'use strict';

const OpenAIProvider = require('../../../app/scripts/modules/ai/OpenAIProvider.js');

function createFakePort() {
    const messageListeners = [];
    const disconnectListeners = [];

    const port = {
        postMessage: function (message) {
            port.posted.push(message);
        },
        onMessage: {
            addListener: function (listener) {
                messageListeners.push(listener);
            }
        },
        onDisconnect: {
            addListener: function (listener) {
                disconnectListeners.push(listener);
            }
        },
        disconnect: function () {
            port.disconnected = true;
        },
        posted: [],
        disconnected: false
    };

    return {
        port: port,
        posted: port.posted,
        emit: function (message) {
            messageListeners.forEach(function (listener) {
                listener(message);
            });
        },
        triggerDisconnect: function () {
            disconnectListeners.forEach(function (listener) {
                listener();
            });
        }
    };
}

function defaultConfig(overrides) {
    return Object.assign({
        baseUrl: 'http://localhost:6655/openai/v1',
        apiKey: 'secret-key',
        model: 'gpt-5.4'
    }, overrides || {});
}

function createProvider(configOverrides) {
    const fake = createFakePort();
    const provider = new OpenAIProvider(Object.assign(defaultConfig(configOverrides), {
        portFactory: function () { return fake.port; }
    }));
    return { provider: provider, fake: fake };
}

