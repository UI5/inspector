'use strict';

/**
 * Create data object for the DataView to consume.
 * @param {Object} options - settings
 * @returns {Object}
 * @private
 */
function _assembleDataToView(options) {
    var object = Object.create(null);
    object.data = options.data ? options.data : Object.create(null);

    object.options = {
        controlId: options.controlId !== undefined ? options.controlId : undefined,
        expandable: options.expandable !== undefined ? options.expandable : true,
        expanded: options.expanded !== undefined ? options.expanded : true,
        hideTitle: options.hideTitle !== undefined ? options.hideTitle : false,
        showTypeInfo: !!options.showTypeInfo,
        title: options.title !== undefined ? options.title : '',
        editableValues: options.editableValues !== undefined ? options.editableValues : true,
        editModel: options.editModel !== undefined ? options.editModel : undefined,
        editModelPath: options.editModelPath !== undefined ? options.editModelPath : undefined
    };

    return object;
}

/**
 * Returns the registered element with the given ID, if any.
 * @param {sap.ui.core.ID|null|undefined} sId ID of the element to search for
 * @returns {sap.ui.core.Element|undefined} Element with the given ID or <code>undefined</code>
 */
function _getElementById(sId) {
    var Element = sap.ui.require('sap/ui/core/Element');
    if (typeof Element.getElementById === 'function') {
        return Element.getElementById(sId);
    }
    if (typeof sap.ui.getCore === 'function' && typeof sap.ui.getCore().byId === 'function') {
        return sap.ui.getCore().byId(sId);
    }
}

/**
 * Create a clickable value for the DataView.
 * @param {Object} options
 * @constructor
 */
function ClickableValue(options) {
    // This is used for checking in the dataView
    this._isClickableValueForDataView = true;
    // This is shown in the data view
    this.value = '<clickable-value key="' + options.key + '" parent="' + options.parent + '">' + (options.value || '') + '</clickable-value>';
    // This data is attached in the click event of the dataview
    this.eventData = options.eventData || {};
}

/**
 * Copies the properties of the sourceObject into the targetObject.
 *
 * Remark: This is a simple alternative to jQuery.Extend.
 * @private
 */
function _extendObject() {
    if (arguments.length === 0) {
        return undefined;
    }

    var targetObject = arguments[0] || {};
    var sourceObject;
    for (var i = 1; i < arguments.length; ++i) {
        sourceObject = arguments[i];
        if (sourceObject) {
            for (var key in sourceObject) {
                targetObject[key] = sourceObject[key];
            }
        }
    }
    return targetObject;
}

/**
 * Extends options with model-dataview specific data.
 * Functions returns a new object, the original object is not subject of change.
 * @param {Object} options
 * @param {Object} modelInfo
 * @returns {Object}
 * @private
 */
function _extendOptionsForModelDataview(options, modelInfo) {
    var additionalOptions = {};
    if (modelInfo && modelInfo.mode === 'TwoWay' && options.showValue) {
        additionalOptions.editableValues = ['value'];
        additionalOptions.editModel = modelInfo.modelName;
        additionalOptions.editModelPath = modelInfo.fullPath;
    }

    return _extendObject({}, options, additionalOptions);
}

/**
 * Create a reference to model information consisting of a reference to the model itself and
 * a path property for the concrete value at the defined path.
 * @param {Object} options
 * @param {Object} modelInfo
 * @param {string} key - optional
 * @returns {Object}
 * @private
 */
function _assembleModelReferences(options, modelInfo, key) {
    // Do not print null or undefined
    if (key === undefined || key === null) {
        key = '';
    }

    var modelName = modelInfo.modelName || '';
    var data = {
        model: new ClickableValue( {
            value: modelName + ' (' + (modelInfo.type ? modelInfo.type.split('.').pop() : '<unknown>') + ')',
            eventData: {
                name: modelName,
                type: modelInfo.type,
                mode: modelInfo.mode,
                data: modelInfo.modelData
            },
            parent: options.parent,
            key: key + '/model'
        }),
        path: new ClickableValue({
            value: modelInfo.path,
            eventData: {
                name: modelName,
                type: modelInfo.type,
                mode: modelInfo.mode,
                path: modelInfo.path,
                data: modelInfo.pathData
            },
            parent: options.parent,
            key: key + '/path'
        })
    };

    if (options.showValue) { // && typeof modelInfo.pathData !== "object"
        data.value = modelInfo.pathData;
    }

    return data;
}

