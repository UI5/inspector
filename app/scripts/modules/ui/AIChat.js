'use strict';

var AssistantController = require('../ai/AssistantController.js');
var AssistantTranscript = require('../ai/AssistantTranscript.js');

/**
 * AIChat - thin view over the Inspector AI Assistant.
 *
 * After Assistant Architecture V2, AIChat owns the banner, the input
 * area, the confirm dialog, the token counter, and the subscription to
 * the {@link AssistantController}. It does *not* own how an assistant
 * turn is rendered — markdown parsing, JSON / code viewers, scroll
 * bookkeeping, the streaming render debounce, and clipboard helpers for
 * transcript content all live behind the named {@link AssistantTranscript}
 * collaborator.
 *
 * The Assistant Controller is unaware that the transcript exists — the
 * view is still its only collaborator. AIChat forwards transcript-shaped
 * controller events to the transcript and consumes the controller's
 * capability and usage surfaces for its own non-transcript widgets.
 *
 * @param {string} containerId - ID of container element.
 * @param {Object} [options]
 * @param {Function} [options.getAppInfo] - Returns the current UI5 application
 *     metadata snapshot for the Prompt Builder.
 * @param {AssistantController} [options.controller] - Pre-built controller
 *     for tests; defaults to a fresh AssistantController wired to the real
 *     PromptBuilder, PromptClient, and ConversationStore.
 * @param {Function} [options.transcriptFactory] - Test seam: a factory
 *     `(container) => AssistantTranscript` that returns a transcript
 *     bound to the messages container. Defaults to a real
 *     AssistantTranscript.
 * @constructor
 */
function AIChat(containerId, options) {
    this._container = document.getElementById(containerId);
    this._options = options || {};

    this._getAppInfo = this._options.getAppInfo || null;
    this._controller = this._options.controller || new AssistantController({
        getAppInfo: this._getAppInfo || function () { return null; }
    });
    this._transcriptFactory = this._options.transcriptFactory || function (host) {
        return new AssistantTranscript(host);
    };

    this._isStreaming = false;
    this._streamingHandle = null;
    this._hasShownUsageWarning = false;

    this.init();
}

/**
 * Initialize the AIChat component.
 */
AIChat.prototype.init = function () {
    this._render();
    this._transcript = this._transcriptFactory(document.getElementById('ai-messages-container'));
    this._attachEventListeners();
    this._attachControllerListeners();
    this._checkModelAvailability();
};

/**
 * Render the chat UI.
 *
 * The messages container element is created here but its contents are
 * owned by {@link AssistantTranscript}, which is constructed in
 * {@link AIChat#init} and writes directly into the container.
 * @private
 */
AIChat.prototype._render = function () {
    this._container.innerHTML = `
        <div class="ai-chat-wrapper" role="region" aria-label="AI Chat">
            <div class="ai-status-banner" id="ai-status-banner" role="status" aria-live="polite">
                <div class="status-content">
                    <span class="status-indicator"></span>
                    <span class="status-text">Checking model status...</span>
                </div>
                <button class="download-button" id="ai-download-button" style="display: none;" aria-label="Download AI model">
                    Download Model
                </button>
                <button class="clear-history-button" id="ai-clear-history-button" style="display: none;" aria-label="Clear chat history">
                    Clear History
                </button>
            </div>

            <div class="ai-messages-wrapper">
                <div class="ai-messages-container" id="ai-messages-container" role="log" aria-live="polite" aria-label="Chat messages"></div>
                <div class="ai-disclaimer">AI-generated content may be incorrect</div>
            </div>

            <div class="ai-input-area">
                <div class="context-info" id="ai-context-info" style="display: none;" role="status" aria-live="polite">
                    <span class="context-icon" aria-hidden="true"></span>
                    <span class="context-text"></span>
                    <button class="context-clear-button" id="ai-context-clear-button" title="Clear context" aria-label="Clear context">×</button>
                </div>
                <div class="input-wrapper">
                    <input
                        type="text"
                        class="ai-input"
                        id="ai-input"
                        placeholder="Ask me anything about UI5..."
                        aria-label="Message input"
                    />
                    <button class="ai-send-button" id="ai-send-button" disabled aria-label="Send message">
                        Send
                    </button>
                </div>
                <div class="input-footer">
                    <span class="token-counter" id="ai-token-counter" role="status" aria-live="polite"></span>
                </div>
            </div>

            <div class="ai-confirm-dialog" id="ai-confirm-dialog" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
                <div class="confirm-overlay"></div>
                <div class="confirm-content">
                    <div class="confirm-title" id="confirm-dialog-title">Clear Chat History?</div>
                    <div class="confirm-message">This will clear all chat history for this page. This action cannot be undone.</div>
                    <div class="confirm-buttons">
                        <button class="confirm-button confirm-cancel" id="ai-confirm-cancel">Cancel</button>
                        <button class="confirm-button confirm-ok" id="ai-confirm-ok">Clear History</button>
                    </div>
                </div>
            </div>
        </div>
    `;
};

