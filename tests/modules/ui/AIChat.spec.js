'use strict';

var AIChat = require('../../../app/scripts/modules/ui/AIChat.js');

/**
 * Minimal AssistantController-shaped fake. The view talks only to the
 * controller surface, so the fake records event registrations and exposes
 * a `fire` helper that dispatches any event the view subscribes to. No
 * Chrome runtime, no storage, no capability behavior.
 * @returns {{listeners: Object, on: Function, fire: Function,
 *           initialize: Function, getUsageInfo: Function,
 *           updateInspectionContext: Function, setUrl: Function,
 *           downloadModel: Function, sendUserMessage: Function,
 *           clearConversation: Function, destroy: Function}}
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
        downloadModel: function () { return Promise.resolve(); },
        sendUserMessage: function () { return Promise.resolve(); },
        clearConversation: function () { return Promise.resolve(); },
        destroy: function () {}
    };
}

/**
 * Minimal AssistantTranscript-shaped fake. Records every call from the
 * view. The spec asserts the view forwards the right calls to the
 * transcript instead of probing markdown / JSON / scroll internals
 * (covered in AssistantTranscript.spec).
 * @returns {{calls: Array, appendUserTurn: Function,
 *           appendSystemMessage: Function, beginAssistantTurn: Function,
 *           clear: Function, reset: Function, scrollToBottom: Function,
 *           destroy: Function}}
 */
function createFakeTranscript() {
    var calls = [];
    var streamingHandle = {
        streamChunk: function (chunk) { calls.push({type: 'streamChunk', chunk: chunk}); },
        finalize: function (content) { calls.push({type: 'finalize', content: content}); }
    };
    return {
        calls: calls,
        appendUserTurn: function (c) { calls.push({type: 'appendUserTurn', content: c}); },
        appendSystemMessage: function (m) { calls.push({type: 'appendSystemMessage', message: m}); },
        beginAssistantTurn: function () {
            calls.push({type: 'beginAssistantTurn'});
            return streamingHandle;
        },
        clear: function () { calls.push({type: 'clear'}); },
        reset: function (turns) { calls.push({type: 'reset', turns: turns}); },
        scrollToBottom: function (force) { calls.push({type: 'scrollToBottom', force: force}); },
        destroy: function () { calls.push({type: 'destroy'}); }
    };
}

