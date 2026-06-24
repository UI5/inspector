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

describe('PromptClient', function () {
    describe('#checkAvailability()', function () {
        it('should resolve with the Assistant Capability State reported by the transport when the model is ready', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            var promise = client.checkAvailability().then(function (result) {
                result.available.should.be.true;
                result.status.should.equal('ready');
                result.message.should.equal('Model is ready');
            });

            fake.posted.should.deep.include({ type: 'check-availability' });
            fake.emit({ type: 'availability', status: 'ready', message: 'Model is ready' });

            return promise;
        });

        it('should mark the Assistant Capability State as unavailable when the transport reports an unsupported status', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            var promise = client.checkAvailability().then(function (result) {
                result.available.should.be.false;
                result.status.should.equal('unsupported');
            });

            fake.emit({ type: 'availability', status: 'unsupported', message: 'Browser unsupported' });

            return promise;
        });
    });

    describe('#downloadModel()', function () {
        it('should report progress callbacks for every download-progress message and resolve on download-complete', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

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
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            var seedMessages = [
                { role: 'system', content: 'system prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' }
            ];

            var promise = client.createSession(seedMessages).then(function (created) {
                created.should.be.true;
                client.hasActiveSession().should.be.true;
            });

            fake.posted[0].type.should.equal('create-session');
            fake.posted[0].data.initialPrompts.should.deep.equal(seedMessages);
            fake.emit({ type: 'session-created' });

            return promise;
        });

        it('should preserve the previously-active session when a subsequent createSession fails so the background can keep the prior session usable on init failure', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            var first = client.createSession([]).then(function () {
                client.hasActiveSession().should.be.true;
            });
            fake.emit({ type: 'session-created' });

            return first.then(function () {
                var second = client.createSession([]).then(function () {
                    throw new Error('Expected second createSession to reject');
                }, function (err) {
                    err.message.should.equal('Session init failed');
                    client.hasActiveSession().should.be.true;
                });
                fake.emit({ type: 'error', message: 'Session init failed' });
                return second;
            });
        });
    });

    describe('#promptStreaming()', function () {
        it('should reject when called before a session has been created', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            return client.promptStreaming('Hello').then(function () {
                throw new Error('Expected promptStreaming to reject without an active session');
            }, function (err) {
                err.message.should.contain('No active session');
            });
        });

        it('should forward the already-formatted prompt to the transport and yield streamed chunks until complete', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

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
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

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
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

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
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

            var sessionPromise = client.createSession([]);
            fake.emit({ type: 'session-created' });

            return sessionPromise.then(function () {
                client.hasActiveSession().should.be.true;

                client.destroy();

                fake.posted.should.deep.include({ type: 'destroy-session' });
                fake.port.disconnected.should.be.true;
                client.hasActiveSession().should.be.false;
            });
        });

        it('should surface a streaming-failed Assistant Capability State when the transport disconnects mid-stream', function () {
            var fake = createFakePort();
            var client = new PromptClient({
                portFactory: function () {
                    return fake.port;
                }
            });

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
