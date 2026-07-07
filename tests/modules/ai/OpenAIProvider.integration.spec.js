'use strict';

/**
 * Integration spec for the `openai-api` port protocol.
 *
 * A real `OpenAIProvider` is wired to a real `attachOpenAIHandler` through one shared fake port
 * pair, so any drift between the panel-side protocol and the service-worker-side handler contract
 * fails the tests. The only fakes are the port transport (chrome.runtime is not available in the
 * karma browser) and `fetch` (to control SSE bytes, HTTP status, and network failures).
 */

const OpenAIProvider = require('../../../app/scripts/modules/ai/OpenAIProvider.js');
const attachOpenAIHandler = require('../../../app/scripts/modules/background/openaiHandler.js');

function makeAbortError() {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
}

/**
 * Connected fake port pair. Matches chrome.runtime port semantics: postMessage on one end delivers
 * to onMessage listeners on the other; calling `disconnect()` from one end fires onDisconnect only
 * on the *peer* end. `forceDisconnect()` simulates the port going away underneath both peers
 * (e.g. background reload) and fires onDisconnect on both ends.
 */
function createPortPair() {
    const providerListeners = { message: [], disconnect: [] };
    const handlerListeners = { message: [], disconnect: [] };
    const state = { disconnected: false };

    function fireOn(listeners) {
        listeners.disconnect.slice().forEach(function (l) { l(); });
    }

    function disconnectFrom(peerListeners) {
        if (state.disconnected) {
            return;
        }
        state.disconnected = true;
        fireOn(peerListeners);
    }

    function forceDisconnect() {
        if (state.disconnected) {
            return;
        }
        state.disconnected = true;
        fireOn(providerListeners);
        fireOn(handlerListeners);
    }

    function makeEnd(ownListeners, peerListeners, posted) {
        return {
            postMessage: function (message) {
                posted.push(message);
                if (state.disconnected) {
                    return;
                }
                peerListeners.message.slice().forEach(function (l) { l(message); });
            },
            onMessage: {
                addListener: function (l) { ownListeners.message.push(l); }
            },
            onDisconnect: {
                addListener: function (l) { ownListeners.disconnect.push(l); }
            },
            disconnect: function () { disconnectFrom(peerListeners); }
        };
    }

    const providerPosted = [];
    const handlerPosted = [];
    const providerPort = makeEnd(providerListeners, handlerListeners, providerPosted);
    const handlerPort = makeEnd(handlerListeners, providerListeners, handlerPosted);

    return {
        providerPort: providerPort,
        handlerPort: handlerPort,
        providerPosted: providerPosted,
        handlerPosted: handlerPosted,
        forceDisconnect: forceDisconnect,
        isDisconnected: function () { return state.disconnected; }
    };
}

/**
 * Fake fetch. `plan` describes what each call should do; exactly one shape applies:
 *   - `{ sseChunks }`   → 200 OK streaming; each entry is one read() result (string or Uint8Array).
 *   - `{ errorStatus, errorBody? }` → non-2xx with a JSON error body (json() rejects if no body).
 *   - `{ rejectWith }`  → the fetch() promise itself rejects with the given Error.
 * `holdReads: true` makes read() return a pending Promise once `sseChunks` is exhausted, so a test
 * can drive the stream a step at a time via `resolveNextRead` / `rejectNextRead`.
 */
