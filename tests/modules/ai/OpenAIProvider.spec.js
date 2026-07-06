'use strict';

const OpenAIProvider = require('../../../app/scripts/modules/ai/OpenAIProvider.js');

function sseEvent(data) {
    return 'data: ' + JSON.stringify(data) + '\n\n';
}

function contentEvent(text) {
    return sseEvent({ choices: [{ delta: { content: text } }] });
}

function createResponse({ ok = true, status = 200, chunks = [], errorBody = null } = {}) {
    let cursor = 0;
    const encoder = new TextEncoder();

    const body = {
        getReader: function () {
            return {
                read: function () {
                    if (cursor >= chunks.length) {
                        return Promise.resolve({ done: true, value: undefined });
                    }
                    const chunk = chunks[cursor++];
                    return Promise.resolve({
                        done: false,
                        value: typeof chunk === 'string' ? encoder.encode(chunk) : chunk
                    });
                },
                cancel: function () {
                    cursor = chunks.length;
                    return Promise.resolve();
                }
            };
        }
    };

    return {
        ok: ok,
        status: status,
        body: body,
        json: function () {
            return Promise.resolve(errorBody || {});
        },
        text: function () {
            return Promise.resolve(errorBody ? JSON.stringify(errorBody) : '');
        }
    };
}

function createFakeFetch(response) {
    const calls = [];
    const fetch = function (url, options) {
        calls.push({ url: url, options: options });
        if (typeof response === 'function') {
            return Promise.resolve(response({ url: url, options: options }));
        }
        return Promise.resolve(response);
    };
    fetch.calls = calls;
    return fetch;
}

function defaultConfig(overrides) {
    return Object.assign({
        baseUrl: 'http://localhost:6655/openai/v1',
        apiKey: 'secret-key',
        model: 'gpt-5.4'
    }, overrides || {});
}

