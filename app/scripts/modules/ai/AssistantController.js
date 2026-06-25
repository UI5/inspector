'use strict';

var PromptBuilder = require('./PromptBuilder.js');
var PromptClient = require('./PromptClient.js');
var ConversationStore = require('./ConversationStore.js');

/**
 * AssistantController - thin workflow coordinator for the Inspector AI Assistant.
 *
 * Owns the Assistant Capability State, Conversation Memory lifecycle for the
 * current inspected URL, session creation and reseeding with Conversation Memory
 * replay, per-turn Inspection Context injection, streaming, and persistence of
 * completed user/assistant turns through the named Prompt Builder, Prompt Client,
 * and Conversation Store boundaries.
 *
 * The controller is the primary high-level test seam for the Inspector AI
 * Assistant. It depends only on the three named collaborators and does not
 * touch Chrome runtime, the DOM, or storage directly. The view (AIChat) listens
 * to events and calls controller methods; it does not own session lifecycle,
 * streaming orchestration, history persistence, or context injection logic.
 *
 * @param {Object} [options]
 * @param {PromptBuilder} [options.promptBuilder]
 * @param {PromptClient} [options.promptClient]
 * @param {ConversationStore} [options.conversationStore]
 * @param {Function} [options.getAppInfo] - Returns the current application metadata
 *     snapshot used by the Prompt Builder when seeding the session.
 * @constructor
 */
function AssistantController(options) {
    options = options || {};
    this._promptBuilder = options.promptBuilder || new PromptBuilder();
    this._promptClient = options.promptClient || new PromptClient();
    this._conversationStore = options.conversationStore || new ConversationStore();
    this._getAppInfo = options.getAppInfo || function () { return null; };

    // Seed with a canonical PRD Assistant Capability State. The Inspector
    // AI Assistant cannot serve prompts until `initialize()` has resolved
    // the real availability from the Prompt Client; `unavailable` is the
    // PRD vocabulary for "local AI cannot be used right now" and is the
    // safest no-op state to surface before initialization runs. It is
    // overwritten by the first real capability resolution.
    this._capabilityState = { status: 'unavailable', message: 'Checking model status...', progress: 0 };
    this._listeners = {};
    this._currentUrl = null;
    this._conversationMemory = [];
    this._pendingInspectionContext = null;
    this._isStreaming = false;
}

/**
 * @returns {boolean} Whether the controller is currently streaming a response.
 *     Useful for views that need to clear a "thinking" indicator without
 *     subscribing to every internal stream event.
 */
AssistantController.prototype.isStreaming = function () {
    return this._isStreaming;
};

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
 * This is a deliberate local, in-process event bus — not a `chrome.runtime`
 * message dispatch like the rest of the inspector. The Assistant Controller
 * and the AIChat view live in the same DevTools panel page; routing their
 * coupling through the background service worker would add latency, hide
 * the seam behind the message router, and make the controller untestable
 * without a real Chrome extension. The cross-process port protocol is
 * still owned exclusively by PromptClient.
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
 * Emit an internal event to all registered listeners.
 * @private
 * @param {string} event
 * @param {*} [payload]
 */
AssistantController.prototype._emit = function (event, payload) {
    var handlers = this._listeners[event];
    if (!handlers) {
        return;
    }
    for (var i = 0; i < handlers.length; i++) {
        handlers[i](payload);
    }
};

/**
 * @returns {{status: string, message: string, progress: number}} The current
 *     Assistant Capability State as resolved by the controller.
 */
AssistantController.prototype.getCapabilityState = function () {
    return this._capabilityState;
};

/**
 * Set and broadcast the Assistant Capability State.
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
 * Map a Prompt Client availability result onto the Inspector AI Assistant's
 * canonical Assistant Capability State vocabulary.
 * @private
 * @param {{available: boolean, status: string, message: string}} availability
 * @returns {{status: string, message: string}}
 */
