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

        describe('base prompt (no app info)', function () {
            it('should return a prompt with Role, Rules, and Style zones and no Current Application Context section', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                prompt.should.contain('Role:');
                prompt.should.contain('Rules:');
                prompt.should.contain('Style:');
                prompt.should.not.contain('Current Application Context');
            });

            it('should describe the assistant as embedded in the UI5 Inspector and specialized in UI5, OpenUI5, and UI5 Web Components', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                prompt.should.contain('UI5 Inspector');
                prompt.should.contain('UI5, OpenUI5');
                prompt.should.contain('UI5 Web Components');
            });

            it('should place the Role zone before the Rules zone and the Rules zone before the Style zone', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                const roleIdx = prompt.indexOf('Role:');
                const rulesIdx = prompt.indexOf('Rules:');
                const styleIdx = prompt.indexOf('Style:');

                roleIdx.should.be.greaterThan(-1);
                rulesIdx.should.be.greaterThan(roleIdx);
                styleIdx.should.be.greaterThan(rulesIdx);
            });

            it('should place the Current Application Context between the Role and Rules zones so rule 4 "shown above" is truthful', function () {
                const appInfo = {
                    common: { data: { OpenUI5: '1.120.0' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                const roleIdx = prompt.indexOf('Role:');
                const appCtxIdx = prompt.indexOf('Current Application Context');
                const rulesIdx = prompt.indexOf('Rules:');

                roleIdx.should.be.greaterThan(-1);
                appCtxIdx.should.be.greaterThan(roleIdx);
                rulesIdx.should.be.greaterThan(appCtxIdx);
            });

            it('should list the four Rules in the prescribed order: English, grounding, uncertainty, runtime-data preference', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                const englishIdx = prompt.indexOf('1.');
                const groundingIdx = prompt.indexOf('2.');
                const uncertaintyIdx = prompt.indexOf('3.');
                const runtimeIdx = prompt.indexOf('4.');

                englishIdx.should.be.greaterThan(-1);
                groundingIdx.should.be.greaterThan(englishIdx);
                uncertaintyIdx.should.be.greaterThan(groundingIdx);
                runtimeIdx.should.be.greaterThan(uncertaintyIdx);

                const rule1 = prompt.substring(englishIdx, groundingIdx);
                const rule2 = prompt.substring(groundingIdx, uncertaintyIdx);
                const rule3 = prompt.substring(uncertaintyIdx, runtimeIdx);
                const rule4 = prompt.substring(runtimeIdx);

                rule1.should.match(/English/);
                rule2.should.contain('Current UI5 Control Context');
                rule3.should.contain('confident');
                rule4.should.match(/runtime data/i);
                rule4.should.contain('shown above');
            });

            it('should include the prescribed uncertainty phrase template', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                prompt.should.contain('I\'m not certain <name> exists on <control> — verify in the API reference.');
            });

            it('should include a bad/good copy-me example demonstrating the uncertainty phrase', function () {
                const prompt = promptBuilder.buildSystemPrompt();

                const badIdx = prompt.toLowerCase().indexOf('bad:');
                const goodIdx = prompt.toLowerCase().indexOf('good:');

                badIdx.should.be.greaterThan(-1);
                goodIdx.should.be.greaterThan(badIdx);

                // The good example must instantiate the uncertainty phrase pattern.
                const goodSection = prompt.substring(goodIdx);
                goodSection.should.match(/I'm not certain .+ exists on .+ — verify in the API reference\./);
            });
        });

        describe('Current Application Context (with app info)', function () {
            it('should include the OpenUI5 framework version from common.data', function () {
                const appInfo = {
                    common: { data: { OpenUI5: '1.120.0' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Current Application Context');
                prompt.should.contain('Framework: 1.120.0');
            });

            it('should include the SAPUI5 framework version from common.data', function () {
                const appInfo = {
                    common: { data: { SAPUI5: '1.120.0' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Framework: 1.120.0');
            });

            it('should include the configured theme from configurationComputed.data.theme', function () {
                const appInfo = {
                    configurationComputed: { data: { theme: 'sap_horizon' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Theme: sap_horizon');
            });

            it('should include the UI locale from configurationComputed.data.language', function () {
                const appInfo = {
                    configurationComputed: { data: { language: 'en-US' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('UI locale: en-US');
            });

            it('should fall back to configurationComputed.data.locale when language is absent', function () {
                const appInfo = {
                    configurationComputed: { data: { locale: 'de-DE' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('UI locale: de-DE');
            });

            it('should omit the UI locale line when neither language nor locale is present', function () {
                const appInfo = {
                    configurationComputed: { data: { theme: 'sap_horizon' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.not.contain('UI locale');
            });

            it('should include the sap-ui-debug URL parameter when present', function () {
                const appInfo = {
                    urlParameters: { data: { 'sap-ui-debug': 'true' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('sap-ui-debug: true');
            });

            it('should omit the sap-ui-debug line when the parameter is absent', function () {
                const appInfo = {
                    urlParameters: { data: { 'other-param': 'x' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.not.contain('sap-ui-debug');
            });

            it('should include the application entry point from common.data.Application', function () {
                const appInfo = {
                    common: {
                        data: {
                            OpenUI5: '1.120.0',
                            Application: 'https://example.com/index.html'
                        }
                    }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Application entry point: https://example.com/index.html');
            });

            it('should omit the entry point line when common.data.Application is missing', function () {
                const appInfo = {
                    common: { data: { OpenUI5: '1.120.0' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.not.contain('Application entry point');
            });

            it('should include the list of loaded libraries', function () {
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

            it('should include the Current Application Context section when only urlParameters.data has sap-ui-debug', function () {
                const appInfo = {
                    urlParameters: { data: { 'sap-ui-debug': 'true' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Current Application Context');
            });

            it('should include the Current Application Context section when only configurationComputed has data', function () {
                const appInfo = {
                    configurationComputed: { data: { theme: 'sap_horizon' } }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Current Application Context');
            });

            it('should omit the Current Application Context section when appInfo contains no recognized fields', function () {
                const appInfo = {
                    common: { data: {} },
                    configurationComputed: { data: {} },
                    urlParameters: { data: {} },
                    loadedLibraries: { data: {} }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.not.contain('Current Application Context');
            });

            it('should render all six fields together when all are provided', function () {
                const appInfo = {
                    common: {
                        data: {
                            OpenUI5: '1.120.0',
                            Application: 'https://example.com/'
                        }
                    },
                    configurationComputed: {
                        data: {
                            theme: 'sap_horizon',
                            language: 'en-US'
                        }
                    },
                    urlParameters: {
                        data: { 'sap-ui-debug': 'true' }
                    },
                    loadedLibraries: {
                        data: { 'sap.m': {}, 'sap.ui.core': {} }
                    }
                };

                const prompt = promptBuilder.buildSystemPrompt(appInfo);

                prompt.should.contain('Framework: 1.120.0');
                prompt.should.contain('Theme: sap_horizon');
                prompt.should.contain('UI locale: en-US');
                prompt.should.contain('sap-ui-debug: true');
                prompt.should.contain('Application entry point: https://example.com/');
                prompt.should.contain('Loaded Libraries: sap.m, sap.ui.core');
            });
        });

        // Golden-file assertions for the assembled system prompt. Any wording change surfaces here
        // as an explicit diff so a human eye reviews shape drift on every prompt change. Zones are
        // held as separate constants so each test composes exactly the zones its scenario expects,
        // in the order the SUT emits them: Role, [Current Application Context], Rules, Style,
        // Example.
        describe('golden output', function () {
            const ROLE =
                'Role:\n' +
                'You are an assistant embedded in the UI5 Inspector, specialized in SAP UI5, OpenUI5, and UI5 Web Components — helping developers understand, debug, and build UI5-based applications.';

            const RULES =
                'Rules:\n' +
                '1. Always reply in English, regardless of the language of the user\'s message.\n' +
                '2. When a Current UI5 Control Context section is present in the user prompt, only reference property, aggregation, event, and binding names that appear in it. If asked about a name not listed there, say so plainly.\n' +
                '3. When naming a specific property, event, method, or enum value on a UI5 control, only state it if confident it exists. Otherwise use this exact phrase and add no further disclaimers:\n' +
                'I\'m not certain <name> exists on <control> — verify in the API reference.\n' +
                '4. Prefer runtime data (resolved binding values, console errors, application metadata shown above) over general assumptions when answering.';

            const STYLE =
                'Style:\n' +
                'Neutral, direct, and developer-focused. Use code snippets for code. No marketing filler, no generic disclaimers.';

            const EXAMPLE =
                'Example — uncertainty phrase in use:\n' +
                'Bad: "Yes, sap.m.Slider has a `flashOnClick` property that lights it up."\n' +
                'Good: "I\'m not certain flashOnClick exists on sap.m.Slider — verify in the API reference."';

            it('golden: no app info', function () {
                const expected = [ROLE, RULES, STYLE, EXAMPLE].join('\n\n');
                promptBuilder.buildSystemPrompt().should.equal(expected);
            });

            it('golden: only framework', function () {
                const appInfo = {
                    common: { data: { OpenUI5: '1.120.0' } }
                };

                const appContext =
                    'Current Application Context:\n' +
                    '- Framework: 1.120.0';

                const expected = [ROLE, appContext, RULES, STYLE, EXAMPLE].join('\n\n');

                promptBuilder.buildSystemPrompt(appInfo).should.equal(expected);
            });

            it('golden: framework + theme + libraries', function () {
                const appInfo = {
                    common: { data: { OpenUI5: '1.120.0' } },
                    configurationComputed: { data: { theme: 'sap_horizon' } },
                    loadedLibraries: { data: { 'sap.m': {}, 'sap.ui.core': {} } }
                };

                const appContext =
                    'Current Application Context:\n' +
                    '- Framework: 1.120.0\n' +
                    '- Theme: sap_horizon\n' +
                    '- Loaded Libraries: sap.m, sap.ui.core';

                const expected = [ROLE, appContext, RULES, STYLE, EXAMPLE].join('\n\n');

                promptBuilder.buildSystemPrompt(appInfo).should.equal(expected);
            });

            it('golden: all six fields', function () {
                const appInfo = {
                    common: {
                        data: {
                            OpenUI5: '1.120.0',
                            Application: 'https://example.com/index.html'
                        }
                    },
                    configurationComputed: {
                        data: { theme: 'sap_horizon', language: 'en-US' }
                    },
                    urlParameters: {
                        data: { 'sap-ui-debug': 'true' }
                    },
                    loadedLibraries: {
                        data: { 'sap.m': {}, 'sap.ui.core': {} }
                    }
                };

                const appContext =
                    'Current Application Context:\n' +
                    '- Framework: 1.120.0\n' +
                    '- Theme: sap_horizon\n' +
                    '- UI locale: en-US\n' +
                    '- sap-ui-debug: true\n' +
                    '- Application entry point: https://example.com/index.html\n' +
                    '- Loaded Libraries: sap.m, sap.ui.core';

                const expected = [ROLE, appContext, RULES, STYLE, EXAMPLE].join('\n\n');

                promptBuilder.buildSystemPrompt(appInfo).should.equal(expected);
            });
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
            seed[0].content.should.contain('UI5 Inspector');
            seed[0].content.should.contain('Rules:');
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
