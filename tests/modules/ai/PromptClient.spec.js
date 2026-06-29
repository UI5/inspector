'use strict';

var PromptClient = require('../../../app/scripts/modules/ai/PromptClient.js');

/**
 * Build a deterministic fake of the Chrome extension port surface
 * (`chrome.runtime.connect({ name: 'prompt-api' })`). Tests can record
 * messages posted by the PromptClient and emit responses through
 * `emit(message)` and `triggerDisconnect()`.
 *
 * @returns {{port: Object, posted: Array, emit: Function, triggerDisconnect: Function}}
 */
function createFakePort() {
    var messageListeners = [];
    var disconnectListeners = [];

    var port = {
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
 * Build a PromptClient wired to a fresh fake port. Convenience over the
 * 17-call-site preamble of constructing a fake port and threading it through
 * a `portFactory`.
 *
 * @returns {{client: Object, fake: Object}}
 */
function createClient() {
    var fake = createFakePort();
    var client = new PromptClient({
        portFactory: function () {
            return fake.port;
        }
    });
    return { client: client, fake: fake };
}

describe('PromptClient', function () {
    describe('#checkAvailability()', function () {
        it('should resolve with the canonical `ready` Assistant Capability State when the background port reports `ready`', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
                result.message.should.equal('Model is ready');
                result.should.not.have.property('available');
            });

            fake.posted.should.deep.include({ type: 'check-availability' });
            fake.emit({ type: 'availability', status: 'ready', message: 'Model is ready' });

            return promise;
        });

        it('should translate the background port `needs-download` status to the canonical `downloadable` Assistant Capability State', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('downloadable');
                result.message.should.equal('Needs download');
            });

            fake.emit({ type: 'availability', status: 'needs-download', message: 'Needs download' });

            return promise;
        });

        it('should pass through the background port `downloading` status as the canonical `downloading` Assistant Capability State, preserving the transport-supplied message', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('downloading');
                result.message.should.equal('Gemini Nano is downloading');
            });

            fake.emit({ type: 'availability', status: 'downloading', message: 'Gemini Nano is downloading' });

            return promise;
        });

        it('should pass through the background port `unsupported` status as the canonical `unsupported` Assistant Capability State', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unsupported');
                result.message.should.equal('Browser unsupported');
            });

            fake.emit({ type: 'availability', status: 'unsupported', message: 'Browser unsupported' });

            return promise;
        });

        it('should pass through the background port `unavailable` status as the canonical `unavailable` Assistant Capability State', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.equal('Gemini Nano is not available on this device');
            });

            fake.emit({ type: 'availability', status: 'unavailable', message: 'Gemini Nano is not available on this device' });

            return promise;
        });

        it('should translate the background port `error` status to the canonical `unavailable` Assistant Capability State, preserving the transport-supplied error message', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.equal('Error: boom');
            });

            fake.emit({ type: 'availability', status: 'error', message: 'Error: boom' });

            return promise;
        });

        it('should default to the canonical `unavailable` Assistant Capability State for any unrecognized background port status', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });

            fake.emit({ type: 'availability', status: 'something-new', message: '' });

            return promise;
        });
    });

    describe('#downloadModel()', function () {
        it('should report progress callbacks for every download-progress message and resolve on download-complete', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var progressUpdates = [];
            var promise = client.downloadModel(function (progress) {
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
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var seedMessages = [
                { role: 'system', content: 'system prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' }
            ];

            var promise = client.createSession(seedMessages).then(function (created) {
                created.should.be.true;
                client._hasActiveSession.should.be.true;
            });

            fake.posted[0].type.should.equal('create-session');
            fake.posted[0].data.initialPrompts.should.deep.equal(seedMessages);
            fake.emit({ type: 'session-created' });

            return promise;
        });

        it('should keep the active session flag set when a subsequent createSession fails', async function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var first = client.createSession([]);
            fake.emit({ type: 'session-created' });
            await first;
            client._hasActiveSession.should.be.true;

            var second = client.createSession([]);
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
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            return client.promptStreaming('Hello').then(function () {
                throw new Error('Expected promptStreaming to reject without an active session');
            }, function (err) {
                err.message.should.contain('No active session');
            });
        });

        it('should buffer chunks emitted between sending the prompt and the first iterator.next() call', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Pre-formatted user prompt');
            }).then(async function (stream) {
                // Emit chunks BEFORE the consumer ever calls iterator.next().
                // With a lazily-wired stream these chunks would be dropped;
                // with a pre-wired buffer they must be delivered in order.
                fake.emit({ type: 'chunk', content: 'first' });
                fake.emit({ type: 'chunk', content: 'second' });
                fake.emit({ type: 'complete' });

                var iterator = stream[Symbol.asyncIterator]();

                var first = await iterator.next();
                first.value.should.equal('first');
                first.done.should.be.false;

                var second = await iterator.next();
                second.value.should.equal('second');
                second.done.should.be.false;

                var done = await iterator.next();
                done.done.should.be.true;
            });
        });

        it('should forward the already-formatted prompt to the transport and yield streamed chunks until complete', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                var streamPromise = client.promptStreaming('Pre-formatted user prompt');

                var streamMessage = fake.posted[fake.posted.length - 1];
                streamMessage.type.should.equal('prompt-streaming');
                streamMessage.data.userMessage.should.equal('Pre-formatted user prompt');

                return streamPromise.then(async function (stream) {
                    var iterator = stream[Symbol.asyncIterator]();
                    var firstChunkPromise = iterator.next();

                    // The first chunk handler is now wired; deliver chunks asynchronously
                    // to mirror real port message arrival.
                    fake.emit({ type: 'chunk', content: 'Hello' });

                    var first = await firstChunkPromise;
                    first.value.should.equal('Hello');
                    first.done.should.be.false;

                    var secondChunkPromise = iterator.next();
                    fake.emit({ type: 'chunk', content: ' world' });
                    var second = await secondChunkPromise;
                    second.value.should.equal(' world');

                    var donePromise = iterator.next();
                    fake.emit({ type: 'complete' });
                    var doneResult = await donePromise;
                    doneResult.done.should.be.true;
                });
            });
        });
    });

    describe('#getUsageInfo()', function () {
        it('should resolve with the usage data payload reported by the transport', function () {
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var promise = client.getUsageInfo().then(function (data) {
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
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Prompt');
            }).then(async function (stream) {
                var iterator = stream[Symbol.asyncIterator]();
                var firstChunk = iterator.next();
                fake.emit({ type: 'chunk', content: 'partial' });
                var first = await firstChunk;
                first.value.should.equal('partial');

                var errorChunk = iterator.next();
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
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var sessionPromise = client.createSession([]);
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
            var harness = createClient();
            var fake = harness.fake;
            var client = harness.client;

            var sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                return client.promptStreaming('Prompt');
            }).then(async function (stream) {
                var iterator = stream[Symbol.asyncIterator]();
                var chunkPromise = iterator.next();
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
