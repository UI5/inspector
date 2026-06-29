'use strict';

/**
 * Assistant-facing interface for local AI operations. Hides the Chrome extension port
 * (`chrome.runtime.connect({ name: 'prompt-api' })`) and its message protocol. Consumers pass
 * already-built prompts and seed messages.
 *
 * @param {Object} [options]
 * @param {Function} [options.portFactory] - Factory returning a port-like object with
 *                                           `postMessage`, `onMessage.addListener`,
 *                                           `onDisconnect.addListener`, and `disconnect`. Defaults
 *                                           to the real Chrome runtime port.
 * @constructor
 */
function PromptClient({
    portFactory = function () {
        return chrome.runtime.connect({ name: 'prompt-api' });
    }
} = {}) {
    this._portFactory = portFactory;
    this._port = null;
    this._isConnected = false;
    this._hasActiveSession = false;
    this._messageHandlers = {};
}

PromptClient.prototype._connect = function () {
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
        this._hasActiveSession = false;
        this._port = null;

        // Surface a streaming-failed state to any in-flight stream so the UI does not hang in "thinking".
        const errorHandler = this._messageHandlers.error;
        if (errorHandler) {
            errorHandler({ message: 'Connection to background script lost. Please try again.' });
        }
    });
};

/**
 * @private
 * @param {string} type
 * @param {Function} handler
 */
PromptClient.prototype._on = function (type, handler) {
    this._messageHandlers[type] = handler;
};

/**
 * @private
 * @param {string} type
 */
PromptClient.prototype._off = function (type) {
    delete this._messageHandlers[type];
};

/**
 * @private
 * @param {Object} message
 */
PromptClient.prototype._send = function (message) {
    this._connect();
    this._port.postMessage(message);
};

/**
 * Translate a background port status into the canonical capability vocabulary. Only
 * `checkAvailability` calls it.
 *
 * @private
 * @param {string} portStatus
 * @returns {string}
 */
function toCanonicalCapabilityState(portStatus) {
    if (portStatus === 'ready') {
        return 'ready';
    }
    if (portStatus === 'needs-download') {
        return 'downloadable';
    }
    if (portStatus === 'downloading') {
        return 'downloading';
    }
    if (portStatus === 'unsupported') {
        return 'unsupported';
    }
    // `unavailable`, `error`, and unrecognized statuses collapse to `unavailable`. The transport message is preserved by the caller.
    return 'unavailable';
}

/**
 * Resolve current capability state from the transport.
 *
 * Translates the background port dialect (`ready`, `needs-download`, `downloading`, `unsupported`,
 * `unavailable`, `error`) into the canonical vocabulary (`ready`, `downloadable`, `downloading`,
 * `unsupported`, `unavailable`).
 *
 * `error` collapses to `unavailable` but the transport message is preserved. Unrecognized statuses
 * also resolve to `unavailable`.
 *
 * @returns {Promise<{status: string, message: string}>}
 */
PromptClient.prototype.checkAvailability = function () {
    return new Promise((resolve) => {
        this._connect();

        this._on('availability', (message) => {
            this._off('availability');
            resolve({
                status: toCanonicalCapabilityState(message.status),
                message: message.message
            });
        });

        this._send({ type: 'check-availability' });
    });
};

/**
 * Request a model download. Invokes `onProgress(progress)` for each progress message, resolves on
 * completion, rejects on error.
 * @param {Function} [onProgress] - Receives values in [0, 1].
 * @returns {Promise<void>}
 */
PromptClient.prototype.downloadModel = function (onProgress) {
    return new Promise((resolve, reject) => {
        this._connect();

        this._on('download-progress', (message) => {
            if (typeof onProgress === 'function') {
                onProgress(message.progress);
            }
        });

        this._on('download-complete', () => {
            this._off('download-progress');
            this._off('download-complete');
            this._off('error');
            resolve();
        });

        this._on('error', (message) => {
            this._off('download-progress');
            this._off('download-complete');
            this._off('error');
            reject(new Error(message.message));
        });

        this._send({ type: 'download-model' });
    });
};

