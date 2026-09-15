'use strict';

/**
 * AI Provider backed by Chrome's on-device Gemini Nano. Wraps the background service worker's
 * `prompt-api` port protocol and caches the messages the underlying Prompt API session has been
 * seeded with so subsequent sends reuse the session unless the prefix diverges.
 *
 * @param {Object} [options]
 * @param {Function} [options.portFactory] - Factory returning a port-like object with
 *     `postMessage`, `onMessage.addListener`, `onDisconnect.addListener`, and `disconnect`.
 *     Defaults to the real Chrome runtime port.
 * @constructor
 */
function GeminiNanoProvider({
    portFactory = function () {
        return chrome.runtime.connect({ name: 'prompt-api' });
    }
} = {}) {
    this._portFactory = portFactory;
    this._port = null;
    this._isConnected = false;
    this._sessionPrefix = null;
    this._messageHandlers = {};
}

GeminiNanoProvider.prototype._connect = function () {
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
        this._sessionPrefix = null;
        this._port = null;

        const errorHandler = this._messageHandlers.error;
        if (errorHandler) {
            errorHandler({ message: 'Connection to background script lost. Please try again.' });
        }
    });
};

GeminiNanoProvider.prototype._on = function (type, handler) {
    this._messageHandlers[type] = handler;
};

GeminiNanoProvider.prototype._off = function (type) {
    delete this._messageHandlers[type];
};

GeminiNanoProvider.prototype._send = function (message) {
    this._connect();
    this._port.postMessage(message);
};

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
    return 'unavailable';
}

function abortError() {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
}

function messagesEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i].role !== b[i].role || a[i].content !== b[i].content) {
            return false;
        }
    }
    return true;
}

/**
 * Resolve current capability state. Translates the port dialect into the canonical vocabulary
 * (`ready`, `downloadable`, `downloading`, `unsupported`, `unavailable`).
 *
 * @returns {Promise<{status: string, message: string}>}
 */
GeminiNanoProvider.prototype.checkAvailability = function () {
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
 * Drive the model download. Invokes `onProgress(progress)` for each progress message.
 * @param {Function} [onProgress] - Receives values in [0, 1].
 * @returns {Promise<void>}
 */
GeminiNanoProvider.prototype.downloadModel = function (onProgress) {
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
 * @private
 * @param {Array<{role: string, content: string}>} prefix
 * @returns {Promise<void>}
 */
GeminiNanoProvider.prototype._createSession = function (prefix) {
    return new Promise((resolve, reject) => {
        this._connect();

        this._on('session-created', () => {
            this._off('session-created');
            this._off('error');
            this._sessionPrefix = prefix.slice();
            resolve();
        });

        this._on('error', (message) => {
            this._off('session-created');
            this._off('error');
            reject(new Error(message.message));
        });

        this._send({
            type: 'create-session',
            data: {
                initialPrompts: prefix
            }
        });
    });
};

/**
 * @private
 * @param {string} userContent
 * @param {Function} [onChunk]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
GeminiNanoProvider.prototype._streamMessage = function (userContent, onChunk, signal) {
    return new Promise((resolve, reject) => {
        this._connect();

        let settled = false;
        let fullText = '';
        let abortListener = null;

        const cleanup = () => {
            this._off('chunk');
            this._off('complete');
            this._off('error');
            if (signal && abortListener) {
                signal.removeEventListener('abort', abortListener);
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

        if (signal) {
            if (signal.aborted) {
                reject(abortError());
                return;
            }
            abortListener = () => {
                settle(() => reject(abortError()));
            };
            signal.addEventListener('abort', abortListener);
        }

        this._on('chunk', (message) => {
            if (settled) {
                return;
            }
            fullText += message.content;
            if (typeof onChunk === 'function') {
                onChunk(message.content);
            }
        });

        this._on('complete', () => {
            settle(() => resolve(fullText));
        });

        this._on('error', (message) => {
            settle(() => reject(new Error(message.message)));
        });

        this._send({
            type: 'prompt-streaming',
            data: {
                userMessage: userContent
            }
        });
    });
};

/**
 * Send the current messages array. If the seed prefix (everything but the last message) differs
 * from what the background session was seeded with, recreate the session before streaming. Calls
 * `onChunk(textDelta)` per streamed piece and resolves with the full response text.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{onChunk?: Function, signal?: AbortSignal}} [options]
 * @returns {Promise<string>}
 */
GeminiNanoProvider.prototype.sendMessage = function (messages, options) {
    const opts = options || {};

    if (!Array.isArray(messages) || messages.length === 0) {
        return Promise.reject(new Error('sendMessage: messages must be a non-empty array'));
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        return Promise.reject(new Error('sendMessage: last message must be a user turn'));
    }
    if (opts.signal && opts.signal.aborted) {
        return Promise.reject(abortError());
    }

    const prefix = messages.slice(0, -1);

    const ensureSession = messagesEqual(this._sessionPrefix, prefix) ?
        Promise.resolve() :
        this._createSession(prefix);

    return ensureSession.then(() => {
        return this._streamMessage(lastMessage.content, opts.onChunk, opts.signal);
    }).then((fullText) => {
        this._sessionPrefix = messages.concat([{ role: 'assistant', content: fullText }]);
        return fullText;
    });
};

/**
 * @returns {Promise<{inputUsage: number, inputQuota: number, percentUsed: number} | null>}
 */
GeminiNanoProvider.prototype.getUsageInfo = function () {
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
 * Destroy the current session, clear cached seed prefix, and disconnect the port.
 */
GeminiNanoProvider.prototype.destroy = function () {
    if (this._isConnected) {
        this._send({ type: 'destroy-session' });
    }

    this._sessionPrefix = null;
    this._messageHandlers = {};

    if (this._port) {
        this._port.disconnect();
        this._port = null;
        this._isConnected = false;
    }
};

module.exports = GeminiNanoProvider;
