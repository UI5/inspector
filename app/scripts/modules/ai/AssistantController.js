'use strict';

const PromptBuilder = require('./PromptBuilder.js');
const PromptClient = require('./PromptClient.js');
const ConversationStore = require('./ConversationStore.js');

/**
 * Workflow coordinator for the Inspector AI Assistant. Owns capability state,
 * conversation memory for the current URL, session creation and reseeding,
 * per-turn inspection context injection, streaming, and persistence through
 * PromptBuilder, PromptClient, and ConversationStore. Has no direct Chrome
 * runtime, DOM, or storage dependencies.
 *
 * @param {Object} [options]
 * @param {PromptBuilder} [options.promptBuilder]
 * @param {PromptClient} [options.promptClient]
 * @param {ConversationStore} [options.conversationStore]
 * @param {Function} [options.getAppInfo] - Returns the current application metadata
 *     snapshot used by PromptBuilder when seeding the session.
 * @constructor
 */
function AssistantController(options) {
    options = options || {};
    this._promptBuilder = options.promptBuilder || new PromptBuilder();
    this._promptClient = options.promptClient || new PromptClient();
    this._conversationStore = options.conversationStore || new ConversationStore();
    this._getAppInfo = options.getAppInfo || function () { return null; };

    // Seed with `unavailable` until `initialize()` resolves the real
    // availability from PromptClient. Overwritten by the first real
    // capability resolution.
    this._capabilityState = { status: 'unavailable', message: 'Checking model status...', progress: 0 };
    this._listeners = {};
    this._currentUrl = null;
    this._conversationMemory = [];
    this._pendingInspectionContext = null;
    this._isStreaming = false;
}

/**
 * Register a listener for a controller event.
 *
 * Supported events:
 *  - `capability-state-changed` ({status, message, progress})
 *  - `conversation-loaded` (turns)
 *  - `stream-chunk` (chunk)
 *  - `stream-complete` ({content})
 *  - `stream-failed` (Error)
 *  - `conversation-cleared`
 *
 * Local in-process event bus, not `chrome.runtime` message dispatch. The
 * controller and the AIChat view live in the same DevTools panel page.
 * The cross-process port protocol is owned by PromptClient.
 *
 * @param {string} event
 * @param {Function} handler
 */
