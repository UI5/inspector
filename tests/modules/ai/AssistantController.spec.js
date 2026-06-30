'use strict';

const AssistantController = require('../../../app/scripts/modules/ai/AssistantController.js');
const PromptBuilder = require('../../../app/scripts/modules/ai/PromptBuilder.js');

/**
 * Fake {@link PromptClient}. Records seed messages and user prompts and lets tests script
 * capability resolution, session creation, streaming, usage info, and failures.
 *
 * @returns {Object}
 */
function createFakePromptClient() {
    const fake = {
        availabilityResult: { status: 'ready', message: 'Model is ready' },
        sessionCreated: true,
        createSessionError: null,
        usageInfo: null,
        downloadShouldFail: false,
        downloadProgressValues: [],

        seedMessagesByCall: [],
        userPromptsByCall: [],
        destroyed: 0,
        pendingStreamControllers: [],
        // When non-null, createSession() returns this pending promise instead of resolving
        // synchronously. Tests resolve / reject the deferred to drive reseed timing.
        deferredCreateSession: null,

        checkAvailability: function () {
            return Promise.resolve(fake.availabilityResult);
        },

        downloadModel: function (onProgress) {
            fake.downloadProgressValues.forEach(function (value) {
                if (typeof onProgress === 'function') {
                    onProgress(value);
                }
            });
            if (fake.downloadShouldFail) {
                return Promise.reject(new Error('download failed'));
            }
            return Promise.resolve();
        },

        createSession: function (seedMessages) {
            fake.seedMessagesByCall.push(seedMessages);
            if (fake.deferredCreateSession) {
                return fake.deferredCreateSession.promise;
            }
            if (fake.createSessionError) {
                return Promise.reject(fake.createSessionError);
            }
            return Promise.resolve(fake.sessionCreated);
        },

        promptStreaming: function (formattedUserMessage) {
            fake.userPromptsByCall.push(formattedUserMessage);

            const chunks = [];
            let done = false;
            let error = null;
            let notify = null;
            const wake = function () {
                const fn = notify;
                notify = null;
                if (fn) { fn(); }
            };

            const controller = {
                emitChunk: function (text) { chunks.push(text); wake(); },
                emitComplete: function () { done = true; wake(); },
                emitError: function (err) { error = err; wake(); }
            };
            fake.pendingStreamControllers.push(controller);

            const stream = (async function* () {
                while (true) {
                    if (chunks.length > 0) {
                        yield chunks.shift();
                        continue;
                    }
                    if (error) {
                        throw error;
                    }
                    if (done) {
                        return;
                    }
                    await new Promise(function (resolve) { notify = resolve; });
                }
            })();

            return Promise.resolve(stream);
        },

        getUsageInfo: function () {
            return Promise.resolve(fake.usageInfo);
        },

        destroy: function () {
            fake.destroyed += 1;
        }
    };

    return fake;
}

/**
 * Fake {@link ConversationStore}. Records load / append / clear per URL.
 *
 * @returns {Object}
 */
function createFakeConversationStore() {
    const data = {};
    const fake = {
        data: data,
        appended: [],
        cleared: [],

        load: function (url) {
            return Promise.resolve((data[url] || []).slice());
        },

        append: function (url, message) {
            if (!data[url]) {
                data[url] = [];
            }
            data[url].push({ role: message.role, content: message.content });
            fake.appended.push({ url: url, message: { role: message.role, content: message.content } });
            return Promise.resolve();
        },

        clear: function (url) {
            delete data[url];
            fake.cleared.push(url);
            return Promise.resolve();
        }
    };
    return fake;
}

/**
 * Builds an AssistantController with fakes.
 *
 * @param {Object} [overrides]
 * @returns {{controller: Object, promptClient: Object, conversationStore: Object,
 *           events: Array, capabilityStates: Array}}
 */