AssistantController.prototype._mapAvailability = function (availability) {
    var status = availability.status;
    if (status === 'ready') {
        return { status: 'ready', message: availability.message };
    }
    if (status === 'needs-download') {
        return { status: 'downloadable', message: availability.message };
    }
    if (status === 'unsupported') {
        return { status: 'unsupported', message: availability.message };
    }
    return { status: 'unavailable', message: availability.message || '' };
};

/**
 * Resolve the Assistant Capability State from the Prompt Client and broadcast it.
 *
 * A rejected capability check is treated as a normal `unavailable`
 * Assistant Capability State, not an exceptional throw — the AIChat
 * view stays the canonical-state consumer and never sees a raw error
 * from initialize.
 *
 * The returned promise therefore never rejects. Callers do not need a
 * `.catch`; the canonical state has already been emitted by the time
 * the promise settles, and downstream UI updates flow through the
 * `capability-state-changed` event bus.
 *
 * @returns {Promise<void>} Always resolves; capability resolution
 *     failure is surfaced via an emitted `unavailable` state.
 */
AssistantController.prototype.initialize = function () {
    var that = this;
    return this._promptClient.checkAvailability().then(function (availability) {
        var mapped = that._mapAvailability(availability);
        that._setCapabilityState(mapped.status, mapped.message, 0);
        return that._loadConversationMemory().then(function () {
            if (mapped.status === 'ready') {
                return that._seedSessionOrFail();
            }
            return undefined;
        });
    }, function (err) {
        that._setCapabilityState('unavailable', err && err.message ? err.message : 'Local AI is unavailable', 0);
    });
};

/**
 * Create a fresh local AI session and translate any failure into a
 * `session-failed` Assistant Capability State rather than letting the
 * error propagate. PRD treats session creation failure as a normal
 * product state, not an exceptional throw.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSessionOrFail = function () {
    var that = this;
    return this._seedSession().then(undefined, function (err) {
        that._setCapabilityState('session-failed', err && err.message ? err.message : 'Session creation failed', 0);
    });
};

/**
 * Create a fresh local AI session seeded with the system prompt and any
 * Conversation Memory turns currently held by the controller.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._seedSession = function () {
    var appInfo = this._getAppInfo();
    var seed = this._promptBuilder.buildSeedMessages(appInfo, this._conversationMemory);
    return this._promptClient.createSession(seed);
};

/**
 * Send a user message through the Inspector AI Assistant: build the prompt
 * via PromptBuilder, stream the response from PromptClient, persist both
 * turns via ConversationStore, and surface stream-chunk / stream-complete
 * events to listeners.
 *
 * Inspection Context held by the controller is injected into this prompt
 * only and is never persisted as Conversation Memory.
 *
 * @param {string} userMessage
 * @returns {Promise<{content: string}>}
 */
AssistantController.prototype.sendUserMessage = function (userMessage) {
    var that = this;
    var contextForThisTurn = this._pendingInspectionContext;
    this._pendingInspectionContext = null;
    var formatted = this._promptBuilder.buildUserPrompt(userMessage, contextForThisTurn);

    this._isStreaming = true;

    return this._promptClient.promptStreaming(formatted).then(function (stream) {
        return that._consumeStream(stream);
    }).then(function (fullText) {
        // Persist only completed turns. Appending the user turn before the
        // stream finishes would leave an orphan user message in Conversation
        // Memory on streaming failure, which would then leak into the next
        // session seed and bias future answers.
        return that._conversationStore.append(that._currentUrl, {
            role: 'user',
            content: userMessage
        }).then(function () {
            return that._conversationStore.append(that._currentUrl, {
                role: 'assistant',
                content: fullText
            });
        }).then(function () {
            that._conversationMemory.push({ role: 'user', content: userMessage });
            that._conversationMemory.push({ role: 'assistant', content: fullText });
            that._isStreaming = false;
            // A successful turn after a prior streaming-failed state means
            // the session has recovered; resurface a `ready` Assistant
            // Capability State so the view does not stay stuck on a
            // failure banner — see PRD user story #8 (graceful recovery,
            // no permanent "thinking" state).
            if (that._capabilityState.status === 'streaming-failed') {
                that._setCapabilityState('ready', 'Gemini Nano is ready', 0);
            }
            that._emit('stream-complete', { content: fullText });
            return { content: fullText };
        });
    }, function (err) {
        that._isStreaming = false;
        that._setCapabilityState('streaming-failed', err && err.message ? err.message : 'Streaming failed', 0);
        that._emit('stream-failed', err);
        throw err;
    });
};

