(function () {
    'use strict';

    /**
     * Create an object witch the initial needed information from the UI5 availability check.
     * @returns {Object}
     */
    function createResponseToContentScript() {
        var responseToContentScript = Object.create(null);
        var responseToContentScriptBody;
        var frameworkName;
        var frameworkVersion;
        var versionInfo;

        responseToContentScript.detail = Object.create(null);
        responseToContentScriptBody = responseToContentScript.detail;

        if (window.sap && window.sap.ui) {
            responseToContentScriptBody.action = 'on-ui5-detected';
            responseToContentScriptBody.framework = Object.create(null);

            // Get framework name and version from getVersionInfo()
            try {
                versionInfo = sap.ui.getVersionInfo();
            } catch (e) {
                versionInfo = null;
            }

            // Framework name: prefer the dedicated framework/name property (already
            // a clean label), fall back to GAV for Maven builds where name detection
            // requires an indexOf check.
            frameworkName = versionInfo && versionInfo.framework && versionInfo.framework.name;
            if (frameworkName) {
                responseToContentScriptBody.framework.name = frameworkName;
            } else if (versionInfo && versionInfo.gav) {
                responseToContentScriptBody.framework.name = versionInfo.gav.indexOf('openui5') !== -1 ? 'OpenUI5' : 'SAPUI5';
            } else {
                responseToContentScriptBody.framework.name = 'UI5';
            }

            // Framework version: prefer the version from getVersionInfo(),
            // fall back to the core configuration when it is not available.
            frameworkVersion = versionInfo && versionInfo.framework && versionInfo.framework.version;
            if (frameworkVersion) {
                responseToContentScriptBody.framework.version = frameworkVersion;
            } else {
                try {
                    responseToContentScriptBody.framework.version = sap.ui.getCore().getConfiguration().getVersion().toString();
                } catch (e) {
                    responseToContentScriptBody.framework.version = '';
                }
            }

            // Check if the version is supported
            responseToContentScriptBody.isVersionSupported = !!sap.ui.require;

        } else {
            responseToContentScriptBody.action = 'on-ui5-not-detected';
        }

        return responseToContentScript;
    }

    // Send information to content script
    document.dispatchEvent(new CustomEvent('detect-ui5-content', createResponseToContentScript()));

    // Listens for event from injected script
    document.addEventListener('do-ui5-detection-injected', function () {
        document.dispatchEvent(new CustomEvent('detect-ui5-content', createResponseToContentScript()));
    }, false);
}());