function createController(overrides) {
    overrides = overrides || {};
    const promptClient = overrides.promptClient || createFakePromptClient();
    const conversationStore = overrides.conversationStore || createFakeConversationStore();
    const promptBuilder = overrides.promptBuilder || new PromptBuilder();
    const getAppInfo = overrides.getAppInfo || function () { return null; };

    const controller = new AssistantController({
        promptBuilder: promptBuilder,
        promptClient: promptClient,
        conversationStore: conversationStore,
        getAppInfo: getAppInfo
    });

    const events = [];
    const capabilityStates = [];
    controller.on('capability-state-changed', function (state) {
        capabilityStates.push(state);
        events.push({ type: 'capability-state-changed', state: state });
    });
    controller.on('conversation-loaded', function (turns) {
        events.push({ type: 'conversation-loaded', turns: turns });
    });
    controller.on('stream-chunk', function (chunk) {
        events.push({ type: 'stream-chunk', chunk: chunk });
    });
    controller.on('stream-complete', function (payload) {
        events.push({ type: 'stream-complete', payload: payload });
    });
    controller.on('stream-failed', function (err) {
        events.push({ type: 'stream-failed', err: err });
    });
    controller.on('conversation-cleared', function () {
        events.push({ type: 'conversation-cleared' });
    });
    controller.on('inspection-context-cleared', function () {
        events.push({ type: 'inspection-context-cleared' });
    });

    return {
        controller: controller,
        promptClient: promptClient,
        conversationStore: conversationStore,
        events: events,
        capabilityStates: capabilityStates
    };
}

/**
 * Drive a fresh harness into `ready`: configure the fake to report ready, set the test URL, and run
 * `initialize()`. After this resolves the controller has a seeded session and accepts
 * `sendUserMessage()`.
 *
 * @param {Object} harness
 * @returns {Promise<void>}
 */
function initializedReady(harness) {
    harness.promptClient.availabilityResult = {
        status: 'ready', message: 'ready'
    };
    harness.controller.setUrl('https://example.com');
    return harness.controller.initialize();
}

/**
 * Wait until the fake has registered a streaming call, then return its controller. Polls because
 * `sendUserMessage()` reaches `promptStreaming` only after the awaited chain flushes. Bounded by
 * `maxAttempts`.
 *
 * @param {Object} fakePromptClient
 * @param {number} [maxAttempts=500]
 * @returns {Promise<{emitChunk: Function, emitComplete: Function, emitError: Function}>}
 */
function awaitStreamController(fakePromptClient, maxAttempts) {
    let attemptsLeft = typeof maxAttempts === 'number' ? maxAttempts : 500;
    return new Promise(function (resolve, reject) {
        function poll() {
            if (fakePromptClient.pendingStreamControllers.length > 0) {
                resolve(fakePromptClient.pendingStreamControllers.shift());
                return;
            }
            attemptsLeft -= 1;
            if (attemptsLeft <= 0) {
                reject(new Error('awaitStreamController: production code never called promptStreaming() within the poll budget'));
                return;
            }
            setTimeout(poll, 1);
        }
        poll();
    });
}

/**
 * A manually-resolvable promise wrapper. Tests use it to defer the fake Prompt Client's
 * `createSession()` so they can drive the reseed timing explicitly.
 *
 * @returns {{promise: Promise<*>, resolve: Function, reject: Function}}
 */
function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise(function (res, rej) {
        resolve = res;
        reject = rej;
    });
    return { promise: promise, resolve: resolve, reject: reject };
}

