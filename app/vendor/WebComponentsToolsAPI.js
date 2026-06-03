(function () {
    'use strict';

    var elementMap = Object.create(null);
    var cachedVersion = null;

    // A UI5 web component exposes the `isUI5Element` getter (returns true).
    // See packages/base/src/UI5Element.ts (get isUI5Element).
    function _isUI5WebComponent(element) {
        return element && element.isUI5Element === true;
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

            // Web components stores runtime info as a JS property `Runtimes`
            // on the meta element (an Array of runtime objects).
            // See packages/base/src/Runtimes.ts.
            if (meta.Runtimes && meta.Runtimes.length > 0 && meta.Runtimes[0].version) {
                cachedVersion = meta.Runtimes[0].version;
            }
        } catch (e) {
            // best-effort
        }
        return cachedVersion;
    }

    // Returns the canonical id used by the framework: `_id` is a getter that
    // lazily assigns `ui5wc_<n>` and stores it in `__id`. Falls back to the
    // author-set id (DOM `id` attribute) if present.
    // See packages/base/src/UI5Element.ts (get _id).
    function _getElementId(element) {
        if (element.id) {
            return element.id;
        }
        if (element._id) {
            return element._id;
        }
        // Last resort for non-UI5 nodes (e.g., when reporting a slotted plain element)
        return 'webc_' + Array.prototype.indexOf.call(
            document.querySelectorAll(element.localName), element
        );
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

    // Property metadata uses constructor references for `type`:
    // {type: Boolean | String | Number | Object | Array}.
    // See packages/base/src/UI5ElementMetadata.ts (Property).
    function _getPropertyType(propMeta) {
        if (!propMeta || !propMeta.type) {
            // Default per the framework's defaultConverter is String.
            return 'string';
        }
        var t = propMeta.type;
        if (t === Boolean) { return 'boolean'; }
        if (t === Number) { return 'number'; }
        if (t === String) { return 'string'; }
        if (t === Object) { return 'object'; }
        if (t === Array) { return 'array'; }
        return 'string';
    }

    // Resolve the framework-applied default for a property by reading it from
    // the prototype chain BEFORE the instance has overridden it. With TS class
    // field initializers the default ends up on the instance (`Object.hasOwn`),
    // but with the framework's converter pattern it's typically on the
    // prototype. We approximate by walking up the prototype chain looking for
    // the first defined value; if none, fall back to type-based defaults.
    function _getDefaultValue(element, propName, type) {
        var proto = Object.getPrototypeOf(element);
        while (proto && proto !== HTMLElement.prototype && proto !== Object.prototype) {
            var desc = Object.getOwnPropertyDescriptor(proto, propName);
            if (desc) {
                if ('value' in desc) {
                    return desc.value;
                }
                // It's a getter — can't safely invoke without side-effects, give up
                break;
            }
            proto = Object.getPrototypeOf(proto);
        }
        // Type-based fallback (matches what the framework uses when no default
        // is declared; see the defaultConverter in UI5Element.ts).
        if (type === 'boolean') { return false; }
        if (type === 'number') { return 0; }
        if (type === 'string') { return ''; }
        return undefined;
    }

    // Slot mapping: a slot's content is exposed on the element under a
    // `propertyName` (defaults to the slot name). The framework populates
    // `element[propertyName]` with the array of assigned nodes.
    // See packages/base/src/UI5Element.ts (_state[propertyName]) and
    // packages/base/src/UI5ElementMetadata.ts (Slot.propertyName).
    function _getSlottedContent(element, slotName, slotData) {
        var propertyName = slotData.propertyName || slotName;
        var nodes = element[propertyName];
        if (!Array.isArray(nodes)) {
            return [];
        }
        var ids = [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n) {
                ids.push(_getElementId(n) || n.localName || '<node>');
            }
        }
        return ids;
    }

    function _getSlotTypeName(slotData) {
        if (!slotData || !slotData.type) {
            return 'HTMLElement';
        }
        return slotData.type === Node ? 'Node' : 'HTMLElement';
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
                var defaultValue = _getDefaultValue(element, key, propType);

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
                var slottedContent = _getSlottedContent(element, slotName, slotData);

                result.own.aggregations[slotName] = Object.create(null);
                result.own.aggregations[slotName].value = slottedContent.length > 0 ? slottedContent : null;
                result.own.aggregations[slotName].type = _getSlotTypeName(slotData);
            }

            result.inherited = [];
            return result;
        },

        // Web components has no concept of bindings; return empty.
        getControlBindings: function () {
            return Object.create(null);
        },

        // Event metadata shape: {detail?, bubbles, cancelable}.
        // See packages/base/src/UI5ElementMetadata.ts (EventData) and
        // packages/base/src/decorators/event.ts.
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
                var eventData = eventsMetadata[eventName] || {};
                // Build a paramsType map from the event's `detail` declaration
                var paramsType = Object.create(null);
                if (eventData.detail) {
                    var detailKeys = Object.keys(eventData.detail);
                    for (var j = 0; j < detailKeys.length; j++) {
                        var paramKey = detailKeys[j];
                        var paramMeta = eventData.detail[paramKey];
                        // detail values can be {type: <ctor>} or just metadata objects
                        paramsType[paramKey] = paramMeta && paramMeta.type
                            ? (paramMeta.type.name || String(paramMeta.type))
                            : '';
                    }
                }
                result.own.events[eventName] = Object.create(null);
                result.own.events[eventName].paramsType = paramsType;
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
