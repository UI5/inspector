(function () {
    'use strict';
    var utils = require('../modules/utils/utils.js');
    var highLighterModule = require('../modules/content/highLighter.js');
    var highLighter = highLighterModule.create();
    var port = utils.getPort();

    function confirmScriptInjectionDone() {
        // Add this action to the Q
        // This is needed when the devtools are undocked from the current inspected window
        setTimeout(function () {
            port.postMessage({
                action: 'on-main-script-injection'
            });
        }, 0);
    }

    var DONE_FLAG = 'MAIN_SCRIPT_INJECTION_DONE';
    if (window[DONE_FLAG] === true) {
        confirmScriptInjectionDone();
        return;
    }

    // Inject needed scripts into the inspected page
    // ================================================================================

    /**
     * Inject javascript file into the page.
     * @param {string} source - file path
     * @callback
     */
    var injectScript = function (source, callback) {
        var script = document.createElement('script');
        script.src = chrome.runtime.getURL(source);
        document.head.appendChild(script);

        /**
         * Delete the injected file, when it is loaded.
         */
        script.onload = function () {
            script.parentNode.removeChild(script);

            if (callback) {
                callback();
            }
        };
    };

    injectScript('vendor/ToolsAPI.js', function () {
        injectScript('scripts/injected/main.js', function () {
            window[DONE_FLAG] = true;
            confirmScriptInjectionDone();
        });
    });

    // ================================================================================
    // Communication
    // ================================================================================

    /**
     * Send message to injected script.
     * @param {Object} message
     */
    var sendCustomMessageToInjectedScript = function (message) {
        document.dispatchEvent(new CustomEvent('ui5-communication-with-injected-script', {
            detail: message
        }));
    };

    // Name space for message handler functions.
    var messageHandler = {

        /**
         * Changes the highlighter position and size,
         * when an element from the ControlTree is hovered.
         * @param {Object} message
         */
        'on-control-tree-hover': function (message) {
            highLighter.setDimensions(document.getElementById(message.target));
        },

        'on-hide-highlight': function () {
            highLighter.hide();
        },

        'do-ping': function (message, messageSender, sendResponse) {
            // respond to ping
            sendResponse(true /* alive status */);
        }
    };

    // Listen for messages from the background page
    port.onMessage(function (message, messageSender, sendResponse) {
        // Resolve incoming messages
        utils.resolveMessage({
            message: message,
            messageSender: messageSender,
            sendResponse: sendResponse,
            actions: messageHandler
        });

        // Send events to injected script
        sendCustomMessageToInjectedScript(message);
    });

    /**
     * Listener for messages from the injected script.
     */
    document.addEventListener('ui5-communication-with-content-script', function sendEvent(detectEvent) {
        // Send the received event detail object to background page
        port.postMessage(detectEvent.detail);
    }, false);
}());
