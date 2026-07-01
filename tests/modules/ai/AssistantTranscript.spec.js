'use strict';

const AssistantTranscript = require('../../../app/scripts/modules/ai/AssistantTranscript.js');

describe('AssistantTranscript', function () {
    const fixtures = document.getElementById('fixtures');
    let container;
    let transcript;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="transcript-host"></div>';
        container = document.getElementById('transcript-host');
        transcript = new AssistantTranscript(container);
    });

    afterEach(function () {
        if (transcript && typeof transcript.destroy === 'function') {
            transcript.destroy();
        }
        transcript = null;
        container = null;
        fixtures.innerHTML = '';
    });

    describe('Constructor', function () {
        it('should accept a container element and render an empty welcome state inside it', function () {
            container.querySelector('.ai-welcome-message').should.exist;
        });

        it('should throw if no container element is supplied, since the transcript cannot render itself without a host node', function () {
            (function () {
                /* eslint-disable no-new */
                new AssistantTranscript(null);
                /* eslint-enable no-new */
            }).should.throw();
        });
    });

    describe('#appendUserTurn()', function () {
        it('should append a user turn to the transcript so the developer sees their own message echoed back', function () {
            transcript.appendUserTurn('Hello');

            container.innerHTML.should.contain('Hello');
            container.querySelectorAll('.message-user').length.should.equal(1);
        });

        it('should escape HTML in user content so an inspected page that put markup into a control id cannot inject script tags through the transcript', function () {
            transcript.appendUserTurn('<script>alert("xss")</script>');

            container.innerHTML.should.not.contain('<script>');
            container.innerHTML.should.contain('&lt;script&gt;');
        });

        it('should remove the welcome message once the first turn is appended, so the empty-state copy does not bleed into a live conversation', function () {
            transcript.appendUserTurn('hi');

            (container.querySelector('.ai-welcome-message') === null).should.be.true;
        });
    });

    describe('#appendSystemMessage()', function () {
        it('should append a system message that the developer can read inline with the conversation', function () {
            transcript.appendSystemMessage('Chat history cleared');

            container.innerHTML.should.contain('Chat history cleared');
            container.querySelectorAll('.message-system').length.should.equal(1);
        });

        it('should escape HTML in system messages so an error string echoing a raw response cannot inject markup', function () {
            transcript.appendSystemMessage('Error: <img src=x onerror=alert(1)>');

            container.innerHTML.should.not.contain('<img');
            container.innerHTML.should.contain('&lt;img');
        });
    });

    describe('#beginAssistantTurn()', function () {
        it('should return a handle so the view can drive a streamed assistant turn without owning the streaming DOM', function () {
            const handle = transcript.beginAssistantTurn();

            handle.should.exist;
            (typeof handle.streamChunk).should.equal('function');
            (typeof handle.finalize).should.equal('function');
        });

        it('should append an assistant message element with a loading indicator so the developer sees that something is being computed before the first chunk arrives', function () {
            transcript.beginAssistantTurn();

            container.querySelectorAll('.message-assistant').length.should.equal(1);
            container.querySelector('.loading-indicator').should.exist;
        });

        it('should render markdown formatting once finalize() is called, so a final assistant turn shows bold/italic/links rendered, not as raw markdown', function () {
            const handle = transcript.beginAssistantTurn();

            handle.finalize('This is **bold** text');

            container.innerHTML.should.contain('<strong>bold</strong>');
        });

        it('should render a JSON viewer for a fenced ```json block in the final assistant content, so the developer gets the expand/collapse tree, not a raw blob', function () {
            const handle = transcript.beginAssistantTurn();

            handle.finalize('Here is data:\n```json\n{"a":1}\n```');

            container.querySelector('.json-viewer').should.exist;
            container.querySelector('.json-toggle').should.exist;
        });

        it('should render a code viewer for a fenced ```js block in the final assistant content, with a copy button so the developer can grab the snippet', function () {
            const handle = transcript.beginAssistantTurn();

            handle.finalize('Try:\n```js\nvar x = 1;\n```');

            container.querySelector('.code-wrapper').should.exist;
            container.querySelector('.copy-code-button').should.exist;
        });

        it('should remove the loading indicator once finalize() runs, since the assistant is no longer thinking', function () {
            const handle = transcript.beginAssistantTurn();
            container.querySelector('.loading-indicator').should.exist;

            handle.finalize('Done');

            (container.querySelector('.loading-indicator') === null).should.be.true;
        });

        it('should add a copy-response button to the finalized assistant turn so the developer can copy the answer in one click', function () {
            const handle = transcript.beginAssistantTurn();

            handle.finalize('answer');

            container.querySelector('.copy-response-button').should.exist;
        });

        it('should buffer streaming chunks behind a debounce timer so a noisy stream does not thrash markdown rendering on every token', function (done) {
            const handle = transcript.beginAssistantTurn();

            handle.streamChunk('Hello ');
            handle.streamChunk('**world**');

            // Wait past the debounce window.
            setTimeout(function () {
                container.querySelector('.message-assistant .message-content').innerHTML.should.contain('<strong>world</strong>');
                done();
            }, 100);
        });
    });

    describe('#clear()', function () {
        it('should drop all rendered turns and show a "cleared" welcome message so the developer knows the transcript is empty by design, not by accident', function () {
            transcript.appendUserTurn('first message');
            transcript.appendUserTurn('second message');

            transcript.clear();

            container.querySelectorAll('.ai-message').length.should.equal(0);
            container.querySelector('.ai-welcome-message').should.exist;
            container.innerHTML.should.contain('cleared');
        });
    });

    describe('#reset()', function () {
        it('should replace the transcript with the supplied list of prior turns, so loading Conversation Memory for a new url renders that conversation verbatim', function () {
            transcript.appendUserTurn('stale');

            transcript.reset([
                { role: 'user', content: 'previous question' },
                { role: 'assistant', content: 'previous **answer**' }
            ]);

            container.querySelectorAll('.ai-message').length.should.equal(2);
            container.innerHTML.should.contain('previous question');
            container.innerHTML.should.contain('<strong>answer</strong>');
        });

        it('should render an empty transcript when passed an empty turn list, so a freshly cleared conversation does not keep stale content from a previous url', function () {
            transcript.appendUserTurn('stale');

            transcript.reset([]);

            container.querySelectorAll('.ai-message').length.should.equal(0);
        });
    });

    describe('#scrollToBottom()', function () {
        it('should expose a scroll-to-bottom hook so the view can keep the latest turn visible when the tab becomes active', function () {
            (typeof transcript.scrollToBottom).should.equal('function');
            // Calling on a container without overflow must not throw.
            (function () { transcript.scrollToBottom(true); }).should.not.throw();
        });
    });

    describe('JSON viewer expand/collapse', function () {
        it('should toggle a JSON content section when the toggle indicator is clicked, so the developer can fold and unfold nested structures', function () {
            const handle = transcript.beginAssistantTurn();
            handle.finalize('```json\n{"a":{"b":1}}\n```');

            const toggle = container.querySelector('.json-toggle');
            const targetId = toggle.getAttribute('data-target');
            const content = document.getElementById(targetId);

            toggle.click();
            content.style.display.should.equal('none');
            toggle.textContent.should.equal('\u25B6');

            toggle.click();
            content.style.display.should.equal('block');
            toggle.textContent.should.equal('\u25BC');
        });
    });

    describe('Copy-button failure handling', function () {
        it('should invoke the injected onCopyFailed callback when the underlying copy command reports failure, so the transcript notifies the view without appending a fake system-role turn', function () {
            // Force execCommand to return false to simulate a denied copy. The transcript must notify the view via callback, not the transcript DOM.
            const originalExecCommand = document.execCommand;
            document.execCommand = function () { return false; };

            let callbackInvoked = false;
            const localContainer = document.createElement('div');
            fixtures.appendChild(localContainer);
            const localTranscript = new AssistantTranscript(localContainer, {
                onCopyFailed: function () { callbackInvoked = true; }
            });

            try {
                const handle = localTranscript.beginAssistantTurn();
                handle.finalize('an answer');

                const copyButton = localContainer.querySelector('.copy-response-button');
                copyButton.should.exist;
                copyButton.click();

                callbackInvoked.should.be.true;
                // Failure must NOT be surfaced as a transcript system message anymore.
                (localContainer.querySelector('.message-system') === null).should.be.true;
                localContainer.innerHTML.should.not.contain('Failed to copy to clipboard');
            } finally {
                document.execCommand = originalExecCommand;
                if (typeof localTranscript.destroy === 'function') {
                    localTranscript.destroy();
                }
            }
        });

        it('should not throw when copy fails and no onCopyFailed callback was supplied, so the transcript keeps working in environments that do not care about surfacing the failure', function () {
            const originalExecCommand = document.execCommand;
            document.execCommand = function () { return false; };

            try {
                const handle = transcript.beginAssistantTurn();
                handle.finalize('an answer');

                const copyButton = container.querySelector('.copy-response-button');
                (function () { copyButton.click(); }).should.not.throw();

                // Even without a callback, no system-role message must be appended.
                (container.querySelector('.message-system') === null).should.be.true;
            } finally {
                document.execCommand = originalExecCommand;
            }
        });
    });

    describe('Scroll behavior on finalize', function () {
        it('should not force-scroll the host container when the stream is finalized, so a developer who scrolled up to read an earlier turn is not yanked to the bottom on completion', function () {
            // Real overflow so scrollTop can be set.
            container.style.height = '50px';
            container.style.overflow = 'auto';

            // Seed enough content for room to scroll up.
            transcript.appendUserTurn('first user message');
            transcript.appendUserTurn('second user message');
            transcript.appendUserTurn('third user message');

            const handle = transcript.beginAssistantTurn();

            // Developer scrolls up while the model streams. Finalize must not yank back.
            container.scrollTop = 0;

            handle.finalize('the assistant answer');

            container.scrollTop.should.equal(0);
        });
    });
});
