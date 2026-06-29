'use strict';

/**
 * AssistantTranscript - presentation module for the Inspector AI Assistant.
 *
 * Owns the *rules* for rendering an assistant transcript inside a host
 * container: markdown parsing, JSON viewer expand/collapse, code viewer
 * rendering, scroll bookkeeping, the streaming render debounce, clipboard
 * helpers for copy buttons it itself injects, and HTML escaping. Exposes
 * a small stream-shaped interface so AIChat can drive it without
 * reaching past it into private helpers.
 *
 * Does not own:
 *  - Conversation Memory persistence (that lives in {@link ConversationStore})
 *  - Capability state, controller communication, or session lifecycle
 *  - AIChat banner, input area, dialogs, token counter
 *
 * @param {HTMLElement} container - The DOM element that hosts the
 *     transcript. AssistantTranscript writes directly into this element.
 * @param {Object} [options]
 * @param {number} [options.maxJsonDepth=10] - Max depth for the inline
 *     JSON viewer before it renders a "max depth reached" sentinel.
 * @param {number} [options.streamDebounceMs=50] - Coalescing interval
 *     for the streaming render loop.
 * @constructor
 */
function AssistantTranscript(container, options) {
    if (!container) {
        throw new Error('AssistantTranscript requires a container element');
    }
    options = options || {};
    this._container = container;
    this._maxJsonDepth = typeof options.maxJsonDepth === 'number' ? options.maxJsonDepth : 10;
    this._streamDebounceMs = typeof options.streamDebounceMs === 'number' ? options.streamDebounceMs : 50;
    this._renderEmptyState();
}

/**
 * Render the initial empty-state welcome panel inside the container.
 * @private
 */
AssistantTranscript.prototype._renderEmptyState = function () {
    // Safe innerHTML usage: literal string, no user- or model-controlled
    // interpolation. Every later append routes turn content through
    // _escapeHtml (user/system) or _parseMarkdown (assistant).
    this._container.innerHTML = '' +
        '<div class="ai-welcome-message">' +
            '<h3>UI5 AI Assistant</h3>' +
            '<span class="experimental-tag">Experimental</span>' +
            '<p>Ask questions about UI5 controls, debugging, or general development topics.</p>' +
            '<p>Select a control in the Control Inspector to automatically include context in your questions.</p>' +
        '</div>';
};

/**
 * Append a user-authored turn to the transcript.
 * @param {string} content - Raw user input, escaped before insertion.
 * @returns {HTMLElement} The message element appended to the container.
 */
AssistantTranscript.prototype.appendUserTurn = function (content) {
    return this._appendMessage('user', content);
};

/**
 * Append a system-authored message (status, error, hint) to the transcript.
 * @param {string} message - Plain text, escaped before insertion.
 * @returns {HTMLElement} The message element appended to the container.
 */
AssistantTranscript.prototype.appendSystemMessage = function (message) {
    return this._appendMessage('system', message);
};

/**
 * Begin a streaming assistant turn.
 *
 * Creates a placeholder assistant message with a loading indicator and
 * returns a small handle the caller can drive with chunks until the
 * stream finalizes. The handle is intentionally minimal: it does not
 * expose the underlying DOM nodes or the debounce timer.
 *
 * @returns {{
 *   streamChunk: function(string): void,
 *   finalize: function(string): void
 * }}
 */
AssistantTranscript.prototype.beginAssistantTurn = function () {
    var messageElement = this._appendMessage('assistant', '', false);
    var contentElement = messageElement.querySelector('.message-content');
    var headerElement = messageElement.querySelector('.message-header');

    var loadingIndicator = document.createElement('span');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.textContent = 'Thinking';
    var loadingDots = document.createElement('span');
    loadingDots.className = 'loading-dots';
    loadingIndicator.appendChild(loadingDots);
    contentElement.appendChild(loadingIndicator);

    var self = this;
    var buffer = '';
    var debounceTimer = null;
    var pendingText = null;

    function flush() {
        if (pendingText !== null && contentElement.isConnected !== false) {
            contentElement.innerHTML = self._parseMarkdown(pendingText);
            self._initializeJsonViewers(contentElement);
            self.scrollToBottom(false);
        }
        debounceTimer = null;
    }

    return {
        streamChunk: function (chunk) {
            buffer += chunk;
            pendingText = buffer;
            if (debounceTimer) {
                return;
            }
            debounceTimer = setTimeout(flush, self._streamDebounceMs);
        },
        finalize: function (fullContent) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            pendingText = null;
            buffer = '';

            contentElement.innerHTML = self._parseMarkdown(fullContent);
            self._initializeJsonViewers(contentElement);

            var copyButton = document.createElement('button');
            copyButton.className = 'copy-response-button';
            copyButton.title = 'Copy response';
            copyButton.setAttribute('aria-label', 'Copy response');
            copyButton.textContent = 'Copy';
            copyButton.addEventListener('click', function (e) {
                self._copyToClipboard(fullContent, e.currentTarget);
            });
            headerElement.appendChild(copyButton);

            // Intentionally do not call scrollToBottom here: the old
            // _finalizeStreamingMessage did not scroll on finalize, only
            // the chunk-by-chunk debounced render did. Preserving that
            // means a developer who scrolled up to read an earlier turn
            // is not yanked to the bottom when the stream completes.
        }
    };
};

