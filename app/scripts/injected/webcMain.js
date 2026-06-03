(function () {
    'use strict';

    var WebCToolsAPI = window.__ui5WebComponentsToolsAPI;
    if (!WebCToolsAPI) {
        return;
    }

    var message = require('../modules/injected/message.js');

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
            formattedProps[key].isDefault = props[key].isDefault;
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

    // Build application info in the same shape as classic UI5's applicationUtils.getApplicationInfo()
    function _buildApplicationInfo(frameworkInformation) {
        var common = frameworkInformation.commonInformation;
        var general = {};
        general[common.frameworkName] = common.version || '(unknown)';
        general['User Agent'] = navigator.userAgent;
        general.Application = location.href;

        return {
            common: {
                options: {
                    title: 'General',
                    expandable: true,
                    expanded: true
                },
                data: general
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
                if (m.target.id === 'ui5-highlighter' || m.target.id === 'ui5-highlighter-container') {
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
        }
    };

    document.addEventListener('ui5-communication-with-injected-script', function (event) {
        var action = event.detail.action;

        if (messageHandler[action]) {
            messageHandler[action](event);
        }
    }, false);
}());