/**
 * Create a reference to model information consisting of a reference to the model itself and
 * a path property for the concrete value at the defined path.
 *
 * Options object
 * {
 *      parent: 'string', the name of the parent section to pass as parameter to clickable values
 *      showValue: 'boolean', if true the concrete value in the model is added as property
 *      collection: 'string', name of the nesting key, default is 'parts'
 *      controlId: 'string', id of inspected control to enable editing
 * }
 * @param {Object} options
 * @param {Object} modelInfo
 * @returns {Object|null}
 * @private
 */
function _assembleModelInfoDataview(options, modelInfo) {
    if (!modelInfo) {
        return null;
    }

    if (modelInfo.parts) {
        modelInfo.parts = modelInfo.parts.filter(partModelInfo => partModelInfo !== null);
    }

    options.data = options.data || Object.create(null);

    if (modelInfo.parts && modelInfo.parts.length > 1) {
        // Add multiple model entries for properties with multiple bindings
        var collectionName = options.collection || 'parts';

        options.data[collectionName] = _assembleDataToView({
            title: 'parts',
            expandable: true,
            expanded: true,
            showTypeInfo: true,
            editableValues: false,
            data: modelInfo.parts.map(function (partModelInfo, index) {

                var partOptions = _extendObject(
                    _extendOptionsForModelDataview(options, partModelInfo),
                    {
                        expandable: false,
                        expanded: true,
                        hideTitle: true,
                        showTypeInfo: true,
                        data: _assembleModelReferences(options, partModelInfo, collectionName + '/data/' + index + '/data')
                    }
                );

                return _assembleDataToView(partOptions);
            })
        });
    } else {
        // Add a single model entry
        modelInfo = modelInfo.parts && modelInfo.parts[0] || modelInfo;

        _extendObject(options.data, _assembleModelReferences(options, modelInfo));
        options = _extendOptionsForModelDataview(options, modelInfo);
    }

    return _assembleDataToView(options);
}

