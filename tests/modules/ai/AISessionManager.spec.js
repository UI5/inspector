'use strict';

var AISessionManager = require('../../../app/scripts/modules/ai/AISessionManager.js');

/**
 * Build a deterministic stub PromptClient that records delegated calls so we
 * can assert AISessionManager's facade behavior without touching Chrome APIs.
 */
function createStubPromptClient() {
    var stub = {
        calls: [],
        _hasActiveSession: false,
        checkAvailability: function () {
            stub.calls.push({ name: 'checkAvailability' });
            return Promise.resolve({ available: true, status: 'ready' });
        },
        downloadModel: function (onProgress) {
            stub.calls.push({ name: 'downloadModel', onProgress: onProgress });
            return Promise.resolve();
        },
        createSession: function (initialPrompts) {
            stub.calls.push({ name: 'createSession', initialPrompts: initialPrompts });
            stub._hasActiveSession = true;
            return Promise.resolve(true);
        },
        promptStreaming: function (formattedUserMessage) {
            stub.calls.push({ name: 'promptStreaming', formattedUserMessage: formattedUserMessage });
            return Promise.resolve({});
        },
        getUsageInfo: function () {
            stub.calls.push({ name: 'getUsageInfo' });
            return Promise.resolve(null);
        },
        destroy: function () {
            stub.calls.push({ name: 'destroy' });
            stub._hasActiveSession = false;
        },
        hasActiveSession: function () {
            return stub._hasActiveSession;
        }
    };
    return stub;
}

describe('AISessionManager', function () {
    var sessionManager;
    var stubClient;

    beforeEach(function () {
        stubClient = createStubPromptClient();
        sessionManager = new AISessionManager({ promptClient: stubClient });
    });

    afterEach(function () {
        sessionManager = null;
        stubClient = null;
    });

    describe('Construction', function () {
        it('should report no active local AI session before one has been created', function () {
            sessionManager.hasActiveSession().should.be.false;
        });
    });

    describe('Prompt construction delegation', function () {
        it('should build the system prompt through the PromptBuilder so the textual shape lives in a single place', function () {
            var prompt = sessionManager.buildSystemPrompt();

            prompt.should.contain('UI5 Inspector');
        });

        it('should build seed messages through the PromptBuilder, leading with a system message', function () {
            var seed = sessionManager.buildSeedMessages(null, []);

            seed.should.have.lengthOf(1);
            seed[0].role.should.equal('system');
        });
    });

    describe('Transport delegation through the Prompt Client', function () {
        it('should delegate availability checks to the Prompt Client', function () {
            return sessionManager.checkAvailability().then(function (result) {
                stubClient.calls[0].name.should.equal('checkAvailability');
                result.status.should.equal('ready');
            });
        });

        it('should delegate model downloads to the Prompt Client, forwarding the progress callback', function () {
            var progress = function () {};
            return sessionManager.downloadModel(progress).then(function () {
                stubClient.calls[0].name.should.equal('downloadModel');
                stubClient.calls[0].onProgress.should.equal(progress);
            });
        });

        it('should delegate session creation to the Prompt Client with the seed messages produced by the builder', function () {
            return sessionManager.createSession([
                { role: 'system', content: 'sys' },
                { role: 'user', content: 'hi' }
            ]).then(function () {
                stubClient.calls[0].name.should.equal('createSession');
                stubClient.calls[0].initialPrompts.should.have.lengthOf(2);
                sessionManager.hasActiveSession().should.be.true;
            });
        });

        it('should format the user prompt through the PromptBuilder and forward only the formatted prompt to the Prompt Client', function () {
            var inspectionContext = {
                control: { type: 'sap.m.Button', id: 'b1' }
            };

            return sessionManager.promptStreaming('What is this?', inspectionContext).then(function () {
                stubClient.calls[0].name.should.equal('promptStreaming');
                stubClient.calls[0].formattedUserMessage.should.contain('Type: sap.m.Button');
                stubClient.calls[0].formattedUserMessage.should.contain('User Question: What is this?');
            });
        });

        it('should delegate usage info retrieval to the Prompt Client', function () {
            return sessionManager.getUsageInfo().then(function () {
                stubClient.calls[0].name.should.equal('getUsageInfo');
            });
        });

        it('should delegate session destruction to the Prompt Client', function () {
            sessionManager.destroy();

            stubClient.calls[0].name.should.equal('destroy');
            sessionManager.hasActiveSession().should.be.false;
        });
    });
});
