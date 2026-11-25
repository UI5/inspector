'use strict';

var utils = require('../../app/scripts/modules/utils/utils.js');
var onConnectListeners = [];
var onMessageListeners = [];

// Stub sendToAll before main.js registers its onMessage listener.
// main.js calls utils.sendToAll(request) on every message — we don't need it for these tests.
sinon.stub(utils, 'sendToAll');

// Set up chrome stub BEFORE requiring main.js.
// Replace window.chrome entirely with a controlled object so we can stub storage.session
// (chrome.storage.session is only available in MV3 service workers, not in Karma/Chrome-Headless).
var sessionStorage = {};
var sessionStub = {
    get: function (key) {
        var result = {};
        if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(sessionStorage, key)) {
            result[key] = sessionStorage[key];
        }
        return Promise.resolve(result);
    },
    set: function (obj) {
        Object.assign(sessionStorage, obj);
        return Promise.resolve();
    }
};

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

// Stub chrome.storage.session.
// chrome.storage exists in Chrome Headless but .session is MV3-only; add it via defineProperty.
if (!window.chrome.storage) {
    window.chrome.storage = {};
}
try {
    Object.defineProperty(window.chrome.storage, 'session', {
        value: sessionStub,
        writable: true,
        configurable: true
    });
} catch (e) {
    window.chrome.storage.session = sessionStub;
}

require('../../app/scripts/background/main.js');

// Helper: flush all pending microtasks (Promise callbacks).
function tick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

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

function sendMessageFrom(action, sender, extra) {
    var msg = { action: action };
    if (extra) {
        Object.keys(extra).forEach(function (k) { msg[k] = extra[k]; });
    }
    onMessageListeners.forEach(function (fn) {
        fn(msg, sender, function () {});
    });
}

describe('background/main.js — devtools port lifecycle', function () {

    beforeEach(function () {
        window.chrome.contextMenus.create.reset();
        window.chrome.contextMenus.removeAll.reset();
        sessionStorage = {};
        // Reinstall the session stub each time: ContextMenu.spec.js replaces window.chrome
        // at module-load time with chrome-stub, which has no storage.session.
        // We ensure storage.session always points to our stub before each test.
        if (!window.chrome.storage) {
            window.chrome.storage = {};
        }
        window.chrome.storage.session = sessionStub;
    });

    it('should call contextMenus.removeAll when devtools port disconnects while UI5 panel is shown', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        sendMessage('on-ui5-devtool-show');
        devtoolsPort._triggerDisconnect();

        return tick().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(1);
        });
    });

    it('should NOT call contextMenus.removeAll when devtools port disconnects but UI5 panel was not shown', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        devtoolsPort._triggerDisconnect();

        return tick().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(0);
        });
    });

    it('should NOT call contextMenus.removeAll on disconnect after user already hid the UI5 panel', function () {
        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        sendMessage('on-ui5-devtool-show');
        sendMessage('on-ui5-devtool-hide');

        return tick().then(function () {
            var callCountAfterHide = window.chrome.contextMenus.removeAll.callCount;
            // Non-vacuous guard: the hide handler must have called removeAll exactly once.
            // Without this assertion, a regressed hide handler (callCountAfterHide === 0)
            // would make the final relative check "0 === 0" trivially true and mask the bug.
            callCountAfterHide.should.equal(1);
            devtoolsPort._triggerDisconnect();

            return tick().then(function () {
                window.chrome.contextMenus.removeAll.callCount.should.equal(callCountAfterHide);
            });
        });
    });

    it('should not interfere with prompt-api port connections', function () {
        var promptPort = makeMockPort('prompt-api');
        var messageListenerAdded = false;
        promptPort.onMessage.addListener = function () { messageListenerAdded = true; };

        onConnectListeners.forEach(function (fn) { fn(promptPort); });

        messageListenerAdded.should.equal(true);
    });

    // ============================================================
    // Storage key round-trip tests
    // ============================================================

    it('should set isUI5PanelShown to true in session storage after on-ui5-devtool-show', function () {
        sendMessage('on-ui5-devtool-show');

        return tick().then(function () {
            sessionStorage.isUI5PanelShown.should.equal(true);
        });
    });

    it('should set isUI5PanelShown to false in session storage after on-ui5-devtool-hide', function () {
        // First show the panel so storage has a true value.
        sendMessage('on-ui5-devtool-show');

        return tick().then(function () {
            sessionStorage.isUI5PanelShown.should.equal(true);
            sendMessage('on-ui5-devtool-hide');

            return tick().then(function () {
                sessionStorage.isUI5PanelShown.should.equal(false);
            });
        });
    });

    // ============================================================
    // Startup-reconciliation tests
    //
    // reconcileContextMenu() is the extracted helper that the startup block calls.
    // It is exposed as window.__ui5InspectorReconcile so tests can seed
    // chrome.storage.session and invoke it directly, covering both branches.
    // ============================================================

    it('startup reconciliation: calls contextMenus.removeAll when isUI5PanelShown is false (orphan cleanup)', function () {
        sessionStorage.isUI5PanelShown = false;

        return window.__ui5InspectorReconcile().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(1);
        });
    });

    it('startup reconciliation: calls contextMenus.removeAll when isUI5PanelShown is unset (orphan cleanup)', function () {
        // sessionStorage is reset in beforeEach — key is absent here.
        return window.__ui5InspectorReconcile().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(1);
        });
    });

    it('startup reconciliation: does NOT call contextMenus.removeAll when isUI5PanelShown is true (menu preserved)', function () {
        sessionStorage.isUI5PanelShown = true;

        return window.__ui5InspectorReconcile().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(0);
        });
    });

    it('disconnect handler: calls removeAll when storage is true (panel was shown)', function () {
        // Pre-seed storage to true (as if the panel was shown before eviction).
        sessionStorage.isUI5PanelShown = true;

        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        devtoolsPort._triggerDisconnect();

        return tick().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(1);
        });
    });

    it('disconnect handler: does NOT call removeAll when storage is false (panel was already hidden)', function () {
        // Pre-seed storage to false (panel was not shown).
        sessionStorage.isUI5PanelShown = false;

        var devtoolsPort = makeMockPort('devtools');
        onConnectListeners.forEach(function (fn) { fn(devtoolsPort); });
        devtoolsPort._triggerDisconnect();

        return tick().then(function () {
            window.chrome.contextMenus.removeAll.callCount.should.equal(0);
        });
    });
});

