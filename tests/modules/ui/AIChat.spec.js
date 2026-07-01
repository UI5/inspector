'use strict';

const AIChat = require('../../../app/scripts/modules/ui/AIChat.js');

/**
 * Fake {@link AssistantController}. Records event registrations and exposes `fire` to dispatch
 * events.
 * @returns {{listeners: Object, on: Function, fire: Function,
 *           initialize: Function, getUsageInfo: Function,
 *           updateInspectionContext: Function, setUrl: Function,
 *           downloadModel: Function, sendUserMessage: Function,
 *           clearConversation: Function, destroy: Function}}
 */
function createFakeController() {
    const listeners = {};
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
 * Fake {@link AssistantTranscript}. Records every call from the view. Captures the
 * `onCopyFailed` callback the view injects, so tests can simulate a clipboard failure that
 * originates inside the transcript.
 * @returns {{calls: Array, appendUserTurn: Function,
 *           appendSystemMessage: Function, beginAssistantTurn: Function,
 *           clear: Function, reset: Function, scrollToBottom: Function,
 *           destroy: Function, onCopyFailed: (Function|null)}}
 */
function createFakeTranscript() {
    const calls = [];
    const streamingHandle = {
        streamChunk: function (chunk) { calls.push({type: 'streamChunk', chunk: chunk}); },
        finalize: function (content) { calls.push({type: 'finalize', content: content}); }
    };
    return {
        calls: calls,
        onCopyFailed: null,
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
    const fixtures = document.getElementById('fixtures');
    let aiChat;
    let fakeController;
    let fakeTranscript;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="ai-chat"></div>';
        fakeController = createFakeController();
        fakeTranscript = createFakeTranscript();
        aiChat = new AIChat('ai-chat', {
            getAppInfo: function () { return null; },
            controller: fakeController,
            transcriptFactory: function (host, options) {
                if (options && typeof options.onCopyFailed === 'function') {
                    fakeTranscript.onCopyFailed = options.onCopyFailed;
                }
                return fakeTranscript;
            }
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
            // Transcript factory was called with the container. The view drives turns through the fake.
            fakeController.fire('conversation-loaded', [{role: 'user', content: 'hi'}]);
            const resetCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'reset'; });
            resetCalls.length.should.equal(1);
        });
    });

    describe('#_render()', function () {
        it('should render chat wrapper with ARIA attributes', function () {
            const wrapper = document.querySelector('.ai-chat-wrapper');
            wrapper.should.exist;
            wrapper.getAttribute('role').should.equal('region');
            wrapper.getAttribute('aria-label').should.equal('AI Chat');
        });

        it('should render messages container as an empty host node owned by the transcript collaborator, with no view-private welcome HTML', function () {
            const container = document.getElementById('ai-messages-container');
            container.should.exist;
            container.getAttribute('role').should.equal('log');
            (container.querySelector('.ai-welcome-message') === null).should.be.true;
        });

        it('should render input with aria-label', function () {
            const input = document.getElementById('ai-input');
            input.should.exist;
            input.getAttribute('aria-label').should.equal('Message input');
        });

        it('should render send button with aria-label', function () {
            const button = document.getElementById('ai-send-button');
            button.should.exist;
            button.getAttribute('aria-label').should.equal('Send message');
        });

        it('should render dialog with ARIA attributes', function () {
            const dialog = document.getElementById('ai-confirm-dialog');
            dialog.should.exist;
            dialog.getAttribute('role').should.equal('dialog');
            dialog.getAttribute('aria-modal').should.equal('true');
        });
    });

    describe('Sending a message', function () {
        it('should forward a user-typed message to the transcript as a user turn and ask the transcript to begin an assistant turn, so transcript-shaped DOM work stays out of the view', function () {
            const input = document.getElementById('ai-input');
            const sendButton = document.getElementById('ai-send-button');
            input.value = 'How does binding work?';
            input.dispatchEvent(new Event('input'));
            sendButton.click();

            const userTurns = fakeTranscript.calls.filter(function (c) { return c.type === 'appendUserTurn'; });
            const assistantTurns = fakeTranscript.calls.filter(function (c) { return c.type === 'beginAssistantTurn'; });
            userTurns.length.should.equal(1);
            userTurns[0].content.should.equal('How does binding work?');
            assistantTurns.length.should.equal(1);
        });

        it('should forward controller stream chunks to the transcript handle returned by beginAssistantTurn, so the view does not buffer chunks itself', function () {
            const input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-chunk', 'partial ');
            fakeController.fire('stream-chunk', 'answer');

            const chunkCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'streamChunk'; });
            chunkCalls.length.should.equal(2);
            chunkCalls[0].chunk.should.equal('partial ');
            chunkCalls[1].chunk.should.equal('answer');
        });

        it('should finalize the transcript streaming handle with the controller\'s full response, so the assistant turn is committed exactly once per stream', function () {
            const input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-complete', {content: 'full response'});

            const finalizeCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'finalize'; });
            finalizeCalls.length.should.equal(1);
            finalizeCalls[0].content.should.equal('full response');
        });

        it('should surface a streaming failure in the inline error slot above the input, not as a transcript system message, so the developer sees the error near the action that failed', function () {
            const input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-failed', new Error('boom'));

            const systemMessages = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
            systemMessages.length.should.equal(0);

            const slot = document.getElementById('ai-error-slot');
            slot.should.exist;
            slot.hasAttribute('hidden').should.be.false;
            slot.textContent.should.contain('boom');
        });
    });

    describe('Conversation lifecycle', function () {
        it('should ask the transcript to reset to the loaded prior turns when the controller emits conversation-loaded', function () {
            const turns = [
                {role: 'user', content: 'older question'},
                {role: 'assistant', content: 'older answer'}
            ];
            fakeController.fire('conversation-loaded', turns);

            const resetCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'reset'; });
            resetCalls.length.should.equal(1);
            resetCalls[0].turns.should.equal(turns);
        });

        it('should clear the transcript when the controller emits conversation-cleared, without appending any confirmation system message — the empty transcript is the confirmation', function () {
            fakeController.fire('conversation-cleared');

            const clearCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'clear'; });
            const systemCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
            clearCalls.length.should.equal(1);
            systemCalls.length.should.equal(0);
        });

        it('should scroll the transcript to the bottom when the tab is activated, so the developer sees the most recent turn without scrolling manually', function () {
            aiChat.onTabActivated();

            const scrollCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'scrollToBottom'; });
            scrollCalls.length.should.equal(1);
            scrollCalls[0].force.should.be.true;
        });
    });

    describe('Dialog Handling', function () {
        describe('#_showConfirmDialog()', function () {
            it('should display dialog', function () {
                aiChat._showConfirmDialog();
                const dialog = document.getElementById('ai-confirm-dialog');
                dialog.style.display.should.equal('flex');
            });

            it('should store previous focus', function () {
                const input = document.getElementById('ai-input');
                input.focus();
                aiChat._showConfirmDialog();
                aiChat._previousFocus.should.equal(input);
            });

            it('should focus cancel button', function () {
                aiChat._showConfirmDialog();
                const cancelButton = document.getElementById('ai-confirm-cancel');
                document.activeElement.should.equal(cancelButton);
            });
        });

        describe('#_hideConfirmDialog()', function () {
            it('should hide dialog', function () {
                aiChat._showConfirmDialog();
                aiChat._hideConfirmDialog();
                const dialog = document.getElementById('ai-confirm-dialog');
                dialog.style.display.should.equal('none');
            });

            it('should restore previous focus', function () {
                const input = document.getElementById('ai-input');
                input.focus();
                aiChat._showConfirmDialog();
                aiChat._hideConfirmDialog();
                document.activeElement.should.equal(input);
            });
        });
    });

    describe('Event Listeners', function () {
        it('should have send button', function () {
            const button = document.getElementById('ai-send-button');
            button.should.exist;
        });

        it('should enable send button when input has text', function () {
            const input = document.getElementById('ai-input');
            const sendButton = document.getElementById('ai-send-button');

            sendButton.disabled.should.be.true;
            input.value = 'Test message';
            input.dispatchEvent(new Event('input'));
            sendButton.disabled.should.be.false;
        });

        it('should have clear history button', function () {
            const button = document.getElementById('ai-clear-history-button');
            button.should.exist;
        });

        it('should have context clear button', function () {
            const button = document.getElementById('ai-context-clear-button');
            button.should.exist;
        });
    });

    describe('Inspection Context pill', function () {
        it('should show the pill with control type and id when updateContext is called with a control snapshot', function () {
            aiChat.updateContext({
                control: { type: 'sap.m.Button', id: 'okButton' }
            });

            const pill = document.getElementById('ai-context-info');
            pill.style.display.should.not.equal('none');
            pill.querySelector('.context-text').textContent.should.contain('sap.m.Button');
            pill.querySelector('.context-text').textContent.should.contain('okButton');
        });

        it('should hide the pill in response to the inspection-context-cleared event, so the controller is the single source of truth for the hide path', function () {
            aiChat.updateContext({
                control: { type: 'sap.m.Button', id: 'okButton' }
            });
            const pill = document.getElementById('ai-context-info');
            pill.style.display.should.not.equal('none');

            fakeController.fire('inspection-context-cleared');

            pill.style.display.should.equal('none');
        });

        it('should ask the controller to clear Inspection Context when the ✕ button is clicked, without writing to the pill DOM directly — the pill hides via the inspection-context-cleared event round-trip — and without appending any confirmation system message', function () {
            aiChat.updateContext({
                control: { type: 'sap.m.Button', id: 'okButton' }
            });
            const pill = document.getElementById('ai-context-info');

            let calledWith = 'never-called';
            fakeController.updateInspectionContext = function (ctx) {
                calledWith = ctx;
            };

            const clearButton = document.getElementById('ai-context-clear-button');
            clearButton.click();

            (calledWith === null).should.be.true;
            // The handler must not have touched the DOM directly. Since we replaced the
            // controller's updateInspectionContext stub, no event was emitted, so the pill
            // should still be visible from the prior updateContext call.
            pill.style.display.should.not.equal('none');

            // No confirmation system message: the pill hiding is itself the confirmation.
            const systemCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
            systemCalls.length.should.equal(0);
        });

        it('should not hide the pill on the conversation-cleared event — clearing Conversation Memory is orthogonal to Inspection Context', function () {
            aiChat.updateContext({
                control: { type: 'sap.m.Button', id: 'okButton' }
            });
            const pill = document.getElementById('ai-context-info');
            pill.style.display.should.not.equal('none');

            fakeController.fire('conversation-cleared');

            pill.style.display.should.not.equal('none');
        });
    });

    describe('Assistant Capability State routing', function () {
        it('should route an unmapped Assistant Capability State to the unavailable banner instead of silently dropping it, so a future canonical state never disappears from the developer\'s view', function () {
            fakeController.fire('capability-state-changed', {
                status: 'some-new-canonical-state-not-yet-mapped',
                message: 'something happened',
                progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unavailable');
            banner.querySelector('.status-text').textContent.should.equal('something happened');
        });

        it('should apply a CSS class derived directly from the canonical ready Assistant Capability State, with no view-private status name translation', function () {
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'Gemini Nano is ready', progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-ready');
            banner.querySelector('.status-text').textContent.should.equal('Gemini Nano is ready');
        });

        it('should apply a status-downloadable CSS class (not a translated status-needs-download) when the Assistant Capability State is downloadable, so the view\'s class vocabulary matches the controller', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloadable', message: 'Model can be downloaded', progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-downloadable');
            banner.className.should.not.contain('status-needs-download');
        });

        it('should show the download button when the Assistant Capability State is downloadable', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloadable', message: 'Model can be downloaded', progress: 0
            });

            const downloadButton = document.getElementById('ai-download-button');
            downloadButton.style.display.should.not.equal('none');
            downloadButton.disabled.should.be.false;
        });

        it('should apply status-downloading and surface the progress percent message when the Assistant Capability State is downloading', function () {
            fakeController.fire('capability-state-changed', {
                status: 'downloading', message: 'Downloading model', progress: 0.42
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-downloading');
            banner.querySelector('.status-text').textContent.should.contain('42');
            const downloadButton = document.getElementById('ai-download-button');
            downloadButton.style.display.should.not.equal('none');
            downloadButton.disabled.should.be.true;
        });

        it('should apply a status-session-failed CSS class (not a translated status-error) when the controller reports session-failed', function () {
            fakeController.fire('capability-state-changed', {
                status: 'session-failed', message: 'unable to create local AI session', progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-session-failed');
            banner.className.should.not.contain('status-error');
            banner.querySelector('.status-text').textContent.should.contain('unable to create local AI session');
        });

        it('should apply a status-unsupported CSS class when the controller reports an unsupported browser', function () {
            fakeController.fire('capability-state-changed', {
                status: 'unsupported', message: 'Browser unsupported', progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unsupported');
            banner.querySelector('.status-text').textContent.should.equal('Browser unsupported');
        });

        it('should apply a status-unavailable CSS class when the controller reports unavailable', function () {
            fakeController.fire('capability-state-changed', {
                status: 'unavailable', message: 'Local AI cannot run on this device', progress: 0
            });

            const banner = document.getElementById('ai-status-banner');
            banner.className.should.contain('status-unavailable');
            banner.querySelector('.status-text').textContent.should.equal('Local AI cannot run on this device');
        });

        it('should hide the download button for every non-download Assistant Capability State that paints a banner, so the developer is not invited to re-download a ready model', function () {
            const nonDownloadStates = ['ready', 'unsupported', 'unavailable', 'session-failed'];
            nonDownloadStates.forEach(function (status) {
                fakeController.fire('capability-state-changed', {
                    status: status, message: status, progress: 0
                });
                const downloadButton = document.getElementById('ai-download-button');
                downloadButton.style.display.should.equal('none');
            });
        });

        it('should expose the clear-history affordance when the controller reports session-failed, so the developer has a user-facing recovery action that destroys the broken session and reseeds a fresh one', function () {
            // Start from ready so clear-history is offered before session-failed arrives. Assert session-failed keeps it offered.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });
            fakeController.fire('capability-state-changed', {
                status: 'session-failed', message: 'session creation failed', progress: 0
            });

            const clearButton = document.getElementById('ai-clear-history-button');
            clearButton.style.display.should.not.equal('none');
        });

        it('should leave the existing banner untouched when streaming-failed arrives — recovery is offered implicitly via the next sendUserMessage, not via a new banner — per PRD user story 8', function () {
            // Paint a ready banner first. This is the state the assistant should recover to on the next successful send.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'Gemini Nano is ready', progress: 0
            });
            const bannerBefore = document.getElementById('ai-status-banner');
            const classBefore = bannerBefore.className;
            const textBefore = bannerBefore.querySelector('.status-text').textContent;

            fakeController.fire('capability-state-changed', {
                status: 'streaming-failed', message: 'model crashed', progress: 0
            });

            const bannerAfter = document.getElementById('ai-status-banner');
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
                const counter = document.getElementById('ai-token-counter');
                counter.textContent.should.equal('');
            });
        });

        it('should append a token-usage warning as a system message exactly once when usage crosses the 70% threshold, so the developer is nudged to clear history without being spammed', function () {
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 700, inputQuota: 1000, percentUsed: 75});
            };

            // Send a message first — the counter is gated on there being messages in the
            // transcript. Then fire two ready transitions to prove the warning appends at most once.
            const input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();
            fakeController.fire('stream-complete', {content: 'a'});

            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                const warnings = fakeTranscript.calls.filter(function (c) {
                    return c.type === 'appendSystemMessage' && c.message.indexOf('token limit') !== -1;
                });
                warnings.length.should.equal(1);
            });
        });
    });

    describe('Empty-conversation gating for token counter and Clear History button', function () {
        it('should render the token counter with the semantic hidden attribute on a fresh load, so the pill is absent from the input footer until there is a message to account for', function () {
            const counter = document.getElementById('ai-token-counter');
            counter.hasAttribute('hidden').should.be.true;
        });

        it('should preserve the token counter\'s role and aria-live attributes so screen-reader announcement behaviour is not regressed by the hide gate', function () {
            const counter = document.getElementById('ai-token-counter');
            counter.getAttribute('role').should.equal('status');
            counter.getAttribute('aria-live').should.equal('polite');
        });

        it('should keep the token counter hidden after a ready capability state with null usage info in an empty conversation, so a pristine panel does not paint an empty pill', function () {
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                counter.hasAttribute('hidden').should.be.true;
                counter.textContent.should.equal('');
            });
        });

        it('should reveal the Clear History button as soon as the user sends the first message, so it is available alongside the assistant response rather than only after the reseed', function () {
            const clearButton = document.getElementById('ai-clear-history-button');
            clearButton.style.display.should.equal('none');

            const input = document.getElementById('ai-input');
            input.value = 'first';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            clearButton.style.display.should.not.equal('none');
        });

        it('should reveal the token counter after the assistant stream completes for the first user turn, so the developer sees usage numbers alongside the first response', function () {
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 100, inputQuota: 1000, percentUsed: 10});
            };

            const input = document.getElementById('ai-input');
            input.value = 'hi';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            fakeController.fire('stream-complete', {content: 'hello'});

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                counter.hasAttribute('hidden').should.be.false;
                counter.textContent.should.contain('100');
            });
        });

        it('should hide the token counter and the Clear History button on conversation-cleared, so the post-clear state matches the fresh-load state', function () {
            // Seed a non-empty conversation with visible pill and clear button.
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 100, inputQuota: 1000, percentUsed: 10});
            };
            fakeController.fire('conversation-loaded', [{role: 'user', content: 'hi'}]);
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                const clearButton = document.getElementById('ai-clear-history-button');
                counter.hasAttribute('hidden').should.be.false;
                clearButton.style.display.should.not.equal('none');

                // Now clear. Post-clear a capability-state ready may still arrive due to reseed;
                // include one to prove the ready path is a no-op for an empty conversation.
                fakeController.fire('conversation-cleared');
                fakeController.fire('capability-state-changed', {
                    status: 'ready', message: 'ready', progress: 0
                });

                return new Promise(function (resolve) { setTimeout(resolve, 10); });
            }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                const clearButton = document.getElementById('ai-clear-history-button');
                counter.hasAttribute('hidden').should.be.true;
                counter.textContent.should.equal('');
                clearButton.style.display.should.equal('none');
            });
        });

        it('should reveal the token counter and Clear History button again when a new message is sent after a clear, so the panel recovers to the active-conversation state', function () {
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 50, inputQuota: 1000, percentUsed: 5});
            };

            fakeController.fire('conversation-cleared');

            const input = document.getElementById('ai-input');
            input.value = 'again';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();
            fakeController.fire('stream-complete', {content: 'ok'});
            // After clear + reseed, the controller re-broadcasts `ready`; that is the existing
            // show point for the Clear History button. Firing it here matches the runtime flow.
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                const clearButton = document.getElementById('ai-clear-history-button');
                counter.hasAttribute('hidden').should.be.false;
                clearButton.style.display.should.not.equal('none');
            });
        });

        it('should reveal the token counter once usage info resolves for a restored non-empty conversation, so a warm start shows the same widgets as a live session', function () {
            fakeController.getUsageInfo = function () {
                return Promise.resolve({inputUsage: 200, inputQuota: 1000, percentUsed: 20});
            };

            fakeController.fire('conversation-loaded', [
                {role: 'user', content: 'q'},
                {role: 'assistant', content: 'a'}
            ]);
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                counter.hasAttribute('hidden').should.be.false;
                counter.textContent.should.contain('200');
            });
        });

        it('should leave the token counter and Clear History button hidden when a restored conversation is empty, so warm-starting an empty store looks identical to a fresh load', function () {
            fakeController.fire('conversation-loaded', []);
            fakeController.fire('capability-state-changed', {
                status: 'ready', message: 'ready', progress: 0
            });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                const clearButton = document.getElementById('ai-clear-history-button');
                counter.hasAttribute('hidden').should.be.true;
                clearButton.style.display.should.equal('none');
            });
        });

        it('should not flicker the token counter off mid-stream when a usage-info refresh briefly returns null, so the last valid pill stays visible until the next successful update', function () {
            let usageQueue = [
                {inputUsage: 100, inputQuota: 1000, percentUsed: 10},
                null
            ];
            fakeController.getUsageInfo = function () {
                return Promise.resolve(usageQueue.shift());
            };

            const input = document.getElementById('ai-input');
            input.value = 'q';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();
            fakeController.fire('stream-complete', {content: 'a'});

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                counter.hasAttribute('hidden').should.be.false;
                counter.textContent.should.contain('100');

                // Second refresh: usage briefly null (stale/unavailable). Pill must not flicker off.
                fakeController.fire('capability-state-changed', {
                    status: 'ready', message: 'ready', progress: 0
                });

                return new Promise(function (resolve) { setTimeout(resolve, 10); });
            }).then(function () {
                const counter = document.getElementById('ai-token-counter');
                counter.hasAttribute('hidden').should.be.false;
                counter.textContent.should.contain('100');
            });
        });
    });

    describe('Inline error slot', function () {
        it('should render an inline error slot inside the input area, hidden by default with role=status and aria-live=polite, so screen readers announce errors non-interruptively when they appear', function () {
            const slot = document.getElementById('ai-error-slot');
            slot.should.exist;
            slot.getAttribute('role').should.equal('status');
            slot.getAttribute('aria-live').should.equal('polite');
            slot.hasAttribute('hidden').should.be.true;
            slot.textContent.should.equal('');
        });

        it('should place the inline error slot between the context-info pill and the input row inside the input area, so errors surface directly above the input that produced them', function () {
            const inputArea = document.querySelector('.ai-input-area');
            const slot = document.getElementById('ai-error-slot');
            const inputWrapper = inputArea.querySelector('.input-wrapper');
            const contextInfo = document.getElementById('ai-context-info');

            slot.parentElement.should.equal(inputArea);
            // Order: context-info first, then error slot, then input-wrapper. Assert with
            // DOCUMENT_POSITION_FOLLOWING (0x04): X.compareDocumentPosition(Y) & FOLLOWING is truthy
            // when Y follows X in document order.
            /* eslint-disable no-bitwise */
            (contextInfo.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).should.not.equal(0);
            (slot.compareDocumentPosition(inputWrapper) & Node.DOCUMENT_POSITION_FOLLOWING).should.not.equal(0);
            /* eslint-enable no-bitwise */
        });

        it('should reveal the inline error slot with a rejected clearConversation error message and never route that failure into the transcript', function () {
            fakeController.clearConversation = function () {
                return Promise.reject(new Error('store locked'));
            };

            aiChat._performClearHistory();

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                const slot = document.getElementById('ai-error-slot');
                slot.hasAttribute('hidden').should.be.false;
                slot.textContent.should.contain('store locked');

                const systemCalls = fakeTranscript.calls.filter(function (c) { return c.type === 'appendSystemMessage'; });
                systemCalls.length.should.equal(0);
            });
        });

        it('should reveal the inline error slot when the transcript reports a clipboard-copy failure via the injected onCopyFailed callback, so the failure surfaces at the input area instead of polluting the transcript', function () {
            (typeof fakeTranscript.onCopyFailed).should.equal('function');

            fakeTranscript.onCopyFailed();

            const slot = document.getElementById('ai-error-slot');
            slot.hasAttribute('hidden').should.be.false;
            slot.textContent.should.contain('Failed to copy');
        });

        it('should clear a visible inline error when the developer resumes typing into the send input, so a stale error does not linger during the next action', function () {
            fakeController.fire('stream-failed', new Error('boom'));
            const slot = document.getElementById('ai-error-slot');
            slot.hasAttribute('hidden').should.be.false;

            const input = document.getElementById('ai-input');
            input.value = 'x';
            input.dispatchEvent(new Event('input'));

            slot.hasAttribute('hidden').should.be.true;
            slot.textContent.should.equal('');
        });

        it('should clear a visible inline error on any keydown in the send input, so pressing modifier or navigation keys also dismisses the stale error', function () {
            fakeController.fire('stream-failed', new Error('boom'));
            const slot = document.getElementById('ai-error-slot');
            slot.hasAttribute('hidden').should.be.false;

            const input = document.getElementById('ai-input');
            const evt = new Event('keydown');
            evt.key = 'a';
            input.dispatchEvent(evt);

            slot.hasAttribute('hidden').should.be.true;
        });

        it('should clear a visible inline error when the developer sends a new message, so retrying via Send starts from a clean state', function () {
            fakeController.fire('stream-failed', new Error('boom'));
            const slot = document.getElementById('ai-error-slot');
            slot.hasAttribute('hidden').should.be.false;

            const input = document.getElementById('ai-input');
            input.value = 'retry';
            input.dispatchEvent(new Event('input'));
            document.getElementById('ai-send-button').click();

            slot.hasAttribute('hidden').should.be.true;
        });

        it('should replace the currently visible inline error message when a new failure arrives, so only the latest status is shown (single-line, no stacking)', function () {
            fakeController.fire('stream-failed', new Error('first'));
            const slot = document.getElementById('ai-error-slot');
            slot.textContent.should.contain('first');

            fakeController.fire('stream-failed', new Error('second'));

            slot.textContent.should.contain('second');
            slot.textContent.should.not.contain('first');
        });
    });
});