AssistantController.prototype.on = function (event, handler) {
    if (!this._listeners[event]) {
        this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
};

/**
 * @private
 * @param {string} event
 * @param {*} [payload]
 */
AssistantController.prototype._emit = function (event, payload) {
    const handlers = this._listeners[event];
    if (!handlers) {
        return;
    }
    for (let i = 0; i < handlers.length; i++) {
        handlers[i](payload);
    }
};

/**
 * @returns {{status: string, message: string, progress: number}}
 */
AssistantController.prototype.getCapabilityState = function () {
    return this._capabilityState;
};

/**
 * @private
 * @param {string} status
 * @param {string} [message]
 * @param {number} [progress]
 */
AssistantController.prototype._setCapabilityState = function (status, message, progress) {
    this._capabilityState = {
        status: status,
        message: message || '',
        progress: typeof progress === 'number' ? progress : 0
    };
    this._emit('capability-state-changed', this._capabilityState);
};

/**
 * Resolve capability state from PromptClient and broadcast it.
 *
 * PromptClient returns canonical capability names directly. The two
 * controller-managed states (`session-failed`, `streaming-failed`) come
 * from elsewhere in this module.
 *
 * A rejected capability check resolves to `unavailable` rather than
 * throwing, so the view always has a canonical state to render. The
 * returned promise never rejects.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.initialize = function () {
    return this._promptClient.checkAvailability().then((capability) => {
        this._setCapabilityState(capability.status, capability.message, 0);
        return this._loadConversationMemory().then(() => {
            if (capability.status === 'ready') {
                return this._seedSessionOrFail();
            }
            return undefined;
        });
    }, (err) => {
        this._setCapabilityState('unavailable', err && err.message ? err.message : 'Local AI is unavailable', 0);
    });
};

/**
 * Create a fresh local AI session and translate any failure into a
 * `session-failed` capability state rather than letting the error propagate.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSessionOrFail = function () {
    return this._seedSession().then(undefined, (err) => {
        this._setCapabilityState('session-failed', err && err.message ? err.message : 'Session creation failed', 0);
    });
};

/**
 * Create a local AI session seeded with the system prompt and current
 * conversation memory.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSession = function () {
    const appInfo = this._getAppInfo();
    const seed = this._promptBuilder.buildSeedMessages(appInfo, this._conversationMemory);
    return this._promptClient.createSession(seed);
};

/**
 * Send a user message: build the prompt, stream the response, persist both
 * turns, and emit stream-chunk / stream-complete events.
 *
 * Inspection context is injected into this prompt only and is never
 * persisted as conversation memory.
 *
 * @param {string} userMessage
 * @returns {Promise<{content: string}>}
 */
AssistantController.prototype.sendUserMessage = function (userMessage) {
    const contextForThisTurn = this._pendingInspectionContext;
    this._pendingInspectionContext = null;
    const formatted = this._promptBuilder.buildUserPrompt(userMessage, contextForThisTurn);

    this._isStreaming = true;

    return this._promptClient.promptStreaming(formatted).then((stream) => {
        return this._consumeStream(stream);
    }).then((fullText) => {
        // Persist only completed turns. Appending the user turn before the
        // stream finishes would leave an orphan user message in conversation
        // memory on streaming failure, which would then leak into the next
        // session seed and bias future answers.
        return this._conversationStore.append(this._currentUrl, {
            role: 'user',
            content: userMessage
        }).then(() => {
            return this._conversationStore.append(this._currentUrl, {
                role: 'assistant',
                content: fullText
            });
        }).then(() => {
            this._conversationMemory.push({ role: 'user', content: userMessage });
            this._conversationMemory.push({ role: 'assistant', content: fullText });
            this._isStreaming = false;
            // A successful turn after a prior streaming-failed state means
            // the session has recovered. Resurface `ready` so the view does
            // not stay stuck on a failure banner.
            if (this._capabilityState.status === 'streaming-failed') {
                this._setCapabilityState('ready', 'Gemini Nano is ready', 0);
            }
            this._emit('stream-complete', { content: fullText });
            return { content: fullText };
        });
    }, (err) => {
        this._isStreaming = false;
        this._setCapabilityState('streaming-failed', err && err.message ? err.message : 'Streaming failed', 0);
        this._emit('stream-failed', err);
        throw err;
    });
};

/**
 * Drain the streamed response, emit each chunk as `stream-chunk`, and
 * return the joined response.
 * @private
 * @param {AsyncIterable<string>} stream
 * @returns {Promise<string>}
 */
AssistantController.prototype._consumeStream = function (stream) {
    const iterator = stream[Symbol.asyncIterator]();
    let fullText = '';

    const step = () => {
        return iterator.next().then((result) => {
            if (result.done) {
                return fullText;
            }
            fullText += result.value;
            this._emit('stream-chunk', result.value);
            return step();
        });
    };

    return step();
};

/**
 * Set the inspected URL whose conversation memory the controller owns.
 *
 * Before initialization, this records the URL. After initialization with a
 * different URL, the controller loads the new URL's conversation memory,
 * destroys the active session, and reseeds with the new history. Same-URL
 * calls are a no-op.
 *
 * @param {string} url
 * @returns {Promise<void>|undefined}
 */
AssistantController.prototype.setUrl = function (url) {
    if (this._currentUrl === url) {
        return Promise.resolve();
    }

    this._currentUrl = url;

    if (this._capabilityState.status !== 'ready') {
        return Promise.resolve();
    }

    return this._loadConversationMemory().then(() => {
        this._promptClient.destroy();
        return this._seedSessionOrFail();
    });
};

/**
 * Update the pending inspection context for the next user prompt. Inspection
 * context is consumed once and is never written to conversation memory.
 * Pass `null` to clear.
 *
 * @param {Object} [context] - Inspection context with optional `control` snapshot.
 */
AssistantController.prototype.updateInspectionContext = function (context) {
    this._pendingInspectionContext = context || null;
};

/**
 * Clear conversation memory for the current URL, destroy the active session,
 * and reseed without prior turns.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.clearConversation = function () {
    return this._conversationStore.clear(this._currentUrl).then(() => {
        this._conversationMemory = [];
        this._promptClient.destroy();
        this._emit('conversation-cleared');
        return this._seedSessionOrFail();
    });
};

/**
 * Drive the PromptClient model download. Emits transient `downloading`
 * capability states with progress in [0, 1], then `ready` once the model is
 * available and the session has been reseeded.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.downloadModel = function () {
    this._setCapabilityState('downloading', 'Starting download...', 0);
    return this._promptClient.downloadModel((progress) => {
        this._setCapabilityState('downloading', 'Downloading model', progress);
    }).then(() => {
        this._setCapabilityState('ready', 'Model ready', 1);
        return this._seedSessionOrFail();
    }, (err) => {
        this._setCapabilityState('unavailable', err && err.message ? err.message : 'Download failed', 0);
        throw err;
    });
};

/**
 * @returns {Promise<Object|null>}
 */
AssistantController.prototype.getUsageInfo = function () {
    return this._promptClient.getUsageInfo();
};

/**
 */
AssistantController.prototype.destroy = function () {
    this._promptClient.destroy();
    this._listeners = {};
};

/**
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._loadConversationMemory = function () {
    return this._conversationStore.load(this._currentUrl).then((turns) => {
        this._conversationMemory = turns || [];
        this._emit('conversation-loaded', this._conversationMemory.slice());
    });
};

module.exports = AssistantController;
