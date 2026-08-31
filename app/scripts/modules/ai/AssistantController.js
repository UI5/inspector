'use strict';

const PromptBuilder = require('./PromptBuilder.js');
const providersRegistry = require('./providers/index.js');
const ConversationStore = require('./ConversationStore.js');

function _msg(err, fallback) {
    return (err && err.message) || fallback;
}

/**
 * Coordinates the AI Assistant: capability state, per-URL conversation memory, inspection context,
 * streaming, and persistence. Delegates all provider-specific concerns (session lifecycle, prefix
 * caching, download progress) to the Provider constructed via the registry. No direct Chrome, DOM,
 * or storage dependencies.
 *
 * @param {Object} [options]
 * @param {PromptBuilder} [options.promptBuilder]
 * @param {string} [options.providerName] - Registry key of the provider to construct. Defaults to
 *     `'gemini-nano'`.
 * @param {Object} [options.providerConfig] - Config object passed to the provider constructor.
 * @param {Function} [options.createProvider] - Test seam: `(name, config) => Provider`. Defaults to
 *     the registry factory.
 * @param {ConversationStore} [options.conversationStore]
 * @param {Function} [options.getAppInfo] - Returns the app metadata snapshot for prompt building.
 * @param {Function} [options.getConsoleErrors] - Returns the recent-console-errors snapshot.
 * @param {Function} [options.clearConsoleErrors] - Clears the recent-console-errors buffer.
 * @constructor
 */
function AssistantController({
    promptBuilder = new PromptBuilder(),
    providerName = 'gemini-nano',
    providerConfig = {},
    createProvider = providersRegistry.createProvider,
    conversationStore = new ConversationStore(),
    getAppInfo = () => null,
    getConsoleErrors = () => [],
    clearConsoleErrors = () => {}
} = {}) {
    this._promptBuilder = promptBuilder;
    this._createProvider = createProvider;
    this._provider = createProvider(providerName, providerConfig);
    this._conversationStore = conversationStore;
    this._getAppInfo = getAppInfo;
    this._getConsoleErrors = getConsoleErrors;
    this._clearConsoleErrors = clearConsoleErrors;

    this._capabilityState = { status: 'unavailable', message: 'Checking model status...', progress: 0 };
    this._lastReadyMessage = 'Ready';
    this._listeners = {};
    this._currentUrl = null;
    this._conversationMemory = [];
    this._inspectionContext = null;
    this._activeAbortController = null;
}

/**
 * Register a listener.
 *
 * Events: `capability-state-changed`, `conversation-loaded`, `stream-chunk`, `stream-complete`,
 * `stream-failed`, `conversation-cleared`, `inspection-context-cleared`.
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
 * @param {string} [reason]
 */
AssistantController.prototype._setCapabilityState = function (status, message, progress, reason) {
    this._capabilityState = {
        status: status,
        message: message || '',
        progress: typeof progress === 'number' ? progress : 0,
        reason: reason || null
    };
    if (status === 'ready' && message) {
        this._lastReadyMessage = message;
    }
    this._emit('capability-state-changed', this._capabilityState);
};

/**
 * Resolve capability state from the provider and broadcast it. Load per-URL conversation memory.
 * Rejected capability checks collapse to `unavailable` — the promise never rejects.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.initialize = function () {
    return this._provider.checkAvailability().then((capability) => {
        this._setCapabilityState(capability.status, capability.message, 0, capability.reason);
        return this._loadConversationMemory();
    }, (err) => {
        this._setCapabilityState('unavailable', _msg(err, 'Local AI is unavailable'), 0);
    });
};

/**
 * Send a user message: build the full messages array, stream the response via the provider,
 * persist both turns, and emit stream events. The current Inspection Context is injected.
 *
 * @param {string} userMessage
 * @returns {Promise<void>}
 */
AssistantController.prototype.sendUserMessage = function (userMessage) {
    const consoleErrors = this._getConsoleErrors();
    const messages = this._promptBuilder.buildMessages({
        appInfo: this._getAppInfo(),
        history: this._conversationMemory,
        userMessage: userMessage,
        inspectionContext: this._inspectionContext,
        consoleErrors: consoleErrors
    });

    const abortController = new AbortController();
    this._activeAbortController = abortController;

    const onChunk = (textDelta) => {
        this._emit('stream-chunk', textDelta);
    };

    return this._provider.sendMessage(messages, {
        onChunk: onChunk,
        signal: abortController.signal
    }).then((fullText) => {
        return this._conversationStore.append(this._currentUrl, {
            role: 'user',
            content: userMessage
        }).then(() => {
            return this._conversationStore.append(this._currentUrl, {
                role: 'assistant',
                content: fullText
            });
        }).then(() => {
            this._conversationMemory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: fullText }
            );
            if (this._activeAbortController === abortController) {
                this._activeAbortController = null;
            }
            if (this._capabilityState.status === 'streaming-failed') {
                this._setCapabilityState('ready', this._lastReadyMessage, 0);
            }
            this._emit('stream-complete', { content: fullText });
        });
    }, (err) => {
        if (this._activeAbortController === abortController) {
            this._activeAbortController = null;
        }
        if (err && err.name === 'AbortError') {
            throw err;
        }
        this._setCapabilityState('streaming-failed', _msg(err, 'Streaming failed'), 0);
        this._emit('stream-failed', err);
        throw err;
    });
};

