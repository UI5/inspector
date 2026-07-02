'use strict';

/**
 * Renders the assistant transcript. Owns markdown parsing, JSON viewer expand/collapse, code viewer
 * rendering, scroll bookkeeping, the streaming render debounce, clipboard helpers, and HTML
 * escaping.
 *
 * Does not own:
 *  - Conversation memory persistence (see {@link ConversationStore})
 *  - Capability state, controller communication, or session lifecycle
 *  - AIChat banner, input area, dialogs, token counter
 *
 * @param {HTMLElement} container - DOM host. Written into directly.
 * @param {Object} [options]
 * @param {number} [options.maxJsonDepth=10] - Max depth before the JSON viewer renders a "max depth
 *                 reached" sentinel.
 * @param {number} [options.streamDebounceMs=50] - Coalescing interval for streaming renders.
 * @param {Function} [options.onCopyFailed] - Called when a clipboard copy fails. The transcript
 *                 does not render error UI; the view surfaces the failure.
 * @constructor
 */
function AssistantTranscript(container, options = {}) {
    if (!container) {
        throw new Error('AssistantTranscript requires a container element');
    }
    this._container = container;
    this._maxJsonDepth = typeof options.maxJsonDepth === 'number' ? options.maxJsonDepth : 10;
    this._streamDebounceMs = typeof options.streamDebounceMs === 'number' ? options.streamDebounceMs : 50;
    this._onCopyFailed = typeof options.onCopyFailed === 'function' ? options.onCopyFailed : null;
    this._renderEmptyState();
}

AssistantTranscript.prototype._renderEmptyState = function () {
    // Safe innerHTML: literal string, no user- or model-controlled interpolation. Later appends route content through _escapeHtml (user/system) or _parseMarkdown (assistant).
    this._container.innerHTML = '' +
        '<div class="ai-welcome-message">' +
            '<h3>UI5 AI Assistant</h3>' +
            '<span class="experimental-tag">Experimental</span>' +
            '<p>Ask questions about UI5 controls, debugging, or general development topics.</p>' +
            '<p>Select a control in the Control Inspector to automatically include context in your questions.</p>' +
        '</div>';
};

/**
 * @param {string} content - Raw user input, escaped before insertion.
 * @returns {HTMLElement}
 */
AssistantTranscript.prototype.appendUserTurn = function (content) {
    return this._appendMessage('user', content);
};

/**
 * @param {string} message - Plain text, escaped before insertion.
 * @returns {HTMLElement}
 */
AssistantTranscript.prototype.appendSystemMessage = function (message) {
    return this._appendMessage('system', message);
};

/**
 * Begin a streaming assistant turn.
 *
 * Creates a placeholder with a loading indicator. Returns a handle the caller drives with chunks
 * until the stream finalizes.
 *
 * @returns {{
 *   streamChunk: function(string): void,
 *   finalize: function(string): void
 * }}
 */
AssistantTranscript.prototype.beginAssistantTurn = function () {
    const messageElement = this._appendMessage('assistant', '', false);
    const contentElement = messageElement.querySelector('.message-content');

    const loadingIndicator = document.createElement('span');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.textContent = 'Thinking';
    const loadingDots = document.createElement('span');
    loadingDots.className = 'loading-dots';
    loadingIndicator.appendChild(loadingDots);
    contentElement.appendChild(loadingIndicator);

    let buffer = '';
    let debounceTimer = null;
    let pendingText = null;

    const flush = () => {
        if (pendingText !== null && contentElement.isConnected !== false) {
            contentElement.innerHTML = this._parseMarkdown(pendingText);
            this._initializeJsonViewers(contentElement);
            this.scrollToBottom(false);
        }
        debounceTimer = null;
    };

    return {
        streamChunk: (chunk) => {
            buffer += chunk;
            pendingText = buffer;
            if (debounceTimer) {
                return;
            }
            debounceTimer = setTimeout(flush, this._streamDebounceMs);
        },
        finalize: (fullContent) => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            pendingText = null;
            buffer = '';

            contentElement.innerHTML = this._parseMarkdown(fullContent);
            this._initializeJsonViewers(contentElement);

            // Skip the copy button when the response is a single code/JSON block — those blocks already carry their own copy affordance.
            if (!this._isOnlyCodeOrJsonBlock(contentElement)) {
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-response-button';
                copyButton.title = 'Copy response';
                copyButton.setAttribute('aria-label', 'Copy response');
                copyButton.textContent = 'Copy';
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(fullContent, e.currentTarget);
                });
                messageElement.appendChild(copyButton);
            }

            // Do not scroll on finalize. The debounced chunk render already scrolled. Skipping here means a developer who scrolled up to read an earlier turn is not yanked to the bottom on stream completion.
        }
    };
};

