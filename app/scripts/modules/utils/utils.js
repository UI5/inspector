'use strict';

/**
 * @typedef {Object} resolveMessageOptions
 * @property {Object} message - port.onMessage.addListener parameter
 * @property {Object} messageSender - port.onMessage.addListener parameter
 * @property {Object} sendResponse - port.onMessage.addListener parameter
 * @property {Object} actions - Object with all the needed actions as methods
 */

/**
 * Calls the needed message action.
 * @param {resolveMessageOptions} options
 * @private
 */
function _resolveMessage(options) {
    if (!options) {
        return;
    }

    var message = options.message;
    var messageSender = options.messageSender;
    var sendResponse = options.sendResponse;
    var actions = options.actions;
    var messageHandlerFunction = actions[message.action];

    // Optional, opt-in sender policy. When privilegedActions names this
    // message's action, it is dispatched only if isTrustedSender approves the
    // sender. Callers that pass no policy dispatch every action, so existing
    // callers are unaffected.
    var privilegedActions = options.privilegedActions;
    if (privilegedActions && privilegedActions.indexOf(message.action) !== -1) {
        if (typeof options.isTrustedSender !== 'function' || !options.isTrustedSender(messageSender)) {
            return;
        }
    }

    if (messageHandlerFunction) {
        messageHandlerFunction(message, messageSender, sendResponse);
    }
}

/**
 * Convert UI5 timestamp to readable date.
 * @param {string} timeStamp  - timestamp in UI5 format ("20150427-1201")
 * @returns {string|undefined}
 * @private
 */
function _convertUI5TimeStampToHumanReadableFormat(timeStamp) {
    var formattedTime = '';

    if (!timeStamp) {
        return;
    }

    timeStamp = timeStamp.replace(/-/g, '');

    // Year
    formattedTime += timeStamp.substr(0, 4) + '/';
    // Month
    formattedTime += timeStamp.substr(4, 2) + '/';
    // Date
    formattedTime += timeStamp.substr(6, 2);

    formattedTime += ' ';

    // Hour
    formattedTime += timeStamp.substr(8, 2) + ':';
    // Minutes
    formattedTime += timeStamp.substr(10, 2) + 'h';

    return formattedTime;
}

/**
 * Set specific class for each OS.
 * @private
 */
function _setOSClassNameToBody() {
    // Set a body attribute for detecting and styling according the OS
    var osName = '';
    if (navigator.appVersion.indexOf('Win') !== -1) {
        osName = 'windows';
    }
    if (navigator.appVersion.indexOf('Mac') !== -1) {
        osName = 'mac';
    }
    if (navigator.appVersion.indexOf('Linux') !== -1) {
        osName = 'linux';
    }

    document.querySelector('body').setAttribute('os', osName);
}

/**
 * Applies the theme. Default is light.
 * @private
 */
function _applyTheme(theme) {
    var oldLink = document.getElementById('ui5inspector-theme');
    var head = document.getElementsByTagName('head')[0];
    var link = document.createElement('link');
    var url = '/styles/themes/light/light.css';

    if (oldLink) {
        oldLink.remove();
    }

    if (theme === 'dark') {
        url = '/styles/themes/dark/dark.css';
    }

    link.id = 'ui5inspector-theme';
    link.rel = 'stylesheet';
    link.href = url;

    head.appendChild(link);
}

function _isObjectEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

function _getPort () {
    return {
        postMessage: function (message, callback) {
            chrome.runtime.sendMessage(message, callback);
        },
        onMessage: function (callback) {
            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                callback(request, sender, sendResponse);
            });
        }
    };
}

/**
 * Send message to the inspected tab (or the active tab as a fallback).
 *
 * When the message carries a tabId (the DevTools panel sets it to
 * inspectedWindow.tabId), the message is delivered to that specific tab so
 * routing stays bound to the tab actually being inspected. Callers that don't
 * supply a tabId (e.g. the frame-ping loop) keep the legacy active-tab
 * behaviour.
 * @param {Object} message
 */
function _sendToAll(message, callback) {
    var frameId = message.frameId;
    var options;

    function dispatch(tabId) {
        // options.frameId allows to send the message to
        // a specific frame instead of all frames in the tab
        if (frameId !== undefined) {
            options = { frameId };
        }
        chrome.tabs.sendMessage(tabId, message, options, callback);
    }

    if (message.tabId !== undefined) {
        dispatch(message.tabId);
        return;
    }

    chrome.windows.getCurrent().then(w => {
        chrome.tabs.query({ active: true, windowId: w.id }).then(tabs => {
            dispatch(tabs[0].id);
        });
    });
}

// Actions the injected script may relay into the extension through the
// content-script CustomEvent bridge. Anything not listed is dropped at the
// relay and never reaches the background service worker.
var PAGE_RELAY_ACTIONS = [
    'on-application-dom-update',
    'on-application-dom-update-webc',
    'on-console-errors-updated',
    'on-contextMenu-control-select',
    'on-control-select',
    'on-control-select-elements-registry',
    'on-event-update',
    'on-framework-information',
    'on-receiving-elements-registry-refresh-data',
    'on-receiving-initial-data',
    'on-receiving-initial-data-webc',
    'on-right-click'
];

/**
 * Whether a page-dispatched action is allowed to be relayed into the extension.
 * @param {string} action
 * @returns {boolean}
 * @private
 */
function _isRelayableAction(action) {
    return PAGE_RELAY_ACTIONS.indexOf(action) !== -1;
}

module.exports = {
    formatter: {
        convertUI5TimeStampToHumanReadableFormat: _convertUI5TimeStampToHumanReadableFormat
    },
    resolveMessage: _resolveMessage,
    setOSClassName: _setOSClassNameToBody,
    applyTheme: _applyTheme,
    isObjectEmpty: _isObjectEmpty,
    getPort: _getPort,
    sendToAll: _sendToAll,
    isRelayableAction: _isRelayableAction
};
