'use strict';

const AssistantController = require('../ai/AssistantController.js');
const AssistantTranscript = require('../ai/AssistantTranscript.js');

/**
 * Thin view over the assistant. Owns the banner, input area, confirm dialog, token counter, and
 * subscription to {@link AssistantController}. Markdown parsing, JSON / code viewers, scroll
 * bookkeeping, the streaming debounce, and clipboard helpers live in {@link AssistantTranscript}.
 *
 * The controller does not know the transcript exists. AIChat forwards transcript-shaped controller
 * events to the transcript and consumes the controller's capability and usage surfaces for its own
 * widgets.
 *
 * @param {string} containerId
 * @param {Object} [options]
 * @param {Function} [options.getAppInfo] - Returns the UI5 metadata snapshot for PromptBuilder.
 * @param {AssistantController} [options.controller] - Pre-built controller for tests. Defaults to a
 *                                                     fresh AssistantController.
 * @param {Function} [options.transcriptFactory] - Test seam: `(container) => AssistantTranscript`.
 *                                                 Defaults to a real AssistantTranscript.
 * @constructor
 */
function AIChat(containerId, {
    getAppInfo = null,
    controller = null,
    transcriptFactory = function (host) {
        return new AssistantTranscript(host);
    }
} = {}) {
    this._container = document.getElementById(containerId);

    this._getAppInfo = getAppInfo;
    this._controller = controller || new AssistantController({
        getAppInfo: this._getAppInfo || function () { return null; }
    });
    this._transcriptFactory = transcriptFactory;

    this._isStreaming = false;
    this._streamingHandle = null;
    this._hasShownUsageWarning = false;

    this.init();
}

/**
 */
AIChat.prototype.init = function () {
    this._render();
    this._transcript = this._transcriptFactory(document.getElementById('ai-messages-container'));
    this._attachEventListeners();
    this._attachControllerListeners();
    this._checkModelAvailability();
};

/**
 * The messages container is created here but its contents are owned by {@link AssistantTranscript}.
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
 * Subscribe to controller events and translate them into transcript, banner, and input state
 * updates.
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
 * Canonical capability states. The banner CSS class derives directly: `status-<name>`. States
 * outside this set route to the unavailable banner.
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
 * React to a capability state change.
 *
 * `streaming-failed` does not change the banner — it is surfaced as a system message via
 * `stream-failed`, and the banner stays on its prior `ready` state so recovery shows on the next
 * send.
 *
 * For every other canonical state the view renders the banner from the controller's state: CSS
 * class `status-<status>`, text `state.message` (with a cosmetic adjustment for downloading
 * progress), download button visible only for the two states that admit it.
 *
 * Non-canonical states fall back to the `unavailable` banner with a console warning.
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
        // Clear-history is the recovery: ConversationStore.clear() destroys the broken session and the controller reseeds. Show the button.
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton) {
            clearButton.style.display = 'inline-block';
        }
    }
};

/**
 * Drive the initial capability resolution through the controller. The controller emits a canonical
 * state for every error path.
 * @private
 */
AIChat.prototype._checkModelAvailability = function () {
    this._controller.initialize();
};

/**
 * Handle model download via the controller. The controller emits a canonical state on both success
 * and failure. The view only re-enables the inputs disabled during download.
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
        // Controller already broadcast `unavailable` via `capability-state-changed`. Re-enable inputs for retry.
        downloadButton.disabled = false;
        input.disabled = false;
    });
};

/**
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

    this._controller.sendUserMessage(userMessage).catch(() => {
        // stream-failed event handler surfaces the error.
    });
};

/**
 * @private
 */
AIChat.prototype._handleClearHistory = function () {
    this._showConfirmDialog();
};

/**
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
 * @private
 */
AIChat.prototype._performClearHistory = function () {
    this._controller.clearConversation().catch((error) => {
        this._transcript.appendSystemMessage('Error clearing history: ' + (error && error.message ? error.message : error));
    });
};

/**
 * Render the status banner from a canonical capability state.
 *
 * CSS class is `status-<status>`. Banner text is `state.message`, with a percent indicator for
 * `downloading` once progress is non-zero. Download-button visibility is bound to the two states
 * that admit it.
 *
 * @private
 * @param {string} status
 * @param {{message: string, progress: number}} state
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
 * @private
 * @param {number} percentUsed
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
 * @private
 */
AIChat.prototype._clearContext = function () {
    this._controller.updateInspectionContext(null);
    const contextInfo = document.getElementById('ai-context-info');
    contextInfo.style.display = 'none';

    this._transcript.appendSystemMessage('❌ Context cleared - no control is currently selected');
};

/**
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
 */
AIChat.prototype.onTabActivated = function () {
    this._transcript.scrollToBottom(true);
};

/**
 * Set current inspected URL. Delegates to the controller, which dedupes repeated calls, loads
 * conversation memory, destroys the active session, and reseeds.
 * @param {string} url
 */
AIChat.prototype.setUrl = function (url) {
    this._controller.setUrl(url);
};

/**
 */
AIChat.prototype.destroy = function () {
    this._controller.destroy();
    if (this._transcript && typeof this._transcript.destroy === 'function') {
        this._transcript.destroy();
    }
};

module.exports = AIChat;
