/**
 * UI5 Web Components — page-side script for the UI5 Inspector.
 *
 * Runs in the inspected page's MAIN world (injected by the background
 * service worker via chrome.scripting.executeScript with world: 'MAIN').
 * Running in MAIN is required to see the framework's classes and the
 * isUI5Element getter on elements; the chrome.* APIs are not used here.
 *
 * Communication
 * -------------
 * Page <-> DevTools panel messages are bridged via CustomEvents on
 * `document`, forwarded by content/detectWebComponents.js (isolated world):
 *
 *   panel  -- port.postMessage -->  background
 *   background  -- chrome.tabs.sendMessage -->  content/detectWebComponents.js
 *   content  -- CustomEvent('ui5-communication-with-injected-script') -->  this script
 *   this script  -- CustomEvent('ui5-communication-with-content-script') -->  content
 *   content  -- port.postMessage -->  background  -->  panel
 *
 * Action names
 * ------------
 *  - `*-webc` actions are WebC-specific (e.g. get-initial-information-webc).
 *  - Shared actions (do-control-select, do-control-focus,
 *    do-copy-control-to-console, do-control-copy-html, do-control-property-change,
 *    on-control-tree-hover, on-hide-highlight, do-context-menu-control-select)
 *    are also handled by injected/main.js for classic UI5. Each handler
 *    here guards on WebCToolsAPI.getElementById, so the two coexist
 *    cleanly on mixed pages: only the script that recognises the id
 *    responds.
 *
 * Introspection is delegated to window.__ui5WebComponentsToolsAPI
 * (defined in vendor/WebComponentsToolsAPI.js, injected just before this
 * script). The control tree is rebuilt on DOM mutations, debounced to
 * collapse rapid bursts (e.g. animations) into a single update.
 */
