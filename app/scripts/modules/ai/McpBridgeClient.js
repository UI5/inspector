'use strict';

// Request/response client for a local MCP bridge, reached over a dedicated Chrome runtime port
// (`chrome.runtime.connect({ name: 'mcp-bridge' })`). The background script is expected to forward
// `list-tools` / `call-tool` messages to a locally running MCP bridge process (Playwright, Snippix,
// ui5-webcomponents, …) and post the results back, correlated by `requestId`.
//
// Every request is best-effort: when no background handler / bridge is running, the request times
// out and rejects rather than hanging, so callers (ReproductionVerifier) resolve to a graceful
// "unavailable" state and the reproduction tooling keeps working without the bridge.

// How long to wait for a bridge response before giving up. Kept short: when the bridge is absent the
// port stays silent, so this timeout is what turns "no bridge" into a prompt "unavailable" verdict.
var DEFAULT_TIMEOUT_MS = 4000;

/**
 * @param {Object} [options]
 * @param {Function} [options.portFactory] - Returns a port-like object with `postMessage`,
 *     `onMessage.addListener`, `onDisconnect.addListener`, and `disconnect`. Defaults to the real
 *     Chrome runtime port. Overridden in tests.
 * @param {number} [options.timeoutMs] - Per-request timeout before rejecting as unavailable.
 * @constructor
 */
function McpBridgeClient(options) {
    options = options || {};
    this._portFactory = options.portFactory || function () {
        return chrome.runtime.connect({ name: 'mcp-bridge' });
    };
    this._timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this._port = null;
    this._isConnected = false;
    this._nextRequestId = 1;
    // requestId -> { resolve, reject, timer }
    this._pending = Object.create(null);
}

/**
 * @private
 */
McpBridgeClient.prototype._connect = function () {
    if (this._isConnected) {
        return;
    }
    var self = this;
    this._port = this._portFactory();
    this._isConnected = true;

    this._port.onMessage.addListener(function (message) {
        self._handleMessage(message);
    });

    this._port.onDisconnect.addListener(function () {
        self._isConnected = false;
        self._port = null;
        self._failAllPending(new Error('MCP bridge disconnected.'));
    });
};

/**
 * Resolve or reject the pending request a bridge message correlates to.
 * @private
 * @param {Object} message
 */
McpBridgeClient.prototype._handleMessage = function (message) {
    if (!message || typeof message.requestId === 'undefined') {
        return;
    }
    var entry = this._pending[message.requestId];
    if (!entry) {
        return;
    }
    delete this._pending[message.requestId];
    if (entry.timer) {
        clearTimeout(entry.timer);
    }
    if (message.type === 'error') {
        entry.reject(new Error(message.message || 'MCP bridge error.'));
        return;
    }
    entry.resolve(message);
};

/**
 * Reject every in-flight request (e.g. the port disconnected).
 * @private
 * @param {Error} error
 */
McpBridgeClient.prototype._failAllPending = function (error) {
    var pending = this._pending;
    this._pending = Object.create(null);
    Object.keys(pending).forEach(function (id) {
        var entry = pending[id];
        if (entry.timer) {
            clearTimeout(entry.timer);
        }
        entry.reject(error);
    });
};

/**
 * Send one request over the port and resolve with the correlated response message. Rejects on
 * timeout, transport error, or disconnect.
 * @private
 * @param {Object} message - Message body; a `requestId` is added before posting.
 * @returns {Promise<Object>}
 */
McpBridgeClient.prototype._request = function (message) {
    var self = this;
    return new Promise(function (resolve, reject) {
        self._connect();
        if (!self._port) {
            reject(new Error('MCP bridge unavailable.'));
            return;
        }
        var requestId = self._nextRequestId;
        self._nextRequestId += 1;

        var timer = setTimeout(function () {
            if (self._pending[requestId]) {
                delete self._pending[requestId];
                reject(new Error('MCP bridge timed out.'));
            }
        }, self._timeoutMs);

        self._pending[requestId] = { resolve: resolve, reject: reject, timer: timer };

        try {
            self._port.postMessage(Object.assign({ requestId: requestId }, message));
        } catch (e) {
            delete self._pending[requestId];
            clearTimeout(timer);
            reject(e);
        }
    });
};

/**
 * List the tools the bridge currently exposes, each tagged with its MCP server name.
 * @returns {Promise<Array<{server: string, name: string}>>}
 */
McpBridgeClient.prototype.listTools = function () {
    return this._request({ type: 'list-tools' }).then(function (message) {
        return Array.isArray(message.tools) ? message.tools : [];
    });
};

/**
 * Invoke one MCP tool and resolve with its result (`{content: [{type, text}], isError?}`).
 * @param {string} server - MCP server name (e.g. 'playwright', 'snippix').
 * @param {string} name - Tool name (e.g. 'browser_navigate').
 * @param {Object} [args] - Tool arguments.
 * @returns {Promise<Object>}
 */
McpBridgeClient.prototype.callTool = function (server, name, args) {
    return this._request({
        type: 'call-tool',
        data: { server: server, name: name, args: args || {} }
    }).then(function (message) {
        return message.result;
    });
};

/**
 * Close the port and reject any in-flight requests. Safe when not connected.
 */
McpBridgeClient.prototype.disconnect = function () {
    var port = this._port;
    this._isConnected = false;
    this._port = null;
    // Reject pending first (as "closed") so this explicit path is distinguishable from an external
    // disconnect; closing the port afterwards finds no pending requests left to reject.
    this._failAllPending(new Error('MCP bridge closed.'));
    if (port) {
        port.disconnect();
    }
};

module.exports = McpBridgeClient;