describe('AssistantController', function () {
    describe('initial Assistant Capability State', function () {
        it('should seed the Assistant Capability State to a canonical PRD state (not the ad-hoc string \'unknown\') before initialization runs', function () {
            const harness = createController();

            const canonicalStates = ['unsupported', 'unavailable', 'downloadable', 'downloading', 'ready', 'session-failed', 'streaming-failed'];
            canonicalStates.should.include(harness.controller._capabilityState.status);
        });
    });

    describe('#initialize() — Assistant Capability State resolution', function () {
        it('should resolve the Assistant Capability State to ready and notify listeners when the Prompt Client reports the local model is ready', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'ready',
                message: 'Gemini Nano is ready'
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('ready');
                harness.capabilityStates.should.deep.include({
                    status: 'ready',
                    message: 'Gemini Nano is ready',
                    progress: 0
                });
            });
        });

        it('should resolve the Assistant Capability State to downloadable when the Prompt Client reports the local model needs download', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'downloadable',
                message: 'Model can be downloaded'
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('downloadable');
            });
        });

        it('should resolve the Assistant Capability State to unsupported when the Prompt Client reports an unsupported browser', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'unsupported',
                message: 'Browser unsupported'
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('unsupported');
            });
        });

        it('should resolve the Assistant Capability State to downloading when the Prompt Client reports the local model is mid-download, instead of collapsing it into unavailable', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'downloading',
                message: 'Gemini Nano is downloading'
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('downloading');
                harness.controller._capabilityState.message.should.equal('Gemini Nano is downloading');
            });
        });

        it('should resolve the Assistant Capability State to unavailable when the Prompt Client reports an unavailable transport, preserving the transport-supplied message rather than substituting a generic one', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'unavailable',
                message: 'Background worker availability check threw: boom'
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('unavailable');
                harness.controller._capabilityState.message.should.equal('Background worker availability check threw: boom');
            });
        });

        it('should resolve the Assistant Capability State to unavailable when the Prompt Client capability check itself throws, instead of letting initialize reject and leave the view without a canonical state to render', function () {
            const harness = createController();
            harness.promptClient.checkAvailability = function () {
                return Promise.reject(new Error('runtime port disconnected'));
            };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('unavailable');
                harness.controller._capabilityState.message.should.contain('runtime port disconnected');
            });
        });
    });

    describe('#initialize() — Conversation Memory loading', function () {
        it('should load stored Conversation Memory for the current inspected URL and emit it to listeners', function () {
            const harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'hi there' }
            ];
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                const loaded = harness.events.filter(function (e) {
                    return e.type === 'conversation-loaded';
                });
                loaded.should.have.length(1);
                loaded[0].turns.should.deep.equal([
                    { role: 'user', content: 'hello' },
                    { role: 'assistant', content: 'hi there' }
                ]);
            });
        });
    });

    describe('#initialize() — session seeding', function () {
        it('should create the local AI session seeded with the Prompt Builder system prompt and the loaded Conversation Memory turns', function () {
            const appInfo = {
                common: { data: { SAPUI5: '1.120.0' } }
            };
            const harness = createController({
                getAppInfo: function () { return appInfo; }
            });
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'previous question' },
                { role: 'assistant', content: 'previous answer' }
            ];
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);
                const seed = harness.promptClient.seedMessagesByCall[0];
                seed[0].role.should.equal('system');
                seed[0].content.should.contain('Framework: 1.120.0');
                seed[1].should.deep.equal({ role: 'user', content: 'previous question' });
                seed[2].should.deep.equal({ role: 'assistant', content: 'previous answer' });
            });
        });

        it('should not attempt to create a session when the Assistant Capability State is not ready', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'unsupported',
                message: 'Browser unsupported'
            };

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(0);
            });
        });

        it('should resolve the Assistant Capability State to session-failed when the Prompt Client reports ready but session creation throws', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'ready', message: 'ready'
            };
            harness.promptClient.createSessionError = new Error('Session create failed');

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('session-failed');
                harness.controller._capabilityState.message.should.equal('Session create failed');
            });
        });

        it('should skip empty assistant placeholders when seeding from Conversation Memory', function () {
            const harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'previous question' },
                { role: 'assistant', content: 'previous answer' },
                { role: 'user', content: 'second question' },
                { role: 'assistant', content: '' }
            ];
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                const seed = harness.promptClient.seedMessagesByCall[0];
                seed.should.have.length(4);
                seed[0].role.should.equal('system');
                seed[1].should.deep.equal({ role: 'user', content: 'previous question' });
                seed[2].should.deep.equal({ role: 'assistant', content: 'previous answer' });
                seed[3].should.deep.equal({ role: 'user', content: 'second question' });
            });
        });
    });

    describe('#sendUserMessage() — Agent Validation Loop streaming', function () {
        it('should forward the Prompt Builder-formatted user prompt to the Prompt Client and emit streamed chunks and a complete event with the joined response', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('What is sap.m.Button?');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('Hello ');
                    streamCtrl.emitChunk('world');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.deep.equal([
                        'What is sap.m.Button?'
                    ]);
                    const chunkEvents = harness.events.filter(function (e) {
                        return e.type === 'stream-chunk';
                    });
                    chunkEvents.map(function (e) { return e.chunk; }).should.deep.equal(['Hello ', 'world']);

                    const completeEvents = harness.events.filter(function (e) {
                        return e.type === 'stream-complete';
                    });
                    completeEvents.should.have.length(1);
                    completeEvents[0].payload.content.should.equal('Hello world');
                });
            });
        });

        it('should append the user turn and the completed assistant turn to the Conversation Store under the current inspected URL', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Question 1');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('Answer 1');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.conversationStore.appended.should.deep.equal([
                        { url: 'https://example.com', message: { role: 'user', content: 'Question 1' } },
                        { url: 'https://example.com', message: { role: 'assistant', content: 'Answer 1' } }
                    ]);
                });
            });
        });
    });

    describe('streaming failure recovery', function () {
        it('should surface a streaming-failed Assistant Capability State and clear the thinking state when the Prompt Client throws mid-stream', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('partial');
                    streamCtrl.emitError(new Error('model crashed'));
                    return sendPromise.then(function () {
                        throw new Error('Expected sendUserMessage to reject on streaming failure');
                    }, function (err) {
                        err.message.should.equal('model crashed');
                    });
                }).then(function () {
                    harness.controller._isStreaming.should.be.false;
                    harness.controller._capabilityState.status.should.equal('streaming-failed');
                    const failed = harness.events.filter(function (e) {
                        return e.type === 'stream-failed';
                    });
                    failed.should.have.length(1);
                });
            });
        });

        it('should leave Conversation Memory untouched when streaming fails — neither the user turn nor the assistant turn should be persisted, so reseed never replays an orphan user message', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitError(new Error('model crashed'));
                    return sendPromise.catch(function () {
                        // expected
                    });
                }).then(function () {
                    const stored = harness.conversationStore.data['https://example.com'];
                    (stored === undefined || stored.length === 0).should.be.true;
                });
            });
        });

        it('should recover the Assistant Capability State to ready when a subsequent sendUserMessage succeeds after a prior streaming failure, so the tab does not get stuck on a failure banner', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const firstSend = harness.controller.sendUserMessage('First, will crash');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitError(new Error('model crashed'));
                    return firstSend.catch(function () { /* expected */ });
                }).then(function () {
                    harness.controller._capabilityState.status.should.equal('streaming-failed');

                    const secondSend = harness.controller.sendUserMessage('Second, will succeed');
                    return awaitStreamController(harness.promptClient).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('ok');
                        streamCtrl2.emitComplete();
                        return secondSend;
                    });
                }).then(function () {
                    harness.controller._capabilityState.status.should.equal('ready');
                });
            });
        });
    });

    describe('#updateInspectionContext()', function () {
        it('should inject the selected-control Inspection Context into every subsequent sendUserMessage prompt until a clearing trigger fires, so the snapshot stays sticky to the selection across multi-turn conversation', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                const first = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return first;
                }).then(function () {
                    const second = harness.controller.sendUserMessage('And now?');
                    return awaitStreamController(harness.promptClient).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('Still a button');
                        streamCtrl2.emitComplete();
                        return second;
                    });
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(2);
                    harness.promptClient.userPromptsByCall[0].should.contain('Type: sap.m.Button');
                    harness.promptClient.userPromptsByCall[0].should.contain('User Question: Explain this');
                    harness.promptClient.userPromptsByCall[1].should.contain('Type: sap.m.Button');
                    harness.promptClient.userPromptsByCall[1].should.contain('User Question: And now?');
                });
            });
        });

        it('should never persist Inspection Context as Conversation Memory', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                const sendPromise = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    const stored = harness.conversationStore.data['https://example.com'];
                    stored.should.deep.equal([
                        { role: 'user', content: 'Explain this' },
                        { role: 'assistant', content: 'It is a button' }
                    ]);
                });
            });
        });

        it('should never carry the selected-control snapshot into the session seed messages handed to the Prompt Client, so the snapshot stays out of persisted Conversation Memory and out of the system-prompt-plus-prior-turns prefix', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton', properties: { text: 'Save' } }
                });

                const sendPromise = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    // The only seed at this point is the initial one. Re-seed after clearConversation to make sure the snapshot still does not leak.
                    return harness.controller.clearConversation();
                }).then(function () {
                    harness.promptClient.seedMessagesByCall.forEach(function (seed) {
                        seed.forEach(function (msg) {
                            JSON.stringify(msg).should.not.contain('sap.m.Button');
                            JSON.stringify(msg).should.not.contain('okButton');
                        });
                    });
                });
            });
        });

        it('should emit inspection-context-cleared exactly once when updateInspectionContext(null) is called with a snapshot attached', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                harness.controller.updateInspectionContext(null);

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(1);
            });
        });

        it('should not emit inspection-context-cleared when updateInspectionContext(null) is called and no snapshot was attached', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext(null);

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);
            });
        });

        it('should not emit inspection-context-cleared when one snapshot replaces another, and the next sendUserMessage carries the new snapshot', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'btn1' }
                });
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Input', id: 'in1' }
                });

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);

                const sendPromise = harness.controller.sendUserMessage('Look');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.promptClient.userPromptsByCall[0].should.contain('Type: sap.m.Input');
                    harness.promptClient.userPromptsByCall[0].should.not.contain('Type: sap.m.Button');
                });
            });
        });
    });

    describe('#clearConversation() and Inspection Context', function () {
        it('should not touch the Inspection Context — clearing Conversation Memory is orthogonal — so the next sendUserMessage after a clear still carries the selected-control snapshot. Regression test for the originally reported bug.', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                return harness.controller.clearConversation();
            }).then(function () {
                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);

                const sendPromise = harness.controller.sendUserMessage('After clear');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(1);
                    harness.promptClient.userPromptsByCall[0].should.contain('Type: sap.m.Button');
                    harness.promptClient.userPromptsByCall[0].should.contain('User Question: After clear');
                });
            });
        });

        it('should not emit inspection-context-cleared when no snapshot is attached', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                return harness.controller.clearConversation();
            }).then(function () {
                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);
            });
        });
    });

    describe('#setUrl() and Inspection Context', function () {
        it('should clear the Inspection Context, emit inspection-context-cleared exactly once, and not carry the snapshot into the next sendUserMessage after switching to a different URL', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                return harness.controller.setUrl('https://other.example.com');
            }).then(function () {
                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(1);

                const sendPromise = harness.controller.sendUserMessage('After url change');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(1);
                    harness.promptClient.userPromptsByCall[0].should.not.contain('Type: sap.m.Button');
                    harness.promptClient.userPromptsByCall[0].should.equal('After url change');
                });
            });
        });

        it('should not emit inspection-context-cleared when setUrl is called with the same URL (the dedupe path)', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                return harness.controller.setUrl('https://example.com');
            }).then(function () {
                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);
            });
        });

        it('should not emit inspection-context-cleared when setUrl changes the URL but no snapshot was attached', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                return harness.controller.setUrl('https://other.example.com');
            }).then(function () {
                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);
            });
        });
    });

    describe('#clearConversation()', function () {
        it('should clear stored Conversation Memory for the inspected URL, destroy the active session, and reseed a fresh session without prior turns', function () {
            const harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'old' },
                { role: 'assistant', content: 'old answer' }
            ];

            return initializedReady(harness).then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);
                harness.promptClient.seedMessagesByCall[0].length.should.equal(3);

                return harness.controller.clearConversation();
            }).then(function () {
                harness.conversationStore.cleared.should.deep.equal(['https://example.com']);
                harness.promptClient.destroyed.should.equal(1);
                harness.promptClient.seedMessagesByCall.should.have.length(2);
                harness.promptClient.seedMessagesByCall[1].should.have.length(1);
                harness.promptClient.seedMessagesByCall[1][0].role.should.equal('system');

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-cleared';
                });
                clearedEvents.should.have.length(1);
            });
        });
    });

    describe('#setUrl() — reseed on URL change', function () {
        it('should load the Conversation Memory for the new inspected URL and reseed the session with its prior turns', function () {
            const harness = createController();
            harness.conversationStore.data['https://a.example.com'] = [
                { role: 'user', content: 'A1' },
                { role: 'assistant', content: 'A2' }
            ];
            harness.conversationStore.data['https://b.example.com'] = [
                { role: 'user', content: 'B1' }
            ];
            harness.promptClient.availabilityResult = {
                status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://a.example.com');

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);

                return harness.controller.setUrl('https://b.example.com');
            }).then(function () {
                harness.promptClient.destroyed.should.be.at.least(1);
                harness.promptClient.seedMessagesByCall.should.have.length(2);
                const lastSeed = harness.promptClient.seedMessagesByCall[1];
                lastSeed[0].role.should.equal('system');
                lastSeed[1].should.deep.equal({ role: 'user', content: 'B1' });

                const loadedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-loaded';
                });
                loadedEvents.should.have.length(2);
                loadedEvents[1].turns.should.deep.equal([{ role: 'user', content: 'B1' }]);
            });
        });

        it('should not reseed when setUrl is called with the same inspected URL', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);

                return harness.controller.setUrl('https://example.com');
            }).then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);
            });
        });
    });

    describe('#downloadModel()', function () {
        it('should drive the Prompt Client download flow, emit downloading capability state with progress, and resolve to a ready capability state once the local model is available', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'downloadable', message: 'Needs download'
            };
            harness.promptClient.downloadProgressValues = [0.25, 0.5, 1.0];

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('downloadable');

                return harness.controller.downloadModel();
            }).then(function () {
                const states = harness.capabilityStates.map(function (s) { return s.status; });
                states.should.include('downloading');
                states.should.include('ready');

                const downloadingStates = harness.capabilityStates.filter(function (s) {
                    return s.status === 'downloading';
                });
                downloadingStates.length.should.be.at.least(1);
                downloadingStates[downloadingStates.length - 1].progress.should.equal(1.0);
            });
        });
    });

    describe('capability-state refresh on successful reseed', function () {
        it('should emit a ready Assistant Capability State after clearConversation reseeds the session, so the panel can reset the token counter, drop quota-exhausted styling, and re-enable the input', function () {
            const harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'old' },
                { role: 'assistant', content: 'old answer' }
            ];

            return initializedReady(harness).then(function () {
                const stateCountBeforeClear = harness.capabilityStates.length;

                return harness.controller.clearConversation().then(function () {
                    const newStates = harness.capabilityStates.slice(stateCountBeforeClear);
                    newStates.should.have.length(1);
                    newStates[0].status.should.equal('ready');
                    newStates[0].progress.should.equal(0);
                });
            });
        });

        it('should emit the ready Assistant Capability State after the conversation-cleared event, so listeners that refresh usage info see a fresh session', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const eventCountBeforeClear = harness.events.length;

                return harness.controller.clearConversation().then(function () {
                    const newEvents = harness.events.slice(eventCountBeforeClear);
                    const clearedIndex = newEvents.findIndex(function (e) { return e.type === 'conversation-cleared'; });
                    const readyIndex = newEvents.findIndex(function (e) {
                        return e.type === 'capability-state-changed' && e.state.status === 'ready';
                    });
                    clearedIndex.should.be.at.least(0);
                    readyIndex.should.be.at.least(0);
                    readyIndex.should.be.above(clearedIndex);
                });
            });
        });

        it('should emit a ready Assistant Capability State after setUrl reseeds the session for a new inspected URL, so the panel refreshes the token counter for the fresh session', function () {
            const harness = createController();
            harness.conversationStore.data['https://a.example.com'] = [
                { role: 'user', content: 'A1' }
            ];

            return initializedReady(harness).then(function () {
                const stateCountBeforeSwitch = harness.capabilityStates.length;

                return harness.controller.setUrl('https://other.example.com').then(function () {
                    const newStates = harness.capabilityStates.slice(stateCountBeforeSwitch);
                    newStates.should.have.length(1);
                    newStates[0].status.should.equal('ready');
                    newStates[0].progress.should.equal(0);
                });
            });
        });

        it('should not emit a redundant ready Assistant Capability State when setUrl is called with the same inspected URL (no reseed happened)', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const stateCountBeforeNoop = harness.capabilityStates.length;

                return harness.controller.setUrl('https://example.com').then(function () {
                    harness.capabilityStates.length.should.equal(stateCountBeforeNoop);
                });
            });
        });

        it('should not emit a ready Assistant Capability State when clearConversation reseed fails, so the session-failed banner is not immediately overwritten with ready', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.promptClient.createSessionError = new Error('reseed failed after clear');
                const stateCountBeforeClear = harness.capabilityStates.length;

                return harness.controller.clearConversation().then(function () {
                    const newStates = harness.capabilityStates.slice(stateCountBeforeClear);
                    const readyAfterFailure = newStates.filter(function (s) { return s.status === 'ready'; });
                    readyAfterFailure.should.have.length(0);
                    harness.controller._capabilityState.status.should.equal('session-failed');
                });
            });
        });
    });

    describe('session reseed failures', function () {
        it('should resolve the Assistant Capability State to session-failed when clearConversation cannot reseed the session', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.promptClient.createSessionError = new Error('reseed failed after clear');
                return harness.controller.clearConversation();
            }).then(function () {
                harness.controller._capabilityState.status.should.equal('session-failed');
            });
        });

        it('should resolve the Assistant Capability State to session-failed when setUrl reseed fails for the new inspected URL', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.promptClient.createSessionError = new Error('reseed failed after url change');
                return harness.controller.setUrl('https://other.example.com');
            }).then(function () {
                harness.controller._capabilityState.status.should.equal('session-failed');
            });
        });

        it('should resolve the Assistant Capability State to session-failed when downloadModel succeeds but reseed afterwards fails', function () {
            const harness = createController();
            harness.promptClient.availabilityResult = {
                status: 'downloadable', message: 'Needs download'
            };

            return harness.controller.initialize().then(function () {
                harness.promptClient.createSessionError = new Error('reseed failed after download');
                return harness.controller.downloadModel();
            }).then(function () {
                harness.controller._capabilityState.status.should.equal('session-failed');
            });
        });
    });

    describe('#sendUserMessage() during an in-flight session reseed', function () {
        it('should defer the user prompt until clearConversation has reseeded the session, so a Send pressed immediately after Clear History does not race the Prompt Client guard', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                // Arrange: defer the reseed createSession so the window between destroy and
                // session-created stays open.
                harness.promptClient.deferredCreateSession = createDeferred();

                // Act: trigger Clear History (fire-and-forget, like AIChat does) then send
                // immediately, before the reseed resolves.
                harness.controller.clearConversation();
                const sendPromise = harness.controller.sendUserMessage('after clear');

                // The user prompt MUST NOT have reached promptStreaming yet — the controller
                // is responsible for waiting for the in-flight seed before sending.
                return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(0);

                    // Now let the reseed complete. Leaving `deferredCreateSession` set is fine —
                    // there is only one seed in flight in this scenario.
                    harness.promptClient.deferredCreateSession.resolve(true);

                    return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                        streamCtrl.emitChunk('hi');
                        streamCtrl.emitComplete();
                        return sendPromise;
                    });
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.deep.equal(['after clear']);
                });
            });
        });

        it('should reject sendUserMessage and leave the Assistant Capability State at session-failed when the in-flight reseed itself fails, instead of overwriting it with streaming-failed', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.promptClient.deferredCreateSession = createDeferred();

                harness.controller.clearConversation();
                const sendPromise = harness.controller.sendUserMessage('after clear');

                // Reseed fails. Leave `deferredCreateSession` set so the fake's `createSession`
                // call from inside the clearConversation chain (on the next microtask) returns
                // the rejected promise rather than falling through to the default resolved path.
                harness.promptClient.deferredCreateSession.reject(new Error('reseed failed mid race'));

                return sendPromise.then(function () {
                    throw new Error('Expected sendUserMessage to reject when the in-flight reseed failed');
                }, function (err) {
                    err.message.should.contain('reseed failed mid race');
                }).then(function () {
                    // Capability state stays session-failed; streaming-failed would overwrite the
                    // user-visible banner with the wrong cause.
                    harness.controller._capabilityState.status.should.equal('session-failed');
                    // The prompt must never have been forwarded to the transport.
                    harness.promptClient.userPromptsByCall.should.have.length(0);
                });
            });
        });

        it('should defer the user prompt until setUrl has reseeded the session for the new inspected URL, so a Send pressed immediately after a URL change does not race the Prompt Client guard', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                // Same race shape as clearConversation, on the setUrl path. Spec acceptance
                // criterion 2 (".scratch/ai-session-reseed-race/issue.md"): URL change reseed
                // must not let a Send through before the new session is live.
                harness.promptClient.deferredCreateSession = createDeferred();

                harness.controller.setUrl('https://other.example.com');
                const sendPromise = harness.controller.sendUserMessage('after url change');

                return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(0);

                    harness.promptClient.deferredCreateSession.resolve(true);

                    return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                        streamCtrl.emitChunk('ok');
                        streamCtrl.emitComplete();
                        return sendPromise;
                    });
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.deep.equal(['after url change']);
                });
            });
        });
    });
});
