'use strict';

const PromptBuilder = require('../../../app/scripts/modules/ai/PromptBuilder.js');

// ---- helpers for section-extraction assertions -----------------------------
// The buildUserPrompt tests below use small extractors so per-section cap assertions do not
// accidentally count characters from *other* sections. They locate the labeled header and read
// until the next blank line or the sandwich's closing `Now answer:` line.

function _extractSection(prompt, header) {
    const start = prompt.indexOf(header);
    if (start < 0) {
        return '';
    }
    const rest = prompt.substring(start);
    // A section ends at the next blank line (which precedes "Now answer:") or at the
    // sandwich's closing line.
    const stopMarkers = ['\n\n', '\nNow answer:'];
    let stop = rest.length;
    for (let i = 0; i < stopMarkers.length; i++) {
        const idx = rest.indexOf(stopMarkers[i]);
        if (idx >= 0 && idx < stop) {
            stop = idx;
        }
    }
    return rest.substring(0, stop);
}

function _extractPropertiesSection(prompt) {
    return _extractSection(prompt, 'Properties:');
}

function _extractBindingsSection(prompt) {
    return _extractSection(prompt, 'Bindings:');
}

function _extractAggregationsSection(prompt) {
    return _extractSection(prompt, 'Aggregations:');
}

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

        describe('no-context behavior', function () {
            it('should return the user message unchanged when no inspection context is provided', function () {
                const result = promptBuilder.buildUserPrompt('Test prompt', null);

                result.should.equal('Test prompt');
            });

            it('should return the user message unchanged when inspection context has no selected control', function () {
                const result = promptBuilder.buildUserPrompt('Test prompt', {});

                result.should.equal('Test prompt');
            });
        });

        describe('sandwich structure', function () {
            it('should start with "User asked: <message>" and end with "Now answer: <message>" when a control is attached', function () {
                const inspectionContext = {
                    control: { type: 'sap.m.Button', id: 'btn' }
                };

                const result = promptBuilder.buildUserPrompt('Why is this broken?', inspectionContext);

                result.indexOf('User asked: Why is this broken?').should.equal(0);
                const idx = result.lastIndexOf('Now answer: Why is this broken?');
                idx.should.be.greaterThan(-1);
                idx.should.equal(result.length - 'Now answer: Why is this broken?'.length);
            });

            it('should place the Current UI5 Control Context block between the top and bottom question restatements', function () {
                const inspectionContext = {
                    control: { type: 'sap.m.Button', id: 'btn' }
                };

                const result = promptBuilder.buildUserPrompt('Test', inspectionContext);

                const userAskedIdx = result.indexOf('User asked:');
                const ctxIdx = result.indexOf('Current UI5 Control Context:');
                const nowAnswerIdx = result.indexOf('Now answer:');

                userAskedIdx.should.equal(0);
                ctxIdx.should.be.greaterThan(userAskedIdx);
                nowAnswerIdx.should.be.greaterThan(ctxIdx);
            });
        });

        describe('control identity', function () {
            it('should include Type and ID lines when both are provided', function () {
                const inspectionContext = {
                    control: { type: 'sap.m.Button', id: 'myButton' }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- Type: sap.m.Button');
                result.should.contain('- ID: myButton');
            });
        });

        describe('properties rendering', function () {
            it('should render properties as key: value lines with no JSON braces on the happy path', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        properties: {
                            own: {
                                data: {
                                    text: 'Save',
                                    enabled: true,
                                    width: '100px'
                                }
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);
                const propsSection = _extractPropertiesSection(result);

                propsSection.should.contain('text: Save');
                propsSection.should.contain('enabled: true');
                propsSection.should.contain('width: 100px');
                propsSection.should.not.contain('{');
                propsSection.should.not.contain('}');
            });

            it('should omit the Properties section entirely when own properties are empty', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        properties: { own: { data: {} } }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.not.contain('Properties:');
            });

            it('should truncate the properties section to its cap with a [truncated] marker on adversarial input', function () {
                const largeData = {};
                for (let i = 0; i < 500; i++) {
                    largeData['property' + i] = 'value'.repeat(20);
                }
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        properties: { own: { data: largeData } }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);
                const propsSection = _extractPropertiesSection(result);

                propsSection.should.contain('[truncated]');
                // 800-char cap plus the "... [truncated]" tail, plus the "Properties:\n" header line.
                propsSection.length.should.be.lessThan(1000);
            });
        });

        describe('bindings rendering', function () {
            it('should render a single binding on one line with path, model, and resolved value', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: {
                                path: '/Name',
                                value: 'Alice',
                                model: 'default'
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- text ← "/Name" = Alice (model: default)');
            });

            it('should omit the "= <value>" segment when the snapshot carries no resolved value', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: { path: '/Name', model: 'default' }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- text ← "/Name" (model: default)');
                result.should.not.contain('=');
            });

            it('should print null literally when the resolved value is null', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: { path: '/Name', value: null, model: 'default' }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('= null');
            });

            it('should print undefined literally when the resolved value is undefined and the field is present', function () {
                // The snapshot must explicitly carry the key as undefined for it to render.
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: Object.assign({ path: '/Name', model: 'default' }, { value: undefined })
                        }
                    }
                };

                // The rule per the AC is: "= <value>" appears only when the snapshot carries a
                // resolved value. `undefined` printed literally is required *only* when the
                // snapshot explicitly carries an undefined value — but `Object.assign` drops
                // undefined properties in some engines, so we test the intent using an explicit
                // hasOwn check via a getter-style object.
                const explicitUndefined = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: (function () {
                                const b = { path: '/Name', model: 'default' };
                                Object.defineProperty(b, 'value', { value: undefined, enumerable: true });
                                return b;
                            }())
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', explicitUndefined);
                result.should.contain('= undefined');
            });

            it('should default the model annotation to "default" when the binding has a path but no explicit model', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: { path: '/Name' }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('(model: default)');
            });

            it('should include type when present', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Input',
                        bindings: {
                            value: {
                                path: '/Age',
                                value: 42,
                                model: 'default',
                                type: 'sap.ui.model.type.Integer'
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('type: sap.ui.model.type.Integer');
            });

            it('should include "formatter: yes" when a formatter is present', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: {
                                path: '/Name',
                                value: 'Alice',
                                model: 'default',
                                formatter: function () {}
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('formatter: yes');
            });

            it('should truncate a very long resolved value at approximately 100 characters', function () {
                const longValue = 'x'.repeat(500);
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: { path: '/Name', value: longValue, model: 'default' }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                // The rendered value must be shorter than the raw length + a truncation marker.
                result.should.not.contain(longValue);
                result.should.contain('...');
            });

            it('should render composite bindings (parts) as a degenerate one-line entry without throwing', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: {
                            text: {
                                parts: [
                                    { path: '/First' },
                                    { path: '/Last' }
                                ]
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- text ← <composite>');
            });

            it('should truncate the bindings section to its cap on adversarial input', function () {
                const many = {};
                for (let i = 0; i < 500; i++) {
                    many['prop' + i] = { path: '/very/long/path/' + i, value: 'value' + i };
                }
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        bindings: many
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);
                const bindingsSection = _extractBindingsSection(result);

                bindingsSection.should.contain('[truncated]');
                bindingsSection.length.should.be.lessThan(1000);
            });

            it('should handle a selected control with circular binding data without throwing', function () {
                const circular = {};
                circular.self = circular;
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        bindings: circular
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('cannot serialize');
            });
        });

        describe('aggregations rendering', function () {
            it('should render an empty aggregation as "<name>: empty"', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Page',
                        aggregations: {
                            own: {
                                data: {
                                    content: []
                                }
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- content: empty');
            });

            it('should append child IDs when the child count is <= 3', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Page',
                        aggregations: {
                            own: {
                                data: {
                                    content: [
                                        { id: 'btn1', type: 'sap.m.Button' },
                                        { id: 'btn2', type: 'sap.m.Button' }
                                    ]
                                }
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- content: 2 children — btn1, btn2');
            });

            it('should render a type histogram when the child count is > 3', function () {
                const children = [];
                for (let i = 0; i < 20; i++) {
                    children.push({ id: 't' + i, type: 'sap.m.Text' });
                }
                for (let i = 0; i < 4; i++) {
                    children.push({ id: 'b' + i, type: 'sap.m.Button' });
                }
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Page',
                        aggregations: {
                            own: {
                                data: { content: children }
                            }
                        }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.contain('- content: 24 children (sap.m.Text × 20, sap.m.Button × 4)');
            });

            it('should omit the Aggregations section entirely when own aggregations are empty', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        aggregations: { own: { data: {} } }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);

                result.should.not.contain('Aggregations:');
            });

            it('should truncate the aggregations section to its cap on adversarial input', function () {
                const data = {};
                for (let i = 0; i < 100; i++) {
                    const children = [];
                    for (let j = 0; j < 200; j++) {
                        children.push({ id: 'child' + i + '_' + j, type: 'sap.m.SomeReallyLongTypeName' });
                    }
                    data['aggr' + i] = children;
                }
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Page',
                        aggregations: { own: { data: data } }
                    }
                };

                const result = promptBuilder.buildUserPrompt('Q', inspectionContext);
                const aggregationsSection = _extractAggregationsSection(result);

                aggregationsSection.should.contain('[truncated]');
                aggregationsSection.length.should.be.lessThan(600);
            });
        });

        describe('golden output', function () {
            it('golden: control identity only', function () {
                const inspectionContext = {
                    control: { type: 'sap.m.Button', id: 'myBtn' }
                };

                const expected =
                    'User asked: Hi\n\n' +
                    'Current UI5 Control Context:\n' +
                    '- Type: sap.m.Button\n' +
                    '- ID: myBtn\n\n' +
                    'Now answer: Hi';

                promptBuilder.buildUserPrompt('Hi', inspectionContext).should.equal(expected);
            });

            it('golden: control + properties only', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Button',
                        id: 'saveBtn',
                        properties: {
                            own: {
                                data: {
                                    text: 'Save',
                                    enabled: true
                                }
                            }
                        }
                    }
                };

                const expected =
                    'User asked: Hi\n\n' +
                    'Current UI5 Control Context:\n' +
                    '- Type: sap.m.Button\n' +
                    '- ID: saveBtn\n' +
                    'Properties:\n' +
                    '- text: Save\n' +
                    '- enabled: true\n\n' +
                    'Now answer: Hi';

                promptBuilder.buildUserPrompt('Hi', inspectionContext).should.equal(expected);
            });

            it('golden: control + bindings (single, with value)', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Text',
                        id: 'nameLabel',
                        bindings: {
                            text: {
                                path: '/Name',
                                value: 'Alice',
                                model: 'default'
                            }
                        }
                    }
                };

                const expected =
                    'User asked: Q\n\n' +
                    'Current UI5 Control Context:\n' +
                    '- Type: sap.m.Text\n' +
                    '- ID: nameLabel\n' +
                    'Bindings:\n' +
                    '- text ← "/Name" = Alice (model: default)\n\n' +
                    'Now answer: Q';

                promptBuilder.buildUserPrompt('Q', inspectionContext).should.equal(expected);
            });

            it('golden: control + aggregations (empty, small, and large mixed)', function () {
                const inspectionContext = {
                    control: {
                        type: 'sap.m.Page',
                        id: 'page1',
                        aggregations: {
                            own: {
                                data: {
                                    customHeader: [],
                                    content: [
                                        { id: 'btn1', type: 'sap.m.Button' },
                                        { id: 'btn2', type: 'sap.m.Button' }
                                    ],
                                    footer: (function () {
                                        const arr = [];
                                        for (let i = 0; i < 5; i++) {
                                            arr.push({ id: 't' + i, type: 'sap.m.Text' });
                                        }
                                        arr.push({ id: 'b1', type: 'sap.m.Button' });
                                        return arr;
                                    }())
                                }
                            }
                        }
                    }
                };

                const expected =
                    'User asked: Q\n\n' +
                    'Current UI5 Control Context:\n' +
                    '- Type: sap.m.Page\n' +
                    '- ID: page1\n' +
                    'Aggregations:\n' +
                    '- customHeader: empty\n' +
                    '- content: 2 children — btn1, btn2\n' +
                    '- footer: 6 children (sap.m.Text × 5, sap.m.Button × 1)\n\n' +
                    'Now answer: Q';

                promptBuilder.buildUserPrompt('Q', inspectionContext).should.equal(expected);
            });
        });
    });

    // ---- helpers for section-extraction assertions -----------------------------
    // See the top of the file for the extractor helpers used by buildUserPrompt tests above.

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
