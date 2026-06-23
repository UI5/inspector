'use strict';

var PromptBuilder = require('./PromptBuilder.js');

/**
 * AISessionManager - Proxy for communicating with background script for Prompt API.
 * Uses chrome.runtime.connect to establish a long-lived port connection.
 * @constructor
 */
function AISessionManager() {
    this._port = null;
    this._messageHandlers = {};
    this._isConnected = false;
    this._hasActiveSession = false;
    this._promptBuilder = new PromptBuilder();
}

/**
 * Connect to background script.
 * @private
 */
AISessionManager.prototype._connect = function () {
    if (this._isConnected) {
        return;
    }

    this._port = chrome.runtime.connect({ name: 'prompt-api' });
    this._isConnected = true;

    // Set up message listener
    this._port.onMessage.addListener((message) => {
        const handler = this._messageHandlers[message.type];
        if (handler) {
            handler(message);
        }
    });

    // Handle disconnect
    this._port.onDisconnect.addListener(() => {
        this._isConnected = false;
        this._hasActiveSession = false;
        this._port = null;

        // Reject any in-flight streaming promise to prevent UI hang
        var errorHandler = this._messageHandlers.error;
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
AISessionManager.prototype._on = function (type, handler) {
    this._messageHandlers[type] = handler;
};

/**
 * Remove a message handler.
 * @private
 * @param {string} type - Message type
 */
AISessionManager.prototype._off = function (type) {
    delete this._messageHandlers[type];
};

/**
 * Send a message to background script.
 * @private
 * @param {Object} message
 */
AISessionManager.prototype._send = function (message) {
    this._connect();
    this._port.postMessage(message);
};

/**
 * Check if the Prompt API is available.
 * @returns {Promise<{available: boolean, status: string, message: string}>}
 */
AISessionManager.prototype.checkAvailability = function () {
    return new Promise((resolve) => {
        this._connect();

        const handler = (message) => {
            this._off('availability');
            resolve({
                available: message.status === 'ready' || message.status === 'needs-download',
                status: message.status,
                message: message.message
            });
        };

        this._on('availability', handler);
        this._send({ type: 'check-availability' });
    });
};

/**
 * Download the Gemini Nano model.
 * @param {Function} onProgress - Callback for download progress (0-1)
 * @returns {Promise<void>}
 */
AISessionManager.prototype.downloadModel = function (onProgress) {
    return new Promise((resolve, reject) => {
        this._connect();

        const progressHandler = (message) => {
            if (onProgress && typeof onProgress === 'function') {
                onProgress(message.progress);
            }
        };

        const completeHandler = (message) => {
            this._off('download-progress');
            this._off('download-complete');
            this._off('error');
            this._hasActiveSession = true;
            resolve();
        };

        const errorHandler = (message) => {
            this._off('download-progress');
            this._off('download-complete');
            this._off('error');
            reject(new Error(message.message));
        };

        this._on('download-progress', progressHandler);
        this._on('download-complete', completeHandler);
        this._on('error', errorHandler);

        this._send({ type: 'download-model' });
    });
};

/**
 * Create a new AI session with optional initial prompts (system + history).
 * @param {Array} initialPrompts - Optional [{role, content}, ...]; first should be 'system'.
 * @returns {Promise<boolean>} - True if session created successfully
 */
AISessionManager.prototype.createSession = function (initialPrompts) {
    return new Promise((resolve, reject) => {
        this._connect();

        const handler = (message) => {
            this._off('session-created');
            this._off('error');
            this._hasActiveSession = true;
            resolve(true);
        };

        const errorHandler = (message) => {
            this._off('session-created');
            this._off('error');
            reject(new Error(message.message));
        };

        this._on('session-created', handler);
        this._on('error', errorHandler);

        this._send({
            type: 'create-session',
            data: {
                initialPrompts: initialPrompts || []
            }
        });
    });
};

/**
 * Build the system prompt content for a given app context.
 * @param {Object} [appInfo] - Optional application metadata snapshot.
 * @returns {string}
 */
AISessionManager.prototype.buildSystemPrompt = function (appInfo) {
    return this._promptBuilder.buildSystemPrompt(appInfo);
};

/**
 * Build the seed message array used to create a new local AI session.
 * Delegates to the PromptBuilder so the textual shape of system prompt and
 * Conversation Memory replay is owned in a single place.
 * @param {Object} [appInfo] - Optional application metadata snapshot.
 * @param {Array} [conversationMemory] - Prior chat turns ({role, content}) to replay.
 * @returns {Array<{role: string, content: string}>}
 */
AISessionManager.prototype.buildSeedMessages = function (appInfo, conversationMemory) {
    return this._promptBuilder.buildSeedMessages(appInfo, conversationMemory);
};

/**
 * Send a prompt and get a streaming response.
 * The Chrome Prompt API session retains its own conversation history,
 * so only the new user message is sent here. System prompt and prior
 * turns are seeded via initialPrompts at session creation time.
 * @param {string} userMessage - Current user message
 * @param {Object} context - Optional context (control data) for prompt formatting
 * @returns {Promise<Object>} - Object with methods to handle streaming
 */
AISessionManager.prototype.promptStreaming = function (userMessage, context) {
    return new Promise((resolve, reject) => {
        this._connect();

        if (!this._hasActiveSession) {
            reject(new Error('No active session. Call createSession() first.'));
            return;
        }

        const formattedMessage = this._promptBuilder.buildUserPrompt(userMessage, context);
        let streamHandlers = {
            onChunk: null,
            onComplete: null,
            onError: null
        };

        // Create async iterable for streaming
        const stream = {
            [Symbol.asyncIterator]: async function* () {
                const chunkPromises = [];
                let resolveChunk;
                let rejectChunk;
                let isComplete = false;
                let error = null;

                const chunkHandler = (message) => {
                    if (resolveChunk) {
                        resolveChunk(message.content);
                        resolveChunk = null;
                    } else {
                        chunkPromises.push(Promise.resolve(message.content));
                    }
                };

                const completeHandler = (message) => {
                    isComplete = true;
                    if (resolveChunk) {
                        resolveChunk({ done: true });
                    }
                };

                const errorHandler = (message) => {
                    error = new Error(message.message);
                    if (rejectChunk) {
                        rejectChunk(error);
                    }
                };

                streamHandlers.onChunk = chunkHandler;
                streamHandlers.onComplete = completeHandler;
                streamHandlers.onError = errorHandler;

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

        // Set up handlers
        const chunkHandler = (message) => {
            if (streamHandlers.onChunk) {
                streamHandlers.onChunk(message);
            }
        };

        const completeHandler = (message) => {
            if (streamHandlers.onComplete) {
                streamHandlers.onComplete(message);
            }
            this._off('chunk');
            this._off('complete');
            this._off('error');
        };

        const errorHandler = (message) => {
            if (streamHandlers.onError) {
                streamHandlers.onError(message);
            }
            this._off('chunk');
            this._off('complete');
            this._off('error');
        };

        this._on('chunk', chunkHandler);
        this._on('complete', completeHandler);
        this._on('error', errorHandler);

        // Send only the new user message — session retains prior history.
        this._send({
            type: 'prompt-streaming',
            data: {
                userMessage: formattedMessage
            }
        });

        // Resolve with the stream
        resolve(stream);
    });
};

/**
 * Get session usage information.
 * @returns {Promise<Object|null>} - {inputUsage, inputQuota, percentUsed}
 */
AISessionManager.prototype.getUsageInfo = function () {
    return new Promise((resolve) => {
        this._connect();

        const handler = (message) => {
            this._off('usage-info');
            resolve(message.data);
        };

        this._on('usage-info', handler);
        this._send({ type: 'get-usage-info' });
    });
};

/**
 * Destroy the current session and free resources.
 */
AISessionManager.prototype.destroy = function () {
    if (this._isConnected) {
        this._send({ type: 'destroy-session' });
        this._hasActiveSession = false;
    }

    // Clear handlers
    this._messageHandlers = {};

    // Disconnect port
    if (this._port) {
        this._port.disconnect();
        this._port = null;
        this._isConnected = false;
    }
};

/**
 * Check if a session is currently active.
 * @returns {boolean}
 */
AISessionManager.prototype.hasActiveSession = function () {
    return this._hasActiveSession;
};

module.exports = AISessionManager;
