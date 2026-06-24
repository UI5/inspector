'use strict';

var AssistantController = require('../../../app/scripts/modules/ai/AssistantController.js');
var PromptBuilder = require('../../../app/scripts/modules/ai/PromptBuilder.js');

/**
 * Build a deterministic fake of the {@link PromptClient} interface for
 * Assistant Controller tests. Records seed messages and user prompts sent
 * by the controller and lets each test script capability resolution,
 * session creation, streaming, usage info, and failures by hand.
 *
 * @returns {Object} fake PromptClient with helpers for test orchestration.
 */
function createFakePromptClient() {
    var fake = {
        availabilityResult: { available: true, status: 'ready', message: 'Model is ready' },
        sessionCreated: true,
        createSessionError: null,
        usageInfo: null,
        downloadShouldFail: false,
        downloadProgressValues: [],

        seedMessagesByCall: [],
        userPromptsByCall: [],
        destroyed: 0,
        hasActiveSessionValue: false,
        pendingStreamControllers: [],

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
            if (fake.createSessionError) {
                return Promise.reject(fake.createSessionError);
            }
            fake.hasActiveSessionValue = fake.sessionCreated;
            return Promise.resolve(fake.sessionCreated);
        },

        hasActiveSession: function () {
            return fake.hasActiveSessionValue;
        },

        promptStreaming: function (formattedUserMessage) {
            fake.userPromptsByCall.push(formattedUserMessage);

            var chunks = [];
            var done = false;
            var error = null;
            var notify = null;

            var controller = {
                emitChunk: function (text) {
                    chunks.push(text);
                    var fn = notify;
                    notify = null;
                    if (fn) { fn(); }
                },
                emitComplete: function () {
                    done = true;
                    var fn = notify;
                    notify = null;
                    if (fn) { fn(); }
                },
                emitError: function (err) {
                    error = err;
                    var fn = notify;
                    notify = null;
                    if (fn) { fn(); }
                }
            };
            fake.pendingStreamControllers.push(controller);

            var stream = {
                [Symbol.asyncIterator]: function () {
                    return {
                        next: function () {
                            return new Promise(function (resolve, reject) {
                                function check() {
                                    if (chunks.length > 0) {
                                        resolve({ value: chunks.shift(), done: false });
                                    } else if (error) {
                                        reject(error);
                                    } else if (done) {
                                        resolve({ value: undefined, done: true });
                                    } else {
                                        notify = check;
                                    }
                                }
                                check();
                            });
                        }
                    };
                }
            };

            return Promise.resolve(stream);
        },

        getUsageInfo: function () {
            return Promise.resolve(fake.usageInfo);
        },

        destroy: function () {
            fake.destroyed += 1;
            fake.hasActiveSessionValue = false;
        }
    };

    return fake;
}

/**
 * Build a deterministic fake of {@link ConversationStore} for Assistant
 * Controller tests. Records load / append / clear interactions per URL.
 *
 * @returns {Object} fake ConversationStore with `data` map for assertions.
 */