function createFakeFetch(plan) {
    const calls = [];
    const encoder = new TextEncoder();
    let capturedSignal = null;
    let pendingRead = null;

    function encode(chunk) {
        return typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    }

    function makeStreamBody(chunks) {
        let cursor = 0;
        let cancelled = false;
        return {
            getReader: function () {
                return {
                    read: function () {
                        if (capturedSignal && capturedSignal.aborted) {
                            return Promise.reject(makeAbortError());
                        }
                        if (cancelled) {
                            return Promise.resolve({ done: true, value: undefined });
                        }
                        if (cursor < chunks.length) {
                            return Promise.resolve({ done: false, value: encode(chunks[cursor++]) });
                        }
                        if (plan.holdReads) {
                            return new Promise(function (resolve, reject) {
                                pendingRead = { resolve: resolve, reject: reject };
                            });
                        }
                        return Promise.resolve({ done: true, value: undefined });
                    },
                    cancel: function () { cancelled = true; return Promise.resolve(); }
                };
            }
        };
    }

    const impl = function (url, options) {
        calls.push({ url: url, options: options });
        capturedSignal = options && options.signal;

        if (plan.rejectWith) {
            return Promise.reject(plan.rejectWith);
        }

        if (plan.errorStatus) {
            return Promise.resolve({
                ok: false,
                status: plan.errorStatus,
                json: function () {
                    if (plan.errorBody) {
                        return Promise.resolve(plan.errorBody);
                    }
                    return Promise.reject(new Error('bad json'));
                },
                text: function () { return Promise.resolve(''); }
            });
        }

        return Promise.resolve({
            ok: true,
            status: 200,
            body: makeStreamBody(plan.sseChunks || [])
        });
    };

    return {
        impl: impl,
        calls: calls,
        signal: function () { return capturedSignal; },
        resolveNextRead: function (value) {
            const p = pendingRead;
            pendingRead = null;
            p.resolve(value);
        },
        // Reject the pending read() with AbortError, matching what a real reader would do once its
        // fetch signal aborts. No-op if no read is pending.
        abortPendingRead: function () {
            if (!pendingRead) {
                return;
            }
            const p = pendingRead;
            pendingRead = null;
            p.reject(makeAbortError());
        }
    };
}

const validConfig = {
    baseUrl: 'http://localhost:6655/openai/v1',
    apiKey: 'secret-key',
    model: 'gpt-5.4'
};

function sseContent(text) {
    return 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n';
}

/**
 * Wire OpenAIProvider ↔ attachOpenAIHandler through one shared port pair.
 *
 * `options.pairs` — optional array of port pairs (with matching fetch fakes) to hand to the
 * provider on successive `_connect()` calls. Defaults to a single fresh pair driven by
 * `options.fetchPlan`. Use the array form to test reconnect after `destroy()`.
 */
function setup(options) {
    const opts = options || {};
    const pairs = opts.pairs || [{
        pair: createPortPair(),
        fetchFake: createFakeFetch(opts.fetchPlan || {})
    }];

    pairs.forEach(function (entry) {
        attachOpenAIHandler(entry.pair.handlerPort, { fetch: entry.fetchFake.impl });
    });

    let nextPair = 0;
    const provider = new OpenAIProvider(Object.assign({}, validConfig, opts.configOverrides || {}, {
        portFactory: function () {
            const entry = pairs[Math.min(nextPair, pairs.length - 1)];
            nextPair++;
            return entry.pair.providerPort;
        }
    }));

    return {
        provider: provider,
        pair: pairs[0].pair,
        fetchFake: pairs[0].fetchFake,
        pairs: pairs
    };
}

// Wait a few macrotask turns so the handler's fetch → readSseStream pump can drain queued reads.
function drain(turns) {
    let p = Promise.resolve();
    const n = turns || 4;
    for (let i = 0; i < n; i++) {
        p = p.then(function () { return new Promise(function (r) { setTimeout(r, 0); }); });
    }
    return p;
}

