'use strict';

var AISessionManager = require('../ai/AISessionManager.js');
var ChatStorageManager = require('../ai/ChatStorageManager.js');

/**
 * AIChat - UI component for AI chat interface.
 * @param {string} containerId - ID of container element
 * @param {Object} options - Configuration options
 * @constructor
 */
function AIChat(containerId, options) {
    this._container = document.getElementById(containerId);
    this._options = options || {};

    this._sessionManager = new AISessionManager();
    this._storageManager = new ChatStorageManager();

    this._currentUrl = null;
    this._currentContext = null;
    this._messages = [];
    this._isStreaming = false;
    this._isReseedingSession = false;
    this._streamingMessageElement = null;
    this._streamingMessageHeader = null;
    this._getAppInfo = options.getAppInfo || null;
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

    // Send message on button click
    sendButton.addEventListener('click', () => {
        this._handleSendMessage();
    });

    // Send message on Enter
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this._handleSendMessage();
        }
    });

    // Enable/disable send button based on input
    input.addEventListener('input', () => {
        const hasText = input.value.trim().length > 0;
        const canSend = hasText && !this._isStreaming;
        sendButton.disabled = !canSend;
    });

    // Download model button
    downloadButton.addEventListener('click', () => {
        this._handleDownloadModel();
    });

    // Clear history button
    clearHistoryButton.addEventListener('click', () => {
        this._handleClearHistory();
    });

    // Clear context button
    contextClearButton.addEventListener('click', () => {
        this._clearContext();
    });

    // Confirmation dialog buttons
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

    // Click on overlay to cancel
    confirmDialog.querySelector('.confirm-overlay').addEventListener('click', () => {
        this._hideConfirmDialog();
    });

    // ESC key to close dialog
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
 * Check model availability and update UI.
 * @private
 */
AIChat.prototype._checkModelAvailability = async function () {
    try {
        const availability = await this._sessionManager.checkAvailability();

        if (availability.status === 'ready') {
            this._renderModelStatus('ready', 0, 'Gemini Nano is ready');
            // Initialize session to show token counter
            await this._initializeSession();
        } else if (availability.status === 'needs-download') {
            this._renderModelStatus('needs-download', 0, availability.message);
        } else {
            this._renderModelStatus('unavailable', 0, availability.message);
        }
    } catch (error) {
        this._renderModelStatus('error', 0, `Error: ${error.message}`);
    }
};

/**
 * Initialize AI session, seeding system prompt + any prior conversation
 * (so the model "remembers" history loaded from storage).
 * @private
 */
AIChat.prototype._initializeSession = async function () {
    try {
        var appInfo = null;
        if (this._getAppInfo) {
            appInfo = this._getAppInfo();
        } else if (this._currentContext) {
            appInfo = this._currentContext.appInfo;
        }

        const initialPrompts = [
            { role: 'system', content: this._sessionManager.buildSystemPrompt(appInfo) }
        ];

        // Replay prior user/assistant turns; skip UI-only 'system' notices
        // and empty placeholders (e.g. the assistant slot added mid-stream).
        this._messages.forEach(m => {
            if ((m.role === 'user' || m.role === 'assistant') && m.content) {
                initialPrompts.push({ role: m.role, content: m.content });
            }
        });

        await this._sessionManager.createSession(initialPrompts);
        document.getElementById('ai-clear-history-button').style.display = 'inline-block';
        this._updateTokenCounter();
    } catch (error) {
        this._addSystemMessage(`Error initializing session: ${error.message}`);
    }
};

/**
 * Handle model download.
 * @private
 */
AIChat.prototype._handleDownloadModel = async function () {
    const downloadButton = document.getElementById('ai-download-button');
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');

    // Disable UI during download
    downloadButton.disabled = true;
    input.disabled = true;
    sendButton.disabled = true;

    try {
        this._renderModelStatus('downloading', 0, 'Starting download...');

        await this._sessionManager.downloadModel((progress) => {
            const percent = Math.round(progress * 100);
            this._renderModelStatus('downloading', progress, `Downloading: ${percent}%`);
        });

        this._renderModelStatus('ready', 1, 'Model ready!');

        // Initialize session after download
        await this._initializeSession();

        // Re-enable UI after successful download
        input.disabled = false;
        sendButton.disabled = !input.value.trim().length;

    } catch (error) {
        this._renderModelStatus('error', 0, `Download failed: ${error.message}`);
        downloadButton.disabled = false;
        input.disabled = false;
    }
};

/**
 * Handle send message.
 * @private
 */