/**
 * Drain the streamed response from the Prompt Client, emitting each chunk
 * as a `stream-chunk` event and returning the joined response.
 * @private
 * @param {AsyncIterable<string>} stream
 * @returns {Promise<string>}
 */
AssistantController.prototype._consumeStream = function (stream) {
    var that = this;
    var iterator = stream[Symbol.asyncIterator]();
    var fullText = '';

    function step() {
        return iterator.next().then(function (result) {
            if (result.done) {
                return fullText;
            }
            fullText += result.value;
            that._emit('stream-chunk', result.value);
            return step();
        });
    }

    return step();
};

/**
 * Set the inspected URL whose Conversation Memory is owned by the controller.
 *
 * When called before initialization, this just records the URL. When called
 * after initialization with a different URL, the controller loads the new
 * URL's Conversation Memory, destroys the active session, and reseeds a
 * fresh session with the new history. Calling with the same URL is a no-op.
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

    var that = this;
    return this._loadConversationMemory().then(function () {
        that._promptClient.destroy();
        return that._seedSessionOrFail();
    });
};

/**
 * Update the pending Inspection Context to inject into the next user prompt.
 *
 * Inspection Context is consumed once and is never written to Conversation
 * Memory. Pass `null` (or no argument) to clear the pending context.
 *
 * @param {Object} [context] - Inspection Context with optional `control` snapshot.
 */
AssistantController.prototype.updateInspectionContext = function (context) {
    this._pendingInspectionContext = context || null;
};

/**
 * Clear Conversation Memory for the current inspected URL, destroy the active
 * local AI session, and reseed a fresh session without prior turns.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.clearConversation = function () {
    var that = this;
    return this._conversationStore.clear(this._currentUrl).then(function () {
        that._conversationMemory = [];
        that._promptClient.destroy();
        that._emit('conversation-cleared');
        return that._seedSessionOrFail();
    });
};

/**
 * Drive the Prompt Client model download. Emits transient `downloading`
 * Assistant Capability States carrying progress values in [0, 1], then a
 * `ready` capability state once the local model is available and the
 * session has been reseeded.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.downloadModel = function () {
    var that = this;
    that._setCapabilityState('downloading', 'Starting download...', 0);
    return this._promptClient.downloadModel(function (progress) {
        that._setCapabilityState('downloading', 'Downloading model', progress);
    }).then(function () {
        that._setCapabilityState('ready', 'Model ready', 1);
        return that._seedSessionOrFail();
    }, function (err) {
        that._setCapabilityState('unavailable', err && err.message ? err.message : 'Download failed', 0);
        throw err;
    });
};

/**
 * Resolve the current local AI session usage info from the Prompt Client.
 * @returns {Promise<Object|null>}
 */
AssistantController.prototype.getUsageInfo = function () {
    return this._promptClient.getUsageInfo();
};

/**
 * Destroy the underlying local AI session and release listeners.
 */
AssistantController.prototype.destroy = function () {
    this._promptClient.destroy();
    this._listeners = {};
};

/**
 * Load Conversation Memory for the current inspected URL and surface it.
 * @private
 * @returns {Promise<void>}
 */
AssistantController.prototype._loadConversationMemory = function () {
    var that = this;
    return this._conversationStore.load(this._currentUrl).then(function (turns) {
        that._conversationMemory = turns || [];
        that._emit('conversation-loaded', that._conversationMemory.slice());
    });
};

module.exports = AssistantController;