describe('OpenAIProvider', function () {
    describe('#checkAvailability()', function () {
        it('should return `ready` when baseUrl, apiKey, and model are all present', function () {
            const provider = new OpenAIProvider(defaultConfig());
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
            });
        });

        it('should return `unavailable` when baseUrl is missing', function () {
            const provider = new OpenAIProvider(defaultConfig({ baseUrl: '' }));
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
                result.message.should.contain('not configured');
            });
        });

        it('should return `unavailable` when apiKey is missing', function () {
            const provider = new OpenAIProvider(defaultConfig({ apiKey: '' }));
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });
        });

        it('should return `unavailable` when model is missing', function () {
            const provider = new OpenAIProvider(defaultConfig({ model: '' }));
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('unavailable');
            });
        });

        it('should not make any network request', function () {
            const fetch = createFakeFetch(createResponse());
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.checkAvailability().then(function () {
                fetch.calls.length.should.equal(0);
            });
        });
    });

    describe('#sendMessage() — request wiring', function () {
        it('should POST to `${baseUrl}/chat/completions` with the messages, model, and stream:true', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [contentEvent('hi'), 'data: [DONE]\n\n']
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            const messages = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' }
            ];
            return provider.sendMessage(messages).then(function () {
                fetch.calls.length.should.equal(1);
                fetch.calls[0].url.should.equal('http://localhost:6655/openai/v1/chat/completions');
                fetch.calls[0].options.method.should.equal('POST');
                const body = JSON.parse(fetch.calls[0].options.body);
                body.model.should.equal('gpt-5.4');
                body.stream.should.equal(true);
                body.messages.should.deep.equal(messages);
            });
        });

        it('should include a Bearer Authorization header with the API key', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [contentEvent('hi'), 'data: [DONE]\n\n']
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                const headers = fetch.calls[0].options.headers;
                headers.Authorization.should.equal('Bearer secret-key');
                headers['Content-Type'].should.equal('application/json');
            });
        });
    });

    describe('#sendMessage() — SSE parsing', function () {
        it('should accumulate content deltas across chunks and resolve with the full text', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [
                    contentEvent('Hello, '),
                    contentEvent('world'),
                    contentEvent('!'),
                    'data: [DONE]\n\n'
                ]
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            const received = [];
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { onChunk: function (t) { received.push(t); } }
            ).then(function (fullText) {
                received.should.deep.equal(['Hello, ', 'world', '!']);
                fullText.should.equal('Hello, world!');
            });
        });

        it('should buffer partial lines split across reads', function () {
            const event = contentEvent('streamed');
            const midpoint = Math.floor(event.length / 2);
            const fetch = createFakeFetch(createResponse({
                chunks: [
                    event.slice(0, midpoint),
                    event.slice(midpoint),
                    'data: [DONE]\n\n'
                ]
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }]
            ).then(function (fullText) {
                fullText.should.equal('streamed');
            });
        });

        it('should handle multiple SSE events packed in one read', function () {
            const packed = contentEvent('one') + contentEvent('two') + contentEvent('three') + 'data: [DONE]\n\n';
            const fetch = createFakeFetch(createResponse({ chunks: [packed] }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }]
            ).then(function (fullText) {
                fullText.should.equal('onetwothree');
            });
        });

        it('should ignore SSE events whose delta has no content field (e.g. role-only opener)', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [
                    sseEvent({ choices: [{ delta: { role: 'assistant' } }] }),
                    contentEvent('body'),
                    'data: [DONE]\n\n'
                ]
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }]
            ).then(function (fullText) {
                fullText.should.equal('body');
            });
        });

        it('should stop cleanly at the [DONE] sentinel without treating it as JSON', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [contentEvent('done-test'), 'data: [DONE]\n\n', contentEvent('after')]
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }]
            ).then(function (fullText) {
                fullText.should.equal('done-test');
            });
        });
    });

    describe('#sendMessage() — error surfacing', function () {
        it('should reject with the API error message on 401', function () {
            const fetch = createFakeFetch(createResponse({
                ok: false,
                status: 401,
                errorBody: { error: { message: 'Invalid API key' } }
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.contain('Invalid API key');
            });
        });

        it('should reject with the API error message on 404', function () {
            const fetch = createFakeFetch(createResponse({
                ok: false,
                status: 404,
                errorBody: { error: { message: 'Model not found' } }
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.contain('Model not found');
            });
        });

        it('should reject with the API error message on 429', function () {
            const fetch = createFakeFetch(createResponse({
                ok: false,
                status: 429,
                errorBody: { error: { message: 'Rate limited' } }
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.contain('Rate limited');
            });
        });

        it('should never include the API key in error messages', function () {
            const fetch = createFakeFetch(createResponse({
                ok: false,
                status: 401,
                errorBody: { error: { message: 'Bad auth' } }
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig({ apiKey: 'super-secret-abc123' }), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.not.contain('super-secret-abc123');
            });
        });

        it('should reject with a generic status message when the API body is not parseable', function () {
            const fetch = function () {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    body: null,
                    json: function () { return Promise.reject(new Error('bad json')); },
                    text: function () { return Promise.resolve(''); }
                });
            };
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            return provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.contain('500');
            });
        });
    });

    describe('#sendMessage() — cancellation', function () {
        it('should reject with an AbortError when the signal is already aborted', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [contentEvent('x'), 'data: [DONE]\n\n']
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            const controller = new AbortController();
            controller.abort();
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { signal: controller.signal }
            ).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.name.should.equal('AbortError');
            });
        });

        it('should forward caller-signal aborts to the fetch call', function () {
            const fetch = createFakeFetch(createResponse({
                chunks: [contentEvent('x'), 'data: [DONE]\n\n']
            }));
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            const controller = new AbortController();
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { signal: controller.signal }
            ).then(function () {
                const fetchSignal = fetch.calls[0].options.signal;
                (typeof fetchSignal === 'object').should.equal(true);
                (fetchSignal.aborted === false).should.equal(true);
                controller.abort();
                (fetchSignal.aborted === true).should.equal(true);
            });
        });

        it('should reject with AbortError when the signal aborts mid-stream', function () {
            const controller = new AbortController();
            let readCount = 0;
            const encoder = new TextEncoder();

            const response = {
                ok: true,
                status: 200,
                body: {
                    getReader: function () {
                        return {
                            read: function () {
                                readCount++;
                                if (readCount === 1) {
                                    return Promise.resolve({
                                        done: false,
                                        value: encoder.encode(contentEvent('first'))
                                    });
                                }
                                controller.abort();
                                const err = new Error('Aborted');
                                err.name = 'AbortError';
                                return Promise.reject(err);
                            },
                            cancel: function () {
                                return Promise.resolve();
                            }
                        };
                    }
                }
            };

            const fetch = createFakeFetch(response);
            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));

            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { signal: controller.signal }
            ).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.name.should.equal('AbortError');
            });
        });
    });

    describe('#destroy()', function () {
        it('should abort any in-flight request', function () {
            let capturedSignal = null;
            const response = {
                ok: true,
                status: 200,
                body: {
                    getReader: function () {
                        return {
                            read: function () {
                                return new Promise(function (resolve, reject) {
                                    capturedSignal.addEventListener('abort', function () {
                                        const err = new Error('Aborted');
                                        err.name = 'AbortError';
                                        reject(err);
                                    });
                                });
                            },
                            cancel: function () { return Promise.resolve(); }
                        };
                    }
                }
            };

            const fetch = function (url, options) {
                capturedSignal = options.signal;
                return Promise.resolve(response);
            };

            const provider = new OpenAIProvider(Object.assign(defaultConfig(), { fetch: fetch }));
            const sendPromise = provider.sendMessage([{ role: 'user', content: 'Hi' }]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.name.should.equal('AbortError');
            });

            // Let the fetch resolve and read to start.
            return Promise.resolve().then(function () {
                return Promise.resolve();
            }).then(function () {
                provider.destroy();
                return sendPromise;
            });
        });
    });
});