AssistantTranscript.prototype.clear = function () {
    // Safe innerHTML: literal string with no interpolation.
    this._container.innerHTML = '' +
        '<div class="ai-welcome-message">' +
            '<h3>UI5 AI Assistant</h3>' +
            '<p>Chat history cleared. Ask me anything!</p>' +
        '</div>';
};

/**
 * @param {Array<{role: string, content: string}>} turns - May be empty.
 */
AssistantTranscript.prototype.reset = function (turns) {
    this._container.innerHTML = '';
    if (!turns || turns.length === 0) {
        return;
    }
    for (let i = 0; i < turns.length; i++) {
        this._appendMessage(turns[i].role, turns[i].content);
    }
    this.scrollToBottom(true);
};

/**
 * Scroll the host to its bottom.
 *
 * @param {boolean} force - When true, scroll unconditionally. When false, scroll only if already
 *                          near the bottom, so a streaming turn does not yank the reader's
 *                          position.
 */
AssistantTranscript.prototype.scrollToBottom = function (force) {
    const container = this._container;
    if (!container || container.scrollHeight === undefined) {
        return;
    }
    if (force || this._isScrolledToBottom()) {
        container.scrollTop = container.scrollHeight;
    }
};

/**
 * Tear-down hook. Streaming timers live in the closure returned by {@link
 * AssistantTranscript#beginAssistantTurn}, so no instance-level timer to cancel. Kept for symmetry.
 */
AssistantTranscript.prototype.destroy = function () {};

AssistantTranscript.prototype._isScrolledToBottom = function () {
    const container = this._container;
    if (!container) {
        return true;
    }
    const threshold = 100;
    const scrollPosition = container.scrollTop + container.clientHeight;
    const scrollHeight = container.scrollHeight;
    return scrollHeight - scrollPosition < threshold;
};