// ================================================================================
// Control Properties Info
// ================================================================================
var controlProperties = (function () {

    var OWN = 'own';
    var INHERITED = 'inherited';

    /**
     * Formatter for global namespaced enum objects.
     * @param {string | Object} type
     * @private
     */
    function _transformStringTypeToObject (type) {
        var parts = type.split('.');
        var obj = window;
        var i;

        for (i = 0; i < parts.length; i++) {
            obj = obj[parts[i]] ? obj[parts[i]] : '';
        }

        return obj;
    }

    /**
     * Formatter for the type enums.
     * @param {string | Object} type
     * @private
     */
    function _formatTypes (type) {
        var objectType;
        if (type.startsWith('sap.') && sap.ui.require('sap/ui/base/DataType').getType(type).getDefaultValue()) {
            objectType = _transformStringTypeToObject(type);
        } else {
            objectType = type;
        }
        return objectType;
    }

    /**
     * Formatter for the inherited properties.
     * @param {string} controlId
     * @param {Object} properties - UI5 control properties
     * @private
     */
    function _formatInheritedProperties(controlId, properties) {

        if (!properties[INHERITED]) {
            return;
        }

        for (var i = 0; i < properties[INHERITED].length; i++) {
            var parent = properties[INHERITED][i];
            var title = parent.meta.controlName;
            var props = parent.properties;
            var formatedProps = {};

            parent = _assembleDataToView({
                controlId: controlId,
                expandable: false,
                title: title
            });

            parent.types = {};
            parent.typeNames = {};
            parent.meta = { controlName: title };

            for (var key in props) {
                formatedProps[key] = Object.create(null);
                parent.types[key]  =  props[key].type ? _formatTypes (props[key].type) : '';
                parent.typeNames[key] = props[key].type ? props[key].type : '';
                formatedProps[key].value = props[key].value;
                formatedProps[key].isDefault = props[key].isDefault && props[key].value !== '';
                parent.data[key] = formatedProps[key];
            }

            var parentTitle = '<span gray>Inherits from</span>';
            parentTitle += ' (' + title + ')';
            parent.options.title = parentTitle;
            properties[INHERITED + i] = parent;
        }

        delete properties[INHERITED];
    }

    /**
     * Formatter for nested properties.
     * @param {Object} propertyObj
     * @param {string} title
     * @returns {Object}
     * @private
     */
    function _formatNestedProperties(propertyObj, title) {

        var nestedProperties = propertyObj.value;
        var props = _assembleDataToView({
            title: title,
            expandable: false,
            showTypeInfo: true
        });

        for (var key in nestedProperties) {
            props.data[key] = nestedProperties[key];
        }

        return props;
    }

    /**
     * Getter for the properties' associations.
     * @param {string} controlId
     * @param {Object} properties
     * @private
     */
    function _getControlPropertiesAssociations(controlId, properties) {
        var control = _getElementById(controlId);

        if (!control) {
            return;
        }

        properties.associations = Object.create(null);

        var controlAssociations = control.getMetadata().getAssociations();
        var genericObject = Object.create(null);

        Object.keys(controlAssociations).forEach(function (key) {
            var associationElement = control.getAssociation(key);
            if (associationElement && associationElement.length) {
                genericObject.name = associationElement;
            }

            genericObject.type = controlAssociations[key].type;
            properties.associations[key] = genericObject;
        });

    }

    /**
     * Formatter for the associations.
     * @param {Object} properties
     * @private
     */
    function _formatAssociations(properties) {
        var associations = properties.associations;

        for (var assoc in associations) {
            var associationsValue = '';
            if (associations[assoc].name) {
                associationsValue += associations[assoc].name + ' ';
            }
            associationsValue += associations[assoc].type;
            associationsValue += ' (associations)';
            associations[assoc] = associationsValue;
        }
    }

    /**
     * Formatter function for the control properties data.
     * @param {string} controlId
     * @param {Object} properties
     * @returns {Object}
     * @private
     */
    var _formatControlProperties = function (controlId, properties) {

        if (Object.keys(properties).length === 0) {
            return properties;
        }

        var title = properties[OWN].meta.controlName;
        var props = properties[OWN].properties;
        var types = {};
        var typeNames = {};
        var formatedProps = {};

        for (var key in props) {
            formatedProps[key] = Object.create(null);
            if (props[key].type === 'object') {
                props[key] = _formatNestedProperties(props[key], key);
                continue;
            }

            types[key] = props[key].type ? _formatTypes (props[key].type) : '';
            typeNames[key] = props[key].type ? props[key].type : '';
            formatedProps[key].value = props[key].value;
            formatedProps[key].isDefault = props[key].isDefault && props[key].value !== '';
        }

        properties[OWN] = _assembleDataToView({
            controlId: controlId,
            expandable: false,
            title: title
        });
        properties[OWN].data = formatedProps;
        properties[OWN].types = types;
        properties[OWN].typeNames = typeNames;
        properties[OWN].options.title = '#<span class="controlId" data-control-id="' + controlId + '" title="Click to copy control to console">' + controlId + '</span><span gray>(' + title + ')</span>';

        _formatInheritedProperties(controlId, properties);
        _getControlPropertiesAssociations(controlId, properties[OWN]);
        _formatAssociations(properties[OWN]);

        return properties;
    };

    return {
        formatControlProperties: _formatControlProperties
    };
}());

/**
 * Helper function for building listener's path in the data.
 * @param {Array} pathArr
 * @returns {string}
 * @private
 */
var _buildStringPathForListener = function (pathArr) {
    var path = '';

    pathArr.forEach(function (pathQuery) {
        path += pathQuery + '/data/';
    });

    return path;
};

