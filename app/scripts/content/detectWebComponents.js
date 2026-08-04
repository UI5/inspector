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

    // Listen for detection requests from the panel and forward to the
    // injected detector.
    port.onMessage(function (message) {
        if (message.action === 'do-webc-detection') {
            document.dispatchEvent(new CustomEvent('do-webc-detection-injected'));
        }
    });

    // Forward the detection result from the injected detector to the background.
    document.addEventListener('detect-webc-content', function (event) {
        port.postMessage(event.detail);
    }, false);
}());