describe('OpenAIProvider ↔ openaiHandler (integration)', function () {

    describe('#checkAvailability()', function () {
        it('should return `ready` with a message that names OpenAI and the model, and post nothing on the port', function () {
            const { provider, pair } = setup({ configOverrides: { model: 'gpt-4o-mini' } });
            return provider.checkAvailability().then(function (result) {
                result.status.should.equal('ready');
                result.message.should.contain('OpenAI');
                result.message.should.contain('gpt-4o-mini');
                pair.providerPosted.should.have.length(0);
                pair.handlerPosted.should.have.length(0);
            });
        });

        it('should return `unavailable` with reason=not-configured when any of baseUrl / apiKey / model is missing, without any port traffic', function () {
            const cases = [{ baseUrl: '' }, { apiKey: '' }, { model: '' }];
            return Promise.all(cases.map(function (overrides) {
                const { provider, pair } = setup({ configOverrides: overrides });
                return provider.checkAvailability().then(function (result) {
                    result.status.should.equal('unavailable');
                    result.reason.should.equal('not-configured');
                    result.message.should.contain('not configured');
                    pair.providerPosted.should.have.length(0);
                    pair.handlerPosted.should.have.length(0);
                });
            }));
        });
    });

    describe('#sendMessage() input validation', function () {
        it('should reject synchronously when the messages array is empty', function () {
            const { provider } = setup();
            return provider.sendMessage([]).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.message.should.contain('non-empty');
            });
        });

        it('should reject with AbortError when the signal is already aborted before send', function () {
            const { provider, pair } = setup();
            const controller = new AbortController();
            controller.abort();
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { signal: controller.signal }
            ).then(function () {
                throw new Error('Expected reject');
            }, function (err) {
                err.name.should.equal('AbortError');
                pair.providerPosted.should.have.length(0);
            });
        });
    });

    describe('#sendMessage() happy path', function () {
        it('should drive a full SSE round-trip: POST the request, stream chunk deltas, and resolve with the accumulated text on [DONE]', function () {
            const { provider, fetchFake } = setup({
                fetchPlan: {
                    sseChunks: [
                        sseContent('Hello, '),
                        sseContent('world'),
                        sseContent('!'),
                        'data: [DONE]\n\n',
                        // Anything after [DONE] must be ignored by the handler.
                        sseContent('after-done')
                    ]
                }
            });
            const received = [];
            const messages = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hi' }
            ];

            return provider.sendMessage(messages, {
                onChunk: function (t) { received.push(t); }
            }).then(function (full) {
                full.should.equal('Hello, world!');
                received.should.deep.equal(['Hello, ', 'world', '!']);

                fetchFake.calls.should.have.length(1);
                const call = fetchFake.calls[0];
                call.url.should.equal('http://localhost:6655/openai/v1/chat/completions');
                call.options.method.should.equal('POST');
                call.options.headers.Authorization.should.equal('Bearer secret-key');
                call.options.headers['Content-Type'].should.equal('application/json');
                const body = JSON.parse(call.options.body);
                body.model.should.equal('gpt-5.4');
                body.stream.should.equal(true);
                body.messages.should.deep.equal(messages);
            });
        });

        it('should reassemble an SSE event that arrives split across two reads', function () {
            const event = sseContent('streamed');
            const midpoint = Math.floor(event.length / 2);
            const encoder = new TextEncoder();
            const { provider } = setup({
                fetchPlan: {
                    sseChunks: [
                        encoder.encode(event.slice(0, midpoint)),
                        encoder.encode(event.slice(midpoint)),
                        'data: [DONE]\n\n'
                    ]
                }
            });
            return provider.sendMessage([{ role: 'user', content: 'Hi' }])
                .then(function (full) {
                    full.should.equal('streamed');
                });
        });

        it('should ignore a role-only opener frame that has no content field', function () {
            const received = [];
            const { provider } = setup({
                fetchPlan: {
                    sseChunks: [
                        'data: ' + JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }) + '\n\n',
                        sseContent('body'),
                        'data: [DONE]\n\n'
                    ]
                }
            });
            return provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                { onChunk: function (t) { received.push(t); } }
            ).then(function (full) {
                full.should.equal('body');
                received.should.deep.equal(['body']);
            });
        });
    });

    describe('#sendMessage() error surfacing', function () {
        it('should surface the API `error.message` from a parseable non-2xx body as a rejected sendMessage', function () {
            const { provider } = setup({
                fetchPlan: {
                    errorStatus: 401,
                    errorBody: { error: { message: 'Invalid API key' } }
                }
            });
            return provider.sendMessage([{ role: 'user', content: 'Hi' }])
                .then(function () { throw new Error('Expected reject'); },
                    function (err) { err.message.should.equal('Invalid API key'); });
        });

        it('should fall back to `HTTP <status>` when the API body is not parseable', function () {
            const { provider } = setup({
                fetchPlan: { errorStatus: 500 } // json() rejects
            });
            return provider.sendMessage([{ role: 'user', content: 'Hi' }])
                .then(function () { throw new Error('Expected reject'); },
                    function (err) { err.message.should.equal('HTTP 500'); });
        });

        it('should surface a fetch-level rejection (e.g. network down) as a rejected sendMessage', function () {
            const { provider } = setup({
                fetchPlan: { rejectWith: new Error('network down') }
            });
            return provider.sendMessage([{ role: 'user', content: 'Hi' }])
                .then(function () { throw new Error('Expected reject'); },
                    function (err) { err.message.should.contain('network down'); });
        });

        it('should redact the apiKey out of any error message that would otherwise leak it', function () {
            const secret = 'super-secret-abc123';
            const { provider, pair } = setup({
                configOverrides: { apiKey: secret },
                fetchPlan: {
                    errorStatus: 401,
                    errorBody: { error: { message: 'Bad auth for key ' + secret } }
                }
            });
            return provider.sendMessage([{ role: 'user', content: 'Hi' }])
                .then(function () { throw new Error('Expected reject'); },
                    function (err) {
                        err.message.should.not.contain(secret);
                        err.message.should.contain('[redacted]');
                        pair.handlerPosted.forEach(function (m) {
                            JSON.stringify(m).should.not.contain(secret);
                        });
                    });
        });
    });

    describe('#sendMessage() cancellation', function () {
        it('should abort the in-flight fetch, post {type:cancel}, reject with AbortError, and drop any chunk that arrives after abort', function () {
            const s = setup({ fetchPlan: { holdReads: true } });
            const controller = new AbortController();
            const received = [];
            const encoder = new TextEncoder();

            const sendPromise = s.provider.sendMessage(
                [{ role: 'user', content: 'Hi' }],
                {
                    onChunk: function (t) { received.push(t); },
                    signal: controller.signal
                }
            );

            return drain().then(function () {
                s.fetchFake.resolveNextRead({ done: false, value: encoder.encode(sseContent('first')) });
                return drain();
            }).then(function () {
                received.should.deep.equal(['first']);
                s.fetchFake.signal().aborted.should.be.false;

                controller.abort();

                const cancelPosts = s.pair.providerPosted.filter(function (m) { return m.type === 'cancel'; });
                cancelPosts.should.have.length(1);
                s.fetchFake.signal().aborted.should.be.true;

                // Directly emit a late chunk frame at the provider — the provider must drop it
                // because the request has already settled with AbortError.
                s.pair.handlerPort.postMessage({ type: 'chunk', content: 'late' });

                s.fetchFake.abortPendingRead();

                return sendPromise.then(function () {
                    throw new Error('Expected reject');
                }, function (err) {
                    err.name.should.equal('AbortError');
                });
            }).then(function () {
                return drain();
            }).then(function () {
                const completes = s.pair.handlerPosted.filter(function (m) { return m.type === 'complete'; });
                completes.should.have.length(0);
                received.should.deep.equal(['first']);
            });
        });
    });

    describe('#sendMessage() port disconnect', function () {
        it('should reject with a "connection lost" error when the port disconnects mid-stream, and abort the handler-side fetch', function () {
            const s = setup({ fetchPlan: { holdReads: true } });

            const sendPromise = s.provider.sendMessage([{ role: 'user', content: 'Hi' }]);

            return drain().then(function () {
                s.fetchFake.signal().aborted.should.be.false;

                s.pair.forceDisconnect();

                s.fetchFake.signal().aborted.should.be.true;
                s.fetchFake.abortPendingRead();

                return sendPromise.then(function () {
                    throw new Error('Expected reject');
                }, function (err) {
                    err.message.toLowerCase().should.contain('connection');
                });
            });
        });
    });

    describe('#destroy()', function () {
        it('should be a no-op when the provider never connected', function () {
            const { provider, pair } = setup();
            provider.destroy();
            pair.isDisconnected().should.be.false;
            pair.providerPosted.should.have.length(0);
        });

        it('should post {type:cancel}, disconnect the port, and let a subsequent sendMessage reconnect a fresh port', function () {
            const first = {
                pair: createPortPair(),
                fetchFake: createFakeFetch({ holdReads: true })
            };
            const second = {
                pair: createPortPair(),
                fetchFake: createFakeFetch({ sseChunks: [sseContent('again'), 'data: [DONE]\n\n'] })
            };
            const s = setup({ pairs: [first, second] });

            const inflight = s.provider.sendMessage([{ role: 'user', content: 'Hi' }]);
            inflight.catch(function () { /* rejection expected once destroy() fires */ });

            return drain().then(function () {
                s.provider.destroy();

                const cancelPosts = first.pair.providerPosted.filter(function (m) { return m.type === 'cancel'; });
                cancelPosts.should.have.length(1);
                first.pair.isDisconnected().should.be.true;
                first.fetchFake.signal().aborted.should.be.true;

                first.fetchFake.abortPendingRead();

                return s.provider.sendMessage([{ role: 'user', content: 'Hi again' }])
                    .then(function (full) {
                        full.should.equal('again');
                        second.fetchFake.calls.should.have.length(1);
                    });
            });
        });
    });
});
