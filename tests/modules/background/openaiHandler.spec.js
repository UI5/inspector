'use strict';

const attachOpenAIHandler = require('../../../app/scripts/modules/background/openaiHandler.js');
const parseSseEvent = attachOpenAIHandler.parseSseEvent;
const DONE = attachOpenAIHandler.DONE;

function createFakePort() {
    const messageListeners = [];
    const disconnectListeners = [];

    const port = {
        name: 'openai-api',
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
        posted: []
    };

    return {
        port: port,
        posted: port.posted,
        deliver: function (message) {
            messageListeners.forEach(function (l) { l(message); });
        },
        triggerDisconnect: function () {
            disconnectListeners.forEach(function (l) { l(); });
        }
    };
}

function encodeChunks(strings) {
    const encoder = new TextEncoder();
    return strings.map(function (s) { return encoder.encode(s); });
}

function makeStreamingResponse(chunks, options) {
    const opts = options || {};
    let cursor = 0;
    let cancelled = false;
    const body = {
        getReader: function () {
            return {
                read: function () {
                    if (opts.signal && opts.signal.aborted) {
                        const err = new Error('Aborted');
                        err.name = 'AbortError';
                        return Promise.reject(err);
                    }
                    if (cancelled || cursor >= chunks.length) {
                        return Promise.resolve({ done: true, value: undefined });
                    }
                    return Promise.resolve({ done: false, value: chunks[cursor++] });
                },
                cancel: function () {
                    cancelled = true;
                    return Promise.resolve();
                }
            };
        }
    };
    return {
        ok: true,
        status: 200,
        body: body
    };
}

function sseContent(text) {
    return 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n';
}

const validConfig = {
    baseUrl: 'http://localhost:6655/openai/v1',
    apiKey: 'secret-key',
    model: 'gpt-5.4'
};

const validMessages = [{ role: 'user', content: 'Hi' }];

