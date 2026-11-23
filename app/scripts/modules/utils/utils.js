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
 * Send message to all ports listening.
 * @param {Object} message
 */
function _sendToAll(message, callback) {
    var frameId = message.frameId;
    var options;
    chrome.windows.getCurrent().then(w => {
        chrome.tabs.query({ active: true, windowId: w.id }).then(tabs => {
            if (!tabs.length) {
                return;
            }
            // options.frameId allows to send the message to
            // a specific frame instead of all frames in the tab
            if (frameId !== undefined) {
                options = { frameId };
            }
            // Without a callback, chrome.tabs.sendMessage returns a promise. Every runtime
            // message is rebroadcast through here, so broadcasts routinely reach frames with no
            // content-script listener (cross-origin iframes, not-yet-injected frames). That
            // rejects with "Could not establish connection. Receiving end does not exist." — a
            // benign, expected outcome for a broadcast, so swallow it rather than leave an
            // unhandled rejection. With a callback, Chrome signals the same condition via
            // chrome.runtime.lastError; read it so it is not logged as an unchecked error.
            if (callback) {
                chrome.tabs.sendMessage(tabs[0].id, message, options, function (response) {
                    void chrome.runtime.lastError;
                    callback(response);
                });
            } else {
                chrome.tabs.sendMessage(tabs[0].id, message, options).catch(function () {});
            }
        });
    });
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
    sendToAll: _sendToAll
};
