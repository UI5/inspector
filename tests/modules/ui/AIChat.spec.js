'use strict';

var AIChat = require('../../../app/scripts/modules/ui/AIChat.js');

describe('AIChat', function () {
    var fixtures = document.getElementById('fixtures');
    var aiChat;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="ai-chat"></div>';
        aiChat = new AIChat('ai-chat', { getAppInfo: function () { return null; } });
    });

    afterEach(function () {
        if (aiChat) {
            aiChat = null;
        }
        fixtures.innerHTML = '';
    });

    describe('Constructor & Initialization', function () {
        it('should create instance with container ID', function () {
            aiChat._container.should.exist;
            aiChat._container.id.should.equal('ai-chat');
        });

        it('should set default values', function () {
            (aiChat._currentUrl === null).should.be.true;
            (aiChat._currentContext === null).should.be.true;
            aiChat._messages.should.be.an('array').with.lengthOf(0);
            aiChat._isStreaming.should.be.false;
            aiChat._maxJsonDepth.should.equal(10);
        });

        it('should render chat interface', function () {
            document.querySelector('.ai-chat-wrapper').should.exist;
        });
    });

    describe('#_render()', function () {
        it('should render chat wrapper with ARIA attributes', function () {
            var wrapper = document.querySelector('.ai-chat-wrapper');
            wrapper.should.exist;
            wrapper.getAttribute('role').should.equal('region');
            wrapper.getAttribute('aria-label').should.equal('AI Chat');
        });

        it('should render messages container', function () {
            var container = document.getElementById('ai-messages-container');
            container.should.exist;
            container.getAttribute('role').should.equal('log');
        });

        it('should render input with aria-label', function () {
            var input = document.getElementById('ai-input');
            input.should.exist;
            input.getAttribute('aria-label').should.equal('Message input');
        });

        it('should render send button with aria-label', function () {
            var button = document.getElementById('ai-send-button');
            button.should.exist;
            button.getAttribute('aria-label').should.equal('Send message');
        });

        it('should render dialog with ARIA attributes', function () {
            var dialog = document.getElementById('ai-confirm-dialog');
            dialog.should.exist;
            dialog.getAttribute('role').should.equal('dialog');
            dialog.getAttribute('aria-modal').should.equal('true');
        });
    });

    describe('#_escapeHtml()', function () {
        it('should escape < and >', function () {
            var result = aiChat._escapeHtml('<div>');
            result.should.contain('&lt;div&gt;');
        });

        it('should escape ampersand', function () {
            var result = aiChat._escapeHtml('A & B');
            result.should.contain('&amp;');
        });

        it('should handle script tags', function () {
            var result = aiChat._escapeHtml('<script>alert("xss")</script>');
            result.should.equal('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('should handle quotes', function () {
            var result = aiChat._escapeHtml('"quoted"');
            result.should.not.contain('<');
        });
    });

    describe('#_parseMarkdown()', function () {
        it('should escape HTML before formatting', function () {
            var result = aiChat._parseMarkdown('<script>alert("xss")</script>');
            result.should.not.contain('<script>');
            result.should.contain('&lt;script&gt;');
        });

        it('should convert **text** to bold', function () {
            var result = aiChat._parseMarkdown('This is **bold** text');
            result.should.contain('<strong>bold</strong>');
        });

        it('should convert *text* to italic', function () {
            var result = aiChat._parseMarkdown('This is *italic* text');
            result.should.contain('<em>italic</em>');
        });

        it('should convert [text](url) to links', function () {
            var result = aiChat._parseMarkdown('[Click here](https://example.com)');
            result.should.contain('<a href="https://example.com"');
            result.should.contain('target="_blank"');
        });

        it('should handle inline code', function () {
            var result = aiChat._parseMarkdown('Use `console.log()` for debugging');
            result.should.contain('<code>');
            result.should.contain('console.log()');
        });

        it('should escape HTML in inline code', function () {
            var result = aiChat._parseMarkdown('Use `<div>` tag');
            result.should.contain('&lt;div&gt;');
        });

        it('should convert line breaks', function () {
            var result = aiChat._parseMarkdown('Line 1\nLine 2');
            result.should.contain('<br>');
        });
    });

    describe('JSON Viewer Methods', function () {
        describe('#_renderJsonValue()', function () {
            it('should handle null', function () {
                var result = aiChat._renderJsonValue(null, 'test', true, 0);
                result.should.contain('json-null');
            });

            it('should handle boolean', function () {
                var result = aiChat._renderJsonValue(true, 'flag', true, 0);
                result.should.contain('json-boolean');
                result.should.contain('true');
            });

            it('should handle number', function () {
                var result = aiChat._renderJsonValue(42, 'count', true, 0);
                result.should.contain('json-number');
                result.should.contain('42');
            });

            it('should handle string', function () {
                var result = aiChat._renderJsonValue('test', 'name', true, 0);
                result.should.contain('json-string');
                result.should.contain('test');
            });

            it('should respect max depth limit', function () {
                var result = aiChat._renderJsonValue({nested: 'value'}, 'deep', true, 11);
                result.should.contain('Max depth reached');
            });
        });

        describe('#_renderJsonArray()', function () {
            it('should render empty arrays', function () {
                var result = aiChat._renderJsonArray('items', [], ',', 0);
                result.should.contain('[]');
            });

            it('should render arrays with items', function () {
                var result = aiChat._renderJsonArray('items', [1, 2, 3], ',', 0);
                result.should.contain('3 items');
            });
        });

        describe('#_renderJsonObject()', function () {
            it('should render empty objects', function () {
                var result = aiChat._renderJsonObject('obj', {}, ',', 0);
                result.should.contain('{}');
            });

            it('should render objects with keys', function () {
                var result = aiChat._renderJsonObject('obj', {a: 1, b: 2}, ',', 0);
                result.should.contain('2 keys');
            });
        });
    });

    describe('Code Viewer Methods', function () {
        describe('#_renderCodeBlock()', function () {
            it('should render code with lines', function () {
                var result = aiChat._renderCodeBlock('line1\nline2', 'javascript');
                result.should.contain('code-line');
            });

            it('should escape HTML in code', function () {
                var result = aiChat._renderCodeBlock('<script>alert()</script>', 'html');
                result.should.contain('&lt;script&gt;');
            });
        });

        describe('#_createCodeViewer()', function () {
            it('should create code viewer HTML', function () {
                var result = aiChat._createCodeViewer('var x = 1;', 'javascript');
                result.should.contain('code-viewer');
                result.should.contain('data-code');
            });
        });

        describe('#_createJsonViewer()', function () {
            it('should create JSON viewer HTML', function () {
                var result = aiChat._createJsonViewer({key: 'value'});
                result.should.contain('json-viewer');
                result.should.contain('data-json');
            });
        });
    });

    describe('Message Handling', function () {
        describe('#_addMessage()', function () {
            it('should add user message', function () {
                aiChat._addMessage('user', 'Hello');
                var container = document.getElementById('ai-messages-container');
                container.innerHTML.should.contain('Hello');
            });

            it('should escape HTML in user messages', function () {
                aiChat._addMessage('user', '<script>alert("xss")</script>');
                var container = document.getElementById('ai-messages-container');
                container.innerHTML.should.not.contain('<script>');
                container.innerHTML.should.contain('&lt;script&gt;');
            });

            it('should use markdown for assistant messages', function () {
                aiChat._addMessage('assistant', 'This is **bold**');
                var container = document.getElementById('ai-messages-container');
                container.innerHTML.should.contain('<strong>bold</strong>');
            });
        });
    });

    describe('Dialog Handling', function () {
        describe('#_showConfirmDialog()', function () {
            it('should display dialog', function () {
                aiChat._showConfirmDialog();
                var dialog = document.getElementById('ai-confirm-dialog');
                dialog.style.display.should.equal('flex');
            });

            it('should store previous focus', function () {
                var input = document.getElementById('ai-input');
                input.focus();
                aiChat._showConfirmDialog();
                aiChat._previousFocus.should.equal(input);
            });

            it('should focus cancel button', function () {
                aiChat._showConfirmDialog();
                var cancelButton = document.getElementById('ai-confirm-cancel');
                document.activeElement.should.equal(cancelButton);
            });
        });

        describe('#_hideConfirmDialog()', function () {
            it('should hide dialog', function () {
                aiChat._showConfirmDialog();
                aiChat._hideConfirmDialog();
                var dialog = document.getElementById('ai-confirm-dialog');
                dialog.style.display.should.equal('none');
            });

            it('should restore previous focus', function () {
                var input = document.getElementById('ai-input');
                input.focus();
                aiChat._showConfirmDialog();
                aiChat._hideConfirmDialog();
                document.activeElement.should.equal(input);
            });
        });
    });

    describe('Debounced Rendering', function () {
        describe('#_debouncedRender()', function () {
            beforeEach(function () {
                aiChat._streamingMessageElement = document.createElement('div');
            });

            it('should store pending render content', function () {
                aiChat._debouncedRender('Pending content');
                aiChat._pendingRender.should.equal('Pending content');
            });

            it('should set debounce timer', function () {
                aiChat._debouncedRender('Test content');
                (aiChat._renderDebounceTimer !== null).should.be.true;
            });
        });
    });

    describe('Event Listeners', function () {
        it('should have send button', function () {
            var button = document.getElementById('ai-send-button');
            button.should.exist;
        });

        it('should enable send button when input has text', function () {
            var input = document.getElementById('ai-input');
            var sendButton = document.getElementById('ai-send-button');

            sendButton.disabled.should.be.true;
            input.value = 'Test message';
            input.dispatchEvent(new Event('input'));
            sendButton.disabled.should.be.false;
        });

        it('should have clear history button', function () {
            var button = document.getElementById('ai-clear-history-button');
            button.should.exist;
        });

        it('should have context clear button', function () {
            var button = document.getElementById('ai-context-clear-button');
            button.should.exist;
        });
    });
});