/**
 * Attach event listeners.
 * @private
 */
AIChat.prototype._attachEventListeners = function () {
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');
    const downloadButton = document.getElementById('ai-download-button');
    const clearHistoryButton = document.getElementById('ai-clear-history-button');
    const contextClearButton = document.getElementById('ai-context-clear-button');

    sendButton.addEventListener('click', () => {
        this._handleSendMessage();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this._handleSendMessage();
        }
    });

    input.addEventListener('input', () => {
        const hasText = input.value.trim().length > 0;
        const canSend = hasText && !this._isStreaming;
        sendButton.disabled = !canSend;
    });

    downloadButton.addEventListener('click', () => {
        this._handleDownloadModel();
    });

    clearHistoryButton.addEventListener('click', () => {
        this._handleClearHistory();
    });

    contextClearButton.addEventListener('click', () => {
        this._clearContext();
    });

    const confirmOk = document.getElementById('ai-confirm-ok');
    const confirmCancel = document.getElementById('ai-confirm-cancel');
    const confirmDialog = document.getElementById('ai-confirm-dialog');

    confirmOk.addEventListener('click', () => {
        this._hideConfirmDialog();
        this._performClearHistory();
    });

    confirmCancel.addEventListener('click', () => {
        this._hideConfirmDialog();
    });

    confirmDialog.querySelector('.confirm-overlay').addEventListener('click', () => {
        this._hideConfirmDialog();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const dialog = document.getElementById('ai-confirm-dialog');
            if (dialog && dialog.style.display !== 'none') {
                this._hideConfirmDialog();
            }
        }
    });
};

/**
 * Subscribe to {@link AssistantController} events and translate them
 * into transcript updates (via {@link AssistantTranscript}) and banner /
 * input state updates (handled directly).
 * @private
 */
AIChat.prototype._attachControllerListeners = function () {
    this._controller.on('capability-state-changed', (state) => {
        this._onCapabilityStateChanged(state);
    });

    this._controller.on('conversation-loaded', (turns) => {
        this._transcript.reset(turns || []);
        if (turns && turns.length > 0) {
            const clearButton = document.getElementById('ai-clear-history-button');
            if (clearButton) {
                clearButton.style.display = 'inline-block';
            }
        }
    });

    this._controller.on('stream-chunk', (chunk) => {
        if (this._streamingHandle) {
            this._streamingHandle.streamChunk(chunk);
        }
    });

    this._controller.on('stream-complete', (payload) => {
        if (this._streamingHandle) {
            this._streamingHandle.finalize(payload.content);
            this._streamingHandle = null;
        }
        this._isStreaming = false;
        this._updateTokenCounter();
    });

    this._controller.on('stream-failed', (err) => {
        this._isStreaming = false;
        this._streamingHandle = null;
        this._transcript.appendSystemMessage('Error: ' + (err && err.message ? err.message : 'streaming failed'));
    });

    this._controller.on('conversation-cleared', () => {
        this._transcript.clear();
        this._hasShownUsageWarning = false;
        this._transcript.appendSystemMessage('Chat history cleared');
    });
};

/**
 * Canonical Assistant Capability States surfaced by the controller. The
 * view derives its banner CSS class directly from these names with no
 * translation table: `status-<name>`. Any state outside this set is
 * routed to the unavailable banner so a future canonical state never
 * disappears silently from the developer's view.
 * @private
 */
AIChat._CANONICAL_CAPABILITY_STATES = [
    'unsupported',
    'unavailable',
    'downloadable',
    'downloading',
    'ready',
    'session-failed',
    'streaming-failed'
];

/**
 * React to an Assistant Capability State change from the controller.
 *
 * `streaming-failed` intentionally does not change the banner: it is
 * already surfaced as a system message via the `stream-failed` event,
 * and the banner stays on its prior `ready` state so the developer
 * sees the assistant recover on the next send (PRD user story #8).
 *
 * For every other canonical state the view renders the banner directly
 * from the controller's state object: the CSS class is `status-<status>`
 * with no ad-hoc string mapping, the displayed text is `state.message`
 * (with one cosmetic adjustment for downloading progress), and the
 * download button is shown only for the two states that admit it.
 *
 * Any non-canonical state falls back to the `unavailable` banner with
 * a console warning so the missing canonical state is detectable in
 * development without dropping a state from the developer's view.
 *
 * @private
 * @param {{status: string, message: string, progress: number}} state
 */
