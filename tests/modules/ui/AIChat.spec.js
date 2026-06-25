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

    describe('Assistant Capability State routing', function () {
        /**
         * Build a minimal AssistantController-shaped fake that records
         * event registrations so a test can synchronously fire any event
         * the AIChat view subscribes to. Avoids the real controller's
         * Chrome runtime / storage dependencies.
         * @returns {{fire: Function, on: Function, initialize: Function,
         *           getUsageInfo: Function, updateInspectionContext: Function,
         *           setUrl: Function, destroy: Function}}
         */
        function createFakeController() {
            var listeners = {};
            return {
                listeners: listeners,
                on: function (event, handler) {
                    listeners[event] = listeners[event] || [];
                    listeners[event].push(handler);
                },
                fire: function (event, payload) {
                    (listeners[event] || []).forEach(function (h) { h(payload); });
                },
                initialize: function () { return Promise.resolve(); },
                getUsageInfo: function () { return Promise.resolve(null); },
                updateInspectionContext: function () {},
                setUrl: function () {},
                destroy: function () {}
            };
        }

        var fakeController;
        var localAiChat;

        beforeEach(function () {
            fixtures.innerHTML = '<div id="ai-chat"></div>';
            fakeController = createFakeController();
            localAiChat = new AIChat('ai-chat', {
                getAppInfo: function () { return null; },
                controller: fakeController
            });
        });

        afterEach(function () {
            localAiChat = null;
            fixtures.innerHTML = '';
        });

        it('should route an unmapped Assistant Capability State to the unavailable banner instead of silently dropping it, so a future canonical state never disappears from the developer\'s view', function () {
            fakeController.fire('capability-state-changed', {
                status: 'some-new-canonical-state-not-yet-mapped',
                message: 'something happened',
                progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unavailable');
            banner.querySelector('.status-text').textContent.should.equal('something happened');
        });

        it('should apply a CSS class derived directly from the canonical ready Assistant Capability State, with no view-private status name translation', function () {
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'Gemini Nano is ready', progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-ready');
            banner.querySelector('.status-text').textContent.should.equal('Gemini Nano is ready');
        });

        it('should apply a status-downloadable CSS class (not a translated status-needs-download) when the Assistant Capability State is downloadable, so the view\'s class vocabulary matches the controller', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloadable', message: 'Model can be downloaded', progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-downloadable');
            banner.className.should.not.contain('status-needs-download');
        });

        it('should show the download button when the Assistant Capability State is downloadable', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloadable', message: 'Model can be downloaded', progress: 0
            });

            var downloadButton = document.getElementById('ai-download-button');
            downloadButton.style.display.should.not.equal('none');
            downloadButton.disabled.should.be.false;
        });

        it('should apply status-downloading and surface the progress percent message when the Assistant Capability State is downloading', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloading', message: 'Downloading model', progress: 0.42
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-downloading');
            banner.querySelector('.status-text').textContent.should.contain('42');
            var downloadButton = document.getElementById('ai-download-button');
            downloadButton.style.display.should.not.equal('none');
            downloadButton.disabled.should.be.true;
        });

        it('should apply a status-session-failed CSS class (not a translated status-error) when the controller reports session-failed', function () {
            fakeController.fire('capability-state-changed', {
                status: 'session-failed', message: 'unable to create local AI session', progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-session-failed');
            banner.className.should.not.contain('status-error');
            banner.querySelector('.status-text').textContent.should.contain('unable to create local AI session');
        });

        it('should apply a status-unsupported CSS class when the controller reports an unsupported browser', function () {
            fakeController.fire('capability-state-changed', {
                status: 'unsupported', message: 'Browser unsupported', progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unsupported');
            banner.querySelector('.status-text').textContent.should.equal('Browser unsupported');
        });

        it('should apply a status-unavailable CSS class when the controller reports unavailable', function () {
            fakeController.fire('capability-state-changed', {
                status: 'unavailable', message: 'Local AI cannot run on this device', progress: 0
            });

            var banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unavailable');
            banner.querySelector('.status-text').textContent.should.equal('Local AI cannot run on this device');
        });

        it('should hide the download button for every non-download Assistant Capability State that paints a banner, so the developer is not invited to re-download a ready model', function () {
            var nonDownloadStates = ['ready', 'unsupported', 'unavailable', 'session-failed'];
            nonDownloadStates.forEach(function (status) {
                fakeController.fire('capability-state-changed', {
                    status: status, message: status, progress: 0
                });
                var downloadButton = document.getElementById('ai-download-button');
                downloadButton.style.display.should.equal('none');
            });
        });

        it('should expose the clear-history affordance when the controller reports session-failed, so the developer has a user-facing recovery action that destroys the broken session and reseeds a fresh one', function () {
            // Start from a ready state so the clear-history button is
            // legitimately offered before session-failed arrives; the
            // test then asserts session-failed keeps it offered.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });
            fakeController.fire('capability-state-changed', {
                status: 'session-failed', message: 'session creation failed', progress: 0
            });

            var clearButton = document.getElementById('ai-clear-history-button');
            clearButton.style.display.should.not.equal('none');
        });

        it('should leave the existing banner untouched when streaming-failed arrives — recovery is offered implicitly via the next sendUserMessage, not via a new banner — per PRD user story 8', function () {
            // Paint a ready banner first; this is the state the assistant
            // should appear to recover to on the next successful send.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'Gemini Nano is ready', progress: 0
            });
            var bannerBefore = document.getElementById('ai-status-banner');
            var classBefore = bannerBefore.className;
            var textBefore = bannerBefore.querySelector('.status-text').textContent;

            fakeController.fire('capability-state-changed', {
                status: 'streaming-failed', message: 'model crashed', progress: 0
            });

            var bannerAfter = document.getElementById('ai-status-banner');
            bannerAfter.className.should.equal(classBefore);
            bannerAfter.querySelector('.status-text').textContent.should.equal(textBefore);
        });
    });
});
