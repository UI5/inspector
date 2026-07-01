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
 * @param {Function} [options.transcriptFactory] - Test seam: `(container, options) => AssistantTranscript`.
 *                                                 Wired with `{ onCopyFailed }` so the transcript
 *                                                 can report clipboard failures back to the view.
 * @constructor
 */
function AIChat(containerId, {
    getAppInfo = null,
    controller = null,
    transcriptFactory = function (host, options) {
        return new AssistantTranscript(host, options);
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
    // Both the token counter and Clear History button are hidden while no messages exist.
    this._hasMessages = false;

    this.init();
}

AIChat.prototype.init = function () {
    this._render();
    this._transcript = this._transcriptFactory(document.getElementById('ai-messages-container'), {
        onCopyFailed: () => { this._showError('Failed to copy to clipboard'); }
    });
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
                <div class="ai-error-slot" id="ai-error-slot" role="status" aria-live="polite" hidden></div>
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
                    <span class="token-counter" id="ai-token-counter" role="status" aria-live="polite" hidden></span>
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
        this._clearError();
        if (e.key === 'Enter') {
            e.preventDefault();
            this._handleSendMessage();
        }
    });

    input.addEventListener('input', () => {
        this._clearError();
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
            this._hasMessages = true;
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
        this._hasMessages = true;
        this._updateTokenCounter();
    });

    this._controller.on('stream-failed', (err) => {
        this._isStreaming = false;
        this._streamingHandle = null;
        this._showError('Error: ' + (err && err.message ? err.message : 'streaming failed'));
    });

    this._controller.on('conversation-cleared', () => {
        this._transcript.clear();
        this._hasShownUsageWarning = false;
        this._hasMessages = false;
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton) {
            clearButton.style.display = 'none';
        }
        this._updateTokenCounter();
    });

    this._controller.on('inspection-context-cleared', () => {
        this._hideContextPill();
    });
};

/**
 * Canonical capability state config. The banner CSS class is `status-<key>` for every key.
 * `skip: true` means no banner update. `showClearButton: true` makes the clear-history button
 * visible. `updateTokens: true` refreshes the token counter. Unknown statuses route to `unavailable`.
 * @private
 */
AIChat._CAPABILITY_CONFIG = {
    'unsupported':      {},
    'unavailable':      {},
    'downloadable':     {},
    'downloading':      {},
    'ready':            { showClearButton: true, updateTokens: true },
    // Recovery: clearConversation destroys the broken session and reseeds.
    'session-failed':   { showClearButton: true },
    // Keep the prior banner; recovery clears on the next successful send. Error surfaces via `_showError`.
    'streaming-failed': { skip: true }
};

/**
 * React to a capability state change.
 * @private
 * @param {{status: string, message: string, progress: number}} state
 */
AIChat.prototype._onCapabilityStateChanged = function (state) {
    let config = AIChat._CAPABILITY_CONFIG[state.status];
    if (config && config.skip) {
        return;
    }

    let status = state.status;
    if (!config) {
        console.warn('AIChat: unmapped Assistant Capability State "' + status + '"; routing to unavailable banner');
        status = 'unavailable';
        config = AIChat._CAPABILITY_CONFIG.unavailable;
    }

    this._renderCapabilityBanner(status, state);

    if (config.showClearButton) {
        // `ready` is gated on `_hasMessages` so a post-clear reseed does not re-reveal the button.
        // `session-failed` still forces it visible — clearing is the recovery path.
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton && (status !== 'ready' || this._hasMessages)) {
            clearButton.style.display = 'inline-block';
        }
    }
    if (config.updateTokens) {
        this._updateTokenCounter();
    }
};

/** @private */
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

AIChat.prototype._handleSendMessage = function () {
    const input = document.getElementById('ai-input');
    const userMessage = input.value.trim();

    if (!userMessage || this._isStreaming) {
        return;
    }

    this._clearError();

    input.value = '';
    document.getElementById('ai-send-button').disabled = true;

    this._transcript.appendUserTurn(userMessage);
    this._hasMessages = true;
    const clearButton = document.getElementById('ai-clear-history-button');
    if (clearButton) {
        clearButton.style.display = 'inline-block';
    }

    this._isStreaming = true;
    this._streamingHandle = this._transcript.beginAssistantTurn();

    this._controller.sendUserMessage(userMessage).catch(() => {
        // stream-failed event handler surfaces the error.
    });
};

AIChat.prototype._handleClearHistory = function () {
    this._showConfirmDialog();
};

AIChat.prototype._showConfirmDialog = function () {
    const dialog = document.getElementById('ai-confirm-dialog');
    dialog.style.display = 'flex';

    this._previousFocus = document.activeElement;

    const cancelButton = document.getElementById('ai-confirm-cancel');
    if (cancelButton) {
        cancelButton.focus();
    }
};

AIChat.prototype._hideConfirmDialog = function () {
    const dialog = document.getElementById('ai-confirm-dialog');
    dialog.style.display = 'none';

    if (this._previousFocus) {
        this._previousFocus.focus();
    }
};

AIChat.prototype._performClearHistory = function () {
    this._controller.clearConversation().catch((error) => {
        this._showError('Error clearing history: ' + (error && error.message ? error.message : error));
    });
};

/**
 * Render the status banner. CSS class is `status-<status>`. Download-button visibility is bound
 * to `downloadable` and `downloading`.
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

AIChat.prototype._updateTokenCounter = function () {
    const counter = document.getElementById('ai-token-counter');
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');

    if (!counter) {
        return;
    }

    if (!this._hasMessages) {
        counter.textContent = '';
        counter.classList.remove('warning', 'warning-critical', 'quota-exhausted');
        counter.hidden = true;
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

            counter.hidden = false;
            this._checkTokenUsageWarning(usageInfo.percentUsed);
        }
        // Null usage: leave the pill's last valid text and state class in place so it does not
        // flicker off between messages.
    }, () => {
        // Rejected usage: same no-op as null.
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

/** @private */
AIChat.prototype._clearContext = function () {
    this._controller.updateInspectionContext(null);
};

/**
 * Hide the Context pill in response to `inspection-context-cleared`. The show path
 * (`updateContext`) writes the pill directly — the controller does not re-emit its data.
 * @private
 */
AIChat.prototype._hideContextPill = function () {
    const contextInfo = document.getElementById('ai-context-info');
    if (contextInfo) {
        contextInfo.style.display = 'none';
    }
};

/**
 * @param {Object} context - `{ control }`. `control.type` and `control.id` are shown in the pill.
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

AIChat.prototype.onTabActivated = function () {
    this._transcript.scrollToBottom(true);
};

/** @param {string} url */
AIChat.prototype.setUrl = function (url) {
    this._controller.setUrl(url);
};

/**
 * Show a transient error in the inline slot above the input. Replaces any current message.
 * Auto-clears on the next input activity.
 * @private
 * @param {string} message
 */
AIChat.prototype._showError = function (message) {
    const slot = document.getElementById('ai-error-slot');
    if (!slot) {
        return;
    }
    slot.textContent = message;
    slot.hidden = false;
};

/**
 * Empty and hide the inline error slot.
 * @private
 */
AIChat.prototype._clearError = function () {
    const slot = document.getElementById('ai-error-slot');
    if (!slot) {
        return;
    }
    slot.textContent = '';
    slot.hidden = true;
};

AIChat.prototype.destroy = function () {
    this._controller.destroy();
    if (this._transcript && typeof this._transcript.destroy === 'function') {
        this._transcript.destroy();
    }
};

module.exports = AIChat;
