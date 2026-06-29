'use strict';

const PromptBuilder = require('../../../app/scripts/modules/ai/PromptBuilder.js');

describe('PromptBuilder', function () {
    let promptBuilder;

    beforeEach(function () {
        promptBuilder = new PromptBuilder();
    });

    afterEach(function () {
        promptBuilder = null;
    });

    describe('#buildSystemPrompt()', function () {
        it('should return the base UI5 assistant prompt without application metadata when no app info is provided', function () {
            const prompt = promptBuilder.buildSystemPrompt();

            prompt.should.contain('AI assistant');
            prompt.should.contain('UI5 Inspector');
            prompt.should.not.contain('Current Application Context');
        });

        it('should include the SAPUI5 framework version from application metadata in the Current Application Context section', function () {
            const appInfo = {
                common: {
                    data: {
                        SAPUI5: '1.120.0'
                    }
                }
            };

            const prompt = promptBuilder.buildSystemPrompt(appInfo);

            prompt.should.contain('Current Application Context');
            prompt.should.contain('Framework: 1.120.0');
        });

        it('should include the configured theme from application metadata', function () {
            const appInfo = {
                configurationComputed: {
                    data: {
                        theme: 'sap_horizon'
                    }
                }
            };

            const prompt = promptBuilder.buildSystemPrompt(appInfo);

            prompt.should.contain('Theme: sap_horizon');
        });

        it('should include the list of loaded libraries from application metadata', function () {
            const appInfo = {
                loadedLibraries: {
                    data: {
                        'sap.m': {},
                        'sap.ui.core': {}
                    }
                }
            };

            const prompt = promptBuilder.buildSystemPrompt(appInfo);

            prompt.should.contain('Loaded Libraries: sap.m, sap.ui.core');
        });
    });

    describe('#buildUserPrompt()', function () {
        it('should return the user message unchanged when no inspection context is provided', function () {
            const result = promptBuilder.buildUserPrompt('Test prompt', null);

            result.should.equal('Test prompt');
        });

        it('should return the user message unchanged when inspection context has no selected control', function () {
            const result = promptBuilder.buildUserPrompt('Test prompt', {});

            result.should.equal('Test prompt');
        });

        it('should prefix the user message with the selected control type, id, and a User Question label', function () {
            const inspectionContext = {
                control: {
                    type: 'sap.m.Button',
                    id: 'myButton'
                }
            };

            const result = promptBuilder.buildUserPrompt('Test prompt', inspectionContext);

            result.should.contain('Type: sap.m.Button');
            result.should.contain('ID: myButton');
            result.should.contain('User Question: Test prompt');
        });

        it('should truncate large selected-control properties so the prompt stays bounded', function () {
            const largeData = {};
            for (let i = 0; i < 200; i++) {
                largeData['property' + i] = 'value'.repeat(20);
            }

            const inspectionContext = {
                control: {
                    type: 'sap.m.Button',
                    properties: {
                        own: {
                            data: largeData
                        }
                    }
                }
            };

            const result = promptBuilder.buildUserPrompt('Test', inspectionContext);

            result.should.contain('[truncated]');
        });

        it('should include a bindings section summarizing the selected control bindings', function () {
            const inspectionContext = {
                control: {
                    type: 'sap.m.Text',
                    bindings: {
                        text: {
                            path: '/Name'
                        }
                    }
                }
            };

            const result = promptBuilder.buildUserPrompt('Test', inspectionContext);

            result.should.contain('Bindings (1):');
            result.should.contain('"/Name"');
        });

        it('should include an aggregations section summarizing the selected control aggregations', function () {
            const inspectionContext = {
                control: {
                    type: 'sap.m.Page',
                    aggregations: {
                        own: {
                            data: {
                                content: ['child1', 'child2']
                            }
                        }
                    }
                }
            };

            const result = promptBuilder.buildUserPrompt('Test', inspectionContext);

            result.should.contain('Aggregations (1):');
            result.should.contain('child1');
        });

        it('should handle a selected control with circular property data without throwing', function () {
            const circular = {};
            circular.self = circular;
            const inspectionContext = {
                control: {
                    type: 'sap.m.Button',
                    bindings: circular
                }
            };

            const result = promptBuilder.buildUserPrompt('Test', inspectionContext);

            result.should.contain('cannot serialize');
        });
    });

    describe('#buildSeedMessages()', function () {
        it('should produce a single system message when there is no Conversation Memory to replay', function () {
            const seed = promptBuilder.buildSeedMessages(null, []);

            seed.should.have.lengthOf(1);
            seed[0].role.should.equal('system');
            seed[0].content.should.contain('AI assistant');
        });

        it('should replay prior user and assistant turns after the system message', function () {
            const memory = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' }
            ];

            const seed = promptBuilder.buildSeedMessages(null, memory);

            seed.should.have.lengthOf(3);
            seed[0].role.should.equal('system');
            seed[1].should.deep.equal({ role: 'user', content: 'Hello' });
            seed[2].should.deep.equal({ role: 'assistant', content: 'Hi there' });
        });

        it('should skip UI-only system notices and empty assistant placeholders from Conversation Memory', function () {
            const memory = [
                { role: 'user', content: 'Hello' },
                { role: 'system', content: 'UI notice' },
                { role: 'assistant', content: '' }
            ];

            const seed = promptBuilder.buildSeedMessages(null, memory);

            seed.should.have.lengthOf(2);
            seed[0].role.should.equal('system');
            seed[1].should.deep.equal({ role: 'user', content: 'Hello' });
        });

        it('should include application metadata in the seed system message when app info is provided', function () {
            const appInfo = {
                common: { data: { OpenUI5: '1.120.0' } }
            };

            const seed = promptBuilder.buildSeedMessages(appInfo, []);

            seed[0].content.should.contain('Framework: 1.120.0');
        });
    });
});
