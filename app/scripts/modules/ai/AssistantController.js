'use strict';

const PromptBuilder = require('./PromptBuilder.js');
const PromptClient = require('./PromptClient.js');
const ConversationStore = require('./ConversationStore.js');

/**
 * Coordinates the AI Assistant: capability state, per-URL conversation memory, session lifecycle,
 * inspection context, streaming, and persistence. No direct Chrome, DOM, or storage dependencies.
 *
 * @param {Object} [options]
 * @param {PromptBuilder} [options.promptBuilder]
 * @param {PromptClient} [options.promptClient]
 * @param {ConversationStore} [options.conversationStore]
 * @param {Function} [options.getAppInfo] - Returns the app metadata snapshot for session seeding.
 * @constructor
 */
function AssistantController({
    promptBuilder = new PromptBuilder(),
    promptClient = new PromptClient(),
    conversationStore = new ConversationStore(),
    getAppInfo = () => null
} = {}) {
    this._promptBuilder = promptBuilder;
    this._promptClient = promptClient;
    this._conversationStore = conversationStore;
    this._getAppInfo = getAppInfo;

    // Seeded as `unavailable` until `initialize()` resolves the real status.
    this._capabilityState = { status: 'unavailable', message: 'Checking model status...', progress: 0 };
    this._listeners = {};
    this._currentUrl = null;
    this._conversationMemory = [];
    this._pendingInspectionContext = null;
    this._isStreaming = false;
}

/**
 * Register a listener.
 *
 * Events: `capability-state-changed`, `conversation-loaded`, `stream-chunk`, `stream-complete`,
 * `stream-failed`, `conversation-cleared`.
 *
 * In-process event bus, not `chrome.runtime` message dispatch. The cross-process port protocol
 * lives in PromptClient.
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
 * PromptClient returns canonical capability names. The two controller-managed states
 * (`session-failed`, `streaming-failed`) come from elsewhere in this module.
 *
 * A rejected capability check resolves to `unavailable` so the view always has a canonical state to
 * render. The returned promise never rejects.
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
 * Create a fresh local AI session. Translates failures into a `session-failed` capability state
 * instead of propagating.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSessionOrFail = function () {
    return this._seedSession().then(undefined, (err) => {
        this._setCapabilityState('session-failed', err && err.message ? err.message : 'Session creation failed', 0);
    });
};

/**
 * Create a local AI session seeded with the system prompt and conversation memory.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSession = function () {
    const appInfo = this._getAppInfo();
    const seed = this._promptBuilder.buildSeedMessages(appInfo, this._conversationMemory);
    return this._promptClient.createSession(seed);
};

/**
 * Send a user message: build the prompt, stream the response, persist both turns, and emit stream
 * events.
 *
 * Inspection context is injected only into this prompt — never persisted.
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
        // Persist only completed turns. Appending the user turn before the stream finishes would leak an orphan user message into the next session seed on streaming failure.
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
            // Resurface `ready` after a streaming-failed recovery so the view does not stick on the failure banner.
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
 * Drain the stream, emit each chunk as `stream-chunk`, return the joined text.
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
 * Before initialization, records the URL. After initialization with a different URL, loads the new
 * URL's memory, destroys the active session, and reseeds. On successful reseed, re-emits a `ready`
 * capability state so the view can refresh state tied to the live session (e.g. the token counter).
 * Same-URL calls are a no-op.
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
        return this._reseedAndAnnounceReady();
    });
};

/**
 * Set the inspection context for the next prompt. Consumed once and never persisted. Pass `null` to
 * clear.
 *
 * @param {Object} [context] - Inspection context with optional `control` snapshot.
 */
AssistantController.prototype.updateInspectionContext = function (context) {
    this._pendingInspectionContext = context || null;
};

/**
 * Clear conversation memory for the current URL, destroy the active session, and reseed without
 * prior turns.
 *
 * On successful reseed, re-emits a `ready` capability state so the view can refresh state tied to
 * the live session — most importantly the token counter, which otherwise keeps showing the
 * pre-clear `inputUsage` (and any `quota-exhausted` styling / disabled input) even though the
 * underlying session is fresh.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.clearConversation = function () {
    return this._conversationStore.clear(this._currentUrl).then(() => {
        this._conversationMemory = [];
        this._promptClient.destroy();
        this._emit('conversation-cleared');
        return this._reseedAndAnnounceReady();
    });
};

/**
 * Reseed the local AI session and, on success, re-emit a `ready` capability state so view-level
 * state derived from the live session (token counter, quota styling, input enablement) refreshes.
 * On failure, `_seedSessionOrFail` already surfaces `session-failed`, so this method does not
 * emit `ready`.
 *
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._reseedAndAnnounceReady = function () {
    return this._seedSessionOrFail().then(() => {
        // `_seedSessionOrFail` resolves either with the session ready or after having flipped
        // capability state to `session-failed`. Re-emit `ready` only in the former case so a
        // failed reseed's `session-failed` banner is not immediately overwritten.
        if (this._capabilityState.status === 'ready') {
            this._setCapabilityState('ready', 'Gemini Nano is ready', 0);
        }
    });
};

/**
 * Drive the model download. Emits transient `downloading` states with progress in [0, 1], then
 * `ready` once the model is available and the session has been reseeded.
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