(function () {
    'use strict';

    var WebCToolsAPI = window.__ui5WebComponentsToolsAPI;
    if (!WebCToolsAPI) {
        return;
    }

    var message = require('../modules/injected/message.js');
    var highLighterModule = require('../modules/content/highLighter.js');
    // Use a distinct wrapper id so this instance doesn't collide with the
    // classic content-script highlighter on mixed pages.
    var highlighter = highLighterModule.create({ wrapperId: 'ui5-highlighter-webc' });

    var TREE_UPDATE_DEBOUNCE_MS = 150;

    // Build the section title HTML used by all DataView formatters
    function _buildSectionTitle(controlId, controlName) {
        return '#<span class="controlId" data-control-id="' + controlId + '">' + controlId +
            '</span><span gray>(' + controlName + ')</span>';
    }

    // Format properties for the DataView panel
    function _formatProperties(controlId, properties) {
        if (!properties || !properties.own) {
            return {};
        }

        var title = properties.own.meta.controlName;
        var props = properties.own.properties;
        var formattedProps = Object.create(null);
        var types = Object.create(null);

        for (var key in props) {
            formattedProps[key] = Object.create(null);
            formattedProps[key].value = props[key].value;
            // No `isDefault`: see the note in WebComponentsToolsAPI.js.
            // DataView omits the "(default)" badge when this is absent.
            types[key] = props[key].type || 'string';
        }

        var result = Object.create(null);
        result.isPropertiesData = true;
        result.own = {
            options: {
                controlId: controlId,
                expandable: false,
                expanded: true,
                title: _buildSectionTitle(controlId, title),
                editableValues: true
            },
            data: formattedProps,
            types: types
        };
        return result;
    }

    // Format aggregations (slots) for the DataView panel
    function _formatAggregations(controlId, aggregations) {
        if (!aggregations || !aggregations.own) {
            return {};
        }

        var title = aggregations.own.meta.controlName;
        var slots = aggregations.own.aggregations;
        var formattedSlots = Object.create(null);

        for (var key in slots) {
            formattedSlots[key] = {
                options: {
                    title: key,
                    expandable: true,
                    expanded: !!slots[key].value,
                    editableValues: false,
                    showTypeInfo: true
                },
                data: {
                    'content (id)': slots[key].value,
                    'slot type': slots[key].type
                }
            };
        }

        var result = Object.create(null);
        result.own = {
            options: {
                controlId: controlId,
                expandable: false,
                expanded: true,
                title: _buildSectionTitle(controlId, title),
                editableValues: false
            },
            data: formattedSlots
        };
        return result;
    }

    // Format events for the DataView panel
    function _formatEvents(controlId, events) {
        if (!events || !events.own) {
            return {};
        }

        var title = events.own.meta.controlName;
        var evts = events.own.events;
        var formattedEvents = Object.create(null);

        for (var key in evts) {
            formattedEvents[key] = Object.create(null);
        }

        var result = Object.create(null);
        result.own = {
            options: {
                controlId: controlId,
                expandable: false,
                expanded: true,
                title: _buildSectionTitle(controlId, title),
                editableValues: false
            },
            data: formattedEvents
        };
        return result;
    }

    // Build a single DataView section: {options, data}. Used by the App Info
    // tab, which expects this shape per section (see classic UI5's
    // applicationUtils.getApplicationInfo()).
    function _section(title, data, expanded) {
        return {
            options: {
                title: title,
                expandable: true,
                expanded: expanded !== false
            },
            data: data
        };
    }

    // Stringify a configuration value for display in the App Info tab.
    function _formatConfigValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (e) {
                return String(value);
            }
        }
        return value;
    }

    // Build application info in the same shape as classic UI5's
    // applicationUtils.getApplicationInfo(). Surfaces what the framework
    // exposes through `meta.Runtimes` (see packages/base/src/Runtimes.ts):
    // configuration (theme, language, timezone, ...), registered tags and
    // features, and a list of runtimes when more than one is active on the
    // page.
    // --- App Info section builders. Each returns a {options, data} section
    // or null if there's nothing to report. ---

    function _generalSection(common) {
        var general = {};
        general[common.frameworkName] = common.version || '(unknown)';
        if (common.description) {
            general.Description = common.description;
        }
        general['User Agent'] = navigator.userAgent;
        general.Application = location.href;
        return _section('General', general);
    }

    function _configurationSection(configuration) {
        if (!configuration) {
            return null;
        }
        var keys = Object.keys(configuration);
        if (!keys.length) {
            return null;
        }
        var data = {};
        for (var i = 0; i < keys.length; i++) {
            data[keys[i]] = _formatConfigValue(configuration[keys[i]]);
        }
        return _section('Configuration', data);
    }

    // Flatten an array into a 1-based-indexed map for DataView display.
    function _listAsIndexedMap(arr) {
        var data = {};
        for (var i = 0; i < arr.length; i++) {
            data[i + 1] = arr[i];
        }
        return data;
    }

    function _registeredTagsSection(tags) {
        if (!Array.isArray(tags) || !tags.length) {
            return null;
        }
        return _section('Registered tags (' + tags.length + ')', _listAsIndexedMap(tags), false);
    }

    function _registeredFeaturesSection(features) {
        if (!Array.isArray(features) || !features.length) {
            return null;
        }
        return _section('Registered features (' + features.length + ')', _listAsIndexedMap(features), false);
    }

    function _interopSection(primary) {
        if (typeof primary.openUI5Detected !== 'boolean') {
            return null;
        }
        var interop = {};
        interop['OpenUI5 detected'] = primary.openUI5Detected;
        if (typeof primary.openUI5LoadedFirst === 'boolean') {
            interop['OpenUI5 loaded first'] = primary.openUI5LoadedFirst;
        }
        return _section('Interop', interop);
    }

    function _runtimesSection(runtimes) {
        if (runtimes.length <= 1) {
            return null;
        }
        var data = {};
        for (var r = 0; r < runtimes.length; r++) {
            var rt = runtimes[r];
            data[r + 1] = (rt.alias ? rt.alias + ' — ' : '') +
                (rt.description || ('version ' + (rt.version || 'unknown')));
        }
        return _section('Runtimes (' + runtimes.length + ')', data);
    }

    // Build application info in the same shape as classic UI5's
    // applicationUtils.getApplicationInfo(). Surfaces what the framework
    // exposes through `meta.Runtimes` (see packages/base/src/Runtimes.ts):
    // configuration (theme, language, timezone, ...), registered tags and
    // features, and a list of runtimes when more than one is active on the
    // page.
    function _buildApplicationInfo(frameworkInformation) {
        var common = frameworkInformation.commonInformation;
        var runtimes = (frameworkInformation.runtimes && frameworkInformation.runtimes.length) ?
            frameworkInformation.runtimes : [];
        var primary = runtimes[0] || {};
        var sections = {
            common: _generalSection(common),
            configuration: _configurationSection(primary.configuration),
            registeredTags: _registeredTagsSection(primary.registeredTags),
            registeredFeatures: _registeredFeaturesSection(primary.registeredFeatures),
            interop: _interopSection(primary),
            runtimes: _runtimesSection(runtimes)
        };

        var result = {};
        var keys = Object.keys(sections);
        for (var i = 0; i < keys.length; i++) {
            if (sections[keys[i]]) {
                result[keys[i]] = sections[keys[i]];
            }
        }
        return result;
    }

    // Send the current control tree to the panel
    function _sendTreeUpdate(action) {
        var controlTreeModel = WebCToolsAPI.getRenderedControlTree();
        WebCToolsAPI.getFrameworkInformation().then(function (frameworkInformation) {
            message.send({
                action: action,
                applicationInformation: _buildApplicationInfo(frameworkInformation),
                controlTree: {
                    versionInfo: {
                        version: frameworkInformation.commonInformation.version,
                        framework: frameworkInformation.commonInformation.frameworkName
                    },
                    controls: controlTreeModel
                }
            });
        });
    }

    var mutation = {
        _pendingUpdate: 0,

        init: function () {
            this._observer.observe(document.body, this._options);
        },

        _observer: new MutationObserver(function (mutations) {
            var isMutationValid = true;

            mutations.forEach(function (m) {
                if (m.target.id === 'ui5-highlighter' || m.target.id === 'ui5-highlighter-webc') {
                    isMutationValid = false;
                    return;
                }
            });

            if (!isMutationValid) {
                return;
            }

            // Debounce: collapse rapid bursts of mutations into a single tree update
            if (mutation._pendingUpdate) {
                clearTimeout(mutation._pendingUpdate);
            }
            mutation._pendingUpdate = setTimeout(function () {
                mutation._pendingUpdate = 0;
                _sendTreeUpdate('on-application-dom-update-webc');
            }, TREE_UPDATE_DEBOUNCE_MS);
        }),

        _options: {
            subtree: true,
            childList: true,
            attributes: false
        }
    };

    mutation.init();

    // Build the actions list for the DataView panel. Web components don't have
    // an `invalidate()` method (re-rendering is automatic), so we omit it.
    function _buildControlActions(controlId) {
        return {
            actions: {
                data: ['Focus', 'Copy to Console', 'Copy HTML to Console']
            },
            own: {
                options: {
                    controlId: controlId
                }
            }
        };
    }

    function _sendControlSelectResponse(controlId) {
        var controlProperties = WebCToolsAPI.getControlProperties(controlId);
        var controlAggregations = WebCToolsAPI.getControlAggregations(controlId);
        var controlEvents = WebCToolsAPI.getControlEvents(controlId);

        message.send({
            action: 'on-control-select',
            controlProperties: _formatProperties(controlId, controlProperties),
            controlBindings: {},
            controlAggregations: _formatAggregations(controlId, controlAggregations),
            controlEvents: _formatEvents(controlId, controlEvents),
            controlActions: _buildControlActions(controlId)
        });
    }

    // ================================================================================
    // Helpers for resolving the visible representation of a hovered element.
    // Some web components (e.g. ui5-breadcrumbs-item) are light-DOM data
    // carriers with zero rect — the visible element lives inside the parent's
    // shadow root, by convention with id `<itemId>-<suffix>`.
    // ================================================================================

    // Find an element inside `host`'s shadow root whose id exactly equals
    // `id` or begins with `id-` (the framework convention for derived ids,
    // e.g. ui5wc_104 -> ui5wc_104-link-wrapper). We avoid a plain prefix
    // match like `[id^="ui5wc_1"]` because it also matches ui5wc_10,
    // ui5wc_100, etc. The selected match must have a non-zero layout box.
    function _findVisibleInShadow(host, id) {
        var match = host.shadowRoot.querySelector(
            '[id="' + id + '"], [id^="' + id + '-"]'
        );
        if (!match) {
            return null;
        }
        var rect = match.getBoundingClientRect();
        return (rect.width || rect.height) ? match : null;
    }

    // Find a target that actually has a layout box. Used by the highlighter,
    // which needs a non-zero rect to position its overlay.
    function _resolveVisibleElement(element) {
        if (!element) {
            return null;
        }
        var rect = element.getBoundingClientRect();
        if (rect.width || rect.height) {
            return element;
        }

        // Walk up to find a shadow-root host and search by id-prefix
        var id = element._id || element.id;
        if (!id) {
            return element;
        }

        var host = element.parentElement;
        while (host && !host.shadowRoot) {
            host = host.parentElement;
        }
        if (!host) {
            return element;
        }

        var visible = _findVisibleInShadow(host, id);
        // Fall back to the parent web component itself if no shadow match
        return visible || host;
    }

    // Note: payload shapes vary per action because they are determined by
    // the panel side, not by this script. Some actions ship the id as
    // `event.detail.target`, others as `event.detail.data.controlId`,
    // others as `event.detail.data` blobs. Matching the corresponding
    // shape in injected/main.js keeps the message contracts identical
    // across the two frameworks.
    var messageHandler = {

        'get-initial-information-webc': function () {
            _sendTreeUpdate('on-receiving-initial-data-webc');
        },

        'do-control-select-webc': function (event) {
            var controlId = event.detail.target;
            _sendControlSelectResponse(controlId);
        },

        'do-control-select': function (event) {
            var controlId = event.detail.target;
            if (!WebCToolsAPI.getElementById(controlId)) {
                return;
            }
            _sendControlSelectResponse(controlId);
        },

        'do-control-property-change': function (event) {
            var data = event.detail.data;
            var controlId = data.controlId;
            var element = WebCToolsAPI.getElementById(controlId);

            if (!element) {
                return;
            }

            // DataView capitalizes first letter (UI5 setter convention) — restore original casing
            var property = data.property.charAt(0).toLowerCase() + data.property.slice(1);

            try {
                element[property] = data.value;
            } catch (e) {
                // silent
            }

            _sendControlSelectResponse(controlId);
        },

        'do-control-focus': function (event) {
            var element = WebCToolsAPI.getElementById(event.detail.data.controlId);
            if (element && typeof element.focus === 'function') {
                element.focus();
            }
        },

        'do-copy-control-to-console': function (event) {
            var element = WebCToolsAPI.getElementById(event.detail.data.controlId);
            if (element) {
                // eslint-disable-next-line no-console
                console.log(element);
            }
        },

        'do-control-copy-html': function (event) {
            var element = WebCToolsAPI.getElementById(event.detail.target);
            if (element) {
                // eslint-disable-next-line no-console
                console.log(element.outerHTML);
            }
        },

        // Position the highlighter overlay on the hovered tree element. Uses
        // WebCToolsAPI.getElementById (web component _id) instead of
        // document.getElementById, which would only find DOM-id matches.
        'on-control-tree-hover': function (event) {
            var element = WebCToolsAPI.getElementById(event.detail.target);
            if (!element) {
                return;
            }
            highlighter.setDimensions(_resolveVisibleElement(element));
        },

        'on-hide-highlight': function () {
            highlighter.hide();
        },

        // Selects the right-clicked element in the tree. Background broadcasts
        // this when "Inspect UI5 element" is chosen from the context menu.
        'do-context-menu-control-select': function (event) {
            var target = event.detail.target;
            // Only respond if the stored id belongs to a UI5 web component
            if (!target || !WebCToolsAPI.getElementById(target)) {
                return;
            }
            message.send({
                action: 'on-contextMenu-control-select',
                target: target,
                frameId: event.detail.frameId
            });
        }
    };

    // ================================================================================
    // Right-click capture: when the user right-clicks a UI5 web component, store
    // its id so the background can hand it to the panel when "Inspect UI5 element"
    // is selected from the context menu.
    // ================================================================================
    document.addEventListener('mousedown', function (event) {
        if (event.button !== 2) {
            return;
        }
        var target = event.target;
        // Walk up to find the nearest UI5 web component ancestor
        while (target && target !== document.body) {
            if (target.isUI5Element === true) {
                // UI5Element guarantees _id (lazy getter, see UI5Element.ts)
                message.send({
                    action: 'on-right-click',
                    target: target._id
                });
                return;
            }
            target = target.parentNode;
        }
    }, true);

    document.addEventListener('ui5-communication-with-injected-script', function (event) {
        var action = event.detail.action;

        if (messageHandler[action]) {
            messageHandler[action](event);
        }
    }, false);
}());