function createFakeConversationStore() {
    var data = {};
    var fake = {
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
 * Convenience builder for an AssistantController with deterministic fakes.
 *
 * @param {Object} [overrides] - Test-specific overrides.
 * @returns {{controller: Object, promptClient: Object, conversationStore: Object,
 *           promptBuilder: PromptBuilder, events: Array, capabilityStates: Array}}
 */
function createController(overrides) {
    overrides = overrides || {};
    var promptClient = overrides.promptClient || createFakePromptClient();
    var conversationStore = overrides.conversationStore || createFakeConversationStore();
    var promptBuilder = overrides.promptBuilder || new PromptBuilder();
    var getAppInfo = overrides.getAppInfo || function () { return null; };

    var controller = new AssistantController({
        promptBuilder: promptBuilder,
        promptClient: promptClient,
        conversationStore: conversationStore,
        getAppInfo: getAppInfo
    });

    var events = [];
    var capabilityStates = [];
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

    return {
        controller: controller,
        promptClient: promptClient,
        conversationStore: conversationStore,
        promptBuilder: promptBuilder,
        events: events,
        capabilityStates: capabilityStates
    };
}

describe('AssistantController', function () {
    describe('initial Assistant Capability State', function () {
        it('should report an unknown Assistant Capability State before initialization', function () {
            var harness = createController();

            harness.controller.getCapabilityState().status.should.equal('unknown');
        });
    });

    describe('#initialize() — Assistant Capability State resolution', function () {
        it('should resolve the Assistant Capability State to ready and notify listeners when the Prompt Client reports the local model is ready', function () {
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: true,
                status: 'ready',
                message: 'Gemini Nano is ready'
            };

            return harness.controller.initialize().then(function () {
                harness.controller.getCapabilityState().status.should.equal('ready');
                harness.capabilityStates.should.deep.include({
                    status: 'ready',
                    message: 'Gemini Nano is ready',
                    progress: 0
                });
            });
        });

        it('should resolve the Assistant Capability State to downloadable when the Prompt Client reports the local model needs download', function () {
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: true,
                status: 'needs-download',
                message: 'Model can be downloaded'
            };

            return harness.controller.initialize().then(function () {
                harness.controller.getCapabilityState().status.should.equal('downloadable');
            });
        });

        it('should resolve the Assistant Capability State to unsupported when the Prompt Client reports an unsupported browser', function () {
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: false,
                status: 'unsupported',
                message: 'Browser unsupported'
            };

            return harness.controller.initialize().then(function () {
                harness.controller.getCapabilityState().status.should.equal('unsupported');
            });
        });
    });

    describe('#initialize() — Conversation Memory loading', function () {
        it('should load stored Conversation Memory for the current inspected URL and emit it to listeners', function () {
            var harness = createController();
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'hi there' }
            ];
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                var loaded = harness.events.filter(function (e) {
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
            var appInfo = {
                common: { data: { SAPUI5: '1.120.0' } }
            };
            var harness = createController({
                getAppInfo: function () { return appInfo; }
            });
            harness.conversationStore.data['https://example.com'] = [
                { role: 'user', content: 'previous question' },
                { role: 'assistant', content: 'previous answer' }
            ];
            harness.controller.setUrl('https://example.com');

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);
                var seed = harness.promptClient.seedMessagesByCall[0];
                seed[0].role.should.equal('system');
                seed[0].content.should.contain('Framework: 1.120.0');
                seed[1].should.deep.equal({ role: 'user', content: 'previous question' });
                seed[2].should.deep.equal({ role: 'assistant', content: 'previous answer' });
            });
        });

        it('should not attempt to create a session when the Assistant Capability State is not ready', function () {
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: false,
                status: 'unsupported',
                message: 'Browser unsupported'
            };

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(0);
            });
        });
    });

    describe('#sendUserMessage() — Agent Validation Loop streaming', function () {
        function initializedReady(harness) {
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize();
        }

        /**
         * Wait until the fake Prompt Client has registered a streaming call,
         * then return its controller so the test can drive chunks deterministically.
         * @param {Object} fakePromptClient
         * @returns {Promise<Object>}
         */
        function awaitStreamController(fakePromptClient) {
            return new Promise(function (resolve) {
                function poll() {
                    if (fakePromptClient.pendingStreamControllers.length > 0) {
                        resolve(fakePromptClient.pendingStreamControllers.shift());
                    } else {
                        setTimeout(poll, 1);
                    }
                }
                poll();
            });
        }

        it('should forward the Prompt Builder-formatted user prompt to the Prompt Client and emit streamed chunks and a complete event with the joined response', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                var sendPromise = harness.controller.sendUserMessage('What is sap.m.Button?');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('Hello ');
                    streamCtrl.emitChunk('world');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.deep.equal([
                        'What is sap.m.Button?'
                    ]);
                    var chunkEvents = harness.events.filter(function (e) {
                        return e.type === 'stream-chunk';
                    });
                    chunkEvents.map(function (e) { return e.chunk; }).should.deep.equal(['Hello ', 'world']);

                    var completeEvents = harness.events.filter(function (e) {
                        return e.type === 'stream-complete';
                    });
                    completeEvents.should.have.length(1);
                    completeEvents[0].payload.content.should.equal('Hello world');
                });
            });
        });

        it('should append the user turn and the completed assistant turn to the Conversation Store under the current inspected URL', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                var sendPromise = harness.controller.sendUserMessage('Question 1');

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
        function initializedReady(harness) {
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize();
        }

        function awaitStreamController(fakePromptClient) {
            return new Promise(function (resolve) {
                function poll() {
                    if (fakePromptClient.pendingStreamControllers.length > 0) {
                        resolve(fakePromptClient.pendingStreamControllers.shift());
                    } else {
                        setTimeout(poll, 1);
                    }
                }
                poll();
            });
        }

        it('should surface a streaming-failed Assistant Capability State and clear the thinking state when the Prompt Client throws mid-stream', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                var sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('partial');
                    streamCtrl.emitError(new Error('model crashed'));
                    return sendPromise.then(function () {
                        throw new Error('Expected sendUserMessage to reject on streaming failure');
                    }, function (err) {
                        err.message.should.equal('model crashed');
                    });
                }).then(function () {
                    harness.controller.isStreaming().should.be.false;
                    harness.controller.getCapabilityState().status.should.equal('streaming-failed');
                    var failed = harness.events.filter(function (e) {
                        return e.type === 'stream-failed';
                    });
                    failed.should.have.length(1);
                });
            });
        });

        it('should not persist an assistant turn when streaming fails before completion', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                var sendPromise = harness.controller.sendUserMessage('Question that crashes');

                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitError(new Error('model crashed'));
                    return sendPromise.catch(function () {
                        // expected
                    });
                }).then(function () {
                    var assistantAppends = harness.conversationStore.appended.filter(function (e) {
                        return e.message.role === 'assistant';
                    });
                    assistantAppends.should.have.length(0);
                });
            });
        });
    });

    describe('#updateInspectionContext()', function () {
        function initializedReady(harness) {
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize();
        }

        function awaitStreamController(fakePromptClient) {
            return new Promise(function (resolve) {
                function poll() {
                    if (fakePromptClient.pendingStreamControllers.length > 0) {
                        resolve(fakePromptClient.pendingStreamControllers.shift());
                    } else {
                        setTimeout(poll, 1);
                    }
                }
                poll();
            });
        }

        it('should inject the selected-control Inspection Context into the next sendUserMessage prompt only', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                var first = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return first;
                }).then(function () {
                    var second = harness.controller.sendUserMessage('And now?');
                    return awaitStreamController(harness.promptClient).then(function (streamCtrl2) {
                        streamCtrl2.emitChunk('Generic answer');
                        streamCtrl2.emitComplete();
                        return second;
                    });
                }).then(function () {
                    harness.promptClient.userPromptsByCall.should.have.length(2);
                    harness.promptClient.userPromptsByCall[0].should.contain('Type: sap.m.Button');
                    harness.promptClient.userPromptsByCall[0].should.contain('User Question: Explain this');
                    harness.promptClient.userPromptsByCall[1].should.equal('And now?');
                });
            });
        });

        it('should never persist Inspection Context as Conversation Memory', function () {
            var harness = createController();

            return initializedReady(harness).then(function () {
                harness.controller.updateInspectionContext({
                    control: { type: 'sap.m.Button', id: 'okButton' }
                });

                var sendPromise = harness.controller.sendUserMessage('Explain this');
                return awaitStreamController(harness.promptClient).then(function (streamCtrl) {
                    streamCtrl.emitChunk('It is a button');
                    streamCtrl.emitComplete();
                    return sendPromise;
                }).then(function () {
                    var stored = harness.conversationStore.data['https://example.com'];
                    stored.should.deep.equal([
                        { role: 'user', content: 'Explain this' },
                        { role: 'assistant', content: 'It is a button' }
                    ]);
                });
            });
        });
    });

    describe('#clearConversation()', function () {
        function initializedReady(harness) {
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://example.com');
            return harness.controller.initialize();
        }

        it('should clear stored Conversation Memory for the inspected URL, destroy the active session, and reseed a fresh session without prior turns', function () {
            var harness = createController();
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
                // After clear, the new seed should only contain the system prompt.
                harness.promptClient.seedMessagesByCall[1].should.have.length(1);
                harness.promptClient.seedMessagesByCall[1][0].role.should.equal('system');

                var clearedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-cleared';
                });
                clearedEvents.should.have.length(1);
            });
        });
    });

    describe('#setUrl() — reseed on URL change', function () {
        it('should load the Conversation Memory for the new inspected URL and reseed the session with its prior turns', function () {
            var harness = createController();
            harness.conversationStore.data['https://a.example.com'] = [
                { role: 'user', content: 'A1' },
                { role: 'assistant', content: 'A2' }
            ];
            harness.conversationStore.data['https://b.example.com'] = [
                { role: 'user', content: 'B1' }
            ];
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
            };
            harness.controller.setUrl('https://a.example.com');

            return harness.controller.initialize().then(function () {
                harness.promptClient.seedMessagesByCall.should.have.length(1);

                return harness.controller.setUrl('https://b.example.com');
            }).then(function () {
                harness.promptClient.destroyed.should.be.at.least(1);
                harness.promptClient.seedMessagesByCall.should.have.length(2);
                var lastSeed = harness.promptClient.seedMessagesByCall[1];
                lastSeed[0].role.should.equal('system');
                lastSeed[1].should.deep.equal({ role: 'user', content: 'B1' });

                var loadedEvents = harness.events.filter(function (e) {
                    return e.type === 'conversation-loaded';
                });
                loadedEvents.should.have.length(2);
                loadedEvents[1].turns.should.deep.equal([{ role: 'user', content: 'B1' }]);
            });
        });

        it('should not reseed when setUrl is called with the same inspected URL', function () {
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: true, status: 'ready', message: 'ready'
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
            var harness = createController();
            harness.promptClient.availabilityResult = {
                available: true, status: 'needs-download', message: 'Needs download'
            };
            harness.promptClient.downloadProgressValues = [0.25, 0.5, 1.0];

            return harness.controller.initialize().then(function () {
                harness.controller.getCapabilityState().status.should.equal('downloadable');

                return harness.controller.downloadModel();
            }).then(function () {
                var states = harness.capabilityStates.map(function (s) { return s.status; });
                states.should.include('downloading');
                states.should.include('ready');

                var downloadingStates = harness.capabilityStates.filter(function (s) {
                    return s.status === 'downloading';
                });
                downloadingStates.length.should.be.at.least(1);
                downloadingStates[downloadingStates.length - 1].progress.should.equal(1.0);
            });
        });
    });
});