/**
 * Create a new session seeded with the supplied prompts. Seed construction belongs to the caller
 * (see PromptBuilder).
 * @param {Array<{role: string, content: string}>} [initialPrompts]
 * @returns {Promise<boolean>}
 */
PromptClient.prototype.createSession = function (initialPrompts) {
    return new Promise((resolve, reject) => {
        this._connect();

        this._on('session-created', () => {
            this._off('session-created');
            this._off('error');
            this._hasActiveSession = true;
            resolve(true);
        });

        this._on('error', (message) => {
            this._off('session-created');
            this._off('error');
            reject(new Error(message.message));
        });

        this._send({
            type: 'create-session',
            data: {
                initialPrompts: initialPrompts || []
            }
        });
    });
};

/**
 * Send a formatted user prompt and return an async-iterable stream of response chunks. The session
 * retains its own history, so only the new message is sent.
 *
 * Chunk / complete / error handlers and the in-memory buffer are wired synchronously before the
 * returned promise resolves. Chunks arriving between `_send` and the consumer's first `next()` are
 * buffered and replayed in order.
 *
 * @param {string} formattedUserMessage
 * @returns {Promise<AsyncIterable<string>>}
 */
PromptClient.prototype.promptStreaming = function (formattedUserMessage) {
    return new Promise((resolve, reject) => {
        this._connect();

        if (!this._hasActiveSession) {
            reject(new Error('No active session. Call createSession() first.'));
            return;
        }

        // Pre-wired streaming buffer. Populated synchronously below. The async iterator drains from this buffer and never registers transport listeners of its own.
        const buffer = {
            chunks: [],
            isComplete: false,
            error: null,
            waiter: null
        };

        const notifyWaiter = () => {
            if (buffer.waiter) {
                const waiter = buffer.waiter;
                buffer.waiter = null;
                waiter();
            }
        };

        this._on('chunk', (message) => {
            if (buffer.isComplete || buffer.error) {
                return;
            }
            buffer.chunks.push(message.content);
            notifyWaiter();
        });

        this._on('complete', () => {
            buffer.isComplete = true;
            this._off('chunk');
            this._off('complete');
            this._off('error');
            notifyWaiter();
        });

        this._on('error', (message) => {
            buffer.error = new Error(message.message);
            this._off('chunk');
            this._off('complete');
            this._off('error');
            notifyWaiter();
        });

        const stream = {
            [Symbol.asyncIterator]: async function* () {
                while (true) {
                    if (buffer.chunks.length > 0) {
                        yield buffer.chunks.shift();
                        continue;
                    }
                    if (buffer.error) {
                        throw buffer.error;
                    }
                    if (buffer.isComplete) {
                        return;
                    }
                    await new Promise((res) => {
                        buffer.waiter = res;
                    });
                }
            }
        };

        this._send({
            type: 'prompt-streaming',
            data: {
                userMessage: formattedUserMessage
            }
        });

        resolve(stream);
    });
};

/**
 * @returns {Promise<Object|null>} {inputUsage, inputQuota, percentUsed} or null.
 */
PromptClient.prototype.getUsageInfo = function () {
    return new Promise((resolve) => {
        this._connect();

        this._on('usage-info', (message) => {
            this._off('usage-info');
            resolve(message.data);
        });

        this._send({ type: 'get-usage-info' });
    });
};

/**
 * Destroy the current session and disconnect the transport. Safe when no session is active.
 */
PromptClient.prototype.destroy = function () {
    if (this._isConnected) {
        this._send({ type: 'destroy-session' });
        this._hasActiveSession = false;
    }

    this._messageHandlers = {};

    if (this._port) {
        this._port.disconnect();
        this._port = null;
        this._isConnected = false;
    }
};

module.exports = PromptClient;
