'use strict';

const McpBridgeClient = require('../../../app/scripts/modules/ai/McpBridgeClient.js');

// A controllable fake Chrome runtime port. Tests drive responses via `emit()` and inspect `sent`.
function fakePort() {
    const port = {
        sent: [],
        _messageListeners: [],
        _disconnectListeners: [],
        disconnected: false,
        onMessage: {
            addListener: function (fn) { port._messageListeners.push(fn); }
        },
        onDisconnect: {
            addListener: function (fn) { port._disconnectListeners.push(fn); }
        },
        postMessage: function (message) { port.sent.push(message); },
        disconnect: function () {
            port.disconnected = true;
            port._disconnectListeners.forEach(function (fn) { fn(); });
        },
        emit: function (message) {
            port._messageListeners.forEach(function (fn) { fn(message); });
        }
    };
    return port;
}

describe('McpBridgeClient', function () {
    let port;
    let client;

    beforeEach(function () {
        port = fakePort();
        client = new McpBridgeClient({ portFactory: function () { return port; }, timeoutMs: 50 });
    });

    afterEach(function () {
        port = null;
        client = null;
    });

    describe('listTools', function () {
        it('should post a list-tools request with a requestId and resolve with the tools', function () {
            const promise = client.listTools();

            port.sent.should.have.length(1);
            port.sent[0].type.should.equal('list-tools');
            port.sent[0].should.have.property('requestId');

            port.emit({ type: 'tools', requestId: port.sent[0].requestId, tools: [{ server: 'playwright', name: 'browser_navigate' }] });

            return promise.then(function (tools) {
                tools.should.have.length(1);
                tools[0].server.should.equal('playwright');
            });
        });

        it('should resolve with [] when the response omits a tools array', function () {
            const promise = client.listTools();
            port.emit({ type: 'tools', requestId: port.sent[0].requestId });
            return promise.then(function (tools) {
                tools.should.have.length(0);
            });
        });

        it('should reject when the request times out (no bridge responds)', function () {
            return client.listTools().then(function () {
                throw new Error('should not resolve');
            }, function (error) {
                error.message.should.contain('timed out');
            });
        });
    });

    describe('callTool', function () {
        it('should post a call-tool request carrying the server, name and args', function () {
            const promise = client.callTool('playwright', 'browser_navigate', { url: 'data:text/html,x' });

            port.sent[0].type.should.equal('call-tool');
            port.sent[0].data.server.should.equal('playwright');
            port.sent[0].data.name.should.equal('browser_navigate');
            port.sent[0].data.args.url.should.equal('data:text/html,x');

            port.emit({ type: 'tool-result', requestId: port.sent[0].requestId, result: { content: [{ type: 'text', text: 'ok' }] } });

            return promise.then(function (result) {
                result.content[0].text.should.equal('ok');
            });
        });

        it('should default args to an empty object', function () {
            client.callTool('snippix', 'save_snippet');
            port.sent[0].data.args.should.deep.equal({});
        });

        it('should reject when the bridge replies with an error message', function () {
            const promise = client.callTool('playwright', 'browser_navigate', {});
            port.emit({ type: 'error', requestId: port.sent[0].requestId, message: 'server not running' });
            return promise.then(function () {
                throw new Error('should not resolve');
            }, function (error) {
                error.message.should.contain('server not running');
            });
        });
    });

    describe('request correlation', function () {
        it('should resolve concurrent requests by their requestId', function () {
            const p1 = client.listTools();
            const p2 = client.callTool('snippix', 'save_snippet', { html: 'x' });

            const id1 = port.sent[0].requestId;
            const id2 = port.sent[1].requestId;
            id1.should.not.equal(id2);

            // Reply out of order.
            port.emit({ type: 'tool-result', requestId: id2, result: { content: [{ type: 'text', text: 'saved' }] } });
            port.emit({ type: 'tools', requestId: id1, tools: [{ server: 'snippix', name: 'save_snippet' }] });

            return Promise.all([p1, p2]).then(function (results) {
                results[0][0].server.should.equal('snippix');
                results[1].content[0].text.should.equal('saved');
            });
        });

        it('should ignore a response for an unknown requestId', function () {
            const promise = client.listTools();
            port.emit({ type: 'tools', requestId: 9999, tools: [] });
            // The real response still resolves the pending request.
            port.emit({ type: 'tools', requestId: port.sent[0].requestId, tools: [{ server: 'playwright', name: 'x' }] });
            return promise.then(function (tools) {
                tools.should.have.length(1);
            });
        });
    });

    describe('disconnect', function () {
        it('should reject in-flight requests when the port disconnects', function () {
            const promise = client.listTools();
            port.disconnect();
            return promise.then(function () {
                throw new Error('should not resolve');
            }, function (error) {
                error.message.should.contain('disconnected');
            });
        });

        it('should reject in-flight requests when disconnect() is called explicitly', function () {
            const promise = client.callTool('playwright', 'browser_navigate', {});
            client.disconnect();
            return promise.then(function () {
                throw new Error('should not resolve');
            }, function (error) {
                error.message.should.contain('closed');
            });
        });
    });
});
