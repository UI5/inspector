'use strict';

var utils = require('../../modules/utils/utils.js');

// Create a port with background page for continuous message communication
var messagePort = utils.getPort();

// Persistent connection so the background knows when DevTools close
chrome.runtime.connect({ name: 'devtools' });

/**
 * Find the ID of the nearest UI5 control from the current selected element in Chrome elements panel.
 * @param {string} selectedElement - The ID of the selected element in Chrome elements panel
 * @returns {string} The ID of the nearest UI5 Control from the selectedElement
 * @private
 */
function _getNearestUI5ControlID(selectedElement) {
    var element = selectedElement;
    while (!element.getAttribute('data-sap-ui')) {
        if (element.nodeName === 'BODY') {
            return undefined;
        }
        element = element.parentNode;
    }
    return element.id;
}

chrome.devtools.panels.create('UI5', '/images/icon-128.png', '/html/panel/ui5/index.html', function (panel) {
    panel.onHidden.addListener(function () {
        messagePort.postMessage({
            action: 'on-hide-highlight'
        });
        messagePort.postMessage({
            action: 'on-ui5-devtool-hide'
        });
    });
    panel.onShown.addListener(function () {
        messagePort.postMessage({
            action: 'on-ui5-devtool-show'
        });
    });
});

chrome.devtools.panels.elements.onSelectionChanged.addListener(function () {
    // To get the selected element in Chrome elements panel, is needed to use eval and call the function with $0 parameter
    var getNearestUI5Control = _getNearestUI5ControlID.toString() + '_getNearestUI5ControlID($0);';

    /* JSHINT evil: true */
    chrome.devtools.inspectedWindow.eval(getNearestUI5Control, {useContentScriptContext: true}, function (elementId) {
        if (elementId === undefined) {
            return;
        }

        messagePort.postMessage({
            action: 'on-select-ui5-control-from-element-tab',
            nearestUI5Control: elementId
        });
    });
    /* JSHINT evil: false */
});
