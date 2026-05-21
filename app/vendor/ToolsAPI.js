sap.ui.define(["sap/ui/core/Core", "sap/ui/core/Element", "sap/ui/core/ElementMetadata"],
    function (Core, Element, ElementMetadata) {
        "use strict";

        var BaseConfig = sap.ui.require('sap/base/config/_Configuration');

        // ================================================================================
        // Technical Information
        // ================================================================================

        /**
         * Returns the framework name.
         * @returns {string}
         * @private
         */
        function _getFrameworkName(distributionName) {
            if (distributionName) {
                return distributionName.toLowerCase().indexOf("openui5") !== -1 ? "OpenUI5" : "SAPUI5";
            } else {
                return "";
            }
        }

        /**
         * Creates an object with the libraries and their version from the version info file.
         * @returns {Object}
         * @private
         */
        function _getLibraries() {
            var VersionInfo = sap.ui.require('sap/ui/VersionInfo');
            var libraries = VersionInfo?._content?.libraries;
            if (!libraries && typeof sap.ui.getVersionInfo === 'function') {
                libraries = sap.ui.getVersionInfo().libraries;
            }
            var formattedLibraries = Object.create(null);

            if (libraries?.length > 0) {
                libraries.forEach(function (element) {
                    formattedLibraries[element.name] = element.version;
                });
            }

            return formattedLibraries;
        }

        /**
         * Creates an object with the loaded libraries and their version.
         * @returns {Object}
         * @private
         */
        function _getLoadedLibraries() {
            var Lib = sap.ui.require('sap/ui/core/Lib');
            var libraries = Object.create(null);
            var formattedLibraries = Object.create(null);

            if (typeof Lib?.all === 'function') {
                libraries = Lib.all(); // obtains a map that contains the libraries that are already initialized
            } else if (typeof sap.ui.getCore === 'function'
                && typeof sap.ui.getCore().getLoadedLibraries === 'function') {
                libraries = sap.ui.getCore().getLoadedLibraries()
            }

            Object.keys(libraries).forEach(function (element) {
                formattedLibraries[element] = libraries[element].version;
            });

            return formattedLibraries;
        }

         /**
         * Returns information whether the framework is in debug mode.
         * @returns {boolean}
         * @private
         */

        function _getDebugModeInfo() {
            // check URI param

            if (!BaseConfig) {
                return false;
            }

            var vDebugInfo = BaseConfig.get({
                name: 'sapUiDebug',
                type: BaseConfig.Type.String,
                defaultValue: false,
                external: true,
                freeze: true
            });

            // check local storage
            try {
                vDebugInfo = vDebugInfo || window.localStorage.getItem('sap-ui-debug');
            } catch (e) {
                // access to localStorage might be disallowed
            }

            // normalize vDebugInfo; afterwards, it either is a boolean or a string not representing a boolean
            if ( typeof vDebugInfo === 'string' ) {
                if ( /^(?:false|true|x|X)$/.test(vDebugInfo) ) {
                    vDebugInfo = vDebugInfo !== 'false';
                }
            } else {
                vDebugInfo = !!vDebugInfo;
            }

            return vDebugInfo;
        }

        /**
         * Obtains the version info of the framework.
         * @returns {Promise}
         */
        function _loadVersionInfo() {
            var VersionInfo = sap.ui.require('sap/ui/VersionInfo');
            if (VersionInfo) {
                return VersionInfo.load();
            }
            if (typeof sap.ui.getVersionInfo === 'function') {
                return Promise.resolve(sap.ui.getVersionInfo());
            }
        }

        /**
         * Returns all declared modules in a sorted array.
         * @returns {Array|undefined}
         */
        function _getAllDeclaredModules() {
            var LoaderExtensions = sap.ui.require('sap/base/util/LoaderExtensions'),
                modules;;
            if (typeof LoaderExtensions?.getAllRequiredModules === 'function') {
                modules = LoaderExtensions.getAllRequiredModules();
            } else if (jQuery?.sap && typeof jQuery.sap.getAllDeclaredModules === 'function') {
                modules = jQuery.sap.getAllDeclaredModules();
            }
            if (modules) {
                return modules.sort();
            }
        }

        /**
         * Returns all URL parameters.
         */
        function _getURLParameters() {
            var oParams = new URLSearchParams(window.location.search);
            return Array.from(oParams.keys()).reduce(function(oResult, sKey) {
                oResult[sKey] = oParams.getAll(sKey);
                return oResult;
            }, {});
        }

        /**
         * Obtains the legacy global configuration object
         * @returns {Object}
         */
        function _getOptionalGlobalConfig() {
            if (typeof sap.ui.getCore === 'function' && typeof sap.ui.getCore().getConfiguration === 'function') {
                return sap.ui.getCore().getConfiguration();
            }
        }

        /**
         * Obtains the theme of the framework.
         * @returns {string}
         */
        function _getTheme() {
            var Theming = sap.ui.require('sap/ui/core/Theming');
            if (typeof Theming?.getTheme === 'function') {
                return Theming.getTheme();
            }
            return _getOptionalGlobalConfig()?.getTheme();
        }

        /**
         * Obtains the language of the framework.
         * @returns {string}
         */
        function _getLanguage() {
            var Localization = sap.ui.require('sap/base/i18n/Localization');
            if (typeof Localization?.getLanguage === 'function') {
                return Localization.getLanguage();
            }
            return _getOptionalGlobalConfig()?.getLanguage();
        }

        /**
         * Returns the format locale string with language and region code.
         * @returns {string}
         */
        function _getFormatLocale() {
            var Locale = sap.ui.require('sap/ui/core/Locale');
            var Formatting = sap.ui.require('sap/base/i18n/Formatting');
            if (typeof Formatting?.getLanguageTag === 'function') {
                return Formatting.getLanguageTag().toString();
            }
            return _getOptionalGlobalConfig()?.getFormatLocale();
        }

        /**
         * Returns a boolean value indicating whether the accessibility mode is enabled.
         * @returns {boolean}
         */
        function _getAccessibility() {
            var ControlBehavior = sap.ui.require('sap/ui/core/ControlBehavior');
            if (typeof ControlBehavior?.isAccessibilityEnabled === 'function') {
                return ControlBehavior.isAccessibilityEnabled();
            }
            return _getOptionalGlobalConfig()?.getAccessibility();
        }

        /**
         * Returns a boolean value indicating whether the animation mode is enabled.
         * @returns {boolean}
         */
        function _getAnimation() {
            var ControlBehavior = sap.ui.require('sap/ui/core/ControlBehavior');
            var AnimationMode = sap.ui.require('sap/ui/core/AnimationMode');
            if (AnimationMode && typeof ControlBehavior.getAnimationMode === 'function') {
                return (ControlBehavior.getAnimationMode() !== AnimationMode.minimal &&
                    ControlBehavior.getAnimationMode() !== AnimationMode.none);
            }
            return _getOptionalGlobalConfig().getAnimation();
        }

        /**
         * Returns a boolean value indicating whether the right-to-left mode is enabled.
         * @returns {boolean}
         */
        function _getRTL() {
            var Localization = sap.ui.require('sap/base/i18n/Localization');
            if (typeof Localization?.getRTL === 'function') {
                return Localization.getRTL();
            }
            return _getOptionalGlobalConfig().getRTL();
        }

        /**
         * Returns a boolean value indicating whether the debug mode is enabled.
         * @returns {boolean}
         */
        function _getDebug() {
            var Supportability = sap.ui.require('sap/ui/core/Supportability');
            if (typeof Supportability?.isDebugModeEnabled === 'function') {
                return Supportability.isDebugModeEnabled();
            }
            return _getOptionalGlobalConfig().getDebug();
        }

        /**
         * Returns a boolean value indicating whether the inspect mode is enabled.
         * @returns {boolean}
         */
        function _getInspect() {
            var Supportability = sap.ui.require('sap/ui/core/Supportability');
            if (typeof Supportability?.isControlInspectorEnabled === 'function') {
                return Supportability.isControlInspectorEnabled();
            }
            return _getOptionalGlobalConfig().getInspect();
        }

        /**
         * Returns a boolean value indicating whether the text origin information is collected.
         * @returns {boolean}
         */
        function _getOriginInfo() {
            var Supportability = sap.ui.require('sap/ui/core/Supportability');
            if (typeof Supportability?.collectOriginInfo === 'function') {
                return Supportability.collectOriginInfo();
            }
            return _getOptionalGlobalConfig().getOriginInfo();
        }

        /**
         * Returns a boolean value indicating whether there should be an exception on any duplicate element IDs.
         * @returns {boolean}
         */
        function _getNoDuplicateIds() {
            var oOptionalConfig = _getOptionalGlobalConfig();
            if (oOptionalConfig) {
                return oOptionalConfig.getNoDuplicateIds();
            }
            return true; // always true in 2.0
        }

        /**
         * Returns the version of the framework.
         * @returns {Object}
         */
        function _getVersion() {
            var Version = sap.ui.require('sap/base/util/Version');
            var VersionInfo = sap.ui.require('sap/ui/VersionInfo');
            var versionStr = VersionInfo?._content?.version;
            if (Version && versionStr) {
                return Version(versionStr);
            }
            return _getOptionalGlobalConfig().getVersion();
        }

        /**
         * Returns the registered element with the given ID, if any.
         * @param {sap.ui.core.ID|null|undefined} sId ID of the element to search for
         * @returns {sap.ui.core.Element|undefined} Element with the given ID or <code>undefined</code>
         */
        function _getElementById(sId) {
            if (typeof Element.getElementById === 'function') {
                return Element.getElementById(sId);
            }
            return sap.ui.getCore().byId(sId);
        }

        /**
         * Returns an object with all elements, keyed by their ID
         * @returns {Object}
         */
        function _getAllElements() {
            var ElementRegistry = sap.ui.require('sap/ui/core/ElementRegistry');
            if (ElementRegistry) {
                return ElementRegistry.all();
            }
            return Element.registry.all();
        }

        /**
         * Returns the default value for the given property.
         * @param {sap.ui.core.Element} oControl
         * @param {string} sPropertyName
         * @returns {*} The default value for the given property
         */
        function _getDefaultValueForProperty(oControl, sPropertyName) {
            var oProperty = oControl.getMetadata().getProperty(sPropertyName);
            if (typeof oProperty.getDefaultValue === 'function') {
                return oProperty.getDefaultValue();
            }
            return oProperty.defaultValue;
        }

        /**
         * Gets all the relevant information for the framework.
         * @returns {Promise}
         * @private
         */
        function _getFrameworkInformation() {
            return new Promise(function(resolve, reject) {
                _loadVersionInfo().then(function(oVersionInfo) {
                    var frameworkInfo = {
                        commonInformation: {
                            frameworkName: _getFrameworkName(oVersionInfo.name),
                            version: oVersionInfo.version,
                            buildTime: oVersionInfo.buildTimestamp,
                            userAgent: navigator.userAgent,
                            applicationHREF: window.location.href,
                            documentTitle: document.title,
                            documentMode: document.documentMode || "",
                            debugMode: _getDebugModeInfo(),
                            statistics: []
                        },

                        configurationBootstrap: window["sap-ui-config"] || Object.create(null),

                        configurationComputed: {
                            theme: _getTheme(),
                            language: _getLanguage(),
                            formatLocale: _getFormatLocale(),
                            accessibility: _getAccessibility(),
                            animation: _getAnimation(),
                            rtl: _getRTL(),
                            debug: _getDebug(),
                            inspect: _getInspect(),
                            originInfo: _getOriginInfo(),
                            noDuplicateIds: _getNoDuplicateIds()
                        },

                        libraries: _getLibraries(),

                        loadedLibraries: _getLoadedLibraries(),

                        loadedModules: _getAllDeclaredModules(),

                        URLParameters: _getURLParameters()
                    }
                    resolve(frameworkInfo);
                });
            });
        }

        // ================================================================================
        // Control tree Information
        // ================================================================================

        /**
         * Name space for all methods related to control trees
         */
        var controlTree = {
            /**
             * Creates data model of the rendered controls as a tree.
             * @param {Element} nodeElement - HTML DOM element from which the function will star searching.
             * @param {Array} resultArray - Array that will contains all the information.
             * @private
             */
            _createRenderedTreeModel: function (nodeElement, resultArray) {
                var node = nodeElement;
                var childNode = node.firstElementChild;
                var results = resultArray;
                var subResult = results;
                var control = _getElementById(node.id);

                if (node.getAttribute("data-sap-ui") && control) {
                    results.push({
                        id: control.getId(),
                        name: control.getMetadata().getName(),
                        type: "sap-ui-control",
                        content: []
                    });

                    subResult = results[results.length - 1].content;
                } else if (node.getAttribute("data-sap-ui-area")) {
                    results.push({
                        id: node.id,
                        name: "sap-ui-area",
                        type: "data-sap-ui",
                        content: []
                    });

                    subResult = results[results.length - 1].content;
                } else if (node.id && control && control.isA("sap.ui.core.Control") && control.getDomRef && control.getDomRef() === node) {
                    // Fallback for controls (e.g. sap.ui.core.HTML) that render without data-sap-ui on their root DOM node.
                    results.push({
                        id: control.getId(),
                        name: control.getMetadata().getName(),
                        type: "sap-ui-control",
                        content: []
                    });

                    subResult = results[results.length - 1].content;
                }

                while (childNode) {
                    this._createRenderedTreeModel(childNode, subResult);
                    childNode = childNode.nextElementSibling;
                }
            }
        };

        // ================================================================================
        // Control Information
        // ================================================================================

        /**
         * Name space for all information relevant for UI5 control
         */
        var controlInformation = {

            // Control Events Info
            // ================================================================================

            /**
             * Creates an array with the control events that are inherited.
             * @param {Object} control - UI5 control.
             * @returns {Array}
             * @private
             */
            _getInheritedEvents: function (control) {
                var result = [];
                var inheritedMetadata = control.getMetadata().getParent();

                while (inheritedMetadata instanceof ElementMetadata) {
                    result.push(this._prepareOwnOrInheritedEvents(control, inheritedMetadata));
                    inheritedMetadata = inheritedMetadata.getParent();
                }

                return result;
            },

            /**
             * Creates an object with all public control events.
             * @param {Object} control - UI5 control.
             * @param {Object} metadata - UI5 control metadata.
             * @returns {Object}
             * @private
             */
            _prepareOwnOrInheritedEvents: function (control, metadata) {
                var result = Object.create(null),
                    controlEventsFromMetadata = metadata.getEvents(),
                    eventRegistry = control.mEventRegistry,
                    metaParams, currRegistry, listener, view;

                result.meta = Object.create(null);
                result.meta.controlName = metadata.getName();

                result.events = Object.create(null);
                Object.keys(controlEventsFromMetadata).forEach(function (key) {
                    metaParams = controlEventsFromMetadata[key].appData && controlEventsFromMetadata[key].appData.parameters;
                    currRegistry = eventRegistry[key];
                    result.events[key] = Object.create(null);
                    result.events[key].paramsType = Object.create(null);

                    if (metaParams) {
                        for (var param in metaParams) {
                            result.events[key].paramsType[param] = metaParams[param].type;
                        }
                    }

                    result.events[key].registry = currRegistry && currRegistry.filter(function(listener) {
                        return !listener.fFunction.toString().includes('ui5-communication-with-injected-script');
                    }).map(function(currListener) {
                        view = currListener.oListener && currListener.oListener.oView;
                        listener = Object.create(null);
                        listener.viewId = view && view.sId;
                        listener.controllerName = view && view._controllerName;
                        listener.name = currListener.fFunction.name || "Anonymous";
                        listener.body = currListener.fFunction;
                        return listener;
                    }, this);

                }, this);

                return result;
            },

            /**
             * Removes the event listeners from the controls
             * @param {string} controlId
             * @private
             */
            _removeEventListeners: function (control) {
                if (control && control._attachedListeners) {
                    Object.keys(control._attachedListeners).forEach(eventName => {
                        control.detachEvent(eventName, control._attachedListeners[eventName]);
                    });
                    delete control._attachedListeners;
                }
            },

            /**
             * Cleares the logged fired events.
             * @param {string} controlId
             * @returns {Object}
             * @private
             */
            _clearEvents: function (controlId) {
                if (!this.firedEventsMap || !controlId) {
                    return null;
                }

                const control = _getElementById(controlId);

                if (!control) {
                    console.warn('Control not found for ID:', controlId);
                    return null;
                }

                // Clear the events for the specific control
                this.firedEventsMap.set(controlId, []);

                // Re-attach event listeners
                this._attachEventListeners(control);

                // Return the updated events structure
                return {
                    own: this._prepareOwnOrInheritedEvents(control, control.getMetadata()),
                    inherited: this._getInheritedEvents(control),
                    fired: []
                };
            },

             /**
             * Attaches events listeners to the controls
             * @param {string} control
             * @private
             */
            _attachEventListeners: function (control) {
                if (!control) {
                    return;
                }

                var eventNames = Object.keys(control.getMetadata().getEvents() || {}),
                    controlId = control.getId(),
                    self = this;

                if (!control._attachedListeners) {
                    control._attachedListeners = {};
                }

                eventNames.forEach(function (eventName) {
                    if (!control._attachedListeners[eventName]) {
                        var listener = function (event) {
                            var eventData = {
                                eventName: eventName,
                                timestamp: new Date().toLocaleTimeString(),
                                parameters: event.getParameters()
                            };

                            var firedEvents = self.firedEventsMap.get(controlId) || [];

                            firedEvents.push(eventData);
                            self.firedEventsMap.set(controlId, firedEvents);

                            document.dispatchEvent(new CustomEvent('ui5-communication-with-injected-script', {
                                detail: {
                                    action: 'do-event-fired',
                                    controlId: controlId
                                }
                            }));
                        };

                        control.attachEvent(eventName, listener);
                        control._attachedListeners[eventName] = listener;
                    }
                });
            },

            /**
             * Creates an object with all control events.
             * @param {string} controlId
             * @returns {Object}
             * @private
             */
            _getEvents: function (controlId) {
                var control = _getElementById(controlId),
                    events = Object.create(null);

                this._initializeEventsMap(controlId);

                if (control) {
                    events.own = this._prepareOwnOrInheritedEvents(control, control.getMetadata());
                    events.inherited = this._getInheritedEvents(control);
                    events.fired = this._getFiredEvents(controlId);
                }

                return events;
            },

             /**
             * Returns all fired event.
             * @param {string} controlId
             * @returns {Object}
             * @private
             */
            _getFiredEvents: function (controlId) {
                const firedEvents = this.firedEventsMap.get(controlId) || [];

                return firedEvents.map(event =>
                    `${event.eventName} event was fired at ${event.timestamp}`
                );
            },

             /**
             * Initializes events map.
             * @param {string} controlId
             * @private
             */
            _initializeEventsMap: function (controlId) {
                if (!this.firedEventsMap) {
                    this.firedEventsMap = new Map();
                }

                if (!this.firedEventsMap.has(controlId)) {
                    this.firedEventsMap.set(controlId, []);
                }
            },

            // Control Properties Info
            // ================================================================================

            /**
             * Creates an object with the control properties that are not inherited.
             * @param {Object} control - UI5 control.
             * @returns {Object}
             * @private
             */
            _getOwnProperties: function (control) {
                var result = Object.create(null);
                var controlPropertiesFromMetadata = control.getMetadata().getProperties();

                result.meta = Object.create(null);
                result.meta.controlName = control.getMetadata().getName();

                result.properties = Object.create(null);
                Object.keys(controlPropertiesFromMetadata).forEach(function (key) {
                    result.properties[key] = Object.create(null);
                    result.properties[key].value = control.getProperty(key);
                    result.properties[key].type = controlPropertiesFromMetadata[key].getType().getName ? controlPropertiesFromMetadata[key].getType().getName() : "";
                    result.properties[key].isDefault = _getDefaultValueForProperty(control, key) === control.getProperty(key);
                });

                return result;
            },

            /**
             * Copies the inherited properties of a UI5 control from the metadata.
             * @param {Object} control - UI5 Control.
             * @param {Object} inheritedMetadata - UI5 control metadata.
             * @returns {Object}
             * @private
             */
            _copyInheritedProperties: function (control, inheritedMetadata) {
                var inheritedMetadataProperties = inheritedMetadata.getProperties();
                var result = Object.create(null);

                result.meta = Object.create(null);
                result.meta.controlName = inheritedMetadata.getName();

                result.properties = Object.create(null);
                Object.keys(inheritedMetadataProperties).forEach(function (key) {
                    result.properties[key] = Object.create(null);
                    result.properties[key].value = inheritedMetadataProperties[key].get(control);
                    result.properties[key].type = inheritedMetadataProperties[key].getType().getName ? inheritedMetadataProperties[key].getType().getName() : "";
                    result.properties[key].isDefault = _getDefaultValueForProperty(control, key) === control.getProperty(key);
                });

                return result;
            },


            /**
             * Creates an array with the control properties that are inherited.
             * @param {Object} control - UI5 control.
             * @returns {Array}
             * @private
             */
            _getInheritedProperties: function (control) {
                var result = [];
                var inheritedMetadata = control.getMetadata().getParent();

                while (inheritedMetadata instanceof ElementMetadata) {
                    result.push(this._copyInheritedProperties(control, inheritedMetadata));
                    inheritedMetadata = inheritedMetadata.getParent();
                }

                return result;
            },

            /**
             * Creates an object with all control properties.
             * @param {string} controlId
             * @returns {Object}
             * @private
             */
            _getProperties: function (controlId) {
                var control = _getElementById(controlId);
                var properties = Object.create(null);

                if (control) {
                    properties.own = this._getOwnProperties(control);
                    properties.inherited = this._getInheritedProperties(control);
                    properties.isPropertiesData = true;
                }

                return properties;
            },

            // Control Aggregations Info
            // ================================================================================

            /**
             * Creates an array with the control aggregations that are inherited.
             * @param {Object} control - UI5 control.
             * @returns {Array}
             * @private
             */
            _getInheritedAggregations: function (control) {
                var result = [];
                var inheritedMetadata = control.getMetadata().getParent();

                while (inheritedMetadata instanceof ElementMetadata) {
                    result.push(this._prepareOwnOrInheritedAggregations(control, inheritedMetadata));
                    inheritedMetadata = inheritedMetadata.getParent();
                }

                return result;
            },

            /**
             * Creates an object with all public control aggregations.
             * @param {Object} control - UI5 control.
             * @param {Object} metadata - UI5 control metadata.
             * @returns {Object}
             * @private
             */
            _prepareOwnOrInheritedAggregations: function (control, metadata) {
                var result = Object.create(null),
                    controlAggregationsFromMetadata = metadata.getAggregations();

                result.meta = Object.create(null);
                result.meta.controlName = metadata.getName();

                result.aggregations = Object.create(null);
                Object.keys(controlAggregationsFromMetadata).forEach(function (key) {
                    result.aggregations[key] = Object.create(null);
                    result.aggregations[key].value = this._getAggregationContent(control.getAggregation(key));
                    result.aggregations[key].type = controlAggregationsFromMetadata[key].type;
                }, this);

                return result;
            },

            /**
             * Gets the content of an aggregation.
             * If the content has an ID, it returns the ID.
             * It returns string, array or null depending on the aggregation status.
             * @param {Object} aggregation
             * @private
             */
            _getAggregationContent: function (aggregation) {
                var content;

                if (aggregation === null) {
                    content = null;
                } else if (aggregation.getId) {
                    content = aggregation.getId();
                } else if (Array.isArray(aggregation)) {
                    content = aggregation.map(function(currAggregation) {
                        return currAggregation.getId()
                    });
                } else {
                    // In some cases like the sap.ui.core.TooltipBase, the aggregation
                    // itself might be of primitive (String) type
                    content = aggregation;
                }

                return content;
            },

            /**
             * Creates an object with all control aggregations.
             * @param {string} controlId
             * @returns {Object}
             * @private
             */
            _getAggregations: function (controlId) {
                var control = _getElementById(controlId);
                var aggregations = Object.create(null);

                if (control) {
                    aggregations.own = this._prepareOwnOrInheritedAggregations(control, control.getMetadata());
                    aggregations.inherited = this._getInheritedAggregations(control);
                }

                return aggregations;
            },

            // Binding Info
            // ================================================================================

            /**
             * Creates an object containing all information about a model, it"s data and the
             * data with respect to the given path.
             *
             * @param {Object} model - model can be either a "real" model or a model-context
             * @param {string} path
             * @param {Object} [binding]
             * @returns {Object}
             * @private
             */
            _getModelInfo: function (model, path, binding) {
                if (!model) {
                    return null;
                }

                if (path === null || path === undefined) {
                    path = "";
                }
                var modelInfo = {
                    type: "",
                    modelName: "",
                    modelData: "",
                    path: "",
                    fullPath: "",
                    pathData: "",
                    mode: ""
                };
                try {
                    var pathParts = path.split(">");
                    var pathContainsModelName = pathParts.length > 1;
                    var pathWithoutModel = pathContainsModelName ? pathParts[1] : pathParts[0];
                    var isRelative = pathWithoutModel.indexOf("/") !== 0;
                    var type = model.getMetadata().getName();
                    var bindingType = binding && binding.getMetadata().getName() || "";
                    var isResourceModel = type === "sap.ui.model.resource.ResourceModel";
                    var fullPath;
                    var contextPath;
                    // Remember the context in case it is odata.v4.Context
                    var context = type === 'sap.ui.model.odata.v4.Context' && model;

                    // we dont care about the context if path is absolute
                    if(!isRelative) {
                        model = model.getModel && model.getModel() || model;
                    }

                    // include contextpath if any (getPath function is only defined on model-context)
                    contextPath = isRelative && model.getPath && model.getPath() || "";
                    // when the model is resource the full path must be without /
                    if (isRelative && pathWithoutModel && !isResourceModel) {
                        fullPath = contextPath + "/" + pathWithoutModel;
                    } else {
                        fullPath = contextPath + pathWithoutModel;
                    }
                    // in case its a model context, retrieve the underlying model
                    model = model.getModel && model.getModel() || model;

                    // in case it is v4 ODataContext we get the data from the context
                    if (context) {
                        // There is no modelData in OData v4 just pathData
                        modelInfo.pathData = path !== context.getPath() ? context.getObject(path) : context.getObject();
                    } else {
                        // functions in the model cannot communicated via message
                        modelInfo.modelData = isResourceModel || type.startsWith("sap.ui.model.odata.v4") ? "" : model.getObject(contextPath || "/");
                        if (bindingType.endsWith("ODataListBinding")) {
                            // the binding has the data
                            modelInfo.pathData = binding.getAllCurrentContexts().map(c => c.getObject());
                        } else {
                            modelInfo.pathData = model.getProperty(fullPath);
                        }
                    }
                    modelInfo.fullPath = fullPath;
                    modelInfo.path = pathWithoutModel;
                    modelInfo.mode =  model.getDefaultBindingMode();
                    modelInfo.modelName = pathContainsModelName ? pathParts[0] : undefined;
                    modelInfo.type = type;
                }
                catch(err) {
                    // Here we catch error in different cases for handling getObject function
                    // Such an error is thrown when the model is OData v4 because the getObject
                    // throws error.
                    console.warn("UI5 Inspector: ", err);

                }

                return modelInfo;
            },

            /**
             * Helper to format input for _getModelInfo-function based on binding information.
             *
             * @param {Object} binding
             * @param {string} bindingInfo
             * @returns {Object}
             * @private
             */
            _getModelInfoFromBinding: function (binding, bindingInfo) {
                return this._getModelInfo(binding.getContext() || binding.getModel(), (bindingInfo.model ? bindingInfo.model + ">" : "") + bindingInfo.path, binding);
            },

            /**
             * Creates an object with the context model of a UI5 control.
             * @param {Object} control
             * @param {string} controlProperty
             * @returns {Object}
             * @private
             */
            _getModelFromContext: function (control, controlProperty) {
                var bindingInfo = control.getBindingInfo(controlProperty);
                var binding = bindingInfo.binding;
                var bindingParts = binding.getBindings && binding.getBindings();
                var model = {};

                if(bindingInfo.parts) {
                    // take care of multiple bindings of a property
                    model.parts = bindingInfo.parts.map(function (bindingInfoPart, index) {
                        var currentBinding = bindingParts && bindingParts[index] || binding;
                        return this._getModelInfoFromBinding(currentBinding, bindingInfoPart);
                    }.bind(this));
                } else {
                    model = this._getModelInfoFromBinding(binding, bindingInfo);
                }

                return model;
            },

            /**
             * Creates an object with the properties bindings of a UI5 control.
             * @param {Object} control
             * @returns {Object}
             * @private
             */
            _getBindDataForProperties: function (control) {
                var properties = control.getMetadata().getAllProperties();
                var propertiesBindingData = Object.create(null);

                for (var key in properties) {
                    if (properties.hasOwnProperty(key) && control.getBinding(key)) {
                        var binding = control.getBinding(key);
                        var bindingInfo = control.getBindingInfo(key);
                        propertiesBindingData[key] = Object.create(null);
                        // When we have composite binding getPath() function throws error so we need to check if this is the case.
                        propertiesBindingData[key].path = bindingInfo.parts ? "" : binding.getPath();
                        propertiesBindingData[key].value = binding.getValue();
                        propertiesBindingData[key].formattedValue = control.getProperty(key);
                        propertiesBindingData[key].type =
                            control.getMetadata().getProperty(key) &&
                            control.getMetadata().getProperty(key).getType() &&
                            control.getMetadata().getProperty(key).getType().getName ? control.getMetadata().getProperty(key).getType().getName() : "";
                        propertiesBindingData[key].mode = binding.getBindingMode();
                        propertiesBindingData[key].model = this._getModelFromContext(control, key);
                    }
                }

                return propertiesBindingData;
            },

            /**
             * Creates an object with the aggregations bindings of a UI5 control.
             * @param {Object} control
             * @returns {Object}
             * @private
             */
            _getBindDataForAggregations: function (control) {
                var aggregations = control.getMetadata().getAllAggregations();
                var aggregationsBindingData = Object.create(null);

                for (var key in aggregations) {
                    if (aggregations.hasOwnProperty(key) && control.getBinding(key)) {
                        aggregationsBindingData[key] = Object.create(null);
                        aggregationsBindingData[key].model = this._getModelFromContext(control, key);
                    }
                }

                return aggregationsBindingData;
            },

            /**
             * Creates an object with a parts array containing all binding contexts for the given control.
             * ATTENTION: This function makes use of internal variables to retrieve the required information.
             * TODO: Is this possible without accessing internals?
             *
             * @param {Object} control
             * @returns {Object}
             * @private
             */
            _getBindingContextsForControl: function(control) {
                var bindingContexts = Object.assign({},
                    control.oPropagatedProperties && control.oPropagatedProperties.oBindingContexts,
                    control.oBindingContexts,
                    control.mElementBindingContexts
                );
                // reduce object to non-empty contexts
                bindingContexts = Object.keys(bindingContexts).reduce(function(finalContexts, key) {
                    if(bindingContexts[key]) {
                        finalContexts[key] = bindingContexts[key];
                    }
                    return finalContexts;
                }, {});
                if (bindingContexts && Object.keys(bindingContexts).length) {
                    return {
                        parts: Object.keys(bindingContexts).map(function (key) {
                            var context = bindingContexts[key];
                            var modelOrContext = context.getMetadata().getName() === 'sap.ui.model.odata.v4.Context' ? context : context.getModel();
                            return controlInformation._getModelInfo(modelOrContext,
                                (key && key !== "undefined" && key !== "null" ? key + ">" : "") + context.getPath());
                        })
                    };
                }
                return null;
            },

        };

        var elementRegistry = {
            getRegisteredElements: function () {
                var isSupported = _getVersion().compareTo("1.67") >= 0,
                    aRegisteredElements = [],
                    oElements;

                if (isSupported) {
                    oElements = _getAllElements();

                    Object.keys(oElements).forEach(function (sKey) {
                        var oElement = oElements[sKey];
                        var oParent = oElement.getParent();
                        var sElementId = oElement.getId();
                        var sControllerName = oElement._xContent && _getElementById(sElementId).getControllerName();
                        var sControllerRelPath = sControllerName && sap.ui.require.toUrl(sControllerName.replaceAll('.', '/') + '.controller.js');

                        aRegisteredElements.push({
                            id: sElementId,
                            type: oElement.getMetadata().getName(),
                            isControl: oElement.isA("sap.ui.core.Control"),
                            isRendered: oElement.isActive(),
                            parentId: oParent && (oParent.isA("sap.ui.core.Control") || oParent.isA("sap.ui.core.Element")) ? oParent.getId() : '',
                            aggregation: oElement.sParentAggregationName ? oElement.sParentAggregationName : '',
                            xml: oElement._xContent && (new XMLSerializer()).serializeToString(oElement._xContent),
                            controllerInfo: {sControllerName, sControllerRelPath}
                        })
                    });
                }

                return {aRegisteredElements, isSupported};
            }
        }

        // ================================================================================
        // Public API
        // ================================================================================

        /**
         * Global object that provide common information for all support tools
         * @type {{
         *  getFrameworkInformation: Function,
         *  getRenderedControlTree: Function,
         *  clearEvents: Function,
         *  getControlProperties: Function,
         *  getControlAggregations: Function,
         *  getControlEvents: Function,
         *  getControlBindingInformation: Function,
         *  attachEventListeners: Function,
         *  removeEventListeners: Function
         * }}
         */
        return {

            /**
             * Common information about the framework
             * @returns {*}
             */
            getFrameworkInformation: _getFrameworkInformation,

            /**
             * Array model of the rendered control as a tree.
             * @returns {Array}
             */
            getRenderedControlTree: function () {
                var renderedControlTreeModel = [];
                controlTree._createRenderedTreeModel(document.body, renderedControlTreeModel);

                return renderedControlTreeModel;
            },

            /**
             * Gets all control properties.
             * @param {string} controlId
             * @returns {Object}
             */
            getControlProperties: function (controlId) {
                return controlInformation._getProperties(controlId);
            },

            /**
             * Gets all control aggregations.
             * @param {string} controlId
             * @returns {Object}
             */
            getControlAggregations: function (controlId) {
                return controlInformation._getAggregations(controlId);
            },

            /**
             * Gets control binding information.
             * @param {string} controlId
             * @returns {Object}
             */
            getControlBindings: function (controlId) {
                var result = Object.create(null);
                var control = _getElementById(controlId);

                if (!control) {
                    return result;
                }

                result.meta = Object.create(null);
                result.meta.controlId = controlId;
                result.aggregations = controlInformation._getBindDataForAggregations(control);
                result.properties = controlInformation._getBindDataForProperties(control);
                result.context = controlInformation._getBindingContextsForControl(control);

                return result;
            },

            /**
             * Gets all control events.
             * @param {string} controlId
             * @returns {Object}
             */
            getControlEvents: function (controlId) {
                return controlInformation._getEvents(controlId);
            },

            /**
             * Removes event listeners from the controls.
             * @param {string} controlId
             */
            removeEventListeners: function (control) {
                return controlInformation._removeEventListeners(control);
            },

            /**
             * Attaches event listeners to the controls.
             * @param {string} control
             */
            attachEventListeners: function (control) {
                return controlInformation._attachEventListeners(control);
            },

            /**
             * Cleares the logged fired events.
             * @param {string} controlId
             * @returns {Object}
             */
            clearEvents: function(controlId) {
                return controlInformation._clearEvents(controlId);
            },

            getRegisteredElements: elementRegistry.getRegisteredElements
        };

    });