/**
 * Clear the transcript and surface a "cleared" empty-state so the
 * developer knows the transcript is empty by design.
 */
AssistantTranscript.prototype.clear = function () {
    // Safe innerHTML usage: literal string with no interpolation.
    this._container.innerHTML = '' +
        '<div class="ai-welcome-message">' +
            '<h3>UI5 AI Assistant</h3>' +
            '<p>Chat history cleared. Ask me anything!</p>' +
        '</div>';
};

/**
 * Replace the transcript with the supplied list of prior turns.
 *
 * @param {Array<{role: string, content: string}>} turns - May be empty.
 */
AssistantTranscript.prototype.reset = function (turns) {
    this._container.innerHTML = '';
    if (!turns || turns.length === 0) {
        return;
    }
    for (var i = 0; i < turns.length; i++) {
        this._appendMessage(turns[i].role, turns[i].content);
    }
    this.scrollToBottom(true);
};

/**
 * Scroll the transcript host to its bottom.
 *
 * @param {boolean} force - When true, scroll even if the developer has
 *     scrolled up; when false, only scroll if already near the bottom
 *     so a streaming turn does not yank the developer's reading position.
 */
AssistantTranscript.prototype.scrollToBottom = function (force) {
    var container = this._container;
    if (!container || container.scrollHeight === undefined) {
        return;
    }
    if (force || this._isScrolledToBottom()) {
        container.scrollTop = container.scrollHeight;
    }
};

/**
 * Tear down hook. Streaming timers live inside the closure of the
 * handle returned by {@link AssistantTranscript#beginAssistantTurn},
 * not on the instance, and the `flush()` guard there is a no-op once
 * the host container is detached — so there is no instance-level
 * timer to cancel here. The method exists for symmetry with the
 * other named assistant modules and for future extension.
 */
AssistantTranscript.prototype.destroy = function () {};

// ---- private rendering helpers ---------------------------------------

/**
 * @private
 */
AssistantTranscript.prototype._isScrolledToBottom = function () {
    var container = this._container;
    if (!container) {
        return true;
    }
    var threshold = 100;
    var scrollPosition = container.scrollTop + container.clientHeight;
    var scrollHeight = container.scrollHeight;
    return scrollHeight - scrollPosition < threshold;
};

/**
 * Append a single message of the given role.
 * @private
 */
AssistantTranscript.prototype._appendMessage = function (role, content, showCopyButton) {
    var welcomeMessage = this._container.querySelector('.ai-welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    var messageElement = document.createElement('div');
    messageElement.className = 'ai-message message-' + role;

    var formattedContent = role === 'assistant' ? this._parseMarkdown(content) : this._escapeHtml(content);
    var shouldShowCopyButton = role === 'assistant' && (showCopyButton === undefined || showCopyButton === true);
    var roleLabel = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System';

    // Safe innerHTML: roleLabel is from a fixed set, formattedContent is
    // either escaped or markdown-parsed (which itself escapes everything
    // it does not turn into a known formatting tag).
    messageElement.innerHTML = '' +
        '<div class="message-header">' +
            '<span class="message-role">' + roleLabel + '</span>' +
            (shouldShowCopyButton ? '<button class="copy-response-button" title="Copy response" aria-label="Copy response">Copy</button>' : '') +
        '</div>' +
        '<div class="message-content">' + formattedContent + '</div>';

    this._container.appendChild(messageElement);

    if (role === 'assistant') {
        var contentElement = messageElement.querySelector('.message-content');
        this._initializeJsonViewers(contentElement);

        var copyButton = messageElement.querySelector('.copy-response-button');
        if (copyButton) {
            var self = this;
            copyButton.addEventListener('click', function (e) {
                self._copyToClipboard(content, e.currentTarget);
            });
        }
    }

    this.scrollToBottom(true);
    return messageElement;
};

/**
 * @private
 */
AssistantTranscript.prototype._escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = (text === null || text === undefined) ? '' : String(text);
    return div.innerHTML;
};

/**
 * @private
 */
