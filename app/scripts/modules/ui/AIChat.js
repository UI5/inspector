'use strict';

var AssistantController = require('../ai/AssistantController.js');

/**
 * AIChat - thin view over the Inspector AI Assistant.
 *
 * After Assistant Architecture V1, AIChat owns rendering, markdown,
 * JSON/code viewers, dialogs, scroll behavior, and clipboard helpers. It
 * does not own session lifecycle, streaming orchestration, history
 * persistence, or Inspection Context injection — those are delegated to
 * the {@link AssistantController}, which is the single integration point
 * for Inspector AI Assistant behavior.
 *
 * @param {string} containerId - ID of container element.
 * @param {Object} [options]
 * @param {Function} [options.getAppInfo] - Returns the current UI5 application
 *     metadata snapshot for the Prompt Builder.
 * @param {AssistantController} [options.controller] - Pre-built controller
 *     for tests; defaults to a fresh AssistantController wired to the real
 *     PromptBuilder, PromptClient, and ConversationStore.
 * @constructor
 */
function AIChat(containerId, options) {
    this._container = document.getElementById(containerId);
    this._options = options || {};

    this._getAppInfo = this._options.getAppInfo || null;
    this._controller = this._options.controller || new AssistantController({
        getAppInfo: this._getAppInfo || function () { return null; }
    });

    this._currentUrl = null;
    this._currentContext = null;
    this._messages = [];
    this._isStreaming = false;
    this._streamingMessageElement = null;
    this._streamingMessageHeader = null;
    this._streamingFullText = '';
    this._hasShownUsageWarning = false;
    this._maxJsonDepth = 10;
    this._renderDebounceTimer = null;
    this._pendingRender = null;

    this.init();
}

/**
 * Initialize the AIChat component.
 */
AIChat.prototype.init = function () {
    this._render();
    this._attachEventListeners();
    this._attachControllerListeners();
    this._checkModelAvailability();
};

/**
 * Render the chat UI.
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
                <div class="ai-messages-container" id="ai-messages-container" role="log" aria-live="polite" aria-label="Chat messages">
                    <div class="ai-welcome-message">
                        <h3>UI5 AI Assistant</h3>
                        <span class="experimental-tag">Experimental</span>
                        <p>Ask questions about UI5 controls, debugging, or general development topics.</p>
                        <p>Select a control in the Control Inspector to automatically include context in your questions.</p>
                    </div>
                </div>
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
 * Subscribe to {@link AssistantController} events and translate them into
 * DOM updates. The controller owns capability resolution, streaming, and
 * history; the view only reacts.
 * @private
 */
AIChat.prototype._attachControllerListeners = function () {
    this._controller.on('capability-state-changed', (state) => {
        this._onCapabilityStateChanged(state);
    });

    this._controller.on('conversation-loaded', (turns) => {
        this._renderConversationMemory(turns);
    });

    this._controller.on('stream-chunk', (chunk) => {
        this._streamingFullText += chunk;
        this._debouncedRender(this._streamingFullText);
    });

    this._controller.on('stream-complete', (payload) => {
        this._finalizeStreamingMessage(payload.content);
    });

    this._controller.on('stream-failed', (err) => {
        this._isStreaming = false;
        this._streamingMessageElement = null;
        this._streamingMessageHeader = null;
        this._streamingFullText = '';
        this._addSystemMessage('Error: ' + (err && err.message ? err.message : 'streaming failed'));
    });

    this._controller.on('conversation-cleared', () => {
        this._messages = [];
        const messagesContainer = document.getElementById('ai-messages-container');
        // Safe to use innerHTML with this literal: no user-controlled or
        // model-controlled content is interpolated. Any user message goes
        // through _addMessage, which routes user/system text through
        // _escapeHtml and assistant text through _parseMarkdown.
        messagesContainer.innerHTML = `
            <div class="ai-welcome-message">
                <h3>UI5 AI Assistant</h3>
                <p>Chat history cleared. Ask me anything!</p>
            </div>
        `;
        this._hasShownUsageWarning = false;
        this._addSystemMessage('Chat history cleared');
    });
};

/**
 * Render any Conversation Memory loaded by the controller into the DOM.
 * @private
 * @param {Array<{role: string, content: string}>} turns
 */