// ================================================================================
// Control Events Info
// ================================================================================
var controlEvents = (function () {

    var OWN = 'own';
    var INHERITED = 'inherited';

    /**
     * Formatter function for a given control event.
     * @param {string} eventName
     * @param {string} eventParamsType
     * @param {Object} listenerConfig
     * @returns {Object}
     * @private
     */
    var _formatEventValues = function (eventName, eventParamsType, listenerConfig) {
        var listenersString = 'listeners';
        var listenerBodyString = 'function';
        var isParamsEmpty = Object.keys(eventParamsType).length === 0;
        var evtRegistry = listenerConfig.eventRegistry;
        var isRegistryPopulatedArray = Array.isArray(evtRegistry) && evtRegistry.length > 0;
        var evt;

        // If there are no meta parameteres and no listeners, no further operations are needed
        if (isParamsEmpty && !isRegistryPopulatedArray) {
            return Object.create(null);
        }

        evt = _assembleDataToView({
            title: eventName,
            expandable: true,
            expanded: true,
            editableValues: false,
            showTypeInfo: true,
        });

        evt.data.parameters = isParamsEmpty ? eventParamsType :
            _assembleDataToView({
                expandable: true,
                expanded: true,
                editableValues: false,
                showTypeInfo: true,
                data: eventParamsType
            });

        evt.data[listenersString] = !isRegistryPopulatedArray ? [] :
            _assembleDataToView({
                expandable: true,
                expanded: true,
                editableValues: false,
                showTypeInfo: true,
                data: evtRegistry.map(function (listener, index) {
                    var curr = _assembleDataToView({
                        title: listener.name,
                        expandable: true,
                        expanded: true,
                        editableValues: false,
                        showTypeInfo: true
                    });

                    curr.data['view id'] = listener.viewId;
                    curr.data['controller name'] = listener.controllerName;
                    curr.data[listenerBodyString] = new ClickableValue({
                        value: 'Log in DevTools Console',
                        eventData: {
                            controlId: listenerConfig.controlId,
                            eventName: eventName,
                            listenerIndex: index
                        },
                        key: listenerBodyString,
                        parent: _buildStringPathForListener([listenerConfig.rootObjectName, eventName, listenersString, index])
                    });

                    return curr;
                })
            });

        return evt;
    };

    /**
     * Formatter for the inherited events.
     * @param {string} controlId
     * @param {Object} events - UI5 control events
     * @private
     */
    var _formatInheritedEvents = function (controlId, events) {

        if (!events[INHERITED]) {
            return;
        }

        for (var i = 0; i < events[INHERITED].length; i++) {
            var parent = events[INHERITED][i];
            var title = parent.meta.controlName;
            var evts = parent.events;
            var inheritedIncremented = INHERITED + i;
            var listenerConfig;

            parent = _assembleDataToView({
                controlId: controlId,
                expandable: false,
                title: title,
                editableValues: false
            });

            for (var key in evts) {
                listenerConfig = Object.create(null);
                listenerConfig.eventRegistry = evts[key].registry;
                listenerConfig.rootObjectName = inheritedIncremented;
                listenerConfig.controlId = controlId;
                parent.data[key] = _formatEventValues(key, evts[key].paramsType, listenerConfig);
            }

            var parentTitle = '<span gray>Inherits from</span>';
            parentTitle += ' (' + title + ')';
            parent.options.title = parentTitle;
            events[inheritedIncremented] = parent;
        }

        delete events[INHERITED];
    };

    /**
     * Formatter function for the control events data.
     * @param {string} controlId
     * @param {Object} events
     * @returns {Object}
     * @private
     */
    var _formatControlEvents = function (controlId, events) {

        if (Object.keys(events).length === 0) {
            return events;
        }

        var title = events[OWN].meta.controlName;
        var evts = events[OWN].events;
        var listenerConfig;

        for (var key in evts) {
            listenerConfig = Object.create(null);
            listenerConfig.eventRegistry = evts[key].registry;
            listenerConfig.rootObjectName = OWN;
            listenerConfig.controlId = controlId;
            evts[key] = _formatEventValues(key, evts[key].paramsType, listenerConfig);
        }

        // Format fired events
        if (events.fired && Array.isArray(events.fired)) {
            events.fired = _assembleDataToView({
                title: 'Fired Events',
                data: events.fired.map(function (eventDetails) {
                    return _assembleDataToView({
                        title: eventDetails,
                        expandable: false,
                    });
                })
            });
        }

        events[OWN] = _assembleDataToView({
            controlId: controlId,
            expandable: false,
            title: title,
            editableValues: false
        });
        events[OWN].data = evts;
        events[OWN].options.title = '#<span class="controlId" data-control-id="' + controlId + '" title="Click to copy control to console">' + controlId + '</span><span gray>(' + title + ')</span>';

        _formatInheritedEvents(controlId, events);

        return events;
    };

    return {
        formatControlEvents: _formatControlEvents
    };
}());