AIChat.prototype._onCapabilityStateChanged = function (state) {
    if (state.status === 'streaming-failed') {
        return;
    }

    let status = state.status;
    if (AIChat._CANONICAL_CAPABILITY_STATES.indexOf(status) === -1) {
        console.warn('AIChat: unmapped Assistant Capability State "' + status + '"; routing to unavailable banner');
        status = 'unavailable';
    }

    this._renderCapabilityBanner(status, state);

    if (status === 'ready') {
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton) {
            clearButton.style.display = 'inline-block';
        }
        this._updateTokenCounter();
    } else if (status === 'session-failed') {
        // The clear-history affordance is the user-facing recovery for a
        // failed session: ConversationStore.clear() destroys the broken
        // session and AssistantController reseeds a fresh one. Surface
        // the button so the developer is not left without an action.
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton) {
            clearButton.style.display = 'inline-block';
        }
    }
};

/**
 * Drive the initial capability resolution through the controller.
 *
 * The controller is responsible for translating every error path into
 * a canonical Assistant Capability State and emitting it. The view
 * therefore does not render an ad-hoc error banner here — doing so
 * would race with the controller's emitted state and reintroduce the
 * view-private "error" vocabulary that this slice removes.
 * @private
 */
AIChat.prototype._checkModelAvailability = function () {
    this._controller.initialize();
};

/**
 * Handle model download via the controller.
 *
 * The controller emits a canonical Assistant Capability State on both
 * success (`ready`) and failure (`unavailable`), so the view does not
 * need to paint its own error banner. It only re-enables the input
 * controls that were disabled while the download was in flight.
 * @private
 */
AIChat.prototype._handleDownloadModel = function () {
    const downloadButton = document.getElementById('ai-download-button');
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');

    downloadButton.disabled = true;
    input.disabled = true;
    sendButton.disabled = true;

    this._controller.downloadModel().then(() => {
        input.disabled = false;
        sendButton.disabled = !input.value.trim().length;
    }, () => {
        // Controller has already broadcast the `unavailable` capability
        // state via `capability-state-changed`. Re-enable the inputs so
        // the developer can retry once they understand the failure.
        downloadButton.disabled = false;
        input.disabled = false;
    });
};

/**
 * Handle the user sending a message via the controller.
 * @private
 */
AIChat.prototype._handleSendMessage = function () {
    const input = document.getElementById('ai-input');
    const userMessage = input.value.trim();

    if (!userMessage || this._isStreaming) {
        return;
    }

    input.value = '';
    document.getElementById('ai-send-button').disabled = true;

    this._transcript.appendUserTurn(userMessage);

    this._isStreaming = true;
    this._streamingHandle = this._transcript.beginAssistantTurn();

    // The controller already owns Inspection Context. The view notifies the
    // controller via updateContext()/_clearContext.
    this._controller.sendUserMessage(userMessage).catch(() => {
        // stream-failed event handler already surfaces the error.
    });
};

/**
 * Handle clear history.
 * @private
 */
AIChat.prototype._handleClearHistory = function () {
    this._showConfirmDialog();
};

/**
 * Show confirmation dialog.
 * @private
 */
AIChat.prototype._showConfirmDialog = function () {
    const dialog = document.getElementById('ai-confirm-dialog');
    dialog.style.display = 'flex';

    this._previousFocus = document.activeElement;

    const cancelButton = document.getElementById('ai-confirm-cancel');
    if (cancelButton) {
        cancelButton.focus();
    }
};

/**
 * Hide confirmation dialog.
 * @private
 */
AIChat.prototype._hideConfirmDialog = function () {
    const dialog = document.getElementById('ai-confirm-dialog');
    dialog.style.display = 'none';

    if (this._previousFocus) {
        this._previousFocus.focus();
    }
};

/**
 * Perform clear history action via the controller.
 * @private
 */
AIChat.prototype._performClearHistory = function () {
    this._controller.clearConversation().catch((error) => {
        this._transcript.appendSystemMessage('Error clearing history: ' + (error && error.message ? error.message : error));
    });
};