AssistantTranscript.prototype._parseMarkdown = function (text) {
    var placeholders = { codeBlocks: [], inlineCode: [] };

    var html = this._extractCodeBlocks(text, placeholders);
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
 * @private
 */
AssistantTranscript.prototype._extractCodeBlocks = function (text, placeholders) {
    return text.replace(/```([\w]*)?\n([\s\S]*?)```/g, function (match, lang, code) {
        var index = placeholders.codeBlocks.length;
        var trimmedCode = code.trim();
        var isJson = lang === 'json' || (!lang && /^[\[\{]/.test(trimmedCode));

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

/**
 * @private
 */
AssistantTranscript.prototype._extractInlineCode = function (text, placeholders) {
    return text.replace(/`([^`]+)`/g, function (match, code) {
        var index = placeholders.inlineCode.length;
        placeholders.inlineCode.push(code);
        return '___INLINECODE_' + index + '___';
    });
};

/**
 * @private
 */
AssistantTranscript.prototype._applyMarkdownFormatting = function (text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\b__([^_]+)__\b/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)([^*<>]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
};

/**
 * @private
 */
AssistantTranscript.prototype._restoreInlineCode = function (text, inlineCode) {
    var self = this;
    inlineCode.forEach(function (code, index) {
        text = text.replace('___INLINECODE_' + index + '___', '<code>' + self._escapeHtml(code) + '</code>');
    });
    return text;
};

/**
 * @private
 */
AssistantTranscript.prototype._restoreCodeBlocks = function (text, codeBlocks) {
    var self = this;
    codeBlocks.forEach(function (block, index) {
        var replacement;
        if (block.type === 'json') {
            replacement = self._createJsonViewer(block.data);
        } else {
            replacement = self._createCodeViewer(block.code, block.lang);
        }
        text = text.replace('___CODEBLOCK_' + index + '___', replacement);
    });
    return text;
};

/**
 * @private
 */
AssistantTranscript.prototype._createJsonViewer = function (data) {
    var jsonString = JSON.stringify(data).replace(/'/g, '&#39;');
    return '<div class="json-viewer" data-json=\'' + jsonString + '\'></div>';
};

/**
 * @private
 */
AssistantTranscript.prototype._createCodeViewer = function (code, lang) {
    var escapedCode = code.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return '<div class="code-viewer" data-code=\'' + escapedCode + '\' data-lang=\'' + lang + '\'></div>';
};

/**
 * @private
 */
AssistantTranscript.prototype._renderJsonValue = function (value, key, isLast, depth) {
    depth = depth || 0;

    if (depth > this._maxJsonDepth) {
        var commaTrunc = isLast ? '' : ',';
        return this._renderJsonLine(key, '<span class="json-truncated">[Max depth reached]</span>' + commaTrunc);
    }

    var comma = isLast ? '' : ',';
    var self = this;
    var handlers = {
        'null': function () { return self._renderJsonLine(key, '<span class="json-null">null</span>' + comma); },
        'boolean': function () { return self._renderJsonLine(key, '<span class="json-boolean">' + value + '</span>' + comma); },
        'number': function () { return self._renderJsonLine(key, '<span class="json-number">' + value + '</span>' + comma); },
        'string': function () { return self._renderJsonString(key, value, comma); },
        'array': function () { return self._renderJsonArray(key, value, comma, depth); },
        'object': function () { return self._renderJsonObject(key, value, comma, depth); }
    };

    var type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    return handlers[type] ? handlers[type]() : this._renderJsonLine(key, this._escapeHtml(String(value)) + comma);
};

/**
 * @private
 */
AssistantTranscript.prototype._renderJsonString = function (key, value, comma) {
    var escaped = this._escapeHtml(value);
    return this._renderJsonLine(key, '<span class="json-string">"' + escaped + '"</span>' + comma);
};

/**
 * @private
 */
AssistantTranscript.prototype._renderJsonArray = function (key, value, comma, depth) {
    if (value.length === 0) {
        return this._renderJsonLine(key, '<span class="json-bracket">[]</span>' + comma);
    }

    var id = 'json-' + Math.random().toString(36).substring(2, 11);
    var keyHtml = key ? '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ' : '';
    var self = this;
    var items = value.map(function (item, i) {
        return self._renderJsonValue(item, null, i === value.length - 1, depth + 1);
    }).join('');

    return '<div class="json-line">' + keyHtml + '<span class="json-toggle" data-target="' + id + '">\u25BC</span> <span class="json-bracket">[</span><span class="json-count">' + value.length + ' items</span></div>' +
        '<div class="json-content" id="' + id + '">' + items + '<div class="json-line"><span class="json-bracket">]</span>' + comma + '</div></div>';
};

/**
 * @private
 */
AssistantTranscript.prototype._renderJsonObject = function (key, value, comma, depth) {
    var keys = Object.keys(value);
    if (keys.length === 0) {
        return this._renderJsonLine(key, '<span class="json-bracket">{}</span>' + comma);
    }

    var id = 'json-' + Math.random().toString(36).substring(2, 11);
    var keyHtml = key ? '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ' : '';
    var self = this;
    var items = keys.map(function (k, i) {
        return self._renderJsonValue(value[k], k, i === keys.length - 1, depth + 1);
    }).join('');

    return '<div class="json-line">' + keyHtml + '<span class="json-toggle" data-target="' + id + '">\u25BC</span> <span class="json-bracket">{</span><span class="json-count">' + keys.length + ' keys</span></div>' +
        '<div class="json-content" id="' + id + '">' + items + '<div class="json-line"><span class="json-bracket">}</span>' + comma + '</div></div>';
};

/**
 * @private
 */
AssistantTranscript.prototype._renderJsonLine = function (key, content) {
    var html = '<div class="json-line">';
    if (key !== null) {
        html += '<span class="json-key">"' + this._escapeHtml(key) + '"</span>: ';
    }
    html += content;
    html += '</div>';
    return html;
};

/**
 * @private
 */
AssistantTranscript.prototype._initializeJsonViewers = function (element) {
    var self = this;

    element.querySelectorAll('.json-viewer').forEach(function (viewer) {
        var jsonData = viewer.getAttribute('data-json');
        if (!jsonData) {
            return;
        }
        try {
            var parsed = JSON.parse(jsonData);
            viewer.innerHTML = '<div class="json-wrapper">' +
                '<button class="copy-code-button" title="Copy JSON" aria-label="Copy JSON">Copy</button>' +
                '<div class="json-tree">' + self._renderJsonValue(parsed, null, true) + '</div>' +
                '</div>';

            self._setupJsonToggleHandlers(viewer);

            var copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', function (e) {
                    self._copyToClipboard(JSON.stringify(parsed, null, 2), e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = 'Error rendering JSON: ' + e.message;
        }
    });

    element.querySelectorAll('.code-viewer').forEach(function (viewer) {
        var code = viewer.getAttribute('data-code');
        var lang = viewer.getAttribute('data-lang');
        if (!code) {
            return;
        }
        try {
            viewer.innerHTML = self._renderCodeBlock(code, lang);
            var copyButton = viewer.querySelector('.copy-code-button');
            if (copyButton) {
                copyButton.addEventListener('click', function (e) {
                    self._copyToClipboard(code, e.currentTarget);
                });
            }
        } catch (e) {
            viewer.textContent = 'Error rendering code: ' + e.message;
        }
    });
};

/**
 * @private
 */
AssistantTranscript.prototype._setupJsonToggleHandlers = function (viewer) {
    viewer.querySelectorAll('.json-toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var content = document.getElementById(toggle.getAttribute('data-target'));
            if (content) {
                var isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? 'block' : 'none';
                toggle.textContent = isCollapsed ? '\u25BC' : '\u25B6';
            }
        });
    });
};

/**
 * @private
 */
AssistantTranscript.prototype._renderCodeBlock = function (code, lang) {
    var self = this;
    var lines = code.split('\n');
    var linesHtml = lines.map(function (line) {
        var escapedLine = self._escapeHtml(line || ' ');
        return '<div class="code-line">' + escapedLine + '</div>';
    }).join('');

    var langLabel = lang && lang !== 'plaintext' ? '<div class="code-lang">' + lang + '</div>' : '';
    var copyButton = '<button class="copy-code-button" title="Copy code" aria-label="Copy code">Copy</button>';

    return '<div class="code-wrapper">' + langLabel + copyButton + '<div class="code-content">' + linesHtml + '</div></div>';
};

/**
 * Copy text to the system clipboard using the legacy execCommand path
 * so the transcript keeps working inside the DevTools panel where the
 * modern async Clipboard API may not have user-activation context.
 *
 * On failure the transcript appends a system message into itself,
 * matching the pre-extraction behavior in AIChat where copy failures
 * surfaced inline. This keeps the failure visible to the developer
 * without reaching back into the view.
 * @private
 */
AssistantTranscript.prototype._copyToClipboard = function (text, button) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    var copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (err) {
        copied = false;
    } finally {
        document.body.removeChild(textarea);
    }

    if (copied) {
        var originalText = button.textContent;
        button.textContent = 'Copied!';
        button.disabled = true;
        setTimeout(function () {
            button.textContent = originalText;
            button.disabled = false;
        }, 1500);
    } else {
        this.appendSystemMessage('Failed to copy to clipboard');
    }
};

module.exports = AssistantTranscript;
