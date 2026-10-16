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

    it('should navigate to the HTML as a data URL and wait before reading the console', function () {
        const callTool = sinon.stub();
        callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
        callTool.returns(Promise.resolve({ content: [] }));
        const verifier = new ReproductionVerifier({ bridgeClient: fakeBridge({ callTool: callTool }), pauseSeconds: 2 });
        return verifier.verify('<html>APP</html>').then(function () {
            const nav = callTool.getCall(0);
            nav.args[1].should.equal('browser_navigate');
            nav.args[2].url.should.contain('data:text/html;charset=utf-8,');
            nav.args[2].url.should.contain(encodeURIComponent('<html>APP</html>'));
            callTool.getCall(1).args[1].should.equal('browser_wait_for');
            callTool.getCall(1).args[2].time.should.equal(2);
            callTool.getCall(2).args[1].should.equal('browser_console_messages');
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

    describe('local-dist bootstrap rewrite', function () {
        it('should rewrite the sap-ui-core.js bootstrap src to the local Snippix distribution before loading', function () {
            const callTool = sinon.stub();
            callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
            callTool.returns(Promise.resolve({ content: [] }));
            const verifier = new ReproductionVerifier({
                bridgeClient: fakeBridge({ callTool: callTool }),
                pauseSeconds: 0,
                localDistBase: 'http://localhost:3000/sapui5/resources'
            });
            const html = '<script id="sap-ui-bootstrap" src="https://ui5.sap.com/1.152.0/resources/sap-ui-core.js" data-sap-ui-libs="sap.m"></script>';
            return verifier.verify(html).then(function () {
                const url = decodeURIComponent(callTool.getCall(0).args[2].url);
                url.should.contain('http://localhost:3000/sapui5/resources/sap-ui-core.js');
                url.should.not.contain('ui5.sap.com');
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

    describe('verifyAndSave', function () {
        it('should save first and then verify Playwright against the real Snippix run URL', function () {
            const calls = [];
            const bridge = {
                listTools: function () { return Promise.resolve([{ server: 'playwright' }, { server: 'snippix' }]); },
                callTool: function (server, name) {
                    calls.push({ server: server, name: name });
                    if (name === 'browser_console_messages') {
                        return Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] });
                    }
                    if (name === 'save_snippet') {
                        return Promise.resolve({ content: [{ type: 'text', text: 'id: zzz\ndirect run: https://snippix.only.sap/snippix/snippets/zzz.html' }] });
                    }
                    return Promise.resolve({ content: [] });
                }
            };
            const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
            return verifier.verifyAndSave('<html>APP</html>').then(function (result) {
                result.verification.ok.should.equal(true);
                result.snippet.ok.should.equal(true);
                result.snippet.url.should.contain('zzz.html');

                // save_snippet must come before browser_navigate
                const saveIdx = calls.findIndex(function (c) { return c.name === 'save_snippet'; });
                const navIdx = calls.findIndex(function (c) { return c.name === 'browser_navigate'; });
                saveIdx.should.be.lessThan(navIdx);
            });
        });

        it('should navigate Playwright to the Snippix run URL, not to a data: URL', function () {
            const callTool = sinon.stub();
            callTool.withArgs('snippix', 'save_snippet').returns(Promise.resolve({ content: [{ type: 'text', text: 'id: abc\ndirect run: https://snippix.only.sap/snippix/snippets/abc.html' }] }));
            callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
            callTool.returns(Promise.resolve({ content: [] }));
            const bridge = {
                listTools: function () { return Promise.resolve([{ server: 'playwright' }, { server: 'snippix' }]); },
                callTool: callTool
            };
            const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
            return verifier.verifyAndSave('<html>APP</html>').then(function () {
                const navCall = callTool.getCalls().find(function (c) { return c.args[1] === 'browser_navigate'; });
                navCall.args[2].url.should.equal('https://snippix.only.sap/snippix/snippets/abc.html');
                navCall.args[2].url.should.not.contain('data:');
            });
        });

        it('should fall back to data: URL verification when Snippix is unavailable', function () {
            const callTool = sinon.stub();
            callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
            callTool.returns(Promise.resolve({ content: [] }));
            const bridge = {
                listTools: function () { return Promise.resolve([{ server: 'playwright' }]); },
                callTool: callTool
            };
            const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
            return verifier.verifyAndSave('<html>APP</html>').then(function (result) {
                (result.snippet.ok === null).should.equal(true);
                result.snippet.reason.should.equal('unavailable');
                const navCall = callTool.getCalls().find(function (c) { return c.args[1] === 'browser_navigate'; });
                navCall.args[2].url.should.contain('data:text/html');
            });
        });

        it('should fall back to data: URL verification when the Snippix save fails', function () {
            const callTool = sinon.stub();
            callTool.withArgs('snippix', 'save_snippet').returns(Promise.resolve({ isError: true, content: [{ type: 'text', text: 'HTTP 503' }] }));
            callTool.withArgs('playwright', 'browser_console_messages').returns(Promise.resolve({ content: [{ type: 'text', text: '[LOG] ok' }] }));
            callTool.returns(Promise.resolve({ content: [] }));
            const bridge = {
                listTools: function () { return Promise.resolve([{ server: 'playwright' }, { server: 'snippix' }]); },
                callTool: callTool
            };
            const verifier = new ReproductionVerifier({ bridgeClient: bridge, pauseSeconds: 0 });
            return verifier.verifyAndSave('<html>APP</html>').then(function (result) {
                result.snippet.ok.should.equal(false);
                const navCall = callTool.getCalls().find(function (c) { return c.args[1] === 'browser_navigate'; });
                navCall.args[2].url.should.contain('data:text/html');
            });
        });
    });
});
