(function () {
    'use strict';
    var utils = require('../modules/utils/utils.js');
    var port = utils.getPort();

    // Guard against double injection (e.g. when DevTools are undocked and
    // re-docked). Without it, a second injection would register duplicate
    // port/CustomEvent listeners and every message would be handled twice.
    // Mirrors the DONE_FLAG pattern in content/main.js.
    var DONE_FLAG = 'WEBC_MAIN_SCRIPT_INJECTION_DONE';
    if (window[DONE_FLAG] === true) {
        return;
    }
    window[DONE_FLAG] = true;

    // Forward messages from the background/panel to the MAIN-world script.
    port.onMessage(function (message) {
        document.dispatchEvent(new CustomEvent('ui5-communication-with-injected-script', {
            detail: message
        }));
    });

    // Forward messages from the MAIN-world script back to the background.
    document.addEventListener('ui5-communication-with-content-script', function (event) {
        // Only relay allowlisted page-originated actions; a hostile page can
        // dispatch this CustomEvent with any action.
        if (!event.detail || !utils.isRelayableAction(event.detail.action)) {
            return;
        }
        port.postMessage(event.detail);
    }, false);
}());