describe('openaiHandler', function () {
    describe('happy path — SSE streaming', function () {
        it('should POST to `${baseUrl}/chat/completions` with the messages, model, and stream:true', function () {
            const fake = createFakePort();
            const fetchCalls = [];
            const fetchImpl = function (url, options) {
                fetchCalls.push({ url: url, options: options });
                return Promise.resolve(makeStreamingResponse(encodeChunks([
                    sseContent('hi'),
                    'data: [DONE]\n\n'
                ])));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                fetchCalls.should.have.length(1);
                fetchCalls[0].url.should.equal('http://localhost:6655/openai/v1/chat/completions');
                fetchCalls[0].options.method.should.equal('POST');
                fetchCalls[0].options.headers.Authorization.should.equal('Bearer secret-key');
                fetchCalls[0].options.headers['Content-Type'].should.equal('application/json');
                const body = JSON.parse(fetchCalls[0].options.body);
                body.model.should.equal('gpt-5.4');
                body.stream.should.equal(true);
                body.messages.should.deep.equal(validMessages);
            });
        });

        it('should forward each SSE content delta as a `chunk` message then emit `complete` on [DONE]', function () {
            const fake = createFakePort();
            const fetchImpl = function () {
                return Promise.resolve(makeStreamingResponse(encodeChunks([
                    sseContent('Hello, '),
                    sseContent('world'),
                    sseContent('!'),
                    'data: [DONE]\n\n'
                ])));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
                const chunks = fake.posted.filter(function (m) { return m.type === 'chunk'; });
                chunks.map(function (m) { return m.content; }).should.deep.equal(['Hello, ', 'world', '!']);
                const completes = fake.posted.filter(function (m) { return m.type === 'complete'; });
                completes.should.have.length(1);
            });
        });

        it('should buffer SSE events split across reads', function () {
            const fake = createFakePort();
            const event = sseContent('streamed');
            const midpoint = Math.floor(event.length / 2);
            const encoder = new TextEncoder();

            const fetchImpl = function () {
                return Promise.resolve(makeStreamingResponse([
                    encoder.encode(event.slice(0, midpoint)),
                    encoder.encode(event.slice(midpoint)),
                    encoder.encode('data: [DONE]\n\n')
                ]));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
                const chunks = fake.posted.filter(function (m) { return m.type === 'chunk'; });
                chunks.map(function (c) { return c.content; }).join('').should.equal('streamed');
            });
        });

        it('should ignore SSE events whose delta has no content field (e.g. role-only opener)', function () {
            const fake = createFakePort();
            const fetchImpl = function () {
                return Promise.resolve(makeStreamingResponse(encodeChunks([
                    'data: ' + JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }) + '\n\n',
                    sseContent('body'),
                    'data: [DONE]\n\n'
                ])));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 30); }).then(function () {
                const chunks = fake.posted.filter(function (m) { return m.type === 'chunk'; });
                chunks.map(function (c) { return c.content; }).should.deep.equal(['body']);
            });
        });
    });

    describe('parseSseEvent', function () {
        it('should return the delta content string for a content event', function () {
            parseSseEvent(sseContent('hello')).should.equal('hello');
        });

        it('should return DONE for the [DONE] sentinel', function () {
            parseSseEvent('data: [DONE]').should.equal(DONE);
        });

        it('should return empty string for a role-only opener (delta with no content)', function () {
            const event = 'data: ' + JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] });
            parseSseEvent(event).should.equal('');
        });

        it('should return empty string for a comment/keep-alive line (no data: prefix)', function () {
            parseSseEvent(': keep-alive').should.equal('');
        });

        it('should return empty string for a non-JSON data payload', function () {
            parseSseEvent('data: not json').should.equal('');
        });

        it('should return empty string when choices is empty', function () {
            parseSseEvent('data: ' + JSON.stringify({ choices: [] })).should.equal('');
        });
    });

    describe('error surfacing', function () {
        function makeErrorResponse(status, errorBody) {
            return {
                ok: false,
                status: status,
                json: function () { return Promise.resolve(errorBody); },
                text: function () { return Promise.resolve(JSON.stringify(errorBody)); }
            };
        }

        [
            { status: 401, message: 'Invalid API key' },
            { status: 404, message: 'Model not found' },
            { status: 429, message: 'Rate limited' }
        ].forEach(function (testCase) {
            it('should post {type:error} with the API `error.message` on ' + testCase.status, function () {
                const fake = createFakePort();
                const fetchImpl = function () {
                    return Promise.resolve(makeErrorResponse(testCase.status, { error: { message: testCase.message } }));
                };

                attachOpenAIHandler(fake.port, { fetch: fetchImpl });
                fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

                return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                    const errors = fake.posted.filter(function (m) { return m.type === 'error'; });
                    errors.should.have.length(1);
                    errors[0].message.should.equal(testCase.message);
                });
            });
        });

        it('should fall back to `HTTP ${status}` when the API body is not parseable', function () {
            const fake = createFakePort();
            const fetchImpl = function () {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: function () { return Promise.reject(new Error('bad json')); },
                    text: function () { return Promise.resolve(''); }
                });
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                const errors = fake.posted.filter(function (m) { return m.type === 'error'; });
                errors.should.have.length(1);
                errors[0].message.should.contain('500');
            });
        });

        it('should surface fetch rejection as {type:error}', function () {
            const fake = createFakePort();
            const fetchImpl = function () {
                return Promise.reject(new Error('network down'));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                const errors = fake.posted.filter(function (m) { return m.type === 'error'; });
                errors.should.have.length(1);
                errors[0].message.should.contain('network down');
            });
        });

        it('should never leak the apiKey into any posted message', function () {
            const fake = createFakePort();
            const secret = 'super-secret-abc123';
            const fetchImpl = function () {
                // API echoes the key in its error body (some misconfigured proxies do this).
                return Promise.resolve(makeErrorResponse(401, {
                    error: { message: 'Bad auth for key ' + secret }
                }));
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({
                type: 'send',
                config: Object.assign({}, validConfig, { apiKey: secret }),
                messages: validMessages
            });

            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                // No posted message may contain the secret anywhere in its serialized form.
                fake.posted.forEach(function (m) {
                    JSON.stringify(m).should.not.contain(secret);
                });
            });
        });
    });

    describe('cancellation', function () {
        it('should abort the in-flight fetch when the port receives {type:cancel}', function () {
            const fake = createFakePort();
            let capturedSignal = null;
            let readReject = null;

            const fetchImpl = function (url, options) {
                capturedSignal = options.signal;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    body: {
                        getReader: function () {
                            return {
                                read: function () {
                                    return new Promise(function (_, reject) {
                                        readReject = reject;
                                    });
                                },
                                cancel: function () { return Promise.resolve(); }
                            };
                        }
                    }
                });
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                capturedSignal.aborted.should.be.false;
                fake.deliver({ type: 'cancel' });
                capturedSignal.aborted.should.be.true;
                if (readReject) {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    readReject(err);
                }
                return new Promise(function (resolve) { setTimeout(resolve, 10); });
            }).then(function () {
                // After cancel, no `complete` should ever be posted for this run.
                const completes = fake.posted.filter(function (m) { return m.type === 'complete'; });
                completes.should.have.length(0);
            });
        });

        it('should abort the in-flight fetch when the port disconnects', function () {
            const fake = createFakePort();
            let capturedSignal = null;
            let readReject = null;

            const fetchImpl = function (url, options) {
                capturedSignal = options.signal;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    body: {
                        getReader: function () {
                            return {
                                read: function () {
                                    return new Promise(function (_, reject) {
                                        readReject = reject;
                                    });
                                },
                                cancel: function () { return Promise.resolve(); }
                            };
                        }
                    }
                });
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                capturedSignal.aborted.should.be.false;
                fake.triggerDisconnect();
                capturedSignal.aborted.should.be.true;
                if (readReject) {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    readReject(err);
                }
            });
        });

        it('should not post `complete` or further chunks after cancel arrives mid-stream', function () {
            const fake = createFakePort();
            const encoder = new TextEncoder();
            let capturedSignal = null;
            let firstReadResolve = null;
            let secondReadResolve = null;

            const fetchImpl = function (url, options) {
                capturedSignal = options.signal;
                let readCount = 0;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    body: {
                        getReader: function () {
                            return {
                                read: function () {
                                    readCount++;
                                    if (readCount === 1) {
                                        return new Promise(function (resolve) {
                                            firstReadResolve = resolve;
                                        });
                                    }
                                    return new Promise(function (resolve, reject) {
                                        secondReadResolve = { resolve: resolve, reject: reject };
                                    });
                                },
                                cancel: function () { return Promise.resolve(); }
                            };
                        }
                    }
                });
            };

            attachOpenAIHandler(fake.port, { fetch: fetchImpl });
            fake.deliver({ type: 'send', config: validConfig, messages: validMessages });

            return new Promise(function (resolve) { setTimeout(resolve, 10); }).then(function () {
                // Deliver the first SSE chunk. Handler will post `chunk` and issue another read.
                firstReadResolve({ done: false, value: encoder.encode(sseContent('first')) });
                return new Promise(function (resolve) { setTimeout(resolve, 10); });
            }).then(function () {
                // Cancel before the second read resolves.
                fake.deliver({ type: 'cancel' });
                capturedSignal.aborted.should.be.true;
                // Reject the pending read with AbortError.
                const err = new Error('Aborted');
                err.name = 'AbortError';
                secondReadResolve.reject(err);
                return new Promise(function (resolve) { setTimeout(resolve, 10); });
            }).then(function () {
                const completes = fake.posted.filter(function (m) { return m.type === 'complete'; });
                completes.should.have.length(0);
                const chunks = fake.posted.filter(function (m) { return m.type === 'chunk'; });
                chunks.map(function (c) { return c.content; }).should.deep.equal(['first']);
                const errors = fake.posted.filter(function (m) { return m.type === 'error'; });
                errors.should.have.length(0);
            });
        });
    });
});