/**
 * Set the inspected URL whose conversation memory the controller owns. Same-URL calls are a no-op.
 * On change: load the new URL's memory, drop any inspection context, clear console errors, and
 * destroy the provider so the next send re-seeds with the new history. Re-emits `ready` so
 * session-tied UI (token counter) can refresh.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
AssistantController.prototype.setUrl = function (url) {
    if (this._currentUrl === url) {
        return Promise.resolve();
    }

    this._currentUrl = url;

    if (this._inspectionContext) {
        this._inspectionContext = null;
        this._emit('inspection-context-cleared');
    }

    this._clearConsoleErrors();

    if (this._capabilityState.status !== 'ready') {
        return Promise.resolve();
    }

    return this._loadConversationMemory().then(() => {
        this._provider.destroy();
        this._setCapabilityState('ready', this._lastReadyMessage, 0);
    });
};

/**
 * Set the Inspection Context for subsequent prompts. Sticky — reused on every `sendUserMessage`
 * until replaced, cleared with `null`, or dropped by `setUrl`. Clearing with `null` emits
 * `inspection-context-cleared`; replacement does not. Never persisted.
 *
 * @param {Object} [context]
 */
AssistantController.prototype.updateInspectionContext = function (context) {
    const next = context || null;
    const wasAttached = this._inspectionContext !== null;
    this._inspectionContext = next;
    if (next === null && wasAttached) {
        this._emit('inspection-context-cleared');
    }
};

/**
 * Clear conversation memory, destroy the provider so its cached seed prefix is dropped, and clear
 * the console-errors buffer so both signals reset together. Re-emits `ready` so the view refreshes
 * the token counter.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.clearConversation = function () {
    return this._conversationStore.clear(this._currentUrl).then(() => {
        this._conversationMemory = [];
        this._clearConsoleErrors();
        this._provider.destroy();
        this._emit('conversation-cleared');
        if (this._capabilityState.status === 'ready') {
            this._setCapabilityState('ready', this._lastReadyMessage, 0);
        }
    });
};

/**
 * Drive the model download. Emits transient `downloading` states with progress in [0, 1], then
 * `ready` once the model is available.
 *
 * @returns {Promise<void>}
 */
AssistantController.prototype.downloadModel = function () {
    this._setCapabilityState('downloading', 'Starting download...', 0);
    return this._provider.downloadModel((progress) => {
        this._setCapabilityState('downloading', 'Downloading model', progress);
    }).then(() => {
        this._setCapabilityState('ready', 'Model ready', 1);
    }, (err) => {
        this._setCapabilityState('unavailable', _msg(err, 'Download failed'), 0);
        throw err;
    });
};

/**
 * @returns {Promise<Object|null>}
 */
AssistantController.prototype.getUsageInfo = function () {
    return typeof this._provider.getUsageInfo === 'function' ?
        this._provider.getUsageInfo() :
        Promise.resolve(null);
};

/**
 * Report which optional Provider methods the currently-installed provider implements, so the view
 * can hide widgets tied to those methods (token counter, download button) after a provider swap.
 *
 * @returns {{hasDownloadModel: boolean, hasUsageInfo: boolean}}
 */
AssistantController.prototype.getProviderCapabilities = function () {
    return {
        hasDownloadModel: typeof this._provider.downloadModel === 'function',
        hasUsageInfo: typeof this._provider.getUsageInfo === 'function'
    };
};

/**
 * Swap the active provider. Aborts any in-flight stream, destroys the current provider, and
 * constructs the replacement via the registry factory. Conversation memory is preserved.
 * `capability-state-changed` is emitted from the new provider's `checkAvailability`.
 *
 * @param {string} name - Registry key of the new provider.
 * @param {Object} [config] - Config passed to the new provider's constructor.
 * @returns {Promise<void>}
 */
AssistantController.prototype.setProvider = function (name, config) {
    if (this._activeAbortController) {
        this._activeAbortController.abort();
        this._activeAbortController = null;
    }

    this._provider.destroy();
    this._provider = this._createProvider(name, config || {});

    return this._provider.checkAvailability().then((capability) => {
        this._setCapabilityState(capability.status, capability.message, 0, capability.reason);
    }, (err) => {
        this._setCapabilityState('unavailable', _msg(err, 'Provider unavailable'), 0);
    });
};

AssistantController.prototype.destroy = function () {
    this._provider.destroy();
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
