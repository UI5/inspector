'use strict';

/**
 * PromptClient - the assistant-facing interface for local AI operations.
 *
 * Hides Chrome extension port transport (`chrome.runtime.connect({ name: 'prompt-api' })`)
 * and the background service worker port message protocol from the rest of the
 * Inspector AI Assistant. Consumers pass already-built prompt strings and seed
 * messages; PromptClient does not construct prompts.
 *
 * @param {Object} [options]
 * @param {Function} [options.portFactory] - Factory returning a port-like object with
 *     `postMessage(msg)`, `onMessage.addListener(fn)`, `onDisconnect.addListener(fn)`,
 *     and `disconnect()`. Defaults to the real Chrome runtime port.
 * @constructor
 */
function PromptClient(options) {
    options = options || {};
    this._portFactory = options.portFactory || function () {
        return chrome.runtime.connect({ name: 'prompt-api' });
    };
    this._port = null;
    this._isConnected = false;
    this._hasActiveSession = false;
    this._messageHandlers = {};
}

/**
 * Connect to the transport.
 * @private
 */
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

        // Surface a streaming-failed Assistant Capability State to any
        // in-flight stream waiting on this transport so the UI does not
        // hang in a "thinking" state.
        const errorHandler = this._messageHandlers.error;
        if (errorHandler) {
            errorHandler({ message: 'Connection to background script lost. Please try again.' });
        }
    });
};

/**
 * Register a message handler.
 * @private
 * @param {string} type - Message type
 * @param {Function} handler - Handler function
 */
PromptClient.prototype._on = function (type, handler) {
    this._messageHandlers[type] = handler;
};

/**
 * Remove a message handler.
 * @private
 * @param {string} type - Message type
 */
PromptClient.prototype._off = function (type) {
    delete this._messageHandlers[type];
};

/**
 * Post a message to the transport.
 * @private
 * @param {Object} message
 */
PromptClient.prototype._send = function (message) {
    this._connect();
    this._port.postMessage(message);
};

/**
 * Resolve the current Assistant Capability State from the transport.
 * @returns {Promise<{available: boolean, status: string, message: string}>}
 */
PromptClient.prototype.checkAvailability = function () {
    return new Promise((resolve) => {
        this._connect();

        this._on('availability', (message) => {
            this._off('availability');
            resolve({
                available: message.status === 'ready' || message.status === 'needs-download',
                status: message.status,
                message: message.message
            });
        });

        this._send({ type: 'check-availability' });
    });
};

/**
 * Request the background service worker to download the local AI model.
 * Calls `onProgress(progress)` for every download-progress message, resolves
 * when the transport reports download-complete, and rejects on error.
 * @param {Function} [onProgress] - Progress callback receiving values in [0, 1].
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
 * Create a new local AI session, seeding it with the supplied initial prompts.
 * The caller is responsible for building seed messages via PromptBuilder;
 * PromptClient does not construct prompts.
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
 * @returns {boolean} Whether a local AI session is currently active.
 */
PromptClient.prototype.hasActiveSession = function () {
    return this._hasActiveSession;
};

/**
 * Send an already-formatted user prompt and obtain an async-iterable stream of
 * response chunks. The transport session retains its own history, so only the
 * new user message is sent here. Prompt construction (system prompt, seed
 * messages, Inspection Context formatting) is the responsibility of
 * PromptBuilder and is not performed inside PromptClient.
 *
 * @param {string} formattedUserMessage - User prompt already built by PromptBuilder.
 * @returns {Promise<AsyncIterable<string>>}
 */
PromptClient.prototype.promptStreaming = function (formattedUserMessage) {
    return new Promise((resolve, reject) => {
        this._connect();

        if (!this._hasActiveSession) {
            reject(new Error('No active session. Call createSession() first.'));
            return;
        }

        let streamHandlers = {
            onChunk: null,
            onComplete: null,
            onError: null
        };

        const stream = {
            [Symbol.asyncIterator]: async function* () {
                const chunkPromises = [];
                let resolveChunk;
                let rejectChunk;
                let isComplete = false;
                let error = null;

                streamHandlers.onChunk = (message) => {
                    if (resolveChunk) {
                        resolveChunk(message.content);
                        resolveChunk = null;
                    } else {
                        chunkPromises.push(Promise.resolve(message.content));
                    }
                };

                streamHandlers.onComplete = () => {
                    isComplete = true;
                    if (resolveChunk) {
                        resolveChunk({ done: true });
                    }
                };

                streamHandlers.onError = (message) => {
                    error = new Error(message.message);
                    if (rejectChunk) {
                        rejectChunk(error);
                    }
                };

                while (!isComplete && !error) {
                    let chunk;
                    if (chunkPromises.length > 0) {
                        chunk = await chunkPromises.shift();
                    } else {
                        chunk = await new Promise((res, rej) => {
                            resolveChunk = res;
                            rejectChunk = rej;
                        });
                    }

                    if (chunk && chunk.done) {
                        break;
                    }

                    if (chunk) {
                        yield chunk;
                    }
                }

                if (error) {
                    throw error;
                }
            }
        };

        this._on('chunk', (message) => {
            if (streamHandlers.onChunk) {
                streamHandlers.onChunk(message);
            }
        });

        this._on('complete', (message) => {
            if (streamHandlers.onComplete) {
                streamHandlers.onComplete(message);
            }
            this._off('chunk');
            this._off('complete');
            this._off('error');
        });

        this._on('error', (message) => {
            if (streamHandlers.onError) {
                streamHandlers.onError(message);
            }
            this._off('chunk');
            this._off('complete');
            this._off('error');
        });

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
 * Resolve current local AI session usage info reported by the transport.
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
 * Destroy the current local AI session and disconnect the transport. Safe to
 * call when no session is active.
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