AssistantTranscript.prototype._appendMessage = function (role, content, showCopyButton) {
    const welcomeMessage = this._container.querySelector('.ai-welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageElement = document.createElement('div');
    messageElement.className = 'ai-message message-' + role;

    const formattedContent = role === 'assistant' ? this._parseMarkdown(content) : this._escapeHtml(content);
    const shouldShowCopyButton = role === 'assistant' && (showCopyButton === undefined || showCopyButton === true);
    const roleLabel = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System';

    // Safe innerHTML: roleLabel is from a fixed set, formattedContent is either escaped or markdown-parsed (which itself escapes anything it does not turn into a known formatting tag).
    messageElement.innerHTML = '' +
        '<div class="message-header">' +
            '<span class="message-role">' + roleLabel + '</span>' +
        '</div>' +
        '<div class="message-content">' + formattedContent + '</div>';

    this._container.appendChild(messageElement);

    if (role === 'assistant') {
        const contentElement = messageElement.querySelector('.message-content');
        this._initializeJsonViewers(contentElement);

        // Skip the copy button when the response is a single code/JSON block — those blocks already carry their own copy affordance.
        if (shouldShowCopyButton && !this._isOnlyCodeOrJsonBlock(contentElement)) {
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

    this.scrollToBottom(true);
    return messageElement;
};

/**
 * Whether a rendered assistant message consists of a single code or JSON block and nothing else.
 * Used to suppress the message-level copy button when the built-in copy affordance on the block
 * would be redundant.
 * @private
 * @param {HTMLElement} contentElement
 * @returns {boolean}
 */
AssistantTranscript.prototype._isOnlyCodeOrJsonBlock = function (contentElement) {
    const clone = contentElement.cloneNode(true);
    const blocks = clone.querySelectorAll('.code-viewer, .json-viewer');
    if (blocks.length !== 1) {
        return false;
    }
    blocks[0].remove();
    return clone.textContent.replace(/\s/g, '') === '';
};

AssistantTranscript.prototype._escapeHtml = function (text) {
    const div = document.createElement('div');
    div.textContent = (text === null || text === undefined) ? '' : String(text);
    return div.innerHTML;
};

AssistantTranscript.prototype._parseMarkdown = function (text) {
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

AssistantTranscript.prototype._extractCodeBlocks = function (text, placeholders) {
    return text.replace(/```([\w]*)?\n([\s\S]*?)```/g, function (match, lang, code) {
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

        return '___CODEBLOCK_' + index + '___';
    });
};

AssistantTranscript.prototype._extractInlineCode = function (text, placeholders) {
    return text.replace(/`([^`]+)`/g, function (match, code) {
        const index = placeholders.inlineCode.length;
        placeholders.inlineCode.push(code);
        return '___INLINECODE_' + index + '___';
    });
};

AssistantTranscript.prototype._applyMarkdownFormatting = function (text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\b__([^_]+)__\b/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)([^*<>]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
};

AssistantTranscript.prototype._restoreInlineCode = function (text, inlineCode) {
    inlineCode.forEach((code, index) => {
        text = text.replace('___INLINECODE_' + index + '___', '<code>' + this._escapeHtml(code) + '</code>');
    });
    return text;
};

AssistantTranscript.prototype._restoreCodeBlocks = function (text, codeBlocks) {
    codeBlocks.forEach((block, index) => {
        let replacement;
        if (block.type === 'json') {
            replacement = this._createJsonViewer(block.data);
        } else {
            replacement = this._createCodeViewer(block.code, block.lang);
        }
        text = text.replace('___CODEBLOCK_' + index + '___', replacement);
    });
    return text;
};

AssistantTranscript.prototype._createJsonViewer = function (data) {
    const jsonString = JSON.stringify(data).replace(/'/g, '&#39;');
    return '<div class="json-viewer" data-json=\'' + jsonString + '\'></div>';
};

AssistantTranscript.prototype._createCodeViewer = function (code, lang) {
    const escapedCode = code.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return '<div class="code-viewer" data-code=\'' + escapedCode + '\' data-lang=\'' + lang + '\'></div>';
};

AssistantTranscript.prototype._renderJsonValue = function (value, key, isLast, depth) {
    depth = depth || 0;

    if (depth > this._maxJsonDepth) {
        const commaTrunc = isLast ? '' : ',';
        return this._renderJsonLine(key, '<span class="json-truncated">[Max depth reached]</span>' + commaTrunc);
    }

    const comma = isLast ? '' : ',';
    const handlers = {
        'null': () => this._renderJsonLine(key, '<span class="json-null">null</span>' + comma),
        'boolean': () => this._renderJsonLine(key, '<span class="json-boolean">' + value + '</span>' + comma),
        'number': () => this._renderJsonLine(key, '<span class="json-number">' + value + '</span>' + comma),
        'string': () => this._renderJsonString(key, value, comma),
        'array': () => this._renderJsonArray(key, value, comma, depth),
        'object': () => this._renderJsonObject(key, value, comma, depth)
    };

    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    return handlers[type] ? handlers[type]() : this._renderJsonLine(key, this._escapeHtml(String(value)) + comma);
};

AssistantTranscript.prototype._renderJsonString = function (key, value, comma) {
    const escaped = this._escapeHtml(value);
    return this._renderJsonLine(key, '<span class="json-string">"' + escaped + '"</span>' + comma);
};

AssistantTranscript.prototype._renderJsonArray = function (key, value, comma, depth) {
    if (value.length === 0) {
        return this._renderJsonLine(key, '<span class="json-bracket">[]</span>' + comma);
    }

    const id = 'json-' + Math.random().toString(36).substring(2, 11);
    const keyHtml = key ? '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ' : '';
    const items = value.map((item, i) => {
        return this._renderJsonValue(item, null, i === value.length - 1, depth + 1);
    }).join('');

    return '<div class="json-line">' + keyHtml + '<span class="json-toggle" data-target="' + id + '">\u25BC</span> <span class="json-bracket">[</span><span class="json-count">' + value.length + ' items</span></div>' +
        '<div class="json-content" id="' + id + '">' + items + '<div class="json-line"><span class="json-bracket">]</span>' + comma + '</div></div>';
};

AssistantTranscript.prototype._renderJsonObject = function (key, value, comma, depth) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
        return this._renderJsonLine(key, '<span class="json-bracket">{}</span>' + comma);
    }

    const id = 'json-' + Math.random().toString(36).substring(2, 11);
    const keyHtml = key ? '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ' : '';
    const items = keys.map((k, i) => {
        return this._renderJsonValue(value[k], k, i === keys.length - 1, depth + 1);
    }).join('');

    return '<div class="json-line">' + keyHtml + '<span class="json-toggle" data-target="' + id + '">\u25BC</span> <span class="json-bracket">{</span><span class="json-count">' + keys.length + ' keys</span></div>' +
        '<div class="json-content" id="' + id + '">' + items + '<div class="json-line"><span class="json-bracket">}</span>' + comma + '</div></div>';
};

AssistantTranscript.prototype._renderJsonLine = function (key, content) {
    let html = '<div class="json-line">';
    if (key !== null) {
        html += '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ';
    }
    html += content;
    html += '</div>';
    return html;
};

AssistantTranscript.prototype._initializeJsonViewers = function (element) {
    element.querySelectorAll('.json-viewer').forEach((viewer) => {
        const jsonData = viewer.getAttribute('data-json');
        if (!jsonData) {
            return;
        }
        try {
            const parsed = JSON.parse(jsonData);
            viewer.innerHTML = '<div class="json-wrapper">' +
                '<button class="copy-code-button" title="Copy JSON" aria-label="Copy JSON">Copy</button>' +
                '<div class="json-tree">' + this._renderJsonValue(parsed, null, true) + '</div>' +
                '</div>';

            this._setupJsonToggleHandlers(viewer);

            const copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', (e) => {
                    this._copyToClipboard(JSON.stringify(parsed, null, 2), e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = 'Error rendering JSON: ' + e.message;
        }
    });

    element.querySelectorAll('.code-viewer').forEach((viewer) => {
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
            viewer.textContent = 'Error rendering code: ' + e.message;
        }
    });
};

AssistantTranscript.prototype._setupJsonToggleHandlers = function (viewer) {
    viewer.querySelectorAll('.json-toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const content = document.getElementById(toggle.getAttribute('data-target'));
            if (content) {
                const isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? 'block' : 'none';
                toggle.textContent = isCollapsed ? '\u25BC' : '\u25B6';
            }
        });
    });
};

AssistantTranscript.prototype._renderCodeBlock = function (code, lang) {
    const lines = code.split('\n');
    const linesHtml = lines.map((line) => {
        const escapedLine = this._escapeHtml(line || ' ');
        return '<div class="code-line">' + escapedLine + '</div>';
    }).join('');

    const langLabel = lang && lang !== 'plaintext' ? '<div class="code-lang">' + lang + '</div>' : '';
    const copyButton = '<button class="copy-code-button" title="Copy code" aria-label="Copy code">Copy</button>';

    return '<div class="code-wrapper">' + langLabel + copyButton + '<div class="code-content">' + linesHtml + '</div></div>';
};

/**
 * Copy text to the clipboard via execCommand. The DevTools panel may lack user-activation for the
 * async Clipboard API, so the legacy path is used. On failure, invokes `onCopyFailed`.
 * @private
 */
AssistantTranscript.prototype._copyToClipboard = function (text, button) {
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

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (err) {
        copied = false;
    } finally {
        document.body.removeChild(textarea);
    }

    if (copied) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.disabled = true;
        setTimeout(function () {
            button.textContent = originalText;
            button.disabled = false;
        }, 1500);
    } else if (this._onCopyFailed) {
        this._onCopyFailed();
    }
};

module.exports = AssistantTranscript;