// ================================================================================
// Binding Info
// ================================================================================
var controlBindings = (function () {

    /**
     *
     * @param {Object} initialControlBindingData - ToolsAPI.getControlBindings()
     * @param {Object} resultControlBindingData
     * @private
     */
    var _getControlContextPathFormattedForDataView = function (initialControlBindingData, resultControlBindingData) {
        if (initialControlBindingData.context) {
            resultControlBindingData.context = _assembleModelInfoDataview({
                title: 'Binding context',
                expandable: false,
                editableValues: false,
                parent: 'context'
            }, initialControlBindingData.context);
        }
    };

    /**
     *
     * @param {Object} initialControlBindingData - ToolsAPI.getControlBindings()
     * @param {Object} resultControlBindingData
     * @private
     */
    var _getControlPropertiesFormattedForDataView = function (initialControlBindingData, resultControlBindingData) {
        if (!initialControlBindingData.properties) {
            return;
        }

        for (var key in initialControlBindingData.properties) {
            var model = initialControlBindingData.properties[key].model;
            var properties = initialControlBindingData.properties[key];

            var options = {
                title: key + ' <opaque>(property)</opaque>',
                expandable: false,
                editableValues: false,
                data: {
                    type: properties.type,
                    mode: properties.mode
                },
                parent: key,
                showValue: true,
                controlId: initialControlBindingData.meta.controlId
            };

            resultControlBindingData[key] = _assembleModelInfoDataview(options, model);

            // Add the formatted data at the very end
            if (properties.formattedValue !== properties.value) {
                resultControlBindingData[key].data.formatted = properties.formattedValue;
            }
        }
    };

    /**
     *
     * @param {Object} initialControlBindingData - ToolsAPI.getControlBindingData()
     * @param {Object} resultControlBindingData
     * @private
     */
    var _getControlAggregationsFormattedForDataView = function (initialControlBindingData, resultControlBindingData) {
        if (!initialControlBindingData.aggregations) {
            return;
        }

        for (var index in initialControlBindingData.aggregations) {
            var model = initialControlBindingData.aggregations[index].model;
            resultControlBindingData[index] = _assembleModelInfoDataview({
                title: index + ' <opaque>(aggregation)</opaque>',
                expandable: false,
                editableValues: false,
                parent: index,
                data: {
                    mode: model.mode
                }
            }, model);
        }
    };

    return {
        getControlContextPathFormattedForDataView: _getControlContextPathFormattedForDataView,
        getControlPropertiesFormattedForDataView: _getControlPropertiesFormattedForDataView,
        getControlAggregationsFormattedForDataView: _getControlAggregationsFormattedForDataView
    };

}());

/**
 * Formatter function for each of the control's aggregations.
 * @param {string} aggregationName
 * @param {Array} aggregationValue
 * @param {string} aggregationType
 * @returns {Object}
 * @private
 */
var _formatAggregationValues = function (aggregationName, aggregationValue, aggregationType) {
    var isAggrPopulatedArr = Array.isArray(aggregationValue) && aggregationValue.length > 0;
    var idString = 'content (id)';
    var aggrTypeString = 'aggregation type';
    var aggr = _assembleDataToView({
            title: aggregationName,
            expandable: true,
            expanded: typeof aggregationValue === 'string' || isAggrPopulatedArr,
            editableValues: false,
            showTypeInfo: true,
        });

    if (isAggrPopulatedArr) {
        aggr.data[idString] = _assembleDataToView({
            expandable: true,
            expanded: false,
            editableValues: false,
            showTypeInfo: true,
            data: aggregationValue
        });
    } else {
        aggr.data[idString] = aggregationValue;
    }

    aggr.data[aggrTypeString] = aggregationType;

    return aggr;
};