AIChat.prototype._handleSendMessage = async function () {
    const input = document.getElementById('ai-input');
    const userMessage = input.value.trim();

    if (!userMessage || this._isStreaming) {
        return;
    }

    if (!this._sessionManager.hasActiveSession()) {
        try {
            await this._initializeSession();
        } catch (error) {
            this._addSystemMessage(`Failed to create session: ${error.message}`);
            return;
        }
    }

    // Clear input
    input.value = '';
    document.getElementById('ai-send-button').disabled = true;

    // Add user message to UI
    this._addMessage('user', userMessage);

    // Save user message to storage
    await this._storageManager.saveMessage(this._currentUrl, {
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
    });

    // Get AI response
    try {
        this._isStreaming = true;

        // Create placeholder for AI response without copy button (will add after completion)
        const messageElement = this._addMessage('assistant', '', false);
        this._streamingMessageElement = messageElement.querySelector('.message-content');
        this._streamingMessageHeader = messageElement;

        // Add loading indicator as DOM elements (not HTML string to avoid escaping)
        const loadingIndicator = document.createElement('span');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.textContent = 'Thinking';
        const loadingDots = document.createElement('span');
        loadingDots.className = 'loading-dots';
        loadingIndicator.appendChild(loadingDots);
        this._streamingMessageElement.appendChild(loadingIndicator);

        // Get app info for context
        var appInfo = null;
        if (this._getAppInfo) {
            appInfo = this._getAppInfo();
        } else if (this._currentContext) {
            appInfo = this._currentContext.appInfo;
        }

        // Build context object
        const context = {
            control: this._currentContext ? this._currentContext.control : null,
            appInfo: appInfo
        };

        // Get streaming response — session retains history internally.
        const stream = await this._sessionManager.promptStreaming(
            userMessage,
            context
        );

        let fullResponse = '';

        // Process stream
        // Note: Chrome Prompt API returns delta chunks (not cumulative text)
        // in Chrome 132+, so we accumulate with +=
        for await (const chunk of stream) {
            fullResponse += chunk;
            this._debouncedRender(fullResponse);
        }

        // Final render after stream completes
        if (this._renderDebounceTimer) {
            clearTimeout(this._renderDebounceTimer);
            this._renderDebounceTimer = null;
        }
        this._streamingMessageElement.innerHTML = this._parseMarkdown(fullResponse);
        this._initializeJsonViewers(this._streamingMessageElement);

        // Add copy button now that response is complete, unless it's only a code/JSON block
        const isOnlyBlock = this._isOnlyCodeOrJsonBlock(this._streamingMessageElement);
        if (!isOnlyBlock) {
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-response-button';
            copyButton.title = 'Copy response';
            copyButton.setAttribute('aria-label', 'Copy response');
            copyButton.textContent = 'Copy';
            copyButton.addEventListener('click', (e) => {
                this._copyToClipboard(fullResponse, e.currentTarget);
            });
            this._streamingMessageHeader.appendChild(copyButton);
        }

        // Save AI response to storage
        await this._storageManager.saveMessage(this._currentUrl, {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now()
        });

        this._isStreaming = false;
        this._streamingMessageElement = null;
        this._streamingMessageHeader = null;

        // Update token counter
        this._updateTokenCounter();

    } catch (error) {
        this._addSystemMessage(`Error: ${error.message}`);
        this._isStreaming = false;
        this._streamingMessageElement = null;
        this._streamingMessageHeader = null;
    }
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

    // Store the element that had focus
    this._previousFocus = document.activeElement;

    // Focus the cancel button (safer default)
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

    // Restore focus to the element that had focus before dialog opened
    if (this._previousFocus) {
        this._previousFocus.focus();
    }
};

/**
 * Perform clear history action.
 * @private
 */
AIChat.prototype._performClearHistory = async function () {
    try {
        await this._storageManager.clearHistory(this._currentUrl);

        // Clear messages from UI
        this._messages = [];
        const messagesContainer = document.getElementById('ai-messages-container');
        messagesContainer.innerHTML = `
            <div class="ai-welcome-message">
                <h3>UI5 AI Assistant</h3>
                <p>Chat history cleared. Ask me anything!</p>
            </div>
        `;

        // Destroy and recreate session to reset token counter
        this._sessionManager.destroy();
        await this._initializeSession();

        // Reset usage warning flag
        this._hasShownUsageWarning = false;

        this._addSystemMessage('Chat history cleared');

    } catch (error) {
        this._addSystemMessage(`Error clearing history: ${error.message}`);
    }
};

/**
 * Render model status banner.
 * @param {string} status - Status: 'ready', 'needs-download', 'downloading', 'unavailable', 'error'
 * @param {number} progress - Download progress (0-1)
 * @param {string} message - Status message
 */