AIChat.prototype._renderConversationMemory = function (turns) {
    this._messages = [];
    const messagesContainer = document.getElementById('ai-messages-container');
    messagesContainer.innerHTML = '';
    if (turns && turns.length > 0) {
        turns.forEach((msg) => {
            this._addMessage(msg.role, msg.content);
        });
        const clearButton = document.getElementById('ai-clear-history-button');
        if (clearButton) {
            clearButton.style.display = 'inline-block';
        }
        this._scrollToBottom(true);
    }
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

    this._addMessage('user', userMessage);

    this._isStreaming = true;
    this._streamingFullText = '';
    const messageElement = this._addMessage('assistant', '', false);
    this._streamingMessageElement = messageElement.querySelector('.message-content');
    this._streamingMessageHeader = messageElement.querySelector('.message-header');

    const loadingIndicator = document.createElement('span');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.textContent = 'Thinking';
    const loadingDots = document.createElement('span');
    loadingDots.className = 'loading-dots';
    loadingIndicator.appendChild(loadingDots);
    this._streamingMessageElement.appendChild(loadingIndicator);

    // The controller already owns Inspection Context. The view notifies the
    // controller via updateContext()/_clearContext.
    this._controller.sendUserMessage(userMessage).catch(() => {
        // stream-failed event handler already surfaces the error.
    });
};

/**
 * Finalize a streaming assistant message once the controller reports
 * stream completion.
 * @private
 * @param {string} fullResponse
 */
AIChat.prototype._finalizeStreamingMessage = function (fullResponse) {
    if (!this._streamingMessageElement) {
        // Nothing in the DOM to finalize; controller-driven update without view.
        this._isStreaming = false;
        return;
    }
    if (this._renderDebounceTimer) {
        clearTimeout(this._renderDebounceTimer);
        this._renderDebounceTimer = null;
    }
    this._streamingMessageElement.innerHTML = this._parseMarkdown(fullResponse);
    this._initializeJsonViewers(this._streamingMessageElement);

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-response-button';
    copyButton.title = 'Copy response';
    copyButton.setAttribute('aria-label', 'Copy response');
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', (e) => {
        this._copyToClipboard(fullResponse, e.currentTarget);
    });
    this._streamingMessageHeader.appendChild(copyButton);

    this._isStreaming = false;
    this._streamingMessageElement = null;
    this._streamingMessageHeader = null;
    this._streamingFullText = '';

    this._updateTokenCounter();
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
        this._addSystemMessage('Error clearing history: ' + (error && error.message ? error.message : error));
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
 * Add a message to the chat UI.
 * @param {string} role - 'user', 'assistant', or 'system'
 * @param {string} content - Message content
 * @param {boolean} showCopyButton - Whether to show copy button for assistant messages (default: true)
 * @returns {HTMLElement} - The message element
 */
