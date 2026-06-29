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
 * Translate a background service worker port-protocol availability status
 * into the canonical Assistant Capability State vocabulary defined in
 * CONTEXT.md. Kept module-private; the only caller is `checkAvailability`.
 *
 * @private
 * @param {string} portStatus - Status string from the background port.
 * @returns {string} Canonical Assistant Capability State name.
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
    // `unavailable`, `error`, and any unrecognized status collapse to
    // canonical `unavailable`. The transport-supplied message is preserved
    // by the caller so the developer still sees the actual cause.
    return 'unavailable';
}

/**
 * Resolve the current Assistant Capability State from the transport.
 *
 * Translates the background service worker's port-protocol status dialect
 * (`ready`, `needs-download`, `downloading`, `unsupported`, `unavailable`,
 * `error`) into the canonical Assistant Capability State vocabulary
 * defined in CONTEXT.md (`ready`, `downloadable`, `downloading`,
 * `unsupported`, `unavailable`). The background port protocol itself does
 * not change — the translation lives at this seam so the rest of the
 * Inspector AI Assistant speaks only the canonical vocabulary.
 *
 * The `error` transport status is collapsed to canonical `unavailable`
 * (the view treats it the same as any other unavailable cause) but the
 * transport-supplied message is preserved so the developer sees the
 * actual failure reason instead of a generic banner. Any unrecognized
 * transport status also resolves to `unavailable` to keep the controller
 * and view on canonical ground.
 *
 * @returns {Promise<{status: string, message: string}>} Canonical state.
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
 * The chunk / complete / error message handlers and the in-memory buffer are
 * attached synchronously, before the returned promise resolves. This makes
 * streaming order-independent: chunks delivered by the transport between
 * `_send('prompt-streaming')` and the consumer's first `iterator.next()` are
 * buffered and replayed in order, instead of being dropped.
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

        // Pre-wired streaming buffer. Populated synchronously below by the
        // chunk / complete / error transport handlers. The async iterator
        // returned to the consumer only drains from this buffer; it never
        // registers transport listeners of its own. This is what makes
        // streaming order-independent.
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