/**
 * Render the status banner from a canonical Assistant Capability State.
 *
 * The CSS class is derived directly from the canonical status name
 * (`status-<status>`) — no view-private vocabulary, no translation
 * table. The banner text comes straight from `state.message`, with one
 * cosmetic adjustment for `downloading`: once progress is non-zero the
 * developer sees a percent indicator instead of the bare "starting
 * download" message. Download-button visibility is the only behavioral
 * branch and is bound to the two states that admit it.
 *
 * @private
 * @param {string} status - Canonical Assistant Capability State name.
 * @param {{message: string, progress: number}} state - Full controller state.
 */
AIChat.prototype._renderCapabilityBanner = function (status, state) {
    const banner = document.getElementById('ai-status-banner');
    const statusText = banner.querySelector('.status-text');
    const downloadButton = document.getElementById('ai-download-button');

    banner.className = 'ai-status-banner status-' + status;

    let message = state.message || '';
    if (status === 'downloading') {
        const percent = Math.round((state.progress || 0) * 100);
        if (percent > 0) {
            message = 'Downloading: ' + percent + '%';
        }
    }
    statusText.textContent = message;

    if (status === 'downloadable') {
        downloadButton.style.display = 'inline-block';
        downloadButton.disabled = false;
    } else if (status === 'downloading') {
        downloadButton.style.display = 'inline-block';
        downloadButton.disabled = true;
    } else {
        downloadButton.style.display = 'none';
    }
};

/**
 * Update token counter display.
 * @private
 */
AIChat.prototype._updateTokenCounter = function () {
    const counter = document.getElementById('ai-token-counter');
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');

    if (!counter) {
        return;
    }

    this._controller.getUsageInfo().then((usageInfo) => {
        if (usageInfo) {
            counter.textContent = 'Tokens: ' + usageInfo.inputUsage + '/' + usageInfo.inputQuota + ' (' + usageInfo.percentUsed + '%)';

            counter.classList.remove('warning', 'warning-critical', 'quota-exhausted');

            if (usageInfo.percentUsed >= 100) {
                counter.classList.add('quota-exhausted');
                input.disabled = true;
                sendButton.disabled = true;
                input.placeholder = 'Token quota exhausted. Clear history to continue.';
            } else if (usageInfo.percentUsed >= 90) {
                counter.classList.add('warning-critical');
            } else if (usageInfo.percentUsed >= 70) {
                counter.classList.add('warning');
            }

            this._checkTokenUsageWarning(usageInfo.percentUsed);
        } else {
            counter.textContent = '';
        }
    }, () => {
        counter.textContent = '';
    });
};

/**
 * Check if token usage warning should be displayed.
 * @private
 * @param {number} percentUsed - Percentage of token quota used
 */
AIChat.prototype._checkTokenUsageWarning = function (percentUsed) {
    if (percentUsed >= 70 && !this._hasShownUsageWarning) {
        this._hasShownUsageWarning = true;

        const warningMessage = '💡 Your conversation is getting long (' + percentUsed + '% of token limit used). ' +
            'For faster responses and better performance, consider clearing the chat history to start fresh. ' +
            'Click "Clear History" button above.';

        this._transcript.appendSystemMessage(warningMessage);
    }
};

/**
 * Clear current Inspection Context.
 * @private
 */
AIChat.prototype._clearContext = function () {
    this._controller.updateInspectionContext(null);
    const contextInfo = document.getElementById('ai-context-info');
    contextInfo.style.display = 'none';

    this._transcript.appendSystemMessage('❌ Context cleared - no control is currently selected');
};

/**
 * Update current Inspection Context (control and app info).
 * @param {Object} context - {control, appInfo}
 */
AIChat.prototype.updateContext = function (context) {
    this._controller.updateInspectionContext(context);

    const contextInfo = document.getElementById('ai-context-info');
    const contextText = contextInfo.querySelector('.context-text');

    if (context && context.control) {
        contextInfo.style.display = 'flex';
        contextText.textContent = 'Context: ' + (context.control.type || 'Control') + ' (' + (context.control.id || 'no ID') + ')';
    } else {
        contextInfo.style.display = 'none';
    }
};

/**
 * Called when AI tab is activated.
 */
AIChat.prototype.onTabActivated = function () {
    this._transcript.scrollToBottom(true);
};

/**
 * Set current inspected URL.
 *
 * Delegates directly to the controller; the controller is responsible for
 * deduping repeated calls with the same URL, loading Conversation Memory,
 * destroying the active session, and reseeding with the new history.
 * @param {string} url
 */
AIChat.prototype.setUrl = function (url) {
    this._controller.setUrl(url);
};

/**
 * Destroy the component and cleanup.
 */
AIChat.prototype.destroy = function () {
    this._controller.destroy();
    if (this._transcript && typeof this._transcript.destroy === 'function') {
        this._transcript.destroy();
    }
};

module.exports = AIChat;
