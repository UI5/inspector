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
 * `document`, forwarded by content/webcMain.js (isolated world):
 *
 *   panel  -- port.postMessage -->  background
 *   background  -- chrome.tabs.sendMessage -->  content/webcMain.js
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

    // Escape HTML-significant characters. The DataView escapes string *values*
    // but not section *titles* or *keys* (DataViewHelper._wrapInTag interpolates
    // them raw). Any page-controlled string that ends up in a title/key — e.g. a
    // runtime's alias or scoping suffix — must be escaped here first, otherwise a
    // hostile page could inject markup into the DevTools panel.
    function _escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    // --- App Info section builders. Each returns a {options, data} section
    // or null if there's nothing to report. ---

    function _generalSection(common, runtimes) {
        var general = {};
        general[common.frameworkName] = common.version || '(unknown)';
        general.Runtimes = runtimes.length;
        // Interop is page-level; read it from the primary (first) runtime.
        var primary = runtimes[0] || {};
        if (typeof primary.openUI5Detected === 'boolean') {
            general['OpenUI5 detected'] = primary.openUI5Detected;
            if (typeof primary.openUI5LoadedFirst === 'boolean') {
                general['OpenUI5 loaded first'] = primary.openUI5LoadedFirst;
            }
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

    // DataView preserves array order (and sorts object keys alphabetically).
    // For long lists we want a stable, readable order — sort the values
    // alphabetically and emit as an array.
    function _asSortedArray(arr) {
        return arr.slice().sort(function (a, b) {
            return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
        });
    }

    // Tags with at least one live instance on the page. Object keys sort
    // alphabetically in the DataView; the value is the instance count.
    function _usedTagsSection(usedTags) {
        if (!Array.isArray(usedTags) || !usedTags.length) {
            return null;
        }
        var data = {};
        for (var i = 0; i < usedTags.length; i++) {
            data[usedTags[i].tag] = usedTags[i].count;
        }
        return _section('Tags in use (' + usedTags.length + ')', data);
    }

    // Registered tags that are not currently instantiated anywhere on the page.
    function _unusedTagsSection(unusedTags) {
        if (!Array.isArray(unusedTags) || !unusedTags.length) {
            return null;
        }
        return _section('Tags registered, not in use (' + unusedTags.length + ')',
            _asSortedArray(unusedTags), false);
    }

    function _registeredFeaturesSection(features) {
        if (!Array.isArray(features) || !features.length) {
            return null;
        }
        return _section('Registered features (' + features.length + ')', _asSortedArray(features), false);
    }

    // Left-pad the runtime index so per-runtime section titles keep numeric
    // order under the DataView's alphabetical key sort. Only widens once indices
    // reach two digits (11+ runtimes); typical pages keep the bare "Runtime 0".
    function _padIndex(index, total) {
        var width = String(Math.max(total - 1, 0)).length;
        var s = String(index);
        while (s.length < width) {
            s = '0' + s;
        }
        return s;
    }

    // A concise per-runtime label, e.g. "Runtime 0 — v2.19.0 (myapp)" or,
    // when there's no alias, "Runtime 0 — v2.19.0 [scoping-suffix]". The
    // version/alias/scoping-suffix are page-controlled and land in a section
    // title, so escape them (the DataView does not escape titles).
    function _runtimeLabel(rt, total) {
        var label = 'Runtime ' + _padIndex(rt.index, total || 1) +
            ' — v' + _escapeHTML(rt.version || 'unknown');
        if (rt.alias) {
            label += ' (' + _escapeHTML(rt.alias) + ')';
        } else if (rt.scopingSuffix) {
            label += ' [' + _escapeHTML(rt.scopingSuffix) + ']';
        }
        return label;
    }

    // One expandable section for a single runtime: its identity fields plus
    // nested Configuration / tags-in-use / unused-tags / features sub-sections,
    // each scoped to that runtime. Collapsed by default — a single runtime can
    // register hundreds of tags.
    function _runtimeDetailSection(rt, total) {
        var data = { Version: rt.version || '(unknown)' };
        if (rt.alias) {
            data.Alias = rt.alias;
        }
        if (rt.scopingSuffix) {
            data['Scoping suffix'] = rt.scopingSuffix;
        }
        if (rt.importMetaUrl) {
            data['Runtime URL'] = rt.importMetaUrl;
        }

        var nested = [
            _configurationSection(rt.configuration),
            _usedTagsSection(rt.usedTags),
            _unusedTagsSection(rt.unusedTags),
            _registeredFeaturesSection(rt.registeredFeatures)
        ];
        for (var i = 0; i < nested.length; i++) {
            if (nested[i]) {
                data[nested[i].options.title] = nested[i];
            }
        }

        return _section(_runtimeLabel(rt, total), data, false);
    }

    // Build the Application-Info payload for the App Info tab. Everything the
    // framework exposes through `meta.Runtimes` (see packages/base/src/Runtimes.ts)
    // is grouped under a single self-labelled "UI5 Web Components" section so it
    // reads as distinct from the classic SAPUI5 sections on mixed pages. The
    // group holds a General summary and one collapsible section per runtime (with
    // that runtime's configuration, used/unused tags and features).
    function _buildApplicationInfo(frameworkInformation) {
        var common = frameworkInformation.commonInformation;
        var runtimes = (frameworkInformation.runtimes && frameworkInformation.runtimes.length) ?
            frameworkInformation.runtimes : [];

        var groupData = { General: _generalSection(common, runtimes) };

        for (var r = 0; r < runtimes.length; r++) {
            var section = _runtimeDetailSection(runtimes[r], runtimes.length);
            groupData[section.options.title] = section;
        }

        var title = 'UI5 Web Components';
        if (runtimes.length > 1) {
            title += ' — ' + runtimes.length + ' runtimes (primary v' +
                _escapeHTML(common.version || 'unknown') + ')';
        } else if (common.version) {
            title += ' (v' + _escapeHTML(common.version) + ')';
        }

        return {
            webcRoot: {
                options: { title: title, expandable: true, expanded: true },
                data: groupData
            }
        };
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