AIChat.prototype._addMessage = function (role, content, showCopyButton) {
    const messagesContainer = document.getElementById('ai-messages-container');

    const welcomeMessage = messagesContainer.querySelector('.ai-welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = 'ai-message message-' + role;

    const formattedContent = role === 'assistant' ? this._parseMarkdown(content) : this._escapeHtml(content);

    const shouldShowCopyButton = role === 'assistant' && (showCopyButton === undefined || showCopyButton === true);

    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-role">${role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System'}</span>
            ${shouldShowCopyButton ? '<button class="copy-response-button" title="Copy response" aria-label="Copy response">Copy</button>' : ''}
        </div>
        <div class="message-content">${formattedContent}</div>
    `;

    messagesContainer.appendChild(messageElement);

    if (role === 'assistant') {
        const contentElement = messageElement.querySelector('.message-content');
        this._initializeJsonViewers(contentElement);

        const copyButton = messageElement.querySelector('.copy-response-button');
        if (copyButton) {
            copyButton.addEventListener('click', (e) => {
                this._copyToClipboard(content, e.currentTarget);
            });
        }
    }

    this._scrollToBottom(true);

    this._messages.push({ role, content });

    return messageElement;
};

/**
 * Add a system message.
 * @param {string} message
 */
AIChat.prototype._addSystemMessage = function (message) {
    this._addMessage('system', message);
};

/**
 * Escape HTML to prevent XSS.
 * @private
 * @param {string} text
 * @returns {string}
 */
AIChat.prototype._escapeHtml = function (text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Parse markdown to HTML for AI responses.
 * @private
 * @param {string} text - Markdown text
 * @returns {string} - HTML string
 */
AIChat.prototype._parseMarkdown = function (text) {
    const placeholders = { codeBlocks: [], inlineCode: [] };

    let html = this._extractCodeBlocks(text, placeholders);
    html = this._extractInlineCode(html, placeholders);

    html = this._escapeHtml(html);

    html = this._applyMarkdownFormatting(html);

    html = html.trimEnd();

    html = html.replace(/\n/g, '<br>');

    html = this._restoreInlineCode(html, placeholders.inlineCode);
    html = this._restoreCodeBlocks(html, placeholders.codeBlocks);

    return html;
};

/**
 * Extract code blocks from text.
 * @private
 */
AIChat.prototype._extractCodeBlocks = function (text, placeholders) {
    return text.replace(/```([\w]*)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const index = placeholders.codeBlocks.length;
        const trimmedCode = code.trim();
        const isJson = lang === 'json' || (!lang && /^[\[\{]/.test(trimmedCode));

        if (isJson) {
            try {
                placeholders.codeBlocks.push({ type: 'json', data: JSON.parse(trimmedCode) });
            } catch (e) {
                placeholders.codeBlocks.push({ type: 'code', lang: 'plaintext', code: trimmedCode });
            }
        } else {
            placeholders.codeBlocks.push({ type: 'code', lang: lang || 'plaintext', code: trimmedCode });
        }

        return `___CODEBLOCK_${index}___`;
    });
};

/**
 * Extract inline code from text.
 * @private
 */
AIChat.prototype._extractInlineCode = function (text, placeholders) {
    return text.replace(/`([^`]+)`/g, (match, code) => {
        const index = placeholders.inlineCode.length;
        placeholders.inlineCode.push(code);
        return `___INLINECODE_${index}___`;
    });
};

/**
 * Apply markdown formatting (bold, italic, links).
 * @private
 */
AIChat.prototype._applyMarkdownFormatting = function (text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\b__([^_]+)__\b/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)([^*<>]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
};

/**
 * Restore inline code.
 * @private
 */
AIChat.prototype._restoreInlineCode = function (text, inlineCode) {
    inlineCode.forEach((code, index) => {
        text = text.replace(`___INLINECODE_${index}___`, `<code>${this._escapeHtml(code)}</code>`);
    });
    return text;
};

/**
 * Restore code blocks.
 * @private
 */
AIChat.prototype._restoreCodeBlocks = function (text, codeBlocks) {
    codeBlocks.forEach((block, index) => {
        let replacement;
        if (block.type === 'json') {
            replacement = this._createJsonViewer(block.data);
        } else {
            replacement = this._createCodeViewer(block.code, block.lang);
        }
        text = text.replace(`___CODEBLOCK_${index}___`, replacement);
    });
    return text;
};

/**
 * Create JSON viewer HTML.
 * @private
 */
AIChat.prototype._createJsonViewer = function (data) {
    const jsonString = JSON.stringify(data).replace(/'/g, '&#39;');
    return `<div class="json-viewer" data-json='${jsonString}'></div>`;
};

/**
 * Create code viewer HTML.
 * @private
 */
AIChat.prototype._createCodeViewer = function (code, lang) {
    const escapedCode = code.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return `<div class="code-viewer" data-code='${escapedCode}' data-lang='${lang}'></div>`;
};

/**
 * Render interactive JSON viewer with expand/collapse.
 * @private
 */
AIChat.prototype._renderJsonValue = function (value, key, isLast, depth) {
    depth = depth || 0;

    if (depth > this._maxJsonDepth) {
        const comma = isLast ? '' : ',';
        return this._renderJsonLine(key, `<span class="json-truncated">[Max depth reached]</span>${comma}`);
    }

    const comma = isLast ? '' : ',';
    const handlers = {
        null: () => this._renderJsonLine(key, `<span class="json-null">null</span>${comma}`),
        boolean: () => this._renderJsonLine(key, `<span class="json-boolean">${value}</span>${comma}`),
        number: () => this._renderJsonLine(key, `<span class="json-number">${value}</span>${comma}`),
        string: () => this._renderJsonString(key, value, comma),
        array: () => this._renderJsonArray(key, value, comma, depth),
        object: () => this._renderJsonObject(key, value, comma, depth)
    };

    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    return handlers[type] ? handlers[type]() : this._renderJsonLine(key, `${this._escapeHtml(String(value))}${comma}`);
};

/**
 * Render JSON string value.
 * @private
 */
AIChat.prototype._renderJsonString = function (key, value, comma) {
    const escaped = this._escapeHtml(value);
    return this._renderJsonLine(key, `<span class="json-string">"${escaped}"</span>${comma}`);
};

/**
 * Render JSON array.
 * @private
 */
AIChat.prototype._renderJsonArray = function (key, value, comma, depth) {
    if (value.length === 0) {
        return this._renderJsonLine(key, `<span class="json-bracket">[]</span>${comma}`);
    }

    const id = 'json-' + Math.random().toString(36).substr(2, 9);
    const keyHtml = key ? `<span class="json-key">"${this._escapeHtml(key)}"</span>: ` : '';
    const items = value.map((item, i) => this._renderJsonValue(item, null, i === value.length - 1, depth + 1)).join('');

    return `<div class="json-line">${keyHtml}<span class="json-toggle" data-target="${id}">▼</span> <span class="json-bracket">[</span><span class="json-count">${value.length} items</span></div>
            <div class="json-content" id="${id}">${items}<div class="json-line"><span class="json-bracket">]</span>${comma}</div></div>`;
};

/**
 * Render JSON object.
 * @private
 */
AIChat.prototype._renderJsonObject = function (key, value, comma, depth) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
        return this._renderJsonLine(key, `<span class="json-bracket">{}</span>${comma}`);
    }

    const id = 'json-' + Math.random().toString(36).substr(2, 9);
    const keyHtml = key ? `<span class="json-key">"${this._escapeHtml(key)}"</span>: ` : '';
    const items = keys.map((k, i) => this._renderJsonValue(value[k], k, i === keys.length - 1, depth + 1)).join('');

    return `<div class="json-line">${keyHtml}<span class="json-toggle" data-target="${id}">▼</span> <span class="json-bracket">{</span><span class="json-count">${keys.length} keys</span></div>
            <div class="json-content" id="${id}">${items}<div class="json-line"><span class="json-bracket">}</span>${comma}</div></div>`;
};

/**
 * Render a single JSON line.
 * @private
 * @param {string} key - Key name (null for array items)
 * @param {string} content - HTML content
 * @returns {string} - HTML string
 */
AIChat.prototype._renderJsonLine = function (key, content) {
    let html = '<div class="json-line">';

    if (key !== null) {
        html += '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ';
    }

    html += content;
    html += '</div>';

    return html;
};

/**
 * Initialize JSON viewers in a message element.
 * @private
 */
AIChat.prototype._initializeJsonViewers = function (element) {
    element.querySelectorAll('.json-viewer').forEach(viewer => {
        const jsonData = viewer.getAttribute('data-json');
        if (!jsonData) {
            return;
        }

        try {
            const parsed = JSON.parse(jsonData);
            viewer.innerHTML = `<div class="json-wrapper">
                <button class="copy-code-button" title="Copy JSON" aria-label="Copy JSON">Copy</button>
                <div class="json-tree">${this._renderJsonValue(parsed, null, true)}</div>
            </div>`;

            this._setupJsonToggleHandlers(viewer);

            const copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(JSON.stringify(parsed, null, 2), e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = `Error rendering JSON: ${e.message}`;
        }
    });

    element.querySelectorAll('.code-viewer').forEach(viewer => {
        const code = viewer.getAttribute('data-code');
        const lang = viewer.getAttribute('data-lang');
        if (!code) {
            return;
        }

        try {
            viewer.innerHTML = this._renderCodeBlock(code, lang);

            const copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(code, e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = `Error rendering code: ${e.message}`;
        }
    });
};

/**
 * Setup toggle handlers for JSON expand/collapse.
 * @private
 */
AIChat.prototype._setupJsonToggleHandlers = function (viewer) {
    viewer.querySelectorAll('.json-toggle').forEach(toggle => {
        toggle.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();

            const content = document.getElementById(toggle.getAttribute('data-target'));
            if (content) {
                const isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? 'block' : 'none';
                toggle.textContent = isCollapsed ? '▼' : '▶';
            }
        });
    });
};

/**
 * Render code block as DOM elements.
 * @private
 */
AIChat.prototype._renderCodeBlock = function (code, lang) {
    const lines = code.split('\n');
    const linesHtml = lines.map(line => {
        const escapedLine = this._escapeHtml(line || ' ');
        return `<div class="code-line">${escapedLine}</div>`;
    }).join('');

    const langLabel = lang && lang !== 'plaintext' ? `<div class="code-lang">${lang}</div>` : '';
    const copyButton = '<button class="copy-code-button" title="Copy code" aria-label="Copy code">Copy</button>';

    return `<div class="code-wrapper">${langLabel}${copyButton}<div class="code-content">${linesHtml}</div></div>`;
};

/**
 * Check if user is scrolled to bottom (within threshold).
 * @private
 * @returns {boolean}
 */
AIChat.prototype._isScrolledToBottom = function () {
    const messagesContainer = document.getElementById('ai-messages-container');
    if (!messagesContainer) {
        return true;
    }

    const threshold = 100;
    const scrollPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
    const scrollHeight = messagesContainer.scrollHeight;

    return scrollHeight - scrollPosition < threshold;
};

/**
 * Scroll messages container to bottom (only if user is already at bottom).
 * @private
 * @param {boolean} force - Force scroll even if user scrolled up
 */
AIChat.prototype._scrollToBottom = function (force) {
    const messagesContainer = document.getElementById('ai-messages-container');
    if (!messagesContainer || messagesContainer.scrollHeight === undefined) {
        return;
    }

    if (force || this._isScrolledToBottom()) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};

/**
 * Debounced render for streaming content to improve performance.
 * @private
 * @param {string} content - Content to render
 */
AIChat.prototype._debouncedRender = function (content) {
    this._pendingRender = content;

    if (this._renderDebounceTimer) {
        return;
    }

    this._renderDebounceTimer = setTimeout(() => {
        if (this._pendingRender && this._streamingMessageElement) {
            this._streamingMessageElement.innerHTML = this._parseMarkdown(this._pendingRender);
            this._initializeJsonViewers(this._streamingMessageElement);
            this._scrollToBottom(false);
        }
        this._renderDebounceTimer = null;
    }, 50);
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

        this._addSystemMessage(warningMessage);
    }
};

/**
 * Clear current Inspection Context.
 * @private
 */
AIChat.prototype._clearContext = function () {
    this._currentContext = null;
    this._controller.updateInspectionContext(null);
    const contextInfo = document.getElementById('ai-context-info');
    contextInfo.style.display = 'none';

    this._addSystemMessage('❌ Context cleared - no control is currently selected');
};

/**
 * Update current Inspection Context (control and app info).
 * @param {Object} context - {control, appInfo}
 */
AIChat.prototype.updateContext = function (context) {
    this._currentContext = context;
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
    this._scrollToBottom(true);
};

/**
 * Set current inspected URL.
 * @param {string} url
 */
AIChat.prototype.setUrl = function (url) {
    if (this._currentUrl !== url) {
        this._currentUrl = url;
        // Controller owns the actual session reseed; the view just notifies it.
        this._controller.setUrl(url);
    }
};

/**
 * Copy text to clipboard.
 * @private
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - The button element that triggered the copy
 */
AIChat.prototype._copyToClipboard = function (text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    textarea.setSelectionRange(0, text.length);

    try {
        const successful = document.execCommand('copy');

        if (successful) {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.disabled = true;

            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 1500);
        } else {
            this._addSystemMessage('Failed to copy to clipboard');
        }
    } catch (err) {
        this._addSystemMessage('Failed to copy to clipboard');
    } finally {
        document.body.removeChild(textarea);
    }
};

/**
 * Destroy the component and cleanup.
 */
AIChat.prototype.destroy = function () {
    this._controller.destroy();
};

module.exports = AIChat;
