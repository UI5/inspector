'use strict';

const GeminiNanoProvider = require('../../../app/scripts/modules/ai/GeminiNanoProvider.js');

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

function createProvider() {
    const fake = createFakePort();
    const provider = new GeminiNanoProvider({
        portFactory: function () {
            return fake.port;
        }
    });
    return { provider: provider, fake: fake };
}

async function firstSend(harness, messages, response) {
    const sendPromise = harness.provider.sendMessage(messages);
    await Promise.resolve();
    harness.fake.emit({ type: 'session-created' });
    await Promise.resolve();
    harness.fake.emit({ type: 'chunk', content: response });
    harness.fake.emit({ type: 'complete' });
    await sendPromise;
}

describe('GeminiNanoProvider', function () {
    describe('#checkAvailability()', function () {
        it('should translate the port `ready` status to the canonical `ready` capability state', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
                result.message.should.equal('Model is ready');
            });

            harness.fake.posted.should.deep.include({ type: 'check-availability' });
            harness.fake.emit({ type: 'availability', status: 'ready', message: 'Model is ready' });
            return promise;
        });

        it('should translate the port `needs-download` status to the canonical `downloadable` capability state', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('downloadable');
            });
            harness.fake.emit({ type: 'availability', status: 'needs-download', message: 'Needs download' });
            return promise;
        });

        it('should pass through the port `downloading` status as the canonical `downloading` capability state', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('downloading');
                result.message.should.equal('Gemini Nano is downloading');
            });
            harness.fake.emit({ type: 'availability', status: 'downloading', message: 'Gemini Nano is downloading' });
            return promise;
        });

        it('should pass through the port `unsupported` status as the canonical `unsupported` capability state', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('unsupported');
            });
            harness.fake.emit({ type: 'availability', status: 'unsupported', message: 'Browser unsupported' });
            return promise;
        });

        it('should translate the port `error` status to the canonical `unavailable` capability state, preserving the transport-supplied message', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.equal('Error: boom');
            });
            harness.fake.emit({ type: 'availability', status: 'error', message: 'Error: boom' });
            return promise;
        });

        it('should default to the canonical `unavailable` capability state for any unrecognized port status', function () {
            const harness = createProvider();
            const promise = harness.provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });
            harness.fake.emit({ type: 'availability', status: 'something-new', message: '' });
            return promise;
        });
    });

    describe('#downloadModel()', function () {
        it('should forward every download-progress message to onProgress and resolve on download-complete', function () {
            const harness = createProvider();
            const progressUpdates = [];
            const promise = harness.provider.downloadModel(function (progress) {
                progressUpdates.push(progress);
            }).then(function () {
                progressUpdates.should.deep.equal([0.25, 0.5, 1.0]);
            });

            harness.fake.posted.should.deep.include({ type: 'download-model' });
            harness.fake.emit({ type: 'download-progress', progress: 0.25 });
            harness.fake.emit({ type: 'download-progress', progress: 0.5 });
            harness.fake.emit({ type: 'download-progress', progress: 1.0 });
            harness.fake.emit({ type: 'download-complete' });
            return promise;
        });

        it('should reject when the port reports an error during download', function () {
            const harness = createProvider();
            const promise = harness.provider.downloadModel().then(function () {
                throw new Error('Expected downloadModel to reject');
            }, function (err) {
                err.message.should.equal('boom');
            });
            harness.fake.emit({ type: 'error', message: 'boom' });
            return promise;
        });
    });

    describe('#sendMessage() — session seeding and streaming', function () {
        it('should reject when the messages array is empty', function () {
            const harness = createProvider();
            return harness.provider.sendMessage([]).then(function () {
                throw new Error('Expected sendMessage to reject');
            }, function (err) {
                err.message.should.contain('non-empty');
            });
        });

        it('should reject when the last message is not a user turn', function () {
            const harness = createProvider();
            return harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'assistant', content: 'a' }
            ]).then(function () {
                throw new Error('Expected sendMessage to reject');
            }, function (err) {
                err.message.should.contain('last message must be a user turn');
            });
        });

        it('should create a session seeded with everything except the last message, then stream that message', async function () {
            const harness = createProvider();

            const messages = [
                { role: 'system', content: 'system prompt' },
                { role: 'user', content: 'first' }
            ];
            const chunks = [];
            const sendPromise = harness.provider.sendMessage(messages, {
                onChunk: function (chunk) { chunks.push(chunk); }
            });

            // Wait a microtask for the promise to reach _createSession.
            await Promise.resolve();

            harness.fake.posted[0].should.deep.equal({
                type: 'create-session',
                data: { initialPrompts: [{ role: 'system', content: 'system prompt' }] }
            });

            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();

            const streamMessage = harness.fake.posted[harness.fake.posted.length - 1];
            streamMessage.type.should.equal('prompt-streaming');
            streamMessage.data.userMessage.should.equal('first');

            harness.fake.emit({ type: 'chunk', content: 'Hello ' });
            harness.fake.emit({ type: 'chunk', content: 'world' });
            harness.fake.emit({ type: 'complete' });

            const fullText = await sendPromise;
            fullText.should.equal('Hello world');
            chunks.should.deep.equal(['Hello ', 'world']);
        });

        it('should reject when session creation fails, without ever posting prompt-streaming', async function () {
            const harness = createProvider();
            const sendPromise = harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ]);

            await Promise.resolve();
            harness.fake.emit({ type: 'error', message: 'Session init failed' });

            try {
                await sendPromise;
                throw new Error('Expected sendMessage to reject');
            } catch (err) {
                err.message.should.equal('Session init failed');
            }
            const streamPosts = harness.fake.posted.filter(function (m) { return m.type === 'prompt-streaming'; });
            streamPosts.should.have.length(0);
        });

        it('should reject when the transport reports an error mid-stream', async function () {
            const harness = createProvider();
            const sendPromise = harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ]);

            await Promise.resolve();
            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();

            harness.fake.emit({ type: 'chunk', content: 'partial' });
            harness.fake.emit({ type: 'error', message: 'model crashed' });

            try {
                await sendPromise;
                throw new Error('Expected sendMessage to reject');
            } catch (err) {
                err.message.should.equal('model crashed');
            }
        });

        it('should reject when the port disconnects mid-stream', async function () {
            const harness = createProvider();
            const sendPromise = harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ]);

            await Promise.resolve();
            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();

            harness.fake.triggerDisconnect();

            try {
                await sendPromise;
                throw new Error('Expected sendMessage to reject on disconnect');
            } catch (err) {
                err.message.should.contain('Connection');
            }
        });
    });

    describe('#sendMessage() — prefix caching and session reuse', function () {
        it('should not recreate the session when the next send extends the previous conversation (same prefix)', async function () {
            const harness = createProvider();
            const system = { role: 'system', content: 'system' };
            const u1 = { role: 'user', content: 'first' };

            await firstSend(harness, [system, u1], 'first answer');

            const createCountBefore = harness.fake.posted.filter(function (m) { return m.type === 'create-session'; }).length;

            const secondMessages = [
                system,
                u1,
                { role: 'assistant', content: 'first answer' },
                { role: 'user', content: 'second' }
            ];
            const sendPromise = harness.provider.sendMessage(secondMessages);
            await Promise.resolve();

            const createCountAfter = harness.fake.posted.filter(function (m) { return m.type === 'create-session'; }).length;
            createCountAfter.should.equal(createCountBefore);

            const lastPost = harness.fake.posted[harness.fake.posted.length - 1];
            lastPost.type.should.equal('prompt-streaming');
            lastPost.data.userMessage.should.equal('second');

            harness.fake.emit({ type: 'chunk', content: 'second answer' });
            harness.fake.emit({ type: 'complete' });
            const result = await sendPromise;
            result.should.equal('second answer');
        });

        it('should recreate the session when the prefix diverges (a middle turn changed)', async function () {
            const harness = createProvider();
            const system = { role: 'system', content: 'system' };
            const u1 = { role: 'user', content: 'first' };

            await firstSend(harness, [system, u1], 'first answer');

            const divergentMessages = [
                system,
                { role: 'user', content: 'different first' },
                { role: 'user', content: 'second' }
            ];
            const sendPromise = harness.provider.sendMessage(divergentMessages);
            await Promise.resolve();

            const createSessionPosts = harness.fake.posted.filter(function (m) { return m.type === 'create-session'; });
            createSessionPosts.should.have.length(2);
            createSessionPosts[1].data.initialPrompts.should.deep.equal([
                system,
                { role: 'user', content: 'different first' }
            ]);

            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();
            harness.fake.emit({ type: 'chunk', content: 'ok' });
            harness.fake.emit({ type: 'complete' });
            await sendPromise;
        });

        it('should recreate the session after destroy(), even when the messages match the previously-cached prefix', async function () {
            const harness = createProvider();
            const system = { role: 'system', content: 'system' };
            const u1 = { role: 'user', content: 'first' };

            await firstSend(harness, [system, u1], 'first answer');

            harness.provider.destroy();

            const secondMessages = [
                system,
                u1,
                { role: 'assistant', content: 'first answer' },
                { role: 'user', content: 'second' }
            ];
            const sendPromise = harness.provider.sendMessage(secondMessages);
            await Promise.resolve();

            const createSessionPosts = harness.fake.posted.filter(function (m) { return m.type === 'create-session'; });
            createSessionPosts.should.have.length(2);

            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();
            harness.fake.emit({ type: 'chunk', content: 'ok' });
            harness.fake.emit({ type: 'complete' });
            await sendPromise;
        });

        it('should recreate the session when the port disconnects between sends (idle-killed background service worker)', async function () {
            const harness = createProvider();
            const system = { role: 'system', content: 'system' };
            const u1 = { role: 'user', content: 'first' };

            await firstSend(harness, [system, u1], 'first answer');

            harness.fake.triggerDisconnect();

            const secondMessages = [
                system,
                u1,
                { role: 'assistant', content: 'first answer' },
                { role: 'user', content: 'second' }
            ];
            const sendPromise = harness.provider.sendMessage(secondMessages);
            await Promise.resolve();

            const createSessionPosts = harness.fake.posted.filter(function (m) { return m.type === 'create-session'; });
            createSessionPosts.should.have.length(2);

            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();
            harness.fake.emit({ type: 'chunk', content: 'ok' });
            harness.fake.emit({ type: 'complete' });
            await sendPromise;
        });
    });

    describe('#sendMessage() — cancellation via AbortSignal', function () {
        it('should reject immediately when the signal is already aborted', function () {
            const harness = createProvider();
            const controller = new AbortController();
            controller.abort();

            return harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ], { signal: controller.signal }).then(function () {
                throw new Error('Expected sendMessage to reject when signal was pre-aborted');
            }, function (err) {
                err.name.should.equal('AbortError');
            });
        });

        it('should reject with AbortError when the signal fires mid-stream', async function () {
            const harness = createProvider();
            const controller = new AbortController();

            const sendPromise = harness.provider.sendMessage([
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ], { signal: controller.signal });

            await Promise.resolve();
            harness.fake.emit({ type: 'session-created' });
            await Promise.resolve();
            harness.fake.emit({ type: 'chunk', content: 'partial' });

            controller.abort();

            try {
                await sendPromise;
                throw new Error('Expected sendMessage to reject on abort');
            } catch (err) {
                err.name.should.equal('AbortError');
            }
        });
    });

    describe('#getUsageInfo()', function () {
        it('should resolve with the usage data payload reported by the transport', function () {
            const harness = createProvider();
            const promise = harness.provider.getUsageInfo().then(function (data) {
                data.should.deep.equal({
                    inputUsage: 1024,
                    inputQuota: 4096,
                    percentUsed: 25
                });
            });

            harness.fake.posted.should.deep.include({ type: 'get-usage-info' });
            harness.fake.emit({
                type: 'usage-info',
                data: { inputUsage: 1024, inputQuota: 4096, percentUsed: 25 }
            });

            return promise;
        });

        it('should resolve with null when the transport reports no usage data', function () {
            const harness = createProvider();
            const promise = harness.provider.getUsageInfo().then(function (data) {
                (data === null).should.be.true;
            });
            harness.fake.emit({ type: 'usage-info', data: null });
            return promise;
        });
    });

    describe('#destroy()', function () {
        it('should send destroy-session, disconnect the port, and clear the cached prefix', async function () {
            const harness = createProvider();
            await firstSend(harness, [
                { role: 'system', content: 's' },
                { role: 'user', content: 'u' }
            ], 'a');

            harness.provider.destroy();

            harness.fake.posted.should.deep.include({ type: 'destroy-session' });
            harness.fake.port.disconnected.should.be.true;
        });
    });
});
