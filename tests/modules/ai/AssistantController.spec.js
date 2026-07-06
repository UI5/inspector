'use strict';

const AssistantController = require('../../../app/scripts/modules/ai/AssistantController.js');
const PromptBuilder = require('../../../app/scripts/modules/ai/PromptBuilder.js');

/**
 * Fake Provider. Records the messages arrays passed to `sendMessage` and lets tests script
 * capability resolution, streaming, usage info, and failures.
 *
 * @returns {Object}
 */
function createFakeProvider() {
    const fake = {
        availabilityResult: { status: 'ready', message: 'Model is ready' },
        usageInfo: null,
        downloadShouldFail: false,
        downloadProgressValues: [],

        messagesByCall: [],
        destroyed: 0,
        pendingStreamControllers: [],
        sendMessageError: null,

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

        sendMessage: function (messages, options) {
            fake.messagesByCall.push(messages);

            if (fake.sendMessageError) {
                return Promise.reject(fake.sendMessageError);
            }

            const opts = options || {};
            let resolveFn = null;
            let rejectFn = null;
            const promise = new Promise(function (resolve, reject) {
                resolveFn = resolve;
                rejectFn = reject;
            });

            let fullText = '';
            const controller = {
                emitChunk: function (text) {
                    fullText += text;
                    if (typeof opts.onChunk === 'function') {
                        opts.onChunk(text);
                    }
                },
                emitComplete: function () {
                    resolveFn(fullText);
                },
                emitError: function (err) {
                    rejectFn(err);
                }
            };
            fake.pendingStreamControllers.push(controller);

            return promise;
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

function createController(overrides) {
    overrides = overrides || {};
    const provider = overrides.provider || createFakeProvider();
    const conversationStore = overrides.conversationStore || createFakeConversationStore();
    const promptBuilder = overrides.promptBuilder || new PromptBuilder();
    const getAppInfo = overrides.getAppInfo || function () { return null; };
    const getConsoleErrors = overrides.getConsoleErrors || function () { return []; };
    const clearConsoleErrors = overrides.clearConsoleErrors || function () {};

    const controller = new AssistantController({
        promptBuilder: promptBuilder,
        createProvider: function () { return provider; },
        conversationStore: conversationStore,
        getAppInfo: getAppInfo,
        getConsoleErrors: getConsoleErrors,
        clearConsoleErrors: clearConsoleErrors
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
        provider: provider,
        conversationStore: conversationStore,
        events: events,
        capabilityStates: capabilityStates
    };
}

/**
 * Drive a fresh harness into `ready` and load memory for the test URL.
 *
 * @param {Object} harness
 * @returns {Promise<void>}
 */
function initializedReady(harness) {
    harness.provider.availabilityResult = { status: 'ready', message: 'ready' };
    harness.controller.setUrl('https://example.com');
    return harness.controller.initialize();
}

/**
 * Poll until the fake provider has recorded a pending stream from a sendMessage call.
 *
 * @param {Object} fakeProvider
 * @param {number} [maxAttempts=500]
 * @returns {Promise<{emitChunk: Function, emitComplete: Function, emitError: Function}>}
 */
function awaitStreamController(fakeProvider, maxAttempts) {
    let attemptsLeft = typeof maxAttempts === 'number' ? maxAttempts : 500;
    return new Promise(function (resolve, reject) {
        function poll() {
            if (fakeProvider.pendingStreamControllers.length > 0) {
                resolve(fakeProvider.pendingStreamControllers.shift());
                return;
            }
            attemptsLeft -= 1;
            if (attemptsLeft <= 0) {
                reject(new Error('awaitStreamController: production code never called sendMessage() within the poll budget'));
                return;
            }
            setTimeout(poll, 1);
        }
        poll();
    });
}

describe('AssistantController', function () {
    describe('initial Assistant Capability State', function () {
        it('should seed the capability state to a canonical state before initialization runs', function () {
            const harness = createController();
            const canonicalStates = ['unsupported', 'unavailable', 'downloadable', 'downloading', 'ready', 'session-failed', 'streaming-failed'];
            canonicalStates.should.include(harness.controller._capabilityState.status);
        });
    });

    describe('#initialize() — capability resolution', function () {
        it('should resolve the capability state to ready and notify listeners when the provider reports ready', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'ready', message: 'Gemini Nano is ready' };

            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('ready');
                harness.capabilityStates.should.deep.include({
                    status: 'ready',
                    message: 'Gemini Nano is ready',
                    progress: 0
                });
            });
        });

        it('should resolve the capability state to downloadable when the provider reports downloadable', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'downloadable', message: 'Model can be downloaded' };
            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('downloadable');
            });
        });

        it('should resolve the capability state to unsupported when the provider reports an unsupported browser', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'unsupported', message: 'Browser unsupported' };
            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('unsupported');
            });
        });

        it('should resolve the capability state to downloading when the provider reports mid-download', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'downloading', message: 'Gemini Nano is downloading' };
            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('downloading');
                harness.controller._capabilityState.message.should.equal('Gemini Nano is downloading');
            });
        });

        it('should resolve the capability state to unavailable when the provider reports unavailable, preserving the transport-supplied message', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'unavailable', message: 'Background worker availability check threw: boom' };
            return harness.controller.initialize().then(function () {
                harness.controller._capabilityState.status.should.equal('unavailable');
                harness.controller._capabilityState.message.should.equal('Background worker availability check threw: boom');
            });
        });

        it('should resolve the capability state to unavailable when the capability check throws', function () {
            const harness = createController();
            harness.provider.checkAvailability = function () {
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

        it('should not ask the provider to seed any session during initialize — session lifecycle is the provider\'s concern', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'ready', message: 'ready' };

            return harness.controller.initialize().then(function () {
                harness.provider.messagesByCall.should.have.length(0);
            });
        });
    });

    describe('#sendUserMessage() — streaming', function () {
        it('should forward the full messages array to the provider and emit streamed chunks and a complete event with the joined response', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('What is sap.m.Button?');

                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('Hello ');
                    streamCtrl.emitChunk('world');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.provider.messagesByCall.should.have.length(1);
                    const sentMessages = harness.provider.messagesByCall[0];
                    sentMessages[0].role.should.equal('system');
                    const lastMsg = sentMessages[sentMessages.length - 1];
                    lastMsg.role.should.equal('user');
                    lastMsg.content.should.equal('What is sap.m.Button?');

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

                return awaitStreamController(harness.provider).then(function (streamCtrl) {
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

        it('should carry prior turns as history in the messages array on the second send', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const firstSend = harness.controller.sendUserMessage('Q1');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('A1');
                    streamCtrl.emitComplete();
                    return firstSend;
                }).then(function () {
                    const secondSend = harness.controller.sendUserMessage('Q2');
                    return awaitStreamController(harness.provider).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('A2');
                        streamCtrl2.emitComplete();
                        return secondSend;
                    });
                }).then(function () {
                    harness.provider.messagesByCall.should.have.length(2);
                    const secondCall = harness.provider.messagesByCall[1];
                    secondCall[0].role.should.equal('system');
                    secondCall[1].should.deep.equal({ role: 'user', content: 'Q1' });
                    secondCall[2].should.deep.equal({ role: 'assistant', content: 'A1' });
                    secondCall[3].should.deep.equal({ role: 'user', content: 'Q2' });
                });
            });
        });
    });

    describe('streaming failure recovery', function () {
        it('should surface a streaming-failed capability state and clear the thinking state when the provider throws mid-stream', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.provider).then(function (streamCtrl) {
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

        it('should leave Conversation Memory untouched when streaming fails', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitError(new Error('model crashed'));
                    return sendPromise.catch(function () {});
                }).then(function () {
                    const stored = harness.conversationStore.data['https://example.com'];
                    (stored === undefined || stored.length === 0).should.be.true;
                });
            });
        });

        it('should recover the capability state to ready when a subsequent sendUserMessage succeeds after a prior streaming failure', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const firstSend = harness.controller.sendUserMessage('First, will crash');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitError(new Error('model crashed'));
                    return firstSend.catch(function () {});
                }).then(function () {
                    harness.controller._capabilityState.status.should.equal('streaming-failed');

                    const secondSend = harness.controller.sendUserMessage('Second, will succeed');
                    return awaitStreamController(harness.provider).then(function (streamCtrl2) {
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
        it('should inject the selected-control Inspection Context into every subsequent sendUserMessage prompt until cleared', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                const first = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return first;
                }).then(function () {
                    const second = harness.controller.sendUserMessage('And now?');
                    return awaitStreamController(harness.provider).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('Still a button');
                        streamCtrl2.emitComplete();
                        return second;
                    });
                }).then(function () {
                    harness.provider.messagesByCall.should.have.length(2);
                    const firstLast = harness.provider.messagesByCall[0].slice(-1)[0].content;
                    const secondLast = harness.provider.messagesByCall[1].slice(-1)[0].content;
                    firstLast.should.contain('Type: sap.m.Button');
                    firstLast.should.contain('Now answer: Explain this');
                    secondLast.should.contain('Type: sap.m.Button');
                    secondLast.should.contain('Now answer: And now?');
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
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
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

        it('should never carry the selected-control snapshot into the history turns of subsequent sends', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton', properties: { text: 'Save' } }
                });

                const sendPromise = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    // Send a follow-up without a fresh inspection context after clearing.
                    harness.controller.updateInspectionContext(null);
                    const followUp = harness.controller.sendUserMessage('And now?');
                    return awaitStreamController(harness.provider).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('ok');
                        streamCtrl2.emitComplete();
                        return followUp;
                    });
                }).then(function () {
                    // The history turns in the second call must not carry the button snapshot.
                    const secondCall = harness.provider.messagesByCall[1];
                    // history turns are indices 1 and 2 (after system, before current user).
                    JSON.stringify(secondCall[1]).should.not.contain('sap.m.Button');
                    JSON.stringify(secondCall[2]).should.not.contain('sap.m.Button');
                    // The current user turn (last) should be the plain follow-up — no snapshot attached.
                    secondCall[secondCall.length - 1].content.should.equal('And now?');
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
                harness.controller.updateInspectionContext({ control: { type: 'sap.m.Button', id: 'btn1' } });
                harness.controller.updateInspectionContext({ control: { type: 'sap.m.Input', id: 'in1' } });

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'inspection-context-cleared';
                });
                clearedEvents.should.have.length(0);

                const sendPromise = harness.controller.sendUserMessage('Look');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                    last.should.contain('Type: sap.m.Input');
                    last.should.not.contain('Type: sap.m.Button');
                });
            });
        });
    });

    describe('#sendUserMessage() — Recent Console Errors seam', function () {
        it('should invoke getConsoleErrors once per send and forward the snapshot to PromptBuilder', function () {
            const calls = [];
            const snapshot = [{ type: 'error', message: 'boom', frame: 'app.js:1', count: 1 }];
            const harness = createController({
                getConsoleErrors: function () {
                    calls.push('called');
                    return snapshot;
                }
            });

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Explain');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                calls.should.have.length(1);
                const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                last.should.contain('Recent Console Errors:');
                last.should.contain('- boom');
            });
        });

        it('should not include the Recent Console Errors section when getConsoleErrors returns an empty array', function () {
            const harness = createController({
                getConsoleErrors: function () { return []; }
            });

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Q');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                last.should.not.contain('Recent Console Errors');
            });
        });

        it('should fall back to no-errors when getConsoleErrors returns undefined', function () {
            const harness = createController({
                getConsoleErrors: function () { return undefined; }
            });

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Q');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                last.should.equal('Q');
            });
        });

        it('should fall back to no-errors when getConsoleErrors throws', function () {
            const harness = createController({
                getConsoleErrors: function () { throw new Error('panel wiring broken'); }
            });

            return initializedReady(harness).then(function () {
                const sendPromise = harness.controller.sendUserMessage('Q');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                last.should.equal('Q');
            });
        });

        it('should treat a missing getConsoleErrors option as an empty snapshot', function () {
            const fakeProvider = createFakeProvider();
            const controller = new AssistantController({
                promptBuilder: new PromptBuilder(),
                createProvider: function () { return fakeProvider; },
                conversationStore: createFakeConversationStore()
            });
            controller._capabilityState = { status: 'ready', message: '', progress: 0 };
            controller._currentUrl = 'https://example.com';

            controller._safeGetConsoleErrors().should.deep.equal([]);
        });
    });

    describe('#clearConversation() — Recent Console Errors buffer', function () {
        it('should invoke clearConsoleErrors alongside conversation-store clear so the buffer resets in lock-step with Conversation Memory', function () {
            let clearCalls = 0;
            const harness = createController({
                clearConsoleErrors: function () { clearCalls += 1; }
            });

            return initializedReady(harness).then(function () {
                clearCalls = 0;
                return harness.controller.clearConversation();
            }).then(function () {
                clearCalls.should.equal(1);
            });
        });

        it('should not throw when clearConsoleErrors itself throws — a broken panel wiring must not block Clear Conversation', function () {
            const harness = createController({
                clearConsoleErrors: function () { throw new Error('panel wiring broken'); }
            });

            return initializedReady(harness).then(function () {
                return harness.controller.clearConversation();
            }).then(function () {
                harness.controller._capabilityState.status.should.equal('ready');
            });
        });
    });

    describe('#setUrl() — Recent Console Errors buffer', function () {
        it('should invoke clearConsoleErrors when the URL changes so buffered errors from the previous page do not leak', function () {
            let clearCalls = 0;
            const harness = createController({
                clearConsoleErrors: function () { clearCalls += 1; }
            });

            return initializedReady(harness).then(function () {
                clearCalls = 0;
                return harness.controller.setUrl('https://other.example.com');
            }).then(function () {
                clearCalls.should.equal(1);
            });
        });

        it('should not invoke clearConsoleErrors when setUrl is called with the same URL', function () {
            let clearCalls = 0;
            const harness = createController({
                clearConsoleErrors: function () { clearCalls += 1; }
            });

            return initializedReady(harness).then(function () {
                clearCalls = 0;
                return harness.controller.setUrl('https://example.com');
            }).then(function () {
                clearCalls.should.equal(0);
            });
        });

        it('should not throw when clearConsoleErrors itself throws', function () {
            const harness = createController({
                clearConsoleErrors: function () { throw new Error('panel wiring broken'); }
            });

            return initializedReady(harness).then(function () {
                return harness.controller.setUrl('https://other.example.com');
            }).then(function () {
                harness.controller._currentUrl.should.equal('https://other.example.com');
            });
        });
    });

    describe('#clearConversation() and Inspection Context', function () {
        it('should not touch the Inspection Context — clearing Conversation Memory is orthogonal', function () {
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
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.provider.messagesByCall.should.have.length(1);
                    const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                    last.should.contain('Type: sap.m.Button');
                    last.should.contain('Now answer: After clear');
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
        it('should clear the Inspection Context, emit inspection-context-cleared exactly once, and not carry the snapshot into the next send after switching URL', function () {
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
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.provider.messagesByCall.should.have.length(1);
                    const last = harness.provider.messagesByCall[0].slice(-1)[0].content;
                    last.should.not.contain('Type: sap.m.Button');
                    last.should.equal('After url change');
                });
            });
        });

        it('should not emit inspection-context-cleared when setUrl is called with the same URL', function () {
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
        it('should clear stored Conversation Memory for the inspected URL, destroy the provider so its cached state is dropped, and reset the messages history for subsequent sends', function () {
            const harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'old' },
                { role: 'assistant', content: 'old answer' }
            ];

            return initializedReady(harness).then(function () {
                harness.controller._conversationMemory.should.have.length(2);

                return harness.controller.clearConversation();
            }).then(function () {
                harness.conversationStore.cleared.should.deep.equal(['https://example.com']);
                harness.provider.destroyed.should.be.at.least(1);
                harness.controller._conversationMemory.should.have.length(0);

                const clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-cleared';
                });
                clearedEvents.should.have.length(1);

                const sendPromise = harness.controller.sendUserMessage('after clear');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                // The messages array after clear should be just [system, user].
                harness.provider.messagesByCall.should.have.length(1);
                const messages = harness.provider.messagesByCall[0];
                messages.should.have.length(2);
                messages[0].role.should.equal('system');
                messages[1].role.should.equal('user');
                messages[1].content.should.equal('after clear');
            });
        });
    });

    describe('#setUrl() — history change on URL change', function () {
        it('should load the Conversation Memory for the new inspected URL and use it as history on subsequent sends', function () {
            const harness = createController();
            harness.conversationStore.data['https://a.example.com'] = [
                { role: 'user', content: 'A1' },
                { role: 'assistant', content: 'A2' }
            ];
            harness.conversationStore.data['https://b.example.com'] = [
                { role: 'user', content: 'B1' }
            ];
            harness.provider.availabilityResult = { status: 'ready', message: 'ready' };
            harness.controller.setUrl('https://a.example.com');

            return harness.controller.initialize().then(function () {
                return harness.controller.setUrl('https://b.example.com');
            }).then(function () {
                harness.provider.destroyed.should.be.at.least(1);

                const loadedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-loaded';
                });
                loadedEvents.should.have.length(2);
                loadedEvents[1].turns.should.deep.equal([{ role: 'user', content: 'B1' }]);

                const sendPromise = harness.controller.sendUserMessage('B2');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('ok');
                    streamCtrl.emitComplete();
                    return sendPromise;
                });
            }).then(function () {
                const messages = harness.provider.messagesByCall[0];
                messages[0].role.should.equal('system');
                messages[1].should.deep.equal({ role: 'user', content: 'B1' });
                messages[2].should.deep.equal({ role: 'user', content: 'B2' });
            });
        });

        it('should not touch the provider when setUrl is called with the same URL', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'ready', message: 'ready' };
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                const destroyedBefore = harness.provider.destroyed;
                return harness.controller.setUrl('https://example.com').then(function () {
                    harness.provider.destroyed.should.equal(destroyedBefore);
                });
            });
        });
    });

    describe('#downloadModel()', function () {
        it('should drive the provider download flow, emit downloading capability state with progress, and resolve to ready once the model is available', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'downloadable', message: 'Needs download' };
            harness.provider.downloadProgressValues = [0.25, 0.5, 1.0];

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

    describe('capability-state refresh on clear / URL change', function () {
        it('should emit a ready capability state after clearConversation, so the panel can reset the token counter, drop quota-exhausted styling, and re-enable the input', function () {
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

        it('should emit the ready capability state after the conversation-cleared event', function () {
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

        it('should emit a ready capability state after setUrl for a new inspected URL', function () {
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

        it('should not emit a redundant ready capability state when setUrl is called with the same inspected URL', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const stateCountBeforeNoop = harness.capabilityStates.length;
                return harness.controller.setUrl('https://example.com').then(function () {
                    harness.capabilityStates.length.should.equal(stateCountBeforeNoop);
                });
            });
        });

        it('should re-emit the provider\'s own ready message (not a hard-coded string) after setUrl, so the banner reflects the active provider — a non-Gemini provider is not mislabelled as Gemini', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'ready', message: 'OpenAI-compatible (gpt-4o-mini) is ready' };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize().then(function () {
                const stateCountBeforeSwitch = harness.capabilityStates.length;
                return harness.controller.setUrl('https://other.example.com').then(function () {
                    const newStates = harness.capabilityStates.slice(stateCountBeforeSwitch);
                    newStates.should.have.length(1);
                    newStates[0].status.should.equal('ready');
                    newStates[0].message.should.equal('OpenAI-compatible (gpt-4o-mini) is ready');
                });
            });
        });

        it('should re-emit the provider\'s own ready message (not a hard-coded string) after clearConversation, so the banner is not clobbered with a Gemini-specific label on a different provider', function () {
            const harness = createController();
            harness.provider.availabilityResult = { status: 'ready', message: 'OpenAI-compatible ready' };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize().then(function () {
                const stateCountBeforeClear = harness.capabilityStates.length;
                return harness.controller.clearConversation().then(function () {
                    const newStates = harness.capabilityStates.slice(stateCountBeforeClear);
                    newStates.should.have.length(1);
                    newStates[0].message.should.equal('OpenAI-compatible ready');
                });
            });
        });
    });

    describe('#setProvider() — hot-swap', function () {
        function createControllerWithFactory() {
            const initialProvider = createFakeProvider();
            const conversationStore = createFakeConversationStore();
            const constructed = [initialProvider];
            const configs = [];
            const controller = new AssistantController({
                createProvider: function (name, config) {
                    if (constructed.length === 1 && configs.length === 0) {
                        configs.push({ name: name, config: config });
                        return initialProvider;
                    }
                    const next = createFakeProvider();
                    constructed.push(next);
                    configs.push({ name: name, config: config });
                    return next;
                },
                conversationStore: conversationStore
            });
            return {
                controller: controller,
                constructed: constructed,
                configs: configs,
                conversationStore: conversationStore
            };
        }

        it('should destroy the old provider when swapping', function () {
            const h = createControllerWithFactory();
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                return h.controller.setProvider('openai', { baseUrl: 'x', apiKey: 'y', model: 'z' });
            }).then(function () {
                h.constructed[0].destroyed.should.equal(1);
            });
        });

        it('should construct the new provider through the registry factory with the given name and config', function () {
            const h = createControllerWithFactory();
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                return h.controller.setProvider('openai', { baseUrl: 'http://x', apiKey: 'k', model: 'm' });
            }).then(function () {
                const last = h.configs[h.configs.length - 1];
                last.name.should.equal('openai');
                last.config.should.deep.equal({ baseUrl: 'http://x', apiKey: 'k', model: 'm' });
            });
        });

        it('should preserve conversation memory across the swap so subsequent sends still carry history', function () {
            const h = createControllerWithFactory();
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                const firstSend = h.controller.sendUserMessage('Q1');
                return awaitStreamController(h.constructed[0]).then(function (sc) {
                    sc.emitChunk('A1');
                    sc.emitComplete();
                    return firstSend;
                });
            }).then(function () {
                return h.controller.setProvider('openai', {});
            }).then(function () {
                const nextProvider = h.constructed[1];
                const secondSend = h.controller.sendUserMessage('Q2');
                return awaitStreamController(nextProvider).then(function (sc) {
                    const messages = nextProvider.messagesByCall[0];
                    const roles = messages.map(function (m) { return m.role; });
                    roles.should.deep.equal(['system', 'user', 'assistant', 'user']);
                    messages[1].content.should.equal('Q1');
                    messages[2].content.should.equal('A1');
                    messages[3].content.should.equal('Q2');
                    sc.emitChunk('A2');
                    sc.emitComplete();
                    return secondSend;
                });
            });
        });

        it('should abort the in-flight stream by firing its AbortSignal', function () {
            const h = createControllerWithFactory();
            const signals = [];
            h.constructed[0].sendMessage = function (messages, options) {
                signals.push(options.signal);
                return new Promise(function () { /* never resolves */ });
            };
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                h.controller.sendUserMessage('Q').catch(function () {});
                return new Promise(function (r) { setTimeout(r, 10); });
            }).then(function () {
                signals.should.have.length(1);
                signals[0].aborted.should.equal(false);
                return h.controller.setProvider('openai', {});
            }).then(function () {
                signals[0].aborted.should.equal(true);
            });
        });

        it('should emit capability-state-changed after checking availability on the new provider', function () {
            const h = createControllerWithFactory();
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                const beforeSwap = h.controller._capabilityState;
                beforeSwap.status.should.equal('ready');
                const stateCountBeforeSwap = (function () {
                    let n = 0;
                    h.controller._listeners['capability-state-changed'] = h.controller._listeners['capability-state-changed'] || [];
                    return n;
                })();
                const events = [];
                h.controller.on('capability-state-changed', function (s) { events.push(s); });
                return h.controller.setProvider('openai', {}).then(function () {
                    void stateCountBeforeSwap;
                    events.length.should.be.at.least(1);
                    events[events.length - 1].status.should.equal('ready');
                });
            });
        });

        it('should call checkAvailability on the new provider (not the old one) after swap', function () {
            const h = createControllerWithFactory();
            let firstChecks = 0;
            const originalCheck = h.constructed[0].checkAvailability;
            h.constructed[0].checkAvailability = function () {
                firstChecks += 1;
                return originalCheck.call(this);
            };
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                const initialFirstChecks = firstChecks;
                return h.controller.setProvider('openai', {}).then(function () {
                    firstChecks.should.equal(initialFirstChecks);
                });
            });
        });
        it('should not emit stream-failed nor flip capability to streaming-failed when the in-flight send is aborted by the swap', function () {
            const h = createControllerWithFactory();
            h.constructed[0].sendMessage = function (messages, options) {
                return new Promise(function (resolve, reject) {
                    options.signal.addEventListener('abort', function () {
                        const err = new Error('Aborted');
                        err.name = 'AbortError';
                        reject(err);
                    });
                });
            };
            let streamFailedEvents = 0;
            h.controller.on('stream-failed', function () { streamFailedEvents += 1; });
            h.controller.setUrl('https://example.com');
            return h.controller.initialize().then(function () {
                const sendPromise = h.controller.sendUserMessage('Q').catch(function () {});
                return new Promise(function (r) { setTimeout(r, 5); }).then(function () {
                    return h.controller.setProvider('openai', {});
                }).then(function () {
                    return sendPromise;
                }).then(function () {
                    streamFailedEvents.should.equal(0);
                    h.controller._capabilityState.status.should.equal('ready');
                });
            });
        });

    });

    describe('#getUsageInfo() — optional Provider method', function () {
        it('should resolve to null when the current provider does not implement getUsageInfo, so a post-swap view refresh does not crash on providers without a running quota', function () {
            const harness = createController();
            delete harness.provider.getUsageInfo;
            return harness.controller.getUsageInfo().then(function (usage) {
                (usage === null).should.be.true;
            });
        });

        it('should return the provider\'s usage info when the method is implemented', function () {
            const harness = createController();
            harness.provider.usageInfo = { inputUsage: 100, inputQuota: 1000, percentUsed: 10 };
            return harness.controller.getUsageInfo().then(function (usage) {
                usage.should.deep.equal({ inputUsage: 100, inputQuota: 1000, percentUsed: 10 });
            });
        });
    });

    describe('idle-killed session recovery (provider-internal)', function () {
        it('should carry the current Conversation Memory into the messages array on every send, so a send after Chrome kills the idle background service worker still references earlier turns via the provider\'s own re-seeding', function () {
            const harness = createController();

            return initializedReady(harness).then(function () {
                const firstSend = harness.controller.sendUserMessage('first question');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    streamCtrl.emitChunk('first answer');
                    streamCtrl.emitComplete();
                    return firstSend;
                });
            }).then(function () {
                const followUp = harness.controller.sendUserMessage('follow-up');
                return awaitStreamController(harness.provider).then(function (streamCtrl) {
                    // The controller passes the full messages array on every send.
                    // The provider is responsible for re-seeding if its cached session died.
                    const messages = harness.provider.messagesByCall[1];
                    const roles = messages.map(function (m) { return m.role; });
                    roles.should.deep.equal(['system', 'user', 'assistant', 'user']);
                    messages[1].should.deep.equal({ role: 'user', content: 'first question' });
                    messages[2].should.deep.equal({ role: 'assistant', content: 'first answer' });
                    messages[3].content.should.equal('follow-up');

                    streamCtrl.emitChunk('follow-up answer');
                    streamCtrl.emitComplete();
                    return followUp;
                });
            });
        });
    });
});
