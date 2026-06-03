(function () {
    'use strict';

    var elementMap = Object.create(null);
    var cachedVersion = null;

    function _isUI5WebComponent(element) {
        return element.localName.indexOf('-') !== -1 &&
            element.constructor &&
            typeof element.constructor.getMetadata === 'function';
    }

    function _getVersion() {
        if (cachedVersion !== null) {
            return cachedVersion;
        }
        cachedVersion = '';
        try {
            var meta = document.querySelector('meta[name="ui5-shared-resources"]');
            if (!meta) {
                return cachedVersion;
            }
            var content = meta.getAttribute('data-ui5-shared-resources-runtimes');
            if (content) {
                var runtimes = JSON.parse(content);
                if (runtimes.length > 0 && runtimes[0].version) {
                    cachedVersion = runtimes[0].version;
                }
            }
        } catch (e) {
            // best-effort
        }
        return cachedVersion;
    }

    function _getElementId(element) {
        return element.id || element._id || element.__id || ('webc_' + Array.prototype.indexOf.call(
            document.querySelectorAll(element.localName), element
        ));
    }

    function _buildTreeRecursive(parentElement) {
        var children = parentElement.children;
        var result = [];

        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (_isUI5WebComponent(child)) {
                var id = _getElementId(child);
                elementMap[id] = child;
                var node = {
                    id: id,
                    name: child.localName,
                    type: 'ui5-web-component',
                    content: _buildTreeRecursive(child)
                };
                result.push(node);
            } else {
                var nested = _buildTreeRecursive(child);
                for (var j = 0; j < nested.length; j++) {
                    result.push(nested[j]);
                }
            }
        }

        return result;
    }

    function _getPropertyType(propMeta) {
        if (!propMeta || !propMeta.type) {
            return 'string';
        }
        var t = propMeta.type;
        if (t === Boolean || t === window.Boolean) return 'boolean';
        if (t === Number || t === window.Number) return 'number';
        if (t === String || t === window.String) return 'string';
        if (t === Object || t === window.Object) return 'object';
        if (t === Array || t === window.Array) return 'array';
        return 'string';
    }

    function _getDefaultValue(type) {
        if (type === 'boolean') return false;
        if (type === 'number') return 0;
        if (type === 'string') return '';
        if (type === 'object') return undefined;
        if (type === 'array') return undefined;
        return undefined;
    }

    window.__ui5WebComponentsToolsAPI = {

        getFrameworkInformation: function () {
            return Promise.resolve({
                commonInformation: {
                    frameworkName: 'UI5 Web Components',
                    version: _getVersion()
                }
            });
        },

        getRenderedControlTree: function () {
            elementMap = Object.create(null);
            return _buildTreeRecursive(document.body);
        },

        getControlProperties: function (controlId) {
            var element = elementMap[controlId];
            if (!element) {
                return {};
            }

            var metadata = element.constructor.getMetadata();
            var propsMetadata = metadata.getProperties();
            var result = Object.create(null);

            result.own = Object.create(null);
            result.own.meta = Object.create(null);
            result.own.meta.controlName = metadata.getTag ? metadata.getTag() : element.localName;

            result.own.properties = Object.create(null);
            var propNames = Object.keys(propsMetadata);
            for (var i = 0; i < propNames.length; i++) {
                var key = propNames[i];
                // Skip private properties (internal implementation details)
                if (key.charAt(0) === '_') {
                    continue;
                }
                var propType = _getPropertyType(propsMetadata[key]);
                var currentValue = element[key];
                var defaultValue = _getDefaultValue(propType);

                result.own.properties[key] = Object.create(null);
                result.own.properties[key].value = currentValue;
                result.own.properties[key].type = propType;
                result.own.properties[key].isDefault = currentValue === defaultValue;
            }

            result.inherited = [];
            result.isPropertiesData = true;

            return result;
        },

        getControlAggregations: function (controlId) {
            var element = elementMap[controlId];
            if (!element) {
                return {};
            }

            var metadata = element.constructor.getMetadata();
            var slotsMetadata = metadata.getSlots();
            var result = Object.create(null);

            result.own = Object.create(null);
            result.own.meta = Object.create(null);
            result.own.meta.controlName = metadata.getTag ? metadata.getTag() : element.localName;

            result.own.aggregations = Object.create(null);
            var slotNames = Object.keys(slotsMetadata);
            for (var i = 0; i < slotNames.length; i++) {
                var slotName = slotNames[i];
                // Skip private slots
                if (slotName.charAt(0) === '_') {
                    continue;
                }
                var slotData = slotsMetadata[slotName];
                var slottedContent;

                try {
                    if (typeof element.getSlottedNodes === 'function') {
                        var nodes = element.getSlottedNodes(slotName);
                        slottedContent = nodes.map(function (n) {
                            return _getElementId(n) || n.localName;
                        });
                    } else {
                        slottedContent = [];
                    }
                } catch (e) {
                    slottedContent = [];
                }

                result.own.aggregations[slotName] = Object.create(null);
                result.own.aggregations[slotName].value = slottedContent.length > 0 ? slottedContent : null;
                result.own.aggregations[slotName].type = slotData.type === Node ? 'Node' : 'HTMLElement';
            }

            result.inherited = [];
            return result;
        },

        getControlBindings: function () {
            return Object.create(null);
        },

        getControlEvents: function (controlId) {
            var element = elementMap[controlId];
            if (!element) {
                return {};
            }

            var metadata = element.constructor.getMetadata();
            var eventsMetadata = metadata.getEvents();
            var result = Object.create(null);

            result.own = Object.create(null);
            result.own.meta = Object.create(null);
            result.own.meta.controlName = metadata.getTag ? metadata.getTag() : element.localName;

            result.own.events = Object.create(null);
            var eventNames = Object.keys(eventsMetadata);
            for (var i = 0; i < eventNames.length; i++) {
                var eventName = eventNames[i];
                // Skip private events
                if (eventName.charAt(0) === '_') {
                    continue;
                }
                result.own.events[eventName] = Object.create(null);
                result.own.events[eventName].paramsType = Object.create(null);
                result.own.events[eventName].registry = null;
            }

            result.inherited = [];
            return result;
        },

        getElementById: function (id) {
            return elementMap[id] || null;
        }
    };
}());