// ================================================================================
// Control Aggregations Info
// ================================================================================
var controlAggregations = (function () {

    var OWN = 'own';
    var INHERITED = 'inherited';

    /**
     * Formatter for the inherited aggregations.
     * @param {string} controlId
     * @param {Object} aggregations - UI5 control aggregations
     * @private
     */
    var _formatInheritedAggregations = function (controlId, aggregations) {

        if (!aggregations[INHERITED]) {
            return;
        }

        for (var i = 0; i < aggregations[INHERITED].length; i++) {
            var parent = aggregations[INHERITED][i];
            var title = parent.meta.controlName;
            var aggrs = parent.aggregations;

            parent = _assembleDataToView({
                controlId: controlId,
                expandable: false,
                title: title,
                editableValues: false
            });

            for (var key in aggrs) {
                parent.data[key] = _formatAggregationValues(key, aggrs[key].value, aggrs[key].type);
            }

            var parentTitle = '<span gray>Inherits from</span>';
            parentTitle += ' (' + title + ')';
            parent.options.title = parentTitle;
            aggregations[INHERITED + i] = parent;
        }

        delete aggregations[INHERITED];
    };

    /**
     * Formatter function for the control aggregations data.
     * @param {string} controlId
     * @param {Object} aggregations
     * @returns {Object}
     * @private
     */
    var _formatControlAggregations = function (controlId, aggregations) {

        if (Object.keys(aggregations).length === 0) {
            return aggregations;
        }

        var title = aggregations[OWN].meta.controlName;
        var aggrs = aggregations[OWN].aggregations;

        for (var key in aggrs) {
            aggrs[key] = _formatAggregationValues(key, aggrs[key].value, aggrs[key].type);
        }

        aggregations[OWN] = _assembleDataToView({
            controlId: controlId,
            expandable: false,
            title: title,
            editableValues: false
        });
        aggregations[OWN].data = aggrs;
        aggregations[OWN].options.title = '#<span class="controlId" data-control-id="' + controlId + '" title="Click to copy control to console">' + controlId + '</span><span gray>(' + title + ')</span>';

        _formatInheritedAggregations(controlId, aggregations);

        return aggregations;
    };

    return {
        formatControlAggregations: _formatControlAggregations
    };
}());

// ================================================================================
// Public API
// ================================================================================
module.exports = {

    /**
     * Returns the entire control tree model.
     * @param {Array} controlTreeModel - ToolsAPI.getRenderedControlTree()
     * @param {Object} commonInformation - commonInformation property from ToolsAPI.getFrameworkInformation()
     * @returns {{versionInfo: {version: (string|*), framework: (*|string)}, controls: *}}
     */
    getControlTreeModel: function (controlTreeModel, commonInformation) {
        return {
            versionInfo: {
                version: commonInformation.version,
                framework: commonInformation.frameworkName
            },
            controls: controlTreeModel
        };
    },

    /**
     * Returns properties for control in a formatted way.
     * @param {string} controlId
     * @param {Object} properties
     * @returns {Object}
     */
    getControlPropertiesFormattedForDataView: function (controlId, properties) {
        return controlProperties.formatControlProperties(controlId, properties);
    },

    /**
     * Returns aggregations for control in a formatted way.
     * @param {string} controlId
     * @param {Object} aggregations
     * @returns {Object}
     */
    getControlAggregationsFormattedForDataView: function (controlId, aggregations) {
        return controlAggregations.formatControlAggregations(controlId, aggregations);
    },

    /**
     * Reformat all information needed for visualizing the control bindings.
     * @param {Object} controlBindingData - ToolsAPI.getControlBindingData()
     * @returns {Object}
     */
    getControlBindingsFormattedForDataView: function (controlBindingData) {
        var resultControlBindingData = Object.create(null);

        controlBindings.getControlContextPathFormattedForDataView(controlBindingData, resultControlBindingData);
        controlBindings.getControlPropertiesFormattedForDataView(controlBindingData, resultControlBindingData);
        controlBindings.getControlAggregationsFormattedForDataView(controlBindingData, resultControlBindingData);

        return resultControlBindingData;
    },

    /**
     * Returns events for control in a formatted way.
     * @param {string} controlId
     * @param {Object} events
     * @returns {Object}
     */
    getControlEventsFormattedForDataView: function (controlId, events) {
        return controlEvents.formatControlEvents(controlId, events);
    },
    /**
     * Returns actions for control.
     * @param {string} controlId
     * @returns {Object}
     */
    getControlActionsFormattedForDataView: function (controlId) {
        return {
            actions: {
                data: ['Focus', 'Invalidate', 'Copy to Console', 'Copy HTML to Console']
            },
            own: {
                options: {
                    controlId: controlId
                }
            }
        };
    },

    /**
     * Returns UI5 element, given its id.
     * @param {string} sId
     * @returns {Object}
     */
    getElementById: _getElementById
};