describe('OpenAIProvider', function () {
    describe('#checkAvailability()', function () {
        it('should return `ready` when baseUrl, apiKey, and model are all present', function () {
            const { provider } = createProvider();
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
            });
        });

        it('should identify itself in the ready message so the banner does not fall back to a generic or Gemini-shaped label after setUrl / clearConversation re-emits it', function () {
            const { provider } = createProvider({ model: 'gpt-4o-mini' });
            return provider.checkAvailability().then(function (result) {
                result.message.should.contain('OpenAI');
                result.message.should.contain('gpt-4o-mini');
            });
        });

        it('should return `unavailable` when baseUrl is missing', function () {
            const { provider } = createProvider({ baseUrl: '' });
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.contain('not configured');
            });
        });

        it('should tag missing-config unavailable with reason=not-configured, so the view can distinguish it from other unavailable reasons and show the "Open settings" action', function () {
            const { provider } = createProvider({ apiKey: '' });
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.reason.should.equal('not-configured');
            });
        });

        it('should return `unavailable` when apiKey is missing', function () {
            const { provider } = createProvider({ apiKey: '' });
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });
        });

        it('should return `unavailable` when model is missing', function () {
            const { provider } = createProvider({ model: '' });
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });
        });

        it('should not post anything on the port', function () {
            const { provider, fake } = createProvider();
            return provider.checkAvailability().then(function () {
                fake.posted.should.have.length(0);
            });
        });
    });

    describe('#sendMessage() — port protocol', function () {
        it('should reject when the messages array is empty', function () {
            const { provider } = createProvider();
            return provider.sendMessage([]).then(function () {
                throw new Error('Expected sendMessage to reject');
            }, function (err) {
                err.message.should.contain('non-empty');
            });
        });

        it('should reject with AbortError when the signal is already aborted', function () {
            const { provider } = createProvider();
            const controller = new AbortController();
            controller.abort();
            return provider.sendMessage([
                { role: 'user', content: 'Hi' }
            ], { signal: controller.signal }).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.name.should.equal('AbortError');
            });
        });

        it('should post {type:send, config, messages} on the port carrying baseUrl, apiKey, and model', async function () {
            const { provider, fake } = createProvider();
            const messages = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' }
            ];

            const sendPromise = provider.sendMessage(messages);
            await Promise.resolve();

            fake.posted.should.have.length(1);
            const posted = fake.posted[0];
            posted.type.should.equal('send');
            posted.messages.should.deep.equal(messages);
            posted.config.should.deep.equal({
                baseUrl: 'http://localhost:6655/openai/v1',
                apiKey: 'secret-key',
                model: 'gpt-5.4'
            });

            fake.emit({ type: 'chunk', content: 'x' });
            fake.emit({ type: 'complete' });
            await sendPromise;
        });

        it('should forward chunk messages via onChunk and resolve with the accumulated text on complete', async function () {
            const { provider, fake } = createProvider();
            const received = [];
            const sendPromise = provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { onChunk: function (t) { received.push(t); } }
            );

            await Promise.resolve();
            fake.emit({ type: 'chunk', content: 'Hello, ' });
            fake.emit({ type: 'chunk', content: 'world' });
            fake.emit({ type: 'chunk', content: '!' });
            fake.emit({ type: 'complete' });

            const full = await sendPromise;
            full.should.equal('Hello, world!');
            received.should.deep.equal(['Hello, ', 'world', '!']);
        });

        it('should reject with the transport-supplied message when an error frame arrives', async function () {
            const { provider, fake } = createProvider();
            const sendPromise = provider.sendMessage([{ role: 'user', content: 'Hi' }]);

            await Promise.resolve();
            fake.emit({ type: 'error', message: 'Invalid API key' });

            try {
                await sendPromise;
                throw new Error('Expected reject');
            } catch (err) {
                err.message.should.equal('Invalid API key');
            }
        });

        it('should reject when the port disconnects mid-request', async function () {
            const { provider, fake } = createProvider();
            const sendPromise = provider.sendMessage([{ role: 'user', content: 'Hi' }]);

            await Promise.resolve();
            fake.triggerDisconnect();

            try {
                await sendPromise;
                throw new Error('Expected reject');
            } catch (err) {
                err.message.should.contain('Connection');
            }
        });
    });

    describe('#sendMessage() — cancellation', function () {
        it('should post {type:cancel} and reject with AbortError when the signal aborts mid-stream', async function () {
            const { provider, fake } = createProvider();
            const controller = new AbortController();

            const sendPromise = provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { signal: controller.signal }
            );

            await Promise.resolve();
            fake.emit({ type: 'chunk', content: 'partial' });
            controller.abort();

            try {
                await sendPromise;
                throw new Error('Expected reject');
            } catch (err) {
                err.name.should.equal('AbortError');
            }

            const cancelPosts = fake.posted.filter(function (m) { return m.type === 'cancel'; });
            cancelPosts.should.have.length(1);
        });

        it('should ignore chunks that arrive after the signal aborts', async function () {
            const { provider, fake } = createProvider();
            const controller = new AbortController();
            const received = [];

            const sendPromise = provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                {
                    onChunk: function (t) { received.push(t); },
                    signal: controller.signal
                }
            );

            await Promise.resolve();
            fake.emit({ type: 'chunk', content: 'first' });
            controller.abort();

            // Late chunk after abort — must not be surfaced.
            fake.emit({ type: 'chunk', content: 'late' });
            fake.emit({ type: 'complete' });

            try {
                await sendPromise;
                throw new Error('Expected reject');
            } catch (err) {
                err.name.should.equal('AbortError');
            }

            received.should.deep.equal(['first']);
        });
    });

    describe('#destroy()', function () {
        it('should disconnect the port when a request has been sent', async function () {
            const { provider, fake } = createProvider();
            provider.sendMessage([{ role: 'user', content: 'Hi' }]).catch(function () { /* ignore */ });

            await Promise.resolve();
            provider.destroy();

            fake.port.disconnected.should.be.true;
        });

        it('should post {type:cancel} when an in-flight request is destroyed', async function () {
            const { provider, fake } = createProvider();
            provider.sendMessage([{ role: 'user', content: 'Hi' }]).catch(function () { /* ignore */ });

            await Promise.resolve();
            provider.destroy();

            const cancelPosts = fake.posted.filter(function (m) { return m.type === 'cancel'; });
            cancelPosts.should.have.length(1);
        });

        it('should be a no-op when never connected', function () {
            const { provider, fake } = createProvider();
            provider.destroy();
            fake.port.disconnected.should.be.false;
            fake.posted.should.have.length(0);
        });
    });
});
