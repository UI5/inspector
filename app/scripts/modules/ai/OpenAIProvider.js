'use strict';

/**
 * AI Provider backed by any OpenAI-compatible HTTP endpoint. Wraps the background service worker's
 * `openai-api` port protocol — the panel's CSP blocks cross-origin `fetch`, so all network I/O
 * runs in the service worker (see modules/background/openaiHandler.js).
 *
 * @param {Object} config
 * @param {string} config.baseUrl - e.g. `http://localhost:6655/openai/v1`. No trailing `/`.
 * @param {string} config.apiKey  - Bearer token. Never included in error messages or logs.
 * @param {string} config.model   - Model identifier passed to the API.
 * @param {Function} [config.portFactory] - Test seam. Defaults to a `chrome.runtime.connect` call.
 * @constructor
 */
function OpenAIProvider(config) {
    const cfg = config || {};
    this._baseUrl = cfg.baseUrl || '';
    this._apiKey = cfg.apiKey || '';
    this._model = cfg.model || '';
    this._portFactory = cfg.portFactory || function () {
        return chrome.runtime.connect({ name: 'openai-api' });
    };
    this._port = null;
    this._isConnected = false;
    this._messageHandlers = {};
    this._disconnectHandler = null;
}

function abortError() {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
}

OpenAIProvider.prototype._connect = function () {
    if (this._isConnected) {
        return;
    }

    this._port = this._portFactory();
    this._isConnected = true;

    this._port.onMessage.addListener((message) => {
        const handler = this._messageHandlers[message.type];
        if (handler) {
            handler(message);
        }
    });

    this._port.onDisconnect.addListener(() => {
        this._isConnected = false;
        this._port = null;

        if (this._disconnectHandler) {
            const h = this._disconnectHandler;
            this._disconnectHandler = null;
            h();
        }
    });
};

/**
 * Return `ready` iff `baseUrl`, `apiKey`, and `model` are all set. Local check — no port traffic.
 * @returns {Promise<{status: string, message: string}>}
 */
OpenAIProvider.prototype.checkAvailability = function () {
    if (this._baseUrl && this._apiKey && this._model) {
        return Promise.resolve({ status: 'ready', message: 'OpenAI-compatible (' + this._model + ') ready' });
    }
    return Promise.resolve({ status: 'unavailable', message: 'not configured' });
};

/**
 * Post the messages to the background over the `openai-api` port. Route incoming
 * `chunk`/`complete`/`error` frames. Resolve with the accumulated text on `complete`.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{onChunk?: Function, signal?: AbortSignal}} [options]
 * @returns {Promise<string>}
 */
OpenAIProvider.prototype.sendMessage = function (messages, options) {
    const opts = options || {};

    if (!Array.isArray(messages) || messages.length === 0) {
        return Promise.reject(new Error('sendMessage: messages must be a non-empty array'));
    }
    if (opts.signal && opts.signal.aborted) {
        return Promise.reject(abortError());
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let fullText = '';
        let abortListener = null;

        const cleanup = () => {
            delete this._messageHandlers.chunk;
            delete this._messageHandlers.complete;
            delete this._messageHandlers.error;
            this._disconnectHandler = null;
            if (opts.signal && abortListener) {
                opts.signal.removeEventListener('abort', abortListener);
            }
        };

        const settle = (fn) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            fn();
        };

        this._messageHandlers.chunk = (message) => {
            if (settled) {
                return;
            }
            fullText += message.content;
            if (typeof opts.onChunk === 'function') {
                opts.onChunk(message.content);
            }
        };

        this._messageHandlers.complete = () => {
            settle(() => resolve(fullText));
        };

        this._messageHandlers.error = (message) => {
            settle(() => reject(new Error(message.message)));
        };

        this._disconnectHandler = () => {
            settle(() => reject(new Error('Connection to background script lost. Please try again.')));
        };

        if (opts.signal) {
            abortListener = () => {
                if (this._isConnected) {
                    this._port.postMessage({ type: 'cancel' });
                }
                settle(() => reject(abortError()));
            };
            opts.signal.addEventListener('abort', abortListener);
        }

        this._connect();
        this._port.postMessage({
            type: 'send',
            config: {
                baseUrl: this._baseUrl,
                apiKey: this._apiKey,
                model: this._model
            },
            messages: messages
        });
    });
};

/**
 * OpenAI-compatible endpoints expose no client-visible token quota, so there is no usage to
 * report. Returning `null` tells the UI to leave the token pill untouched (see AIChat).
 * @returns {Promise<null>}
 */
OpenAIProvider.prototype.getUsageInfo = function () {
    return Promise.resolve(null);
};

/**
 * Cancel any in-flight request and disconnect the port.
 */
OpenAIProvider.prototype.destroy = function () {
    if (this._disconnectHandler) {
        const h = this._disconnectHandler;
        this._disconnectHandler = null;
        h();
    }
    if (this._isConnected && this._port) {
        this._port.postMessage({ type: 'cancel' });
        this._port.disconnect();
    }
    this._port = null;
    this._isConnected = false;
    this._messageHandlers = {};
    this._disconnectHandler = null;
};

module.exports = OpenAIProvider;
