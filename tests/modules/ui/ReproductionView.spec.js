'use strict';

const ReproductionView = require('../../../app/scripts/modules/ui/ReproductionView.js');

function createFakeBuilder(output) {
    return {
        calls: [],
        build: function (snapshot, options) {
            this.calls.push({ snapshot: snapshot, options: options });
            return output || 'PROMPT';
        }
    };
}

function sampleSnapshot(overrides) {
    return Object.assign({
        meta: {},
        consoleErrors: [],
        tree: [],
        stats: { controlCount: 3, truncated: false }
    }, overrides);
}

describe('ReproductionView', function () {
    const fixtures = document.getElementById('fixtures');
    let view;
    let fakeBuilder;
    let fakeHtmlBuilder;
    let fakeFocuser;
    let requested;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="reproduction-view"></div>';
        fakeBuilder = createFakeBuilder('PROMPT');
        fakeHtmlBuilder = createFakeBuilder('<!DOCTYPE html>');
        fakeFocuser = {
            focus: sinon.stub().returns(Promise.resolve({ usedAI: false, reason: 'empty-selection', tree: [] }))
        };
        requested = 0;
        view = new ReproductionView('reproduction-view', {
            promptBuilder: fakeBuilder,
            htmlBuilder: fakeHtmlBuilder,
            issueFocuser: fakeFocuser,
            onRequestSnapshot: function () { requested += 1; }
        });
    });

    afterEach(function () {
        view = null;
        fakeBuilder = null;
        fakeHtmlBuilder = null;
        fakeFocuser = null;
        fixtures.innerHTML = '';
    });

    describe('Rendering', function () {
        it('should render the toolbar controls and the output area', function () {
            view._container.querySelector('.reproduction-generate').should.exist;
            view._container.querySelector('.reproduction-generate-html').should.exist;
            view._container.querySelector('.reproduction-realdata-input').should.exist;
            view._container.querySelector('.reproduction-copy').should.exist;
            view._container.querySelector('.reproduction-output').should.exist;
        });

        it('should start with the Copy button disabled', function () {
            view._copyButton.disabled.should.equal(true);
        });
    });

    describe('Generate', function () {
        it('should request a snapshot, disable both generate buttons and show a crawling status', function () {
            view._generateButton.click();

            requested.should.equal(1);
            view._generateButton.disabled.should.equal(true);
            view._generateHtmlButton.disabled.should.equal(true);
            view._status.textContent.should.contain('Crawling');
        });
    });

    describe('Generate app code', function () {
        it('should request a snapshot and switch to html mode', function () {
            view._generateHtmlButton.click();

            requested.should.equal(1);
            view._mode.should.equal('html');
            view._generateButton.disabled.should.equal(true);
            view._generateHtmlButton.disabled.should.equal(true);
        });

        it('should build the app code into the output field on success', function () {
            view._generateHtmlButton.click();
            view.showSnapshot(sampleSnapshot());

            view._output.value.should.equal('<!DOCTYPE html>');
            fakeHtmlBuilder.calls.should.have.length(1);
            fakeBuilder.calls.should.have.length(0);
            view._copyButton.disabled.should.equal(false);
            view._status.textContent.should.contain('App code ready');
            view._status.textContent.should.contain('3 controls');
        });

        it('should keep producing the prompt in prompt mode', function () {
            view._generateButton.click();
            view.showSnapshot(sampleSnapshot());

            view._output.value.should.equal('PROMPT');
            fakeBuilder.calls.should.have.length(1);
            fakeHtmlBuilder.calls.should.have.length(0);
        });
    });

    describe('Validation (Playwright + Snippix MCP)', function () {
        function viewWithVerifier(verifier) {
            fixtures.innerHTML = '<div id="reproduction-view"></div>';
            return new ReproductionView('reproduction-view', {
                promptBuilder: fakeBuilder,
                htmlBuilder: fakeHtmlBuilder,
                issueFocuser: fakeFocuser,
                verifier: verifier,
                onRequestSnapshot: function () {}
            });
        }

        it('should not validate when no verifier is wired', function () {
            view._generateHtmlButton.click();
            const result = view.showSnapshot(sampleSnapshot());
            (result === null).should.equal(true);
            view._status.textContent.should.contain('App code ready');
            view._status.textContent.should.not.contain('Validating');
        });

        it('should validate the generated app and report a clean render + Snippix URL', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: true, errors: [], reason: 'ok' },
                    snippet: { ok: true, url: 'https://snippix/snippets/abc.html', reason: 'saved' },
                    attempts: 0, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();

            const promise = v.showSnapshot(sampleSnapshot());
            verifier.verifyFixSave.calledOnce.should.equal(true);
            verifier.verifyFixSave.firstCall.args[0].should.equal('<!DOCTYPE html>');

            return promise.then(function () {
                v._status.textContent.should.contain('Rendered with no console errors');
                v._status.textContent.should.contain('Snippix: https://snippix/snippets/abc.html');
            });
        });

        it('should pass a rebuild function that regenerates HTML with the given adjustments', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: true, errors: [], reason: 'ok' },
                    snippet: { ok: true, url: 'https://snippix/snippets/abc.html', reason: 'saved' },
                    attempts: 0, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                const rebuild = verifier.verifyFixSave.firstCall.args[1];
                const before = fakeHtmlBuilder.calls.length;
                rebuild({ excludeTypes: ['sap.m.Foo'], excludeLibraries: [] });
                const lastCall = fakeHtmlBuilder.calls[fakeHtmlBuilder.calls.length - 1];
                fakeHtmlBuilder.calls.length.should.equal(before + 1);
                lastCall.options.excludeTypes.should.deep.equal(['sap.m.Foo']);
            });
        });

        it('should report the fix attempts when the app needed fixing before saving', function () {
            const verifier = {
                verifyFixSave: sinon.stub().callsFake(function (html, rebuild, options) {
                    options.onAttempt({ attempt: 1, maxAttempts: 3, errors: ['[ERROR] x'], adjustments: {} });
                    return Promise.resolve({
                        verification: { ok: true, errors: [], reason: 'ok' },
                        snippet: { ok: true, url: 'https://snippix/snippets/abc.html', reason: 'saved' },
                        attempts: 1, fixed: true
                    });
                })
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                v._status.textContent.should.contain('Rendered with no console errors (after 1 fix)');
                v._status.textContent.should.contain('Snippix: https://snippix/snippets/abc.html');
            });
        });

        it('should report console errors and NOT create a Snippix when the app stays broken', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: false, errors: ['[ERROR] boom'], reason: 'errors' },
                    snippet: { ok: false, url: '', reason: 'not-saved-has-errors' },
                    attempts: 3, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                v._status.textContent.should.contain('1 console error(s)');
                v._status.textContent.should.contain('boom');
                v._status.textContent.should.contain('Snippix not created (app has errors)');
            });
        });

        it('should report a skipped render check and no Snippix when the bridge is unavailable', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: null, errors: [], reason: 'unavailable' },
                    snippet: { ok: null, url: '', reason: 'skipped-unverified' },
                    attempts: 0, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                v._status.textContent.should.contain('Render check skipped (unavailable)');
                v._status.textContent.should.contain('Snippix not created');
            });
        });

        it('should degrade gracefully when verifyFixSave rejects', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.reject(new Error('bridge down')))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                v._status.textContent.should.contain('Validation unavailable');
            });
        });

        it('should NOT re-validate or re-save when typing in the issue field (html mode)', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: true, errors: [], reason: 'ok' },
                    snippet: { ok: true, url: 'https://snippix/snippets/abc.html', reason: 'saved' },
                    attempts: 0, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                verifier.verifyFixSave.calledOnce.should.equal(true);
                // Typing in the issue field must not spawn more render checks / Snippix saves.
                v._issueInput.value = 'S';
                v._issueInput.dispatchEvent(new Event('input'));
                v._issueInput.value = 'Sa';
                v._issueInput.dispatchEvent(new Event('input'));
                v._issueInput.value = 'Sav';
                v._issueInput.dispatchEvent(new Event('input'));
                verifier.verifyFixSave.calledOnce.should.equal(true);
                // The app code is still refreshed in the output field.
                v._output.value.should.equal('<!DOCTYPE html>');
            });
        });

        it('should re-validate when the real-data toggle changes (html mode)', function () {
            const verifier = {
                verifyFixSave: sinon.stub().returns(Promise.resolve({
                    verification: { ok: true, errors: [], reason: 'ok' },
                    snippet: { ok: true, url: 'https://snippix/snippets/abc.html', reason: 'saved' },
                    attempts: 0, fixed: false
                }))
            };
            const v = viewWithVerifier(verifier);
            v._generateHtmlButton.click();
            return v.showSnapshot(sampleSnapshot()).then(function () {
                verifier.verifyFixSave.calledOnce.should.equal(true);
                v._realDataInput.checked = true;
                v._realDataInput.dispatchEvent(new Event('change'));
                verifier.verifyFixSave.calledTwice.should.equal(true);
            });
        });
    });

    describe('showSnapshot', function () {
        it('should build and display the prompt and enable copy on success', function () {
            view.showSnapshot(sampleSnapshot());

            view._output.value.should.equal('PROMPT');
            view._copyButton.disabled.should.equal(false);
            view._generateButton.disabled.should.equal(false);
            view._status.textContent.should.contain('3 controls');
            view._status.textContent.should.contain('lines');
            fakeBuilder.calls.should.have.length(1);
            fakeBuilder.calls[0].options.includeRealData.should.equal(false);
        });

        it('should show a truncated suffix when the snapshot was truncated', function () {
            view.showSnapshot(sampleSnapshot({ stats: { controlCount: 2, truncated: true } }));
            view._status.textContent.should.contain('truncated');
        });

        it('should show an error and keep copy disabled on failure', function () {
            view.showSnapshot(null, 'Boom');

            view._output.value.should.equal('');
            view._copyButton.disabled.should.equal(true);
            view._status.textContent.should.equal('Boom');
        });

        it('should use a default message when no error text is provided', function () {
            view.showSnapshot(null);
            view._status.textContent.should.contain('Could not crawl');
        });
    });

    describe('Real-data toggle', function () {
        it('should rebuild with includeRealData when toggled after a snapshot exists', function () {
            view.showSnapshot(sampleSnapshot());
            view._realDataInput.checked = true;
            view._realDataInput.dispatchEvent(new Event('change'));

            fakeBuilder.calls.should.have.length(2);
            fakeBuilder.calls[1].options.includeRealData.should.equal(true);
        });

        it('should do nothing when toggled before any snapshot exists', function () {
            view._realDataInput.checked = true;
            view._realDataInput.dispatchEvent(new Event('change'));
            fakeBuilder.calls.should.have.length(0);
        });
    });

    describe('Issue field', function () {
        it('should pass the issue text to the builder when generating', function () {
            view._issueInput.value = 'Save throws a binding error';
            view.showSnapshot(sampleSnapshot());

            fakeBuilder.calls.should.have.length(1);
            fakeBuilder.calls[0].options.issue.should.equal('Save throws a binding error');
        });

        it('should NOT generate while typing in the issue field', function () {
            view.showSnapshot(sampleSnapshot());
            fakeBuilder.calls.should.have.length(1);

            view._issueInput.value = 'S';
            view._issueInput.dispatchEvent(new Event('input'));
            view._issueInput.value = 'Save';
            view._issueInput.dispatchEvent(new Event('input'));

            // Typing must not trigger any new build — generation only happens on an explicit button.
            fakeBuilder.calls.should.have.length(1);
        });

        it('should do nothing when edited before any snapshot exists', function () {
            view._issueInput.value = 'something';
            view._issueInput.dispatchEvent(new Event('input'));
            fakeBuilder.calls.should.have.length(0);
        });

        it('should drop a stale AI focus when the issue text is edited', function () {
            const focusedTree = [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }];
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: true, focusedIds: ['btnSave'], tree: focusedTree, reason: 'ok' }));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                (view._focusedSnapshot === null).should.equal(false);
                view._issueInput.value = 'Save fails more';
                view._issueInput.dispatchEvent(new Event('input'));
                (view._focusedSnapshot === null).should.equal(true);
            });
        });
    });

    describe('Focus with AI', function () {
        it('should render a Focus with AI button', function () {
            view._container.querySelector('.reproduction-focus').should.exist;
        });

        it('should prompt to generate first when there is no snapshot', function () {
            view._focusButton.click();
            fakeFocuser.focus.called.should.equal(false);
            view._status.textContent.should.contain('Generate a prompt first');
        });

        it('should prompt for an issue when the field is empty', function () {
            view.showSnapshot(sampleSnapshot());
            view._focusButton.click();
            fakeFocuser.focus.called.should.equal(false);
            view._status.textContent.should.contain('Type an issue');
        });

        it('should rebuild from the pruned tree and report the focused count on success', function () {
            const focusedTree = [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }];
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: true, focusedIds: ['btnSave'], tree: focusedTree, reason: 'ok' }));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                const lastCall = fakeBuilder.calls[fakeBuilder.calls.length - 1];
                lastCall.snapshot.tree.should.equal(focusedTree);
                view._status.textContent.should.contain('AI-focused to 1 controls');
            });
        });

        it('should label the status as a keyword match when the focus used the deterministic fallback', function () {
            const focusedTree = [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }];
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: true, method: 'keyword', focusedIds: ['btnSave'], tree: focusedTree, reason: 'ok' }));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                view._status.textContent.should.contain('Focused to 1 controls (keyword match)');
            });
        });

        it('should fall back to the full outline and explain when the model declines', function () {
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: false, reason: 'too-large', tree: [] }));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                view._status.textContent.should.contain('AI focus skipped');
                view._status.textContent.should.contain('too large');
            });
        });

        it('should report a failure when the focuser rejects', function () {
            fakeFocuser.focus.returns(Promise.reject(new Error('boom')));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                view._status.textContent.should.contain('AI focus failed');
            });
        });

        it('should apply the focus to the generated app code when in html mode', function () {
            const focusedTree = [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }];
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: true, focusedIds: ['btnSave'], tree: focusedTree, reason: 'ok' }));

            view._generateHtmlButton.click();
            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                // The HTML builder (not the prompt builder) renders the pruned tree.
                const lastCall = fakeHtmlBuilder.calls[fakeHtmlBuilder.calls.length - 1];
                lastCall.snapshot.tree.should.equal(focusedTree);
                view._status.textContent.should.contain('App code ready');
                view._status.textContent.should.contain('AI-focused to 1 controls');
            });
        });

        it('should drop frames from the focused snapshot so the pruned tree is rendered', function () {
            const focusedTree = [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }];
            fakeFocuser.focus.returns(Promise.resolve({ usedAI: true, focusedIds: ['btnSave'], tree: focusedTree, reason: 'ok' }));

            view.showSnapshot(Object.assign(sampleSnapshot(), {
                frames: [{ frameId: 0, tree: [] }, { frameId: 1, tree: [] }]
            }));
            view._issueInput.value = 'Save fails';

            return view._focusWithAI().then(function () {
                const lastCall = fakeBuilder.calls[fakeBuilder.calls.length - 1];
                (lastCall.snapshot.frames === undefined).should.equal(true);
                lastCall.snapshot.tree.should.equal(focusedTree);
            });
        });

        it('should cancel an in-flight focus run when the button is clicked again', function () {
            let resolveFocus;
            fakeFocuser.focus.returns(new Promise(function (resolve) { resolveFocus = resolve; }));

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            const pending = view._focusWithAI();
            view._isFocusing.should.equal(true);
            view._focusButton.textContent.should.equal('Cancel focus');

            // Second click cancels.
            view._focusButton.click();
            view._isFocusing.should.equal(false);
            view._focusButton.textContent.should.equal('Focus with AI');
            view._status.textContent.should.contain('AI focus cancelled');

            // The late result must not mutate the view (no focus applied).
            resolveFocus({ usedAI: true, focusedIds: ['btnSave'], tree: [{ id: 'btnSave', type: 'sap.m.Button', isControl: true, children: [] }], reason: 'ok' });
            return pending.then(function () {
                (view._focusedSnapshot === null).should.equal(true);
            });
        });

        it('should report download progress while focusing', function () {
            fakeFocuser.focus.callsFake(function (snapshot, issue, options) {
                options.onProgress(0.42);
                return Promise.resolve({ usedAI: false, reason: 'empty-selection', tree: [] });
            });

            view.showSnapshot(sampleSnapshot());
            view._issueInput.value = 'Save fails';

            const p = view._focusWithAI();
            view._status.textContent.should.contain('42%');
            return p;
        });
    });

    describe('Copy', function () {
        it('should do nothing when there is no output', function () {
            const spy = sinon.spy(document, 'execCommand');
            view._copyButton.click();
            spy.called.should.equal(false);
            spy.restore();
        });

        it('should write to the clipboard when the async clipboard API is available', function () {
            view.showSnapshot(sampleSnapshot());
            const writeText = sinon.stub(navigator.clipboard, 'writeText').returns(Promise.resolve());

            view._copyButton.click();

            writeText.calledWith('PROMPT').should.equal(true);
            writeText.restore();
        });

        it('should fall back to execCommand when the async clipboard API is unavailable', function () {
            view.showSnapshot(sampleSnapshot());

            const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
            const exec = sinon.stub(document, 'execCommand').returns(true);

            view._copyButton.click();

            exec.called.should.equal(true);
            view._status.textContent.should.contain('Copied');

            exec.restore();
            if (original) {
                Object.defineProperty(navigator, 'clipboard', original);
            }
        });

        it('should report a failure when the fallback copy throws', function () {
            view.showSnapshot(sampleSnapshot());

            const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
            const exec = sinon.stub(document, 'execCommand').throws(new Error('denied'));

            view._copyButton.click();

            view._status.textContent.should.contain('Copy failed');

            exec.restore();
            if (original) {
                Object.defineProperty(navigator, 'clipboard', original);
            }
        });
    });
});
