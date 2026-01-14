'use strict';

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
 * Get default system prompt for UI5 expert assistant.
 * @private
 * @param {Object} appInfo - Application information
 * @returns {string}
 */
AISessionManager.prototype._getDefaultSystemPrompt = function (appInfo) {
    let prompt = `You are an AI assistant embedded in the UI5 Inspector, specialized in SAP UI5, OpenUI5, and UI5 Web Components. Your role is to help developers understand, debug, and build UI5-based applications.
Provide clear, accurate, and practical guidance on components, APIs, accessibility, theming, layout, performance, and best practices. Prefer concise answers, but explain reasoning when needed. Use code snippets where helpful and format code clearly.
Assume familiarity with JavaScript, HTML, and modern frameworks. When information is uncertain or version-dependent, say so clearly. Do not invent APIs or unsupported features.
You cannot browse the web or open links. If external content is required, ask the user to paste it.
Be neutral, direct, and developer-focused. Avoid marketing language, unnecessary filler, and generic disclaimers. Respond in the user's language and adapt tone to the context.`;

    if (appInfo) {
        prompt += '\n\nCurrent Application Context:\n';

        if (appInfo.common && appInfo.common.data) {
            const frameworkInfo = appInfo.common.data.OpenUI5 || appInfo.common.data.SAPUI5;
            if (frameworkInfo) {
                prompt += `- Framework: ${frameworkInfo}\n`;
            }
        }

        if (appInfo.configurationComputed && appInfo.configurationComputed.data && appInfo.configurationComputed.data.theme) {
            prompt += `- Theme: ${appInfo.configurationComputed.data.theme}\n`;
        }

        if (appInfo.loadedLibraries && appInfo.loadedLibraries.data) {
            const libraries = Object.keys(appInfo.loadedLibraries.data);
            if (libraries.length > 0) {
                prompt += `- Loaded Libraries: ${libraries.join(', ')}\n`;
            }
        }
    }

    return prompt;
};

/**
 * Create a new AI session (empty, stateless).
 * @returns {Promise<boolean>} - True if session created successfully
 */
AISessionManager.prototype.createSession = function () {
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
            data: {}
        });
    });
};

/**
 * Format prompt with optional context.
 * @private
 * @param {string} prompt - User prompt
 * @param {Object} context - Optional context
 * @returns {string}
 */
AISessionManager.prototype._formatPrompt = function (prompt, context) {
    if (!context || !context.control) {
        return prompt;
    }

    let contextString = 'Current UI5 Control Context:\n';
    contextString += `- Type: ${context.control.type || 'Unknown'}\n`;
    contextString += `- ID: ${context.control.id || 'None'}\n`;

    if (context.control.properties && context.control.properties.own && context.control.properties.own.data && Object.keys(context.control.properties.own.data).length > 0) {
        const propsPreview = context.control.properties.own.data;
        contextString += `- Properties: ${JSON.stringify(propsPreview)}\n`;
    }

    if (context.control.bindings && Object.keys(context.control.bindings).length > 0) {
        contextString += `- Has Bindings: ${Object.keys(context.control.bindings).length}\n`;
    }

    return contextString + '\nUser Question: ' + prompt;
};

/**
 * Build messages array for prompt API.
 * @private
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Previous messages [{ role, content }]
 * @param {Object} context - Optional context (control data, appInfo)
 * @returns {Array} - Messages array [{ role, content }]
 */
AISessionManager.prototype._buildMessagesArray = function (userMessage, conversationHistory, context) {
    const messages = [];

    const systemPrompt = this._getDefaultSystemPrompt(context ? context.appInfo : null);
    messages.push({ role: 'system', content: systemPrompt });

    if (conversationHistory && Array.isArray(conversationHistory)) {
        conversationHistory.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
    }

    const formattedMessage = this._formatPrompt(userMessage, context);
    messages.push({ role: 'user', content: formattedMessage });

    return messages;
};

/**
 * Send a prompt and get a streaming response.
 * @param {string} userMessage - Current user message
 * @param {Array} conversationHistory - Previous messages [{ role, content }]
 * @param {Object} context - Optional context (control data, appInfo)
 * @returns {Promise<Object>} - Object with methods to handle streaming
 */
AISessionManager.prototype.promptStreaming = function (userMessage, conversationHistory, context) {
    return new Promise((resolve, reject) => {
        this._connect();

        if (!this._hasActiveSession) {
            reject(new Error('No active session. Call createSession() first.'));
            return;
        }

        const messages = this._buildMessagesArray(userMessage, conversationHistory, context);
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

        // Send messages array
        this._send({
            type: 'prompt-streaming',
            data: {
                messages: messages
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