AIChat.prototype._renderModelStatus = function (status, progress, message) {
    const banner = document.getElementById('ai-status-banner');
    const statusText = banner.querySelector('.status-text');
    const downloadButton = document.getElementById('ai-download-button');

    banner.className = 'ai-status-banner status-' + status;
    statusText.textContent = message;

    // Show/hide download button
    if (status === 'needs-download') {
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
 * Check if a message content element contains only a single code or JSON block with no other text.
 * @private
 * @param {HTMLElement} contentElement
 * @returns {boolean}
 */
AIChat.prototype._isOnlyCodeOrJsonBlock = function (contentElement) {
    var clone = contentElement.cloneNode(true);
    var blocks = clone.querySelectorAll('.code-viewer, .json-viewer');
    if (blocks.length !== 1) {
        return false;
    }
    blocks[0].remove();
    return clone.textContent.replace(/\s/g, '') === '';
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

    // Remove welcome message if it exists
    const welcomeMessage = messagesContainer.querySelector('.ai-welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = 'ai-message message-' + role;

    // Use markdown rendering for AI responses, escape HTML for user/system messages
    const formattedContent = role === 'assistant' ? this._parseMarkdown(content) : this._escapeHtml(content);

    // Default showCopyButton to true for assistant messages
    const shouldShowCopyButton = role === 'assistant' && (showCopyButton === undefined || showCopyButton === true);

    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-role">${role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System'}</span>
        </div>
        <div class="message-content">${formattedContent}</div>
    `;

    messagesContainer.appendChild(messageElement);

    // Initialize JSON viewers if this is an assistant message
    if (role === 'assistant') {
        const contentElement = messageElement.querySelector('.message-content');
        this._initializeJsonViewers(contentElement);

        if (shouldShowCopyButton) {
            const isOnlyBlock = this._isOnlyCodeOrJsonBlock(contentElement);
            if (!isOnlyBlock) {
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-response-button';
                copyButton.title = 'Copy response';
                copyButton.setAttribute('aria-label', 'Copy response');
                copyButton.textContent = 'Copy';
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(content, e.currentTarget);
                });
                messageElement.appendChild(copyButton);
            }
        }
    }

    // Force scroll to bottom when adding new message
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

    // Step 1: Extract code blocks and inline code
    let html = this._extractCodeBlocks(text, placeholders);
    html = this._extractInlineCode(html, placeholders);

    // Step 2: Escape HTML
    html = this._escapeHtml(html);

    // Step 3: Apply markdown formatting
    html = this._applyMarkdownFormatting(html);

    // Step 4: Trim trailing whitespace before converting line breaks
    html = html.trimEnd();

    // Step 5: Convert line breaks BEFORE restoring code (so <br> doesn't appear inside <code> tags)
    html = html.replace(/\n/g, '<br>');

    // Step 6: Restore code (after line breaks so code blocks keep their original formatting)
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
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // Bold
        .replace(/\b__([^_]+)__\b/g, '<strong>$1</strong>')   // Bold (alt)
        .replace(/(?<!\*)\*(?!\*)([^*<>]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')  // Italic
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');  // Links
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
            // Use data attribute approach like JSON viewer
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
    // Initialize JSON viewers
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

            // Add copy button event listener
            const copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(JSON.stringify(parsed, null, 2), e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = `Error rendering JSON: ${e.message}`;
            console.error('JSON viewer error:', e);
        }
    });

    // Initialize code viewers
    element.querySelectorAll('.code-viewer').forEach(viewer => {
        const code = viewer.getAttribute('data-code');
        const lang = viewer.getAttribute('data-lang');
        if (!code) {
            return;
        }

        try {
            viewer.innerHTML = this._renderCodeBlock(code, lang);

            // Add copy button event listener
            const copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(code, e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = `Error rendering code: ${e.message}`;
            console.error('Code viewer error:', e);
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

    const threshold = 100; // pixels from bottom
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

    // Only auto-scroll if user is already at bottom, or if forced
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
            // Don't force scroll during streaming - let user scroll freely
            this._scrollToBottom(false);
        }
        this._renderDebounceTimer = null;
    }, 50); // 50ms debounce
};

/**
 * Update token counter display.
 * @private
 */
AIChat.prototype._updateTokenCounter = async function () {
    const counter = document.getElementById('ai-token-counter');
    const input = document.getElementById('ai-input');
    const sendButton = document.getElementById('ai-send-button');

    try {
        const usageInfo = await this._sessionManager.getUsageInfo();

        if (usageInfo) {
            counter.textContent = `Tokens: ${usageInfo.inputUsage}/${usageInfo.inputQuota} (${usageInfo.percentUsed}%)`;

            // Remove all warning classes first
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

            // Show usage warning when reaching 70% (only once per session)
            this._checkTokenUsageWarning(usageInfo.percentUsed);
        } else {
            counter.textContent = '';
        }
    } catch (error) {
        counter.textContent = '';
    }
};

/**
 * Check if token usage warning should be displayed.
 * @private
 * @param {number} percentUsed - Percentage of token quota used
 */
AIChat.prototype._checkTokenUsageWarning = function (percentUsed) {
    // Show warning at 70% usage, only once per session
    if (percentUsed >= 70 && !this._hasShownUsageWarning) {
        this._hasShownUsageWarning = true;

        const warningMessage = '💡 Your conversation is getting long (' + percentUsed + '% of token limit used). ' +
            'For faster responses and better performance, consider clearing the chat history to start fresh. ' +
            'Click "Clear History" button above.';

        this._addSystemMessage(warningMessage);
    }
};

/**
 * Clear current context.
 * @private
 */
AIChat.prototype._clearContext = function () {
    this._currentContext = null;
    const contextInfo = document.getElementById('ai-context-info');
    contextInfo.style.display = 'none';

    // Add a system message to inform AI that context was cleared
    this._addSystemMessage('❌ Context cleared - no control is currently selected');
};

/**
 * Update current context (control and app info).
 * @param {Object} context - {control, appInfo}
 */
AIChat.prototype.updateContext = function (context) {
    this._currentContext = context;

    const contextInfo = document.getElementById('ai-context-info');
    const contextText = contextInfo.querySelector('.context-text');

    if (context && context.control) {
        contextInfo.style.display = 'flex';
        contextText.textContent = `Context: ${context.control.type || 'Control'} (${context.control.id || 'no ID'})`;
    } else {
        contextInfo.style.display = 'none';
    }
};

/**
 * Called when AI tab is activated.
 */
AIChat.prototype.onTabActivated = function () {
    // Load chat history if we have a URL
    if (this._currentUrl) {
        this._loadHistory();
    }

    // Force scroll to bottom when context changes
    this._scrollToBottom(true);
};

/**
 * Set current inspected URL.
 * @param {string} url
 */
AIChat.prototype.setUrl = function (url) {
    if (this._currentUrl !== url) {
        this._currentUrl = url;
        this._loadHistory();
    }
};

/**
 * Load chat history from storage.
 * @private
 */
AIChat.prototype._loadHistory = async function () {
    if (this._isStreaming || this._isReseedingSession) {
        return;
    }
    try {
        const messages = await this._storageManager.loadHistory(this._currentUrl);

        // Reset in-memory state before repopulating from storage —
        // _addMessage always pushes, so without this every tab switch duplicates.
        this._messages = [];
        const messagesContainer = document.getElementById('ai-messages-container');
        messagesContainer.innerHTML = '';

        if (messages.length > 0) {
            messages.forEach(msg => {
                this._addMessage(msg.role, msg.content);
            });

            document.getElementById('ai-clear-history-button').style.display = 'inline-block';
            // Force scroll to bottom when loading history
            this._scrollToBottom(true);
        }

        // Re-seed session regardless of history length: a fresh app context
        // (different framework version, theme, libraries) needs a new system prompt.
        if (this._sessionManager.hasActiveSession()) {
            this._isReseedingSession = true;
            try {
                this._sessionManager.destroy();
                await this._initializeSession();
            } finally {
                this._isReseedingSession = false;
            }
        }
    } catch (error) {
        this._isReseedingSession = false;
        // Fail silently
    }
};

/**
 * Copy text to clipboard.
 * @private
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - The button element that triggered the copy
 */
AIChat.prototype._copyToClipboard = function (text, button) {
    // Create temporary textarea (must be visible for copy to work)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Position off-screen but keep visible (opacity 0 can block copy in some contexts)
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    // Select the text
    textarea.focus();
    textarea.select();

    // For iOS compatibility
    textarea.setSelectionRange(0, text.length);

    try {
        // Execute copy command
        const successful = document.execCommand('copy');

        if (successful) {
            // Change button text to "Copied!"
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.disabled = true;

            // Revert back after 1.5 seconds
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 1500);
        } else {
            console.error('execCommand returned false');
            this._addSystemMessage('Failed to copy to clipboard');
        }
    } catch (err) {
        console.error('Copy failed:', err);
        this._addSystemMessage('Failed to copy to clipboard');
    } finally {
        // Clean up
        document.body.removeChild(textarea);
    }
};

/**
 * Destroy the component and cleanup.
 */
AIChat.prototype.destroy = function () {
    this._sessionManager.destroy();
};

module.exports = AIChat;
