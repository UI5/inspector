'use strict';

var utils = require('../../../app/scripts/modules/utils/utils.js');

var messageAction = {
    /**
     * Mock function for the unit test purpose.
     * @param {Object} message
     */
    'mock-action': function (message) {
        return console.log('Message resolver is working');
    }
};

describe('utils', function () {
    it('should exists', function () {
        utils.should.be.a('object');
    });

    describe('#formatter', function () {
        it('should be an object', function () {
            utils.formatter.should.be.a('object');
        });
    });

    describe('#formatter.convertUI5TimeStampToHumanReadableFormat()', function () {
        it('should re-format UI5 timestamp to human readable format', function () {
            utils.formatter.convertUI5TimeStampToHumanReadableFormat('201508171459').should.be.equal('2015/08/17 14:59h');
        });
    });

    describe('#resolveMessage()', function () {
        var spyConsole;

        beforeEach(function () {
            spyConsole = sinon.spy(console, 'log');
        });

        afterEach(function () {
            console.log.restore();
        });

        it('should resolve the action that is needed from a message', function () {
            utils.resolveMessage({
                message: {
                    action: 'mock-action'
                },
                messageSender: 'messageSender',
                sendResponse: 'sendResponse',
                actions: messageAction
            });

            spyConsole.callCount.should.equal(1);
        });

        it('should do nothing if no parameters are provided', function () {
            utils.resolveMessage();

            spyConsole.callCount.should.equal(0);
        });

        it('should do nothing if the parameter contains unknown action', function () {
            utils.resolveMessage({
                message: {
                    action: 'other-mock-action'
                },
                messageSender: 'messageSender',
                sendResponse: 'sendResponse',
                actions: messageAction
            });

            spyConsole.callCount.should.equal(0);
        });

        it('should dispatch a privileged action when the sender is trusted', function () {
            utils.resolveMessage({
                message: { action: 'mock-action' },
                messageSender: { id: 'ext-id' },
                actions: messageAction,
                privilegedActions: ['mock-action'],
                isTrustedSender: function () { return true; }
            });

            spyConsole.callCount.should.equal(1);
        });

        it('should NOT dispatch a privileged action when the sender is untrusted', function () {
            utils.resolveMessage({
                message: { action: 'mock-action' },
                messageSender: { tab: { id: 7 } },
                actions: messageAction,
                privilegedActions: ['mock-action'],
                isTrustedSender: function () { return false; }
            });

            spyConsole.callCount.should.equal(0);
        });

        it('should dispatch any action when no policy is provided (default-allow)', function () {
            utils.resolveMessage({
                message: { action: 'mock-action' },
                messageSender: { tab: { id: 7 } },
                actions: messageAction
            });

            spyConsole.callCount.should.equal(1);
        });

    });

    describe('#isRelayableAction()', function () {
        it('should allow a legitimate page-originated action', function () {
            utils.isRelayableAction('on-control-select').should.equal(true);
        });

        it('should allow the WebC tree-update actions', function () {
            utils.isRelayableAction('on-application-dom-update-webc').should.equal(true);
            utils.isRelayableAction('on-receiving-initial-data-webc').should.equal(true);
        });

        it('should reject a privileged action forged by the page', function () {
            utils.isRelayableAction('do-script-injection').should.equal(false);
        });

        it('should reject an unknown action', function () {
            utils.isRelayableAction('totally-made-up').should.equal(false);
        });
    });

    describe('#sendToAll()', function () {
        var originalChrome;
        var sendMessageSpy;

        beforeEach(function () {
            // background/main.spec.js stubs utils.sendToAll at module load and
            // never restores it; restore the real implementation so these tests
            // exercise the actual routing logic.
            if (utils.sendToAll.restore) {
                utils.sendToAll.restore();
            }
            originalChrome = window.chrome;
            sendMessageSpy = sinon.spy();
            window.chrome = {
                windows: {
                    getCurrent: function () { return Promise.resolve({ id: 1 }); }
                },
                tabs: {
                    // Active-tab fallback resolves to tab id 99.
                    query: function () { return Promise.resolve([{ id: 99 }]); },
                    sendMessage: sendMessageSpy
                }
            };
        });

        afterEach(function () {
            window.chrome = originalChrome;
            // Re-stub so other specs that assume sendToAll is a no-op (e.g.
            // background/main.spec.js's port-lifecycle tests) are unaffected by
            // test ordering.
            if (!utils.sendToAll.restore) {
                sinon.stub(utils, 'sendToAll');
            }
        });

        it('should deliver to message.tabId (the inspected tab) when provided', function () {
            utils.sendToAll({ action: 'do-control-select', tabId: 202 });
            // Synchronous path — no active-tab query needed.
            sendMessageSpy.callCount.should.equal(1);
            sendMessageSpy.firstCall.args[0].should.equal(202);
        });

        it('should fall back to the active tab when no tabId is provided', function () {
            utils.sendToAll({ action: 'do-ping' });
            return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
                sendMessageSpy.callCount.should.equal(1);
                sendMessageSpy.firstCall.args[0].should.equal(99);
            });
        });

        it('should pass the frameId through as an option', function () {
            utils.sendToAll({ action: 'do-control-select', tabId: 202, frameId: 7 });
            sendMessageSpy.firstCall.args[2].should.deep.equal({ frameId: 7 });
        });
    });

    describe('#setOSClassName()', function () {
        var navigatorAppVersionInitialValue = navigator.appVersion;

        beforeEach(function () {
        });

        afterEach(function () {
            navigator.__defineGetter__('appVersion', function () {
                return navigatorAppVersionInitialValue;
            });
        });

        it('should add attribute os="windows" on Windows', function () {
            navigator.__defineGetter__('appVersion', function () {
                return 'Win';
            });

            utils.setOSClassName();

            document.querySelector('body').getAttribute('os').should.equal('windows');
        });

        it('should add attribute os="mac" on OSx', function () {
            navigator.__defineGetter__('appVersion', function () {
                return 'Mac';
            });

            utils.setOSClassName();

            document.querySelector('body').getAttribute('os').should.equal('mac');
        });

        it('should add attribute os="linux" on Linux', function () {
            navigator.__defineGetter__('appVersion', function () {
                return 'Linux';
            });

            utils.setOSClassName();

            document.querySelector('body').getAttribute('os').should.equal('linux');
        });
    });

    describe('#applyTheme()', function () {

        it('should change theme', function () {

            utils.applyTheme('dark');

            expect(document.getElementById('ui5inspector-theme').href).to.have.string('/styles/themes/dark/dark.css');

            utils.applyTheme('light');

            expect(document.getElementById('ui5inspector-theme').href).to.have.string('/styles/themes/light/light.css');
        });
    });

    describe('#getPort()', function () {

        it('should return port object', function () {

            var port = utils.getPort('dark');

            port.onMessage.should.be.a('function');
            port.postMessage.should.be.a('function');
        });
    });
});
