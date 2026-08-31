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

    // Returns the raw array of runtime descriptors the framework registers on
    // the shared-resources meta element. See packages/base/src/Runtimes.ts.
    // Each runtime exposes (mostly as live getters): version, alias,
    // description, importMetaUrl, scopingSuffix, registeredTags,
    // registeredFeatures, configuration (theme, language, timezone, etc.),
    // openUI5Detected, openUI5LoadedFirst. Returns [] if the meta element or
    // Runtimes property is missing.
    function _getRuntimes() {
        try {
            var meta = document.querySelector('meta[name="ui5-shared-resources"]');
            if (meta && Array.isArray(meta.Runtimes)) {
                return meta.Runtimes;
            }
        } catch (e) {
            // best-effort
        }
        return [];
    }

    // Many runtime fields are live getters that call framework functions and
    // can throw (e.g. on partially-booted runtimes). Read every field through
    // this guard so one bad getter never breaks the whole App Info tab.
    function _safe(fn, fallback) {
        try {
            var value = fn();
            return value === undefined ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    // Count live UI5 web component instances per tag name, walking the whole
    // document including shadow roots. Light-DOM-only queries miss components
    // rendered inside other components' shadow roots, so we recurse. Returns a
    // plain map { localName: count }.
    function _getTagUsageCounts() {
        var counts = Object.create(null);

        function walk(root) {
            var all = root.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el.isUI5Element === true) {
                    var tag = el.localName;
                    counts[tag] = (counts[tag] || 0) + 1;
                }
                if (el.shadowRoot) {
                    walk(el.shadowRoot);
                }
            }
        }

        walk(document);
        return counts;
    }

    // Look up how many instances of a registered tag are on the page.
    // `registeredTags` comes from getMetadata().getTag(), which already applies
    // any scoping suffix (ui5-button-<suffix>), and the DOM elements carry that
    // same scoped name — so usageCounts[tag] matches directly. The extra
    // scoped-spelling lookup below is a defensive no-op for that case and only
    // contributes if a framework version were to expose base (unscoped) tags.
    // See packages/base/src/UI5ElementMetadata.ts (getTag) and
    // packages/base/src/CustomElementsScopeUtils.ts.
    function _usageForTag(usageCounts, tag, scopingSuffix) {
        var count = usageCounts[tag] || 0;
        if (scopingSuffix) {
            count += usageCounts[tag + '-' + scopingSuffix] || 0;
        }
        return count;
    }

    // Normalize the raw runtime descriptors into plain, serializable objects
    // (the panel receives these over postMessage, so no getters/functions can
    // survive). Splits each runtime's registered tags into used/unused with
    // instance counts.
    function _normalizeRuntimes() {
        var raw = _getRuntimes();
        var usageCounts = _getTagUsageCounts();

        return raw.map(function (rt, index) {
            var scopingSuffix = _safe(function () { return rt.scopingSuffix; }, '');
            var registeredTags = _safe(function () { return rt.registeredTags; }, []) || [];
            var usedTags = [];
            var unusedTags = [];

            registeredTags.forEach(function (tag) {
                var count = _usageForTag(usageCounts, tag, scopingSuffix);
                if (count > 0) {
                    usedTags.push({ tag: tag, count: count });
                } else {
                    unusedTags.push(tag);
                }
            });

            return {
                index: index,
                version: _safe(function () { return rt.version; }, ''),
                isNext: _safe(function () { return rt.isNext; }, false),
                buildTime: _safe(function () { return rt.buildTime; }, undefined),
                alias: _safe(function () { return rt.alias; }, ''),
                description: _safe(function () { return rt.description; }, ''),
                importMetaUrl: _safe(function () { return rt.importMetaUrl; }, ''),
                scopingSuffix: scopingSuffix,
                registeredTags: registeredTags,
                usedTags: usedTags,
                unusedTags: unusedTags,
                registeredFeatures: _safe(function () { return rt.registeredFeatures; }, []) || [],
                configuration: _safe(function () { return rt.configuration; }, null),
                openUI5Detected: _safe(function () { return rt.openUI5Detected; }, undefined),
                openUI5LoadedFirst: _safe(function () { return rt.openUI5LoadedFirst; }, undefined)
            };
        });
    }

    window.__ui5WebComponentsToolsAPI = {

        getFrameworkInformation: function () {
            var runtimes = _normalizeRuntimes();
            var primary = runtimes[0] || {};
            return Promise.resolve({
                commonInformation: {
                    frameworkName: 'UI5 Web Components',
                    version: _getVersion(),
                    buildTime: primary.buildTime,
                    description: primary.description
                },
                runtimes: runtimes
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
                // Note: `isDefault` is intentionally not reported. Web
                // components has no declared `defaultValue` in metadata, and
                // class field initializers compiled to ES2022 land on the
                // instance, so we cannot reliably distinguish the framework
                // default from a user-set value. A future implementation
                // could snapshot defaults by sampling a fresh
                // document.createElement(tag) per tag at startup.
                result.own.properties[key] = Object.create(null);
                result.own.properties[key].value = element[key];
                result.own.properties[key].type = _getPropertyType(propsMetadata[key]);
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
