'use strict';

const PromptClient = require('../../../app/scripts/modules/ai/PromptClient.js');

/**
 * Fake Chrome extension port (`chrome.runtime.connect({ name: 'prompt-api' })`). Records posted
 * messages and emits responses via `emit` and `triggerDisconnect`.
 *
 * @returns {{port: Object, posted: Array, emit: Function, triggerDisconnect: Function}}
 */
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

/**
 * Build a PromptClient with a fake port.
 *
 * @returns {{client: Object, fake: Object}}
 */
function createClient() {
    const fake = createFakePort();
    const client = new PromptClient({
        portFactory: function () {
            return fake.port;
        }
    });
    return { client: client, fake: fake };
}

describe('PromptClient', function () {
    describe('#checkAvailability()', function () {
        it('should resolve with the canonical `ready` Assistant Capability State when the background port reports `ready`', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
                result.message.should.equal('Model is ready');
                result.should.not.have.property('available');
            });

            fake.posted.should.deep.include({ type: 'check-availability' });
            fake.emit({ type: 'availability', status: 'ready', message: 'Model is ready' });

            return promise;
        });

        it('should translate the background port `needs-download` status to the canonical `downloadable` Assistant Capability State', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('downloadable');
                result.message.should.equal('Needs download');
            });

            fake.emit({ type: 'availability', status: 'needs-download', message: 'Needs download' });

            return promise;
        });

        it('should pass through the background port `downloading` status as the canonical `downloading` Assistant Capability State, preserving the transport-supplied message', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('downloading');
                result.message.should.equal('Gemini Nano is downloading');
            });

            fake.emit({ type: 'availability', status: 'downloading', message: 'Gemini Nano is downloading' });

            return promise;
        });

        it('should pass through the background port `unsupported` status as the canonical `unsupported` Assistant Capability State', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unsupported');
                result.message.should.equal('Browser unsupported');
            });

            fake.emit({ type: 'availability', status: 'unsupported', message: 'Browser unsupported' });

            return promise;
        });

        it('should pass through the background port `unavailable` status as the canonical `unavailable` Assistant Capability State', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.equal('Gemini Nano is not available on this device');
            });

            fake.emit({ type: 'availability', status: 'unavailable', message: 'Gemini Nano is not available on this device' });

            return promise;
        });

        it('should translate the background port `error` status to the canonical `unavailable` Assistant Capability State, preserving the transport-supplied error message', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.equal('Error: boom');
            });

            fake.emit({ type: 'availability', status: 'error', message: 'Error: boom' });

            return promise;
        });

        it('should default to the canonical `unavailable` Assistant Capability State for any unrecognized background port status', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });

            fake.emit({ type: 'availability', status: 'something-new', message: '' });

            return promise;
        });
    });

    describe('#downloadModel()', function () {
        it('should report progress callbacks for every download-progress message and resolve on download-complete', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const progressUpdates = [];
            const promise = client.downloadModel(function (progress) {
                progressUpdates.push(progress);
            }).then(function () {
                progressUpdates.should.deep.equal([0.25, 0.5, 1.0]);
            });

            fake.posted.should.deep.include({ type: 'download-model' });
            fake.emit({ type: 'download-progress', progress: 0.25 });
            fake.emit({ type: 'download-progress', progress: 0.5 });
            fake.emit({ type: 'download-progress', progress: 1.0 });
            fake.emit({ type: 'download-complete' });

            return promise;
        });
    });

    describe('#createSession()', function () {
        it('should forward the supplied seed messages to the transport and resolve when the session is created', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const seedMessages = [
                { role: 'system', content: 'system prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' }
            ];

            const promise = client.createSession(seedMessages).then(function (created) {
                created.should.be.true;
                client._hasActiveSession.should.be.true;
            });

            fake.posted[0].type.should.equal('create-session');
            fake.posted[0].data.initialPrompts.should.deep.equal(seedMessages);
            fake.emit({ type: 'session-created' });

            return promise;
        });

        it('should keep the active session flag set when a subsequent createSession fails', async function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const first = client.createSession([]);
            fake.emit({ type: 'session-created' });
            await first;
            client._hasActiveSession.should.be.true;

            const second = client.createSession([]);
            fake.emit({ type: 'error', message: 'Session init failed' });
            try {
                await second;
                throw new Error('Expected second createSession to reject');
            } catch (err) {
                err.message.should.equal('Session init failed');
            }
            client._hasActiveSession.should.be.true;
        });
    });

    describe('#promptStreaming()', function () {
        it('should reject when called before a session has been created', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            return client.promptStreaming('Hello').then(function () {
                throw new Error('Expected promptStreaming to reject without an active session');
            }, function (err) {
                err.message.should.contain('No active session');
            });
        });

        it('should buffer chunks emitted between sending the prompt and the first iterator.next() call', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Pre-formatted user prompt');
            }).then(async function (stream) {
                // Emit chunks before the consumer calls iterator.next(). A lazily-wired stream would drop these. A pre-wired buffer must deliver them in order.
                fake.emit({ type: 'chunk', content: 'first' });
                fake.emit({ type: 'chunk', content: 'second' });
                fake.emit({ type: 'complete' });

                const iterator = stream[Symbol.asyncIterator]();

                const first = await iterator.next();
                first.value.should.equal('first');
                first.done.should.be.false;

                const second = await iterator.next();
                second.value.should.equal('second');
                second.done.should.be.false;

                const done = await iterator.next();
                done.done.should.be.true;
            });
        });

        it('should forward the already-formatted prompt to the transport and yield streamed chunks until complete', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                const streamPromise = client.promptStreaming('Pre-formatted user prompt');

                const streamMessage = fake.posted[fake.posted.length - 1];
                streamMessage.type.should.equal('prompt-streaming');
                streamMessage.data.userMessage.should.equal('Pre-formatted user prompt');

                return streamPromise.then(async function (stream) {
                    const iterator = stream[Symbol.asyncIterator]();
                    const firstChunkPromise = iterator.next();

                    // Deliver chunks asynchronously to mirror real port arrival.
                    fake.emit({ type: 'chunk', content: 'Hello' });

                    const first = await firstChunkPromise;
                    first.value.should.equal('Hello');
                    first.done.should.be.false;

                    const secondChunkPromise = iterator.next();
                    fake.emit({ type: 'chunk', content: ' world' });
                    const second = await secondChunkPromise;
                    second.value.should.equal(' world');

                    const donePromise = iterator.next();
                    fake.emit({ type: 'complete' });
                    const doneResult = await donePromise;
                    doneResult.done.should.be.true;
                });
            });
        });
    });

    describe('#getUsageInfo()', function () {
        it('should resolve with the usage data payload reported by the transport', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const promise = client.getUsageInfo().then(function (data) {
                data.should.deep.equal({
                    inputUsage: 1024,
                    inputQuota: 4096,
                    percentUsed: 25
                });
            });

            fake.posted.should.deep.include({ type: 'get-usage-info' });
            fake.emit({
                type: 'usage-info',
                data: { inputUsage: 1024, inputQuota: 4096, percentUsed: 25 }
            });

            return promise;
        });
    });

    describe('error and disconnect handling', function () {
        it('should surface a streaming-failed Assistant Capability State by throwing through the async iterator when the transport reports an error mid-stream', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Prompt');
            }).then(async function (stream) {
                const iterator = stream[Symbol.asyncIterator]();
                const firstChunk = iterator.next();
                fake.emit({ type: 'chunk', content: 'partial' });
                const first = await firstChunk;
                first.value.should.equal('partial');

                const errorChunk = iterator.next();
                fake.emit({ type: 'error', message: 'model crashed' });

                try {
                    await errorChunk;
                    throw new Error('Expected stream to throw on transport error');
                } catch (err) {
                    err.message.should.equal('model crashed');
                }
            });
        });

        it('should disconnect the transport on destroy and clear active-session state', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                client._hasActiveSession.should.be.true;

                client.destroy();

                fake.posted.should.deep.include({ type: 'destroy-session' });
                fake.port.disconnected.should.be.true;
                client._hasActiveSession.should.be.false;
            });
        });

        it('should surface a streaming-failed Assistant Capability State when the transport disconnects mid-stream', function () {
            const harness = createClient();
            const fake = harness.fake;
            const client = harness.client;

            const sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Prompt');
            }).then(async function (stream) {
                const iterator = stream[Symbol.asyncIterator]();
                const chunkPromise = iterator.next();
                fake.triggerDisconnect();

                try {
                    await chunkPromise;
                    throw new Error('Expected stream to throw when transport disconnects');
                } catch (err) {
                    err.message.should.contain('Connection');
                }
            });
        });
    });
});