describe('AIChat', function () {
    var fixtures = document.getElementById('fixtures');
    var aiChat;
    var fakeController;
    var fakeTranscript;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="ai-chat"></div>';
        fakeController = createFakeController();
        fakeTranscript = createFakeTranscript();
        aiChat = new AIChat('ai-chat', {
            getAppInfo: function () { return null; },
            controller: fakeController,
            transcriptFactory: function () { return fakeTranscript; }
        });
    });

    afterEach(function () {
        if (aiChat) {
            aiChat = null;
        }
        fakeController = null;
        fakeTranscript = null;
        fixtures.innerHTML = '';
    });

    describe('Constructor & Initialization', function () {
        it('should create instance with container ID', function () {
            aiChat._container.should.exist;
            aiChat._container.id.should.equal('ai-chat');
        });

        it('should render chat interface', function () {
            document.querySelector('.ai-chat-wrapper').should.exist;
        });

        it('should construct the transcript with the messages container as host, so all transcript rendering writes into the DOM the view already laid out', function () {
            // The transcript factory was called with the container; the
            // view drives turns through the fake instead of rendering itself.
            fakeController.fire('conversation-loaded', [{role: 'user', content: 'hi'}]);
            var resetCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'reset'; });
            resetCalls.length.should.equal(1);
        });
    });

    describe('#_render()', function () {
        it('should render chat wrapper with ARIA attributes', function () {
            var wrapper = document.querySelector('.ai-chat-wrapper');
            wrapper.should.exist;
            wrapper.getAttribute('role').should.equal('region');
            wrapper.getAttribute('aria-label').should.equal('AI Chat');
        });

        it('should render messages container as an empty host node owned by the transcript collaborator, with no view-private welcome HTML', function () {
            var container = document.getElementById('ai-messages-container');
            container.should.exist;
            container.getAttribute('role').should.equal('log');
            (container.querySelector('.ai-welcome-message') === null).should.be.true;
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

    describe('Sending a message', function () {
        it('should forward a user-typed message to the transcript as a user turn and ask the transcript to begin an assistant turn, so transcript-shaped DOM work stays out of the view', function () {
            var input = document.getElementById('ai-input');
            var sendButton = document.getElementById('ai-send-button');
            input.value = 'How does binding work?';
            input.dispatchEvent(new Event('input'));
            sendButton.click();

            var userTurns = fakeTranscript.calls.filter(function (c) { return c.type === 'appendUserTurn'; });
            var assistantTurns = fakeTranscript.calls.filter(function (c) { return c.type === 'beginAssistantTurn'; });
            userTurns.length.should.equal(1);
            userTurns[0].content.should.equal('How does binding work?');
            assistantTurns.length.should.equal(1);
        });

        it('should forward controller stream chunks to the transcript handle returned by beginAssistantTurn, so the view does not buffer chunks itself', function () {
            var input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-chunk', 'partial ');
            fakeController.fire('stream-chunk', 'answer');

            var chunkCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'streamChunk'; });
            chunkCalls.length.should.equal(2);
            chunkCalls[0].chunk.should.equal('partial ');
            chunkCalls[1].chunk.should.equal('answer');
        });

        it('should finalize the transcript streaming handle with the controller\'s full response, so the assistant turn is committed exactly once per stream', function () {
            var input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-complete', {content: 'full response'});

            var finalizeCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'finalize'; });
            finalizeCalls.length.should.equal(1);
            finalizeCalls[0].content.should.equal('full response');
        });

        it('should surface a streaming failure as a transcript system message instead of rendering its own error DOM', function () {
            var input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-failed', new Error('boom'));

            var systemMessages = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
            systemMessages.length.should.equal(1);
            systemMessages[0].message.should.contain('boom');
        });
    });

    describe('Conversation lifecycle', function () {
        it('should ask the transcript to reset to the loaded prior turns when the controller emits conversation-loaded', function () {
            var turns = [
                {role: 'user', content: 'older question'},
                {role: 'assistant', content: 'older answer'}
            ];
            fakeController.fire('conversation-loaded', turns);

            var resetCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'reset'; });
            resetCalls.length.should.equal(1);
            resetCalls[0].turns.should.equal(turns);
        });

        it('should clear the transcript and then append a "cleared" system message when the controller emits conversation-cleared, so the developer sees both the empty state and an explanatory note', function () {
            fakeController.fire('conversation-cleared');

            var clearCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'clear'; });
            var systemCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
            clearCalls.length.should.equal(1);
            systemCalls.length.should.equal(1);
            systemCalls[0].message.should.contain('cleared');
        });

        it('should scroll the transcript to the bottom when the tab is activated, so the developer sees the most recent turn without scrolling manually', function () {
            aiChat.onTabActivated();

            var scrollCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'scrollToBottom'; });
            scrollCalls.length.should.equal(1);
            scrollCalls[0].force.should.be.true;
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
            // offered before session-failed arrives. The test then asserts
            // session-failed keeps it offered.
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

    describe('Token counter', function () {
        it('should leave the token counter empty when the controller reports no usage info, so a non-ready or quota-unaware session does not paint stale numbers', function () {
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            // getUsageInfo resolves to null; drain the microtask.
            return Promise.resolve().then(function () {
                return Promise.resolve();
            }).then(function () {
                var counter = document.getElementById('ai-token-counter');
                counter.textContent.should.equal('');
            });
        });

        it('should append a token-usage warning as a system message exactly once when usage crosses the 70% threshold, so the developer is nudged to clear history without being spammed', function () {
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 700, inputQuota: 1000, percentUsed: 75});
            };

            // Two ready transitions to prove the warning appends at most
            // once even if _updateTokenCounter runs repeatedly.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                var warnings = fakeTranscript.calls.filter(function (c) {
                    return c.type === 'appendSystemMessage' && c.message.indexOf('token limit') !== -1;
                });
                warnings.length.should.equal(1);
            });
        });
    });
});
