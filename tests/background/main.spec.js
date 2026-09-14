'use strict';

var utils = require('../../app/scripts/modules/utils/utils.js');
var onConnectListeners = [];
var onMessageListeners = [];

// Stub sendToAll before main.js registers its onMessage listener.
// main.js calls utils.sendToAll(request) on every message — we don't need it for these tests.
sinon.stub(utils, 'sendToAll');

// Set up chrome stub BEFORE requiring main.js
if (!window.chrome) {
    window.chrome = {};
}
window.chrome.contextMenus = {
    create: sinon.spy(),
    removeAll: sinon.spy(),
    onClicked: { addListener: function () {} }
};
window.chrome.action = {
    disable: function () {},
    enable: function () {},
    setTitle: function () {}
};
window.chrome.runtime = {
    onMessage: { addListener: function (fn) { onMessageListeners.push(fn); } },
    onConnect: { addListener: function (fn) { onConnectListeners.push(fn); } },
    onInstalled: { addListener: function () {} },
    sendMessage: function () {},
    id: 'test-extension-id'
};
window.chrome.windows = {
    getCurrent: function () { return Promise.resolve({ id: 1 }); }
};
window.chrome.tabs = {
    query: function () { return Promise.resolve([{ id: 1 }]); },
    sendMessage: function () {}
};
window.chrome.scripting = {
    executeScript: function () { return Promise.resolve(); }
};

require('../../app/scripts/background/main.js');

function makeMockPort(name) {
    var disconnectListeners = [];
    return {
        name: name,
        onMessage: { addListener: function () {} },
        onDisconnect: {
            addListener: function (fn) { disconnectListeners.push(fn); }
        },
        _triggerDisconnect: function () {
            disconnectListeners.forEach(function (fn) { fn(); });
        }
    };
}

function sendMessage(action) {
    var msg = { action: action };
    onMessageListeners.forEach(function (fn) {
        fn(msg, { tab: { id: 1 } }, function () {});
    });
}

describe('background/main.js — devtools port lifecycle', function () {

    beforeEach(function () {
        window.chrome.contextMenus.create.reset();
        window.chrome.contextMenus.removeAll.reset();
    });

    it('should call contextMenus.removeAll when devtools port disconnects while UI5 panel is shown', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        sendMessage('on-ui5-devtool-show');
        devtoolsPort._triggerDisconnect();

        window.chrome.contextMenus.removeAll.callCount.should.equal(1);
    });

    it('should NOT call contextMenus.removeAll when devtools port disconnects but UI5 panel was not shown', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        devtoolsPort._triggerDisconnect();

        window.chrome.contextMenus.removeAll.callCount.should.equal(0);
    });

    it('should NOT call contextMenus.removeAll on disconnect after user already hid the UI5 panel', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        sendMessage('on-ui5-devtool-show');
        sendMessage('on-ui5-devtool-hide');
        var callCountAfterHide = window.chrome.contextMenus.removeAll.callCount;

        devtoolsPort._triggerDisconnect();

        window.chrome.contextMenus.removeAll.callCount.should.equal(callCountAfterHide);
    });

    it('should not interfere with prompt-api port connections', function () {
        var promptPort = makeMockPort('prompt-api');
        var messageListenerAdded = false;
        promptPort.onMessage.addListener = function () { messageListenerAdded = true; };

        onConnectListeners.forEach(function (fn) { fn(promptPort); });

        messageListenerAdded.should.equal(true);
    });
});
