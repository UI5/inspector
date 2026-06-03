(function () {
    'use strict';
    var utils = require('../modules/utils/utils.js');
    var port = utils.getPort();

    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('/scripts/injected/detectWebComponents.js');
    document.head.appendChild(script);

    script.onload = function () {
        script.parentNode.removeChild(script);
    };

    // Bridge messages from background/panel to the injected webcMain.js script
    port.onMessage(function (message) {
        if (message.action === 'do-webc-detection') {
            document.dispatchEvent(new CustomEvent('do-webc-detection-injected'));
            return;
        }

        // Forward all actions to injected script via CustomEvent
        // (webcMain.js ignores actions it doesn't handle)
        document.dispatchEvent(new CustomEvent('ui5-communication-with-injected-script', {
            detail: message
        }));
    });

    // Bridge messages from injected webcMain.js back to background
    document.addEventListener('ui5-communication-with-content-script', function (event) {
        port.postMessage(event.detail);
    }, false);

    // Keep the detection bridge
    document.addEventListener('detect-webc-content', function (event) {
        port.postMessage(event.detail);
    }, false);
}());
