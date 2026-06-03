(function () {
    'use strict';

    function _extractVersion(meta) {
        if (!meta) {
            return '';
        }
        try {
            var runtimesData = meta.getAttribute('data-ui5-shared-resources-runtimes');
            if (!runtimesData) {
                return '';
            }
            var runtimes = JSON.parse(runtimesData);
            if (runtimes.length > 0 && runtimes[0].version) {
                return runtimes[0].version;
            }
        } catch (e) {
            // version extraction is best-effort
        }
        return '';
    }

    function _hasUI5WebComponents(meta) {
        if (meta) {
            return true;
        }
        var allElements = document.querySelectorAll('*');
        for (var i = 0; i < allElements.length; i++) {
            var localName = allElements[i].localName;
            if (localName.indexOf('ui5-') === 0 && window.customElements.get(localName)) {
                return true;
            }
        }
        return false;
    }

    function createResponseToContentScript() {
        var responseToContentScript = Object.create(null);
        responseToContentScript.detail = Object.create(null);
        var body = responseToContentScript.detail;

        var meta = document.querySelector('meta[name="ui5-shared-resources"]');
        var hasWebComponents = _hasUI5WebComponents(meta);

        if (hasWebComponents) {
            body.action = 'on-webc-detected';
            body.framework = Object.create(null);
            body.framework.name = 'UI5 Web Components';
            body.framework.version = _extractVersion(meta);
            body.isVersionSupported = true;
        } else {
            body.action = 'on-webc-not-detected';
        }

        return responseToContentScript;
    }

    document.dispatchEvent(new CustomEvent('detect-webc-content', createResponseToContentScript()));

    document.addEventListener('do-webc-detection-injected', function () {
        document.dispatchEvent(new CustomEvent('detect-webc-content', createResponseToContentScript()));
    }, false);
}());
