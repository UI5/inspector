
(function () {
    'use strict';

    // ================================================================================
    // Main controller for 'UI5' tab in devtools
    // ================================================================================

    // ================================================================================
    // Bootstrap
    // ================================================================================

    // Components that need to be required and reference
    // ================================================================================
    var utils = require('../../../modules/utils/utils.js');
    var TabBar = require('../../../modules/ui/TabBar.js');
    var FrameSelect = require('../../../modules/ui/FrameSelect.js');
    var ControlTree = require('../../../modules/ui/ControlTree.js');
    var DataView = require('../../../modules/ui/DataView.js');
    var Splitter = require('../../../modules/ui/SplitContainer.js');
    var ODataDetailView = require('../../../modules/ui/ODataDetailView.js');
    var ODataMasterView = require('../../../modules/ui/ODataMasterView.js');
    var XMLDetailView = require('../../../modules/ui/XMLDetailView.js');
    var ControllerDetailView = require('../../../modules/ui/ControllerDetailView.js');
    var OElementsRegistryMasterView = require('../../../modules/ui/OElementsRegistryMasterView.js');
    var AIChat = require('../../../modules/ui/AIChat.js');

    // Apply theme
    // ================================================================================
    utils.applyTheme(chrome.devtools.panels.themeName);

    // Create a port with background page for continuous message communication
    // ================================================================================
    var port = Object.assign(utils.getPort(), {
        onMessage: function (callback) {
            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                // accept only messages from the inspected tab
                // or from the extension's own background script
                if ((sender.tab && sender.tab.id === chrome.devtools.inspectedWindow.tabId) ||
                    (!sender.tab && sender.id === chrome.runtime.id)) {
                    callback(request, sender, sendResponse);
                }
            });
        }
    });

    // Bootstrap for 'Control inspector' tab
    // ================================================================================
    utils.setOSClassName();

    var frameData = {};
    var framesSelect;
    var displayFrameData;
    var updateSupportabilityOverlay;
    var sharedDataViewOptions = {

        /**
         * Send message upon click to copy control to console
         * @param {Object} data
         */
        onCopyControlToConsole: function(data) {
            port.postMessage({
                action: 'do-copy-control-to-console',
                data: data,
                frameId: framesSelect.getSelectedId()
            });
        }
    };

    // Main tabbar inside 'UI5' devtools panel
    var UI5TabBar = new TabBar('ui5-tabbar');

    // Horizontal Splitter for 'Control Inspector' tab
    var controlInspectorHorizontalSplitter = new Splitter('control-inspector-splitter', {
        endContainerWidth: '400px'
    });

    // Control tree
    var controlTree = new ControlTree('control-tree', {

        /**
         * Send message, that the a new element is selected in the ControlTree.
         * @param {string} selectedElementId
         */
        onSelectionChanged: function (selectedElementId) {
            port.postMessage({
                action: 'do-control-select',
                target: selectedElementId,
                frameId: framesSelect.getSelectedId()
            });
            frameData[framesSelect.getSelectedId()].selectedElementId = selectedElementId;
        },

        /**
         * Send message, that the a new element is hovered in the ControlTree.
         * @param {string} hoveredElementId
         */
        onHoverChanged: function (hoveredElementId) {
            port.postMessage({
                action: 'on-control-tree-hover',
                target: hoveredElementId,
                frameId: framesSelect.getSelectedId()
            });
        },

        /**
         * Fired at first rendering of the ControlTree.
         */
        onInitialRendering: function () {
            var controls = this.getData().controls;
            this.setSelectedElement(controls[0].id);
        }
    });

    // Tabbar for Controltree additional information (Properties, Binding and etc)
    var controlTreeTabBar = new TabBar('control-tree-tabbar');

    // Dataview for control properties
    var controlProperties = new DataView('control-properties', Object.assign({

        /**
         * Send message, that an proprety in the DataView is changed.
         * @param {Object} changeData
         */
        onPropertyUpdated: function (changeData) {
            port.postMessage({
                action: 'do-control-property-change',
                data: changeData,
                frameId: framesSelect.getSelectedId()
            });
        }
    }, sharedDataViewOptions));

    // Vertical splitter for 'Bindings' tab
    var controlBindingsSplitter = new Splitter('control-bindings-splitter', {
        hideEndContainer: true,
        isEndContainerClosable: true,
        endContainerTitle: 'Model Information'
    });

    // Dataview for control aggregations
    var controlAggregations = new DataView('control-aggregations', sharedDataViewOptions);

    // Dataview for control binding information
    var controlBindingInfoRightDataView = new DataView('control-bindings-right');

    // Dataview for control binding information - left part
    var controlBindingInfoLeftDataView = new DataView('control-bindings-left', {

        /**
         * Method fired when a clickable element is clicked.
         * @param {Object} event
         */
        onValueClick: function (event) {
            var dataFormatedForDataView = {
                modelInfo: {
                    options: {
                        title: 'Model Information',
                        expandable: false,
                        expanded: true,
                        hideTitle: true
                    },
                    data: event.data
                }
            };

            controlBindingInfoRightDataView.setData(dataFormatedForDataView);
            controlBindingsSplitter.showEndContainer();
        }
    });

    // Dataview for control events
    var controlEvents = new DataView('control-events', Object.assign ({

        /**
         * Method fired when a clickable element is clicked.
         * @param {Object} event
         */
        onValueClick: function (event) {
            port.postMessage({
                action: 'do-console-log-event-listener',
                data: event.data,
                frameId: framesSelect.getSelectedId()
            });
        },
        /**
         * Method fired when Clear fired events button is clicked.
         * @param {Object} changeData
         */
        onClearEvents(changeData) {
            port.postMessage({
                action: 'do-control-clear-events',
                target: changeData.controlId,
                tabId: chrome.devtools.inspectedWindow.tabId
            });
        }
    }, sharedDataViewOptions));

    var controlActions = new DataView('control-actions', Object.assign({
        onControlInvalidated: function (changeData) {
            port.postMessage({
                action: 'do-control-invalidate',
                data: changeData
            });
        },

        onControlFocused: function (changeData) {
            port.postMessage({
                action: 'do-control-focus',
                data: changeData
            });
        },
        onCopyControlHTMLToConsole: function (changeData) {
            port.postMessage({
                action: 'do-control-copy-html',
                target: changeData.controlId,
                tabId: chrome.devtools.inspectedWindow.tabId,
                file: '/scripts/background/main.js'
            });
        }
    }, sharedDataViewOptions));

    // Bootstrap for 'Control inspector' tab
    // ================================================================================

    // Dataview for 'Application information' tab
    var appInfo = new DataView('app-info');

    // Bootstrap for 'OData' tab
    // ================================================================================
    var odataHorizontalSplitter = new Splitter('odata-splitter', {
        endContainerWidth: '50%',
        isEndContainerClosable: true,
        hideEndContainer: true
    });

    // Dataview for OData requests
    // ================================================================================
    var oDataDetailView = new ODataDetailView('odata-tab-detail');
    new ODataMasterView('odata-tab-master', {
        /**
         * Method fired when an OData Entry log is selected.
         * @param {Object} data
         */
        onSelectItem: function (data) {
            odataHorizontalSplitter.showEndContainer();
            oDataDetailView.update(data);
        },
        /**
         * Clears all OData Entry log items.
         */
        onClearItems: function () {
            oDataDetailView.clear();
            odataHorizontalSplitter.hideEndContainer();
        }
    });

    // XML visualization for XML Views
    var oXMLDetailView = new XMLDetailView('elements-registry-control-xmlview');
    var oControllerDetailView = new ControllerDetailView('elements-registry-control-controller');
    var oElementsRegistryMasterView = new OElementsRegistryMasterView('elements-registry-tab-master', {
        XMLDetailView: oXMLDetailView,
        ControllerDetailView: oControllerDetailView,
        /**
         * Method fired when a Control is selected.
         * @param {string} sControlId
         */
        onSelectItem: function (sControlId) {
            /**
             * Send message, that the a new element is selected in the ElementsRegistry tab.
             * @param {string} sControlId
             */
            port.postMessage({
                action: 'do-control-select-elements-registry',
                target: sControlId,
                frameId: framesSelect.getSelectedId()
            });
        },
        /**
         * Refresh ElementRegistry tab.
         */
        onRefreshButtonClicked: function () {
            port.postMessage({
                action: 'do-elements-registry-refresh',
                frameId: framesSelect.getSelectedId()
            });
        }
    });

    // Horizontal Splitter for 'Elements Registry' tab
    var controlInspectorHorizontalSplitterElementsRegistry = new Splitter('elements-registry-splitter', {
        endContainerWidth: '400px'
    });

    // Tabbar for Elements Registry additional information (Properties, Binding and etc)
    var elementsRegistryTabBar = new TabBar('elements-registry-tabbar');

    // Dataview for control properties
    var controlPropertiesElementsRegistry = new DataView('elements-registry-control-properties', Object.assign({

        /**
         * Send message, that an proprety in the DataView is changed.
         * @param {Object} changeData
         */
        onPropertyUpdated: function (changeData) {
            port.postMessage({
                action: 'do-control-property-change-elements-registry',
                data: changeData,
                frameId: framesSelect.getSelectedId()
            });
        }
    }, sharedDataViewOptions));

    // Vertical splitter for 'Bindings' tab
    var controlBindingsSplitterElementsRegistry = new Splitter('elements-registry-control-bindings-splitter', {
        hideEndContainer: true,
        isEndContainerClosable: true,
        endContainerTitle: 'Model Information'
    });

    // Dataview for control aggregations
    var controlAggregationsElementsRegistry = new DataView('elements-registry-control-aggregations', sharedDataViewOptions);

    // Dataview for control binding information
    var controlBindingInfoRightDataViewElementsRegistry = new DataView('elements-registry-control-bindings-right');

    // Dataview for control binding information - left part
    var controlBindingInfoLeftDataViewElementsRegistry = new DataView('elements-registry-control-bindings-left', {

        /**
         * Method fired when a clickable element is clicked.
         * @param {Object} event
         */
        onValueClick: function (event) {
            var dataFormatedForDataView = {
                modelInfo: {
                    options: {
                        title: 'Model Information',
                        expandable: false,
                        expanded: true,
                        hideTitle: true
                    },
                    data: event.data
                }
            };

            controlBindingInfoRightDataViewElementsRegistry.setData(dataFormatedForDataView);
            controlBindingsSplitterElementsRegistry.showEndContainer();
        }
    });

    // Dataview for control events
    var controlEventsElementsRegistry = new DataView('elements-registry-control-events', Object.assign({

        /**
         * Method fired when a clickable element is clicked.
         * @param {Object} event
         */
        onValueClick: function (event) {
            port.postMessage({
                action: 'do-console-log-event-listener',
                data: event.data,
                frameId: framesSelect.getSelectedId()
            });
        }
    }, sharedDataViewOptions));

    displayFrameData = function (options) {
        var frameId = options.selectedId;
        var oldFrameId = options.oldSelectedId;
        var UI5Data = frameData[frameId];

        framesSelect.setSelectedId(frameId);
        updateSupportabilityOverlay();

        if (UI5Data) {
            controlTree.setData(UI5Data.controlTree);
            UI5Data.selectedElementId && controlTree.setSelectedElement(UI5Data.selectedElementId);
            appInfo.setData(UI5Data.applicationInformation);
            UI5Data.elementRegistry && oElementsRegistryMasterView.setData(UI5Data.elementRegistry);

            controlProperties.setData(UI5Data.controlProperties || {});
            controlBindingInfoLeftDataView.setData(UI5Data.controlBindings || {});
            controlAggregations.setData(UI5Data.controlAggregations || {});
            controlEvents.setData(UI5Data.controlEvents || {});

            controlPropertiesElementsRegistry.setData({});
            controlBindingInfoLeftDataViewElementsRegistry.setData({});
            controlAggregationsElementsRegistry.setData({});
            controlEventsElementsRegistry.setData({});

            // Set bindings count
            if (UI5Data.controlBindings) {
                document.querySelector('#tab-bindings count').innerHTML = '&nbsp;(' + Object.keys(UI5Data.controlBindings).length + ')';
            }
            controlTree.setSelectedElement(UI5Data.nearestUI5Control);
        }

        // after switching to inspect a new frame,
        // hide any highlights that were needed for
        // the previousy inspected frame
        port.postMessage({
            action: 'on-hide-highlight',
            frameId: oldFrameId
        });
    };

    updateSupportabilityOverlay = function () {
        var currentFrameData = frameData[framesSelect.getSelectedId()];
        if (!currentFrameData) {
            return;
        }

        var overlay = document.getElementById('supportability');
        var overlayNoUI5Section = overlay.querySelector('[no-ui5-version]');
        var overlayUnsupportedVersionSection = overlay.querySelector('[unsupported-version]');

        var showOverlay = !currentFrameData.isUI5Detected || !currentFrameData.isVersionSupported;
        var showNoUI5Overlay = !currentFrameData.isUI5Detected;
        var showUnsupportedVersionOverlay = currentFrameData.isUI5Detected && !currentFrameData.isVersionSupported;

        overlay.hidden = !showOverlay;
        overlayNoUI5Section.style.display = showNoUI5Overlay ? 'block' : 'none';
        overlayUnsupportedVersionSection.style.display = showUnsupportedVersionOverlay ? 'block' : 'none';
    };

    framesSelect = new FrameSelect('frame-select', {
        onSelectionChange: displayFrameData
    });

    // AI Chat component
    var aiChat = new AIChat('ai-chat', {
        getAppInfo: function () {
            var currentFrameId = framesSelect.getSelectedId();
            console.log('[main.js] getAppInfo called. currentFrameId:', currentFrameId);
            console.log('[main.js] frameData:', frameData);
            return frameData[currentFrameId] ? frameData[currentFrameId].applicationInformation : null;
        }
    });

    // ================================================================================
    // Communication
    // ================================================================================

    // Name space for message handler functions.
    var messageHandler = {

        /**
         * Handler for UI5 detection on the current inspected page.
         * @param {Object} message
         */
        'on-ui5-detected': function (message, messageSender) {
            frameData[messageSender.frameId] = {
                isUI5Detected: true,
                isVersionSupported: message.isVersionSupported,
                url: messageSender.url
            };
            framesSelect.setData(frameData);

            if (framesSelect.getSelectedId() === messageSender.frameId) {
                updateSupportabilityOverlay();
            }

            port.postMessage({
                action: 'do-script-injection',
                tabId: chrome.devtools.inspectedWindow.tabId,
                frameId: messageSender.frameId,
                file: '/scripts/content/main.js'
            });
        },

        /**
         * Get the initial needed information, when the main injected script is available.
         * @param {Object} message
         */
        'on-main-script-injection': function (message, messageSender) {
            port.postMessage({
                action: 'get-initial-information',
                frameId: messageSender.frameId
            });
        },

        /**
         * Visualize the initial needed data for the extension.
         * @param {Object} message
         */
        'on-receiving-initial-data': function (message, messageSender) {
            var frameId = messageSender.frameId;
            frameData[frameId].controlTree = message.controlTree;
            frameData[frameId].applicationInformation = message.applicationInformation;
            frameData[frameId].elementRegistry = message.elementRegistry;

            if (framesSelect.getSelectedId() === frameId) {
                controlTree.setData(message.controlTree);

                // Set URL for AI Chat history
                aiChat.setUrl(frameData[frameId].url);
                appInfo.setData(message.applicationInformation);
                oElementsRegistryMasterView.setData(message.elementRegistry);
            }
        },

        /**
         * Refresh Elements Registry data.
         * @param {Object} message
         */
        'on-receiving-elements-registry-refresh-data': function (message, messageSender) {
            var frameId = messageSender.frameId;
            frameData[frameId].elementRegistry = message.elementRegistry;
            if (framesSelect.getSelectedId() === frameId) {
                oElementsRegistryMasterView.setData(message.elementRegistry);
            }
        },

        /**
         * Updates the ControlTree, when the DOM in the inspected window is changed.
         * @param {Object} message
         */
        'on-application-dom-update': function (message, messageSender) {
            var frameId = messageSender.frameId;
            var frameIds = Object.keys(frameData).map( x => parseInt(x));
            frameData[frameId].controlTree = message.controlTree;
            if (framesSelect.getSelectedId() === frameId) {
                controlTree.setData(message.controlTree);
            }

            if (frameIds.length > 1) {
                // send a request to the background script
                // to ping each of the frame ids listed in <code>aFrameIds</code>
                // The background page will send an "on-ping-frames" async response
                // with the updated list once it pinged all individual frames
                port.postMessage({
                    action: 'do-ping-frames',
                    frameIds: frameIds
                });
            }
        },

        /**
         * Event update handler.
         * @param {Object} message
         */

        'on-event-update': function (message, messageSender) {
            var frameId = messageSender.frameId;
            if (framesSelect.getSelectedId() === frameId) {
                controlEvents.setData(message.controlEvents);
            }
        },

        /**
         * Handler for ControlTree element selecting.
         * @param {Object} message
         */

        'on-control-select': function (message, messageSender) {
            var frameId = messageSender.frameId;
            frameData[frameId].controlProperties = message.controlProperties;
            frameData[frameId].controlBindings = message.controlBindings;
            frameData[frameId].controlAggregations = message.controlAggregations;
            frameData[frameId].controlEvents = message.controlEvents;

            if (framesSelect.getSelectedId() === frameId) {
                controlProperties.setData(message.controlProperties);
                controlBindingInfoLeftDataView.setData(message.controlBindings);
                controlAggregations.setData(message.controlAggregations);
                controlEvents.setData(message.controlEvents);
                controlActions.setData(message.controlActions);

                // Set bindings count
                document.querySelector('#tab-bindings count').innerHTML = '&nbsp;(' + Object.keys(message.controlBindings).length + ')';

                // Close possible open binding info and/or methods info
                controlBindingsSplitter.hideEndContainer();

                // Update AI Chat context with control data
                var controlId = message.controlProperties.own && message.controlProperties.own.options && message.controlProperties.own.options.controlId;
                var controlType = null;
                if (message.controlProperties.own && message.controlProperties.own.options && message.controlProperties.own.options.title) {
                    var titleMatch = message.controlProperties.own.options.title.match(/\(([^)]+)\)<\/span>$/);
                    if (titleMatch) {
                        controlType = titleMatch[1];
                    }
                }

                aiChat.updateContext({
                    control: {
                        type: controlType,
                        id: controlId,
                        properties: message.controlProperties,
                        bindings: message.controlBindings,
                        aggregations: message.controlAggregations
                    },
                    appInfo: frameData[frameId].applicationInformation
                });
            }
        },

        /**
         * Handler for Elements Registry element selecting.
         * @param {Object} message
         */
        'on-control-select-elements-registry': function (message, messageSender) {
            var frameId = messageSender.frameId;
            frameData[frameId].controlProperties = message.controlProperties;
            frameData[frameId].controlBindings = message.controlBindings;
            frameData[frameId].controlAggregations = message.controlAggregations;
            frameData[frameId].controlEvents = message.controlEvents;

            if (framesSelect.getSelectedId() === frameId) {
                controlPropertiesElementsRegistry.setData(message.controlProperties);
                controlBindingInfoLeftDataViewElementsRegistry.setData(message.controlBindings);
                controlAggregationsElementsRegistry.setData(message.controlAggregations);
                controlEventsElementsRegistry.setData(message.controlEvents);

                // Set bindings count
                document.querySelector('#tab-bindings count').innerHTML = '&nbsp;(' + Object.keys(message.controlBindings).length + ')';
                // Close possible open binding info and/or methods info
                controlBindingsSplitterElementsRegistry.hideEndContainer();
            }
        },

        /**
         * Select ControlTree element, based on selection in the Element panel.
         * @param {Object} message
         */
        'on-select-ui5-control-from-element-tab': function (message, messageSender) {
            var frameId = messageSender.frameId;
            frameData[frameId].nearestUI5Control = message.nearestUI5Control;

            if (framesSelect.getSelectedId() === frameId) {
                controlTree.setSelectedElement(message.nearestUI5Control);
            }
        },

        /**
         * Select ControlTree element, based on right click and context menu.
         * @param {Object} message
         */
        'on-contextMenu-control-select': function (message) {
            displayFrameData({
                selectedId: message.frameId,
                oldSelectedId: framesSelect.getSelectedId()
            });
            controlTree.setSelectedElement(message.target);
        },

        /**
         * Handler for UI5 none detection on the current inspected page.
         * @param {Object} message
         */
        'on-ui5-not-detected': function (message, messageSender) {
            frameData[messageSender.frameId] = {
                isUI5Detected: false,
                url: messageSender.url
            };
            framesSelect.setData(frameData);
            if (framesSelect.getSelectedId() === messageSender.frameId) {
                updateSupportabilityOverlay();
            }
        },

        'on-ping-frames': function(message) {
            var aLatestFrameIds = message.frameIds;
            var aFrameIds = Object.keys(frameData).map(x => parseInt(x));
            var bFrameUpdate = false;

            aFrameIds.forEach(function(iFrameId) {
                if (aLatestFrameIds.indexOf(iFrameId) < 0) {
                    delete frameData[iFrameId];
                    bFrameUpdate = true;
                }
            });

            if (bFrameUpdate) {
                framesSelect.setData(frameData);
            }
        }
    };

    // Listen for messages from the background page
    port.onMessage(function (message, messageSender, sendResponse) {
        // Resolve incoming messages
        utils.resolveMessage({
            message: message,
            messageSender: messageSender,
            sendResponse: sendResponse,
            actions: messageHandler
        });
    });

    port.postMessage({ action: 'do-ui5-detection' });

    // Restart everything when the URL is changed
    chrome.devtools.network.onNavigated.addListener(function () {
        frameData = {};
        framesSelect.setSelectedId(0);
        framesSelect.setData(frameData);
        port.postMessage({ action: 'do-ui5-detection' });
    });
}());
