'use strict';

const ReproductionVerifier = require('../../../app/scripts/modules/ai/ReproductionVerifier.js');

function fakeBridge(overrides) {
    return Object.assign({
        listTools: function () {
            return Promise.resolve([{ server: 'playwright', name: 'browser_navigate' }]);
        },
        callTool: function (server, name) {
            if (name === 'browser_console_messages') {
                return Promise.resolve({ content: [{ type: 'text', text: '[LOG] app loaded' }] });
            }
            return Promise.resolve({ content: [] });
        }
    }, overrides || {});
}

describe('ReproductionVerifier', function () {
    it('should skip (ok: null) when there is no HTML', function () {
        const verifier = new ReproductionVerifier({ bridgeClient: fakeBridge() });
        return verifier.verify('').then(function (result) {
            (result.ok === null).should.equal(true);
            result.reason.should.equal('no-html');
        });
    });

    it('should skip when the bridge does not host the Playwright server', function () {
        const bridge = fakeBridge({
            listTools: function () { return Promise.resolve([{ server: 'ui5', name: 'get_version_info' }]); },
            callTool: sinon.stub()
        });
        const verifier = new ReproductionVerifier({ bridgeClient: bridge });
        return verifier.verify('<html></html>').then(function (result) {
            (result.ok === null).should.equal(true);
            result.reason.should.equal('unavailable');
            bridge.callTool.called.should.equal(false);
        });
    });

    it('should pass when the console has no error entries', function () {
        const verifier = new ReproductionVerifier({ bridgeClient: fakeBridge(), pauseSeconds: 0 });
        return verifier.verify('<html></html>').then(function (result) {
            result.ok.should.equal(true);
            result.errors.should.have.length(0);
            result.reason.should.equal('ok');
        });
    });

    it('should navigate to the bootstrap origin, write the HTML into the live page, then read the console', function () {
        const callTool = sinon.stub();
        callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
        callTool.returns(Promise.resolve({ content: [] }));
        const html = '<html><head><script id="sap-ui-bootstrap" src="https://ui5.sap.com/resources/sap-ui-core.js"></script></head><body>APP</body></html>';
        const verifier = new ReproductionVerifier({ bridgeClient: fakeBridge({ callTool: callTool }), pauseSeconds: 2 });
        return verifier.verify(html).then(function () {
            // UI5 cannot boot from a data: URL, so the check navigates to the bootstrap's real origin…
            const nav = callTool.getCall(0);
            nav.args[1].should.equal('browser_navigate');
            nav.args[2].url.should.equal('https://ui5.sap.com/resources/sap-ui-version.json');
            nav.args[2].url.should.not.contain('data:');
            // …then writes the reproduction into that live page via document.write…
            const evalCall = callTool.getCall(1);
            evalCall.args[1].should.equal('browser_evaluate');
            evalCall.args[2].function.should.contain('document.write');
            evalCall.args[2].function.should.contain('APP');
            // …waits, then reads the console.
            callTool.getCall(2).args[1].should.equal('browser_wait_for');
            callTool.getCall(2).args[2].time.should.equal(2);
            callTool.getCall(3).args[1].should.equal('browser_console_messages');
        });
    });

    it('should fail and report the console errors', function () {
        const bridge = fakeBridge({
            callTool: function (server, name) {
                if (name === 'browser_console_messages') {
                    return Promise.resolve({ content: [{ type: 'text', text: '[LOG] a\n[ERROR] boom happened\n[WARNING] meh' }] });
                }
                return Promise.resolve({ content: [] });
            }
        });
        const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
        return verifier.verify('<html></html>').then(function (result) {
            result.ok.should.equal(false);
            result.errors.should.have.length(1);
            result.errors[0].should.contain('boom happened');
            result.reason.should.equal('errors');
        });
    });

    it('should cap the number of reported errors', function () {
        const many = Array.from({ length: 10 }, function (_, i) { return '[ERROR] e' + i; }).join('\n');
        const bridge = fakeBridge({
            callTool: function (server, name) {
                if (name === 'browser_console_messages') {
                    return Promise.resolve({ content: [{ type: 'text', text: many }] });
                }
                return Promise.resolve({ content: [] });
            }
        });
        const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
        return verifier.verify('<html></html>').then(function (result) {
            result.ok.should.equal(false);
            result.errors.length.should.equal(5);
        });
    });

    it('should be graceful (ok: null) when a Playwright call fails', function () {
        const bridge = fakeBridge({
            callTool: function () { return Promise.reject(new Error('browser crashed')); }
        });
        const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
        return verifier.verify('<html></html>').then(function (result) {
            (result.ok === null).should.equal(true);
            result.reason.should.contain('browser crashed');
        });
    });

    describe('references', function () {
        function wcBridge(apiText) {
            return {
                listTools: function () { return Promise.resolve([{ server: 'ui5-webcomponents', name: 'get_component_api' }]); },
                callTool: function (server, name, args) {
                    server.should.equal('ui5-webcomponents');
                    name.should.equal('get_component_api');
                    return Promise.resolve({ content: [{ type: 'text', text: apiText(args.componentName) }] });
                }
            };
        }

        it('should resolve with [] when given no component names', function () {
            const verifier = new ReproductionVerifier({ bridgeClient: wcBridge(function () { return ''; }) });
            return verifier.references([]).then(function (refs) {
                refs.should.have.length(0);
            });
        });

        it('should resolve with [] when the webcomponents server is absent', function () {
            const bridge = {
                listTools: function () { return Promise.resolve([{ server: 'playwright', name: 'browser_navigate' }]); },
                callTool: sinon.stub()
            };
            const verifier = new ReproductionVerifier({ bridgeClient: bridge });
            return verifier.references(['Avatar']).then(function (refs) {
                refs.should.have.length(0);
                bridge.callTool.called.should.equal(false);
            });
        });

        it('should fetch the real API overview for each distinct component', function () {
            const verifier = new ReproductionVerifier({
                bridgeClient: wcBridge(function (name) {
                    return '# ' + name + ' API Reference\n## Description\n### Overview\nThe ui5-' + name.toLowerCase() + ' component does things. More text.';
                })
            });
            return verifier.references(['Avatar', 'Avatar', 'Button']).then(function (refs) {
                refs.should.have.length(2);
                refs[0].name.should.equal('Avatar');
                refs[0].found.should.equal(true);
                refs[0].overview.should.contain('ui5-avatar component does things');
                refs[1].name.should.equal('Button');
            });
        });

        it('should flag a component the server cannot find', function () {
            const verifier = new ReproductionVerifier({
                bridgeClient: wcBridge(function () { return 'Component "ui5-shell-bar" not found in any of the UI5 Web Components packages.'; })
            });
            return verifier.references(['ShellBar']).then(function (refs) {
                refs[0].found.should.equal(false);
                refs[0].overview.should.equal('');
            });
        });
    });

    describe('render-check origin', function () {
        it('should derive the navigate origin from the HTML bootstrap src', function () {
            const callTool = sinon.stub();
            callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
            callTool.returns(Promise.resolve({ content: [] }));
            const verifier = new ReproductionVerifier({ bridgeClient: fakeBridge({ callTool: callTool }), pauseSeconds: 0 });
            const html = '<script id="sap-ui-bootstrap" src="https://ui5.sap.com/1.152.0/resources/sap-ui-core.js" data-sap-ui-libs="sap.m"></script>';
            return verifier.verify(html).then(function () {
                const navUrl = callTool.getCall(0).args[2].url;
                navUrl.should.equal('https://ui5.sap.com/resources/sap-ui-version.json');
                navUrl.should.not.contain('data:');
            });
        });
    });

    describe('save', function () {
        function snippixBridge(overrides) {
            return Object.assign({
                listTools: function () { return Promise.resolve([{ server: 'snippix', name: 'save_snippet' }]); },
                callTool: function () {
                    return Promise.resolve({ content: [{ type: 'text', text: 'Snippet saved.\nid: abc123\nsnippix link: https://snippix.only.sap/snippix/snippets/abc123\ndirect run: https://snippix.only.sap/snippix/snippets/abc123.html' }] });
                }
            }, overrides || {});
        }

        it('should skip (ok: null) when there is no HTML', function () {
            const verifier = new ReproductionVerifier({ bridgeClient: snippixBridge() });
            return verifier.save('').then(function (result) {
                (result.ok === null).should.equal(true);
                result.reason.should.equal('no-html');
            });
        });

        it('should skip when the bridge does not host the snippix server', function () {
            const bridge = snippixBridge({
                listTools: function () { return Promise.resolve([{ server: 'playwright', name: 'browser_navigate' }]); },
                callTool: sinon.stub()
            });
            const verifier = new ReproductionVerifier({ bridgeClient: bridge });
            return verifier.save('<html></html>').then(function (result) {
                (result.ok === null).should.equal(true);
                result.reason.should.equal('unavailable');
                bridge.callTool.called.should.equal(false);
            });
        });

        it('should store the snippet and return its id and run URL', function () {
            const verifier = new ReproductionVerifier({ bridgeClient: snippixBridge() });
            return verifier.save('<html>APP</html>').then(function (result) {
                result.ok.should.equal(true);
                result.id.should.equal('abc123');
                result.url.should.equal('https://snippix.only.sap/snippix/snippets/abc123.html');
            });
        });

        it('should report a save failure flagged by the snippix server', function () {
            const verifier = new ReproductionVerifier({
                bridgeClient: snippixBridge({
                    callTool: function () { return Promise.resolve({ isError: true, content: [{ type: 'text', text: 'Failed to save snippet (HTTP 403)' }] }); }
                })
            });
            return verifier.save('<html></html>').then(function (result) {
                result.ok.should.equal(false);
                result.reason.should.contain('403');
            });
        });

        it('should be graceful (ok: null) when the save call rejects', function () {
            const verifier = new ReproductionVerifier({
                bridgeClient: snippixBridge({ callTool: function () { return Promise.reject(new Error('bridge down')); } })
            });
            return verifier.save('<html></html>').then(function (result) {
                (result.ok === null).should.equal(true);
                result.reason.should.contain('bridge down');
            });
        });
    });

    describe('verifyFixSave', function () {
        function makeVerifier() {
            return new ReproductionVerifier({ bridgeClient: fakeBridge() });
        }

        it('should save immediately and never rebuild when the first render is clean', function () {
            const verifier = makeVerifier();
            sinon.stub(verifier, 'verify').returns(Promise.resolve({ ok: true, errors: [], reason: 'ok' }));
            const save = sinon.stub(verifier, 'save').returns(Promise.resolve({ ok: true, id: 'x', url: 'u', reason: 'saved' }));
            const rebuild = sinon.stub().returns('REBUILT');
            return verifier.verifyFixSave('HTML', rebuild).then(function (result) {
                result.snippet.ok.should.equal(true);
                result.attempts.should.equal(0);
                result.fixed.should.equal(false);
                rebuild.called.should.equal(false);
                save.calledWith('HTML').should.equal(true);
            });
        });

        it('should fix and then save when a rebuild clears the errors', function () {
            const verifier = makeVerifier();
            const verify = sinon.stub(verifier, 'verify');
            verify.onCall(0).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/Foo.js"'], reason: 'errors' }));
            verify.onCall(1).returns(Promise.resolve({ ok: true, errors: [], reason: 'ok' }));
            const save = sinon.stub(verifier, 'save').returns(Promise.resolve({ ok: true, id: 'x', url: 'u', reason: 'saved' }));
            const rebuild = sinon.stub().returns('REBUILT');
            return verifier.verifyFixSave('HTML', rebuild).then(function (result) {
                result.snippet.ok.should.equal(true);
                result.fixed.should.equal(true);
                result.attempts.should.equal(1);
                rebuild.calledOnce.should.equal(true);
                rebuild.firstCall.args[0].excludeTypes.should.contain('sap.m.Foo');
                save.calledWith('REBUILT').should.equal(true);
            });
        });

        it('should never save when the errors cannot be fixed (no recognized signature)', function () {
            const verifier = makeVerifier();
            sinon.stub(verifier, 'verify').returns(Promise.resolve({ ok: false, errors: ['some opaque error'], reason: 'errors' }));
            const save = sinon.stub(verifier, 'save');
            const rebuild = sinon.stub().returns('REBUILT');
            return verifier.verifyFixSave('HTML', rebuild).then(function (result) {
                result.snippet.ok.should.equal(false);
                result.snippet.reason.should.equal('not-saved-has-errors');
                save.called.should.equal(false);
                rebuild.called.should.equal(false);
            });
        });

        it('should stop after maxAttempts and never save a persistently broken app', function () {
            const verifier = makeVerifier();
            const verify = sinon.stub(verifier, 'verify');
            verify.onCall(0).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/A.js"'], reason: 'errors' }));
            verify.onCall(1).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/B.js"'], reason: 'errors' }));
            verify.onCall(2).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/C.js"'], reason: 'errors' }));
            verify.onCall(3).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/D.js"'], reason: 'errors' }));
            const save = sinon.stub(verifier, 'save');
            const rebuild = sinon.stub().returns('REBUILT');
            return verifier.verifyFixSave('HTML', rebuild, { maxAttempts: 3 }).then(function (result) {
                result.snippet.reason.should.equal('not-saved-has-errors');
                result.attempts.should.equal(3);
                rebuild.callCount.should.equal(3);
                save.called.should.equal(false);
            });
        });

        it('should never save when the render check is unavailable', function () {
            const verifier = makeVerifier();
            sinon.stub(verifier, 'verify').returns(Promise.resolve({ ok: null, errors: [], reason: 'unavailable' }));
            const save = sinon.stub(verifier, 'save');
            return verifier.verifyFixSave('HTML', sinon.stub()).then(function (result) {
                (result.snippet.ok === null).should.equal(true);
                result.snippet.reason.should.equal('skipped-unverified');
                save.called.should.equal(false);
            });
        });

        it('should invoke onAttempt before each fix rebuild', function () {
            const verifier = makeVerifier();
            const verify = sinon.stub(verifier, 'verify');
            verify.onCall(0).returns(Promise.resolve({ ok: false, errors: ['failed to load "sap/m/Foo.js"'], reason: 'errors' }));
            verify.onCall(1).returns(Promise.resolve({ ok: true, errors: [], reason: 'ok' }));
            sinon.stub(verifier, 'save').returns(Promise.resolve({ ok: true, id: 'x', url: 'u', reason: 'saved' }));
            const onAttempt = sinon.spy();
            return verifier.verifyFixSave('HTML', sinon.stub().returns('R'), { onAttempt: onAttempt }).then(function () {
                onAttempt.calledOnce.should.equal(true);
                onAttempt.firstCall.args[0].attempt.should.equal(1);
                onAttempt.firstCall.args[0].maxAttempts.should.equal(3);
            });
        });
    });
});