describe('background/main.js — privileged action sender validation', function () {

    beforeEach(function () {
        if (!window.chrome.scripting) {
            window.chrome.scripting = {};
        }
        if (!window.chrome.runtime) {
            window.chrome.runtime = {};
        }
        window.chrome.runtime.id = 'test-extension-id';
        window.chrome.scripting.executeScript = sinon.spy(function () { return Promise.resolve(); });
        window.chrome.windows = window.chrome.windows || {};
        window.chrome.windows.getCurrent = function () { return Promise.resolve({ id: 1 }); };
        window.chrome.tabs = window.chrome.tabs || {};
        window.chrome.tabs.query = function () { return Promise.resolve([{ id: 1 }]); };
    });

    it('should NOT run script injection for a forged do-script-injection from a page/content origin', function () {
        sendMessageFrom('do-script-injection', { tab: { id: 1 }, id: 'test-extension-id', file: '/x.js' });

        window.chrome.scripting.executeScript.callCount.should.equal(0);
    });

    it('should run script injection for a legitimate do-script-injection from the extension (panel/popup) origin', function () {
        sendMessageFrom('do-script-injection', { id: 'test-extension-id', file: '/x.js' });

        return tick().then(function () {
            window.chrome.scripting.executeScript.callCount.should.be.above(0);
        });
    });

    it('should inject into the inspected tab (message.tabId), not the active tab', function () {
        sendMessageFrom('do-script-injection',
            { id: 'test-extension-id' },
            { tabId: 202, file: '/x.js' });

        return tick().then(function () {
            window.chrome.scripting.executeScript.callCount.should.be.above(0);
            var arg = window.chrome.scripting.executeScript.firstCall.args[0];
            arg.target.tabId.should.equal(202);
        });
    });

    it('should fall back to the active tab when no tabId is supplied', function () {
        sendMessageFrom('do-script-injection',
            { id: 'test-extension-id' },
            { file: '/x.js' });

        return tick().then(function () {
            window.chrome.scripting.executeScript.callCount.should.be.above(0);
            var arg = window.chrome.scripting.executeScript.firstCall.args[0];
            arg.target.tabId.should.equal(1);
        });
    });
});
