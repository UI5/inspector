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
    this._streamingMessageElement = null;
    this._getAppInfo = options.getAppInfo || null;

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
        <div class="ai-chat-wrapper">
            <div class="ai-status-banner" id="ai-status-banner">
                <div class="status-content">
                    <span class="status-indicator"></span>
                    <span class="status-text">Checking model status...</span>
                </div>
                <button class="download-button" id="ai-download-button" style="display: none;">
                    Download Model
                </button>
                <button class="clear-history-button" id="ai-clear-history-button" style="display: none;">
                    Clear History
                </button>
            </div>

            <div class="ai-messages-container" id="ai-messages-container">
                <div class="ai-welcome-message">
                    <h3>UI5 AI Assistant</h3>
                    <p>Ask questions about UI5 controls, debugging, or general development topics.</p>
                    <p>Select a control in the Control Inspector to automatically include context in your questions.</p>
                </div>
            </div>

            <div class="ai-input-area">
                <div class="context-info" id="ai-context-info" style="display: none;">
                    <span class="context-icon">🎯</span>
                    <span class="context-text"></span>
                </div>
                <div class="input-wrapper">
                    <textarea
                        class="ai-input"
                        id="ai-input"
                        placeholder="Ask me anything about UI5..."
                        rows="1"
                    ></textarea>
                    <button class="ai-send-button" id="ai-send-button" disabled>
                        Send
                    </button>
                </div>
                <div class="input-footer">
                    <span class="token-counter" id="ai-token-counter"></span>
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

    // Send message on button click
    sendButton.addEventListener('click', () => {
        this._handleSendMessage();
    });

    // Send message on Ctrl/Cmd + Enter
    input.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) && e.key === 'Enter') {
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
 * Initialize AI session.
 * @private
 */
AIChat.prototype._initializeSession = async function () {
    try {
        await this._sessionManager.createSession();
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
    downloadButton.disabled = true;

    try {
        this._renderModelStatus('downloading', 0, 'Starting download...');

        await this._sessionManager.downloadModel((progress) => {
            const percent = Math.round(progress * 100);
            this._renderModelStatus('downloading', progress, `Downloading: ${percent}%`);
        });

        this._renderModelStatus('ready', 1, 'Model ready!');

        // Initialize session after download
        await this._initializeSession();

    } catch (error) {
        this._renderModelStatus('error', 0, `Download failed: ${error.message}`);
        downloadButton.disabled = false;
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

        // Create placeholder for AI response
        const messageElement = this._addMessage('assistant', '');
        this._streamingMessageElement = messageElement.querySelector('.message-content');

        // Build conversation history (exclude the placeholder we just added)
        const conversationHistory = this._messages.slice(0, -1);

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

        // Get streaming response
        const stream = await this._sessionManager.promptStreaming(
            userMessage,
            conversationHistory,
            context
        );

        let fullResponse = '';

        // Process stream
        for await (const chunk of stream) {
            fullResponse += chunk;
            this._streamingMessageElement.textContent = fullResponse;
            this._scrollToBottom();
        }

        // Save AI response to storage
        await this._storageManager.saveMessage(this._currentUrl, {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now()
        });

        this._isStreaming = false;
        this._streamingMessageElement = null;

        // Update token counter
        this._updateTokenCounter();

    } catch (error) {
        this._addSystemMessage(`Error: ${error.message}`);
        this._isStreaming = false;
        this._streamingMessageElement = null;
    }
};

/**
 * Handle clear history.
 * @private
 */
AIChat.prototype._handleClearHistory = async function () {
    if (!confirm('Clear chat history for this page? This cannot be undone.')) {
        return;
    }

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
 * Add a message to the chat UI.
 * @param {string} role - 'user', 'assistant', or 'system'
 * @param {string} content - Message content
 * @returns {HTMLElement} - The message element
 */
AIChat.prototype._addMessage = function (role, content) {
    const messagesContainer = document.getElementById('ai-messages-container');

    // Remove welcome message if it exists
    const welcomeMessage = messagesContainer.querySelector('.ai-welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = 'ai-message message-' + role;

    const timestamp = new Date().toLocaleTimeString();

    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-role">${role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System'}</span>
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-content">${this._escapeHtml(content)}</div>
    `;

    messagesContainer.appendChild(messageElement);
    this._scrollToBottom();

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
 * Scroll messages container to bottom.
 * @private
 */
AIChat.prototype._scrollToBottom = function () {
    const messagesContainer = document.getElementById('ai-messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

/**
 * Update token counter display.
 * @private
 */
AIChat.prototype._updateTokenCounter = async function () {
    const counter = document.getElementById('ai-token-counter');

    try {
        const usageInfo = await this._sessionManager.getUsageInfo();

        if (usageInfo) {
            counter.textContent = `Tokens: ${usageInfo.inputUsage}/${usageInfo.inputQuota} (${usageInfo.percentUsed}%)`;
            counter.classList.toggle('warning', usageInfo.percentUsed >= 90);
        } else {
            counter.textContent = '';
        }
    } catch (error) {
        counter.textContent = '';
    }
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

    // Scroll to bottom
    this._scrollToBottom();
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
    try {
        const messages = await this._storageManager.loadHistory(this._currentUrl);

        if (messages.length > 0) {
            const messagesContainer = document.getElementById('ai-messages-container');
            messagesContainer.innerHTML = '';

            messages.forEach(msg => {
                this._addMessage(msg.role, msg.content);
            });

            document.getElementById('ai-clear-history-button').style.display = 'inline-block';
            this._scrollToBottom();
        }
    } catch (error) {
        // Fail silently
    }
};

/**
 * Destroy the component and cleanup.
 */
AIChat.prototype.destroy = function () {
    this._sessionManager.destroy();
};

module.exports = AIChat;
