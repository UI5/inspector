'use strict';

var AISessionManager = require('../../../app/scripts/modules/ai/AISessionManager.js');

describe('AISessionManager', function () {
    var sessionManager;

    beforeEach(function () {
        sessionManager = new AISessionManager();
    });

    afterEach(function () {
        sessionManager = null;
    });

    describe('Constructor', function () {
        it('should initialize with null port', function () {
            (sessionManager._port === null).should.be.true;
        });

        it('should initialize with empty message handlers', function () {
            Object.keys(sessionManager._messageHandlers).should.have.lengthOf(0);
        });

        it('should initialize with disconnected state', function () {
            sessionManager._isConnected.should.be.false;
        });

        it('should initialize with no active session', function () {
            sessionManager._hasActiveSession.should.be.false;
        });
    });

    describe('#_on() and #_off()', function () {
        it('should register message handler', function () {
            var handler = function () {};
            sessionManager._on('test-type', handler);

            sessionManager._messageHandlers['test-type'].should.equal(handler);
        });

        it('should remove message handler', function () {
            var handler = function () {};
            sessionManager._on('test-type', handler);
            sessionManager._off('test-type');

            (sessionManager._messageHandlers['test-type'] === undefined).should.be.true;
        });
    });

    describe('#_getDefaultSystemPrompt()', function () {
        it('should return base prompt without app info', function () {
            var prompt = sessionManager._getDefaultSystemPrompt();

            prompt.should.contain('AI assistant');
            prompt.should.contain('UI5 Inspector');
            prompt.should.not.contain('Current Application Context');
        });

        it('should include framework info when available', function () {
            var appInfo = {
                common: {
                    data: {
                        SAPUI5: '1.120.0'
                    }
                }
            };

            var prompt = sessionManager._getDefaultSystemPrompt(appInfo);

            prompt.should.contain('Current Application Context');
            prompt.should.contain('Framework: 1.120.0');
        });

        it('should include theme when available', function () {
            var appInfo = {
                configurationComputed: {
                    data: {
                        theme: 'sap_horizon'
                    }
                }
            };

            var prompt = sessionManager._getDefaultSystemPrompt(appInfo);

            prompt.should.contain('Theme: sap_horizon');
        });

        it('should include loaded libraries when available', function () {
            var appInfo = {
                loadedLibraries: {
                    data: {
                        'sap.m': {},
                        'sap.ui.core': {}
                    }
                }
            };

            var prompt = sessionManager._getDefaultSystemPrompt(appInfo);

            prompt.should.contain('Loaded Libraries: sap.m, sap.ui.core');
        });
    });

    describe('#_truncateJson()', function () {
        it('should return JSON string when under limit', function () {
            var data = { key: 'value' };
            var result = sessionManager._truncateJson(data, 1000);

            result.should.contain('"key"');
            result.should.contain('"value"');
        });

        it('should truncate JSON when over limit', function () {
            var largeData = {};
            for (var i = 0; i < 200; i++) {
                largeData['property' + i] = 'value'.repeat(20);
            }

            var result = sessionManager._truncateJson(largeData, 100);

            result.should.contain('[truncated]');
            result.length.should.be.at.most(115);
        });

        it('should handle circular references gracefully', function () {
            var circular = {};
            circular.self = circular;

            var result = sessionManager._truncateJson(circular, 1000);

            result.should.contain('cannot serialize');
        });
    });

    describe('#_formatPrompt()', function () {
        it('should return prompt unchanged when no context', function () {
            var result = sessionManager._formatPrompt('Test prompt', null);

            result.should.equal('Test prompt');
        });

        it('should return prompt unchanged when no control', function () {
            var result = sessionManager._formatPrompt('Test prompt', {});

            result.should.equal('Test prompt');
        });

        it('should add control type and ID', function () {
            var context = {
                control: {
                    type: 'sap.m.Button',
                    id: 'myButton'
                }
            };

            var result = sessionManager._formatPrompt('Test prompt', context);

            result.should.contain('Type: sap.m.Button');
            result.should.contain('ID: myButton');
            result.should.contain('User Question: Test prompt');
        });

        it('should truncate large properties', function () {
            var largeData = {};
            for (var i = 0; i < 200; i++) {
                largeData['property' + i] = 'value'.repeat(20);
            }

            var context = {
                control: {
                    type: 'sap.m.Button',
                    properties: {
                        own: {
                            data: largeData
                        }
                    }
                }
            };

            var result = sessionManager._formatPrompt('Test', context);

            result.should.contain('[truncated]');
        });
    });

    describe('#_buildMessagesArray()', function () {
        it('should include system prompt', function () {
            var messages = sessionManager._buildMessagesArray('Hello', [], null);

            messages[0].role.should.equal('system');
            messages[0].content.should.contain('AI assistant');
        });

        it('should include conversation history', function () {
            var history = [
                { role: 'user', content: 'First question' },
                { role: 'assistant', content: 'First answer' }
            ];

            var messages = sessionManager._buildMessagesArray('Second question', history, null);

            messages.should.have.lengthOf(4);
            messages[1].content.should.equal('First question');
            messages[2].content.should.equal('First answer');
        });

        it('should format user message with context', function () {
            var context = {
                control: {
                    type: 'sap.m.Button',
                    id: 'btn1'
                }
            };

            var messages = sessionManager._buildMessagesArray('What is this?', [], context);

            messages[1].role.should.equal('user');
            messages[1].content.should.contain('Type: sap.m.Button');
            messages[1].content.should.contain('What is this?');
        });

        it('should handle empty conversation history', function () {
            var messages = sessionManager._buildMessagesArray('Hello', null, null);

            messages.should.have.lengthOf(2);
        });
    });

    describe('#hasActiveSession()', function () {
        it('should return false initially', function () {
            sessionManager.hasActiveSession().should.be.false;
        });

        it('should return true after session set', function () {
            sessionManager._hasActiveSession = true;
            sessionManager.hasActiveSession().should.be.true;
        });
    });
});
