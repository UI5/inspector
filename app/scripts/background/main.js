(function () {
    'use strict';

    var utils = require('../modules/utils/utils.js');
    var ContextMenu = require('../modules/background/ContextMenu.js');
    var pageAction = require('../modules/background/pageAction.js');

    var contextMenu = new ContextMenu({
        title: 'Inspect UI5 control',
        id: 'context-menu',
        contexts: ['all']
    });

    /**
     * This method will be fired when an instance is clicked. The idea is to be overwritten from the instance.
     * @param {Object} info - Information sent when a context menu item is clicked. Check chrome.contextMenus.onClicked.
     * @param {Object} tab - The details of the tab where the click took place.
     */
    contextMenu.onClicked = function (info, tab) {
        utils.sendToAll({
            action: 'do-context-menu-control-select',
            target: contextMenu._rightClickTarget,
            // specify the frame in which the user clicked
            frameId: info.frameId
        });
    };

    // Name space for message handler functions.
    var messageHandler = {

        /**
         * Create an icons with hover information inside the address bar.
         * @param {Object} message
         * @param {Object} messageSender
         */
        'on-ui5-detected': function (message, messageSender) {
            var framework = message.framework;

            if (message.isVersionSupported === true) {
                pageAction.create({
                    version: framework.version,
                    framework: framework.name,
                    tabId: messageSender.tab.id
                });

                pageAction.enable();
            }
        },

        /**
         * Handler for UI5 none detection on the current inspected page.
         * @param {Object} message
         */
        'on-ui5-not-detected': function (message) {
            pageAction.disable();
        },

        /**
         * Inject script into the inspected page.
         * @param {Object} message
         */
        'do-script-injection': function (message) {
            const frameId = message.frameId;
            chrome.windows.getCurrent().then(w => {
                chrome.tabs.query({ active: true, windowId: w.id }).then(tabs => {
                    const target = {
                        tabId: tabs[0].id
                    };
                    // inject the script only into the frame
                    // specified in the request from the devTools UI5 panel script;
                    // If no frameId specified, the script will be injected into the main frame
                    if (frameId !== undefined) {
                        target.frameIds = [message.frameId];
                    }
                    chrome.scripting.executeScript({
                        target,
                        files: [message.file]
                    });
                });
            });
        },

        /**
         * Set the element that was clicked with the right button of the mouse.
         * @param {Object} message
         */
        'on-right-click': function (message) {
            contextMenu.setRightClickTarget(message.target);
        },

        /**
         * Create the button for the context menu, when the user switches to the "UI5" panel.
         * @param {Object} message
         */
        'on-ui5-devtool-show': function (message) {
            contextMenu.create();
        },

        /**
         * Delete the button for the context menu, when the user switches away to the "UI5" panel.
         * @param {Object} message
         */
        'on-ui5-devtool-hide': function (message) {
            contextMenu.removeAll();
        },

        'do-ping-frames': function (message, messageSender) {
            var frameIds = message.frameIds;
            var liveFrameIds = [];
            var pingFrame = function (i) {
                    if (i >= frameIds.length) {
                        // no more frameId to ping
                        // => done with pinging each frame
                        // => send a message [to the devTools UI5 panel]
                        // with the updated list of 'live' frame ids
                        chrome.runtime.sendMessage(messageSender.id, {
                            action: 'on-ping-frames',
                            frameIds: liveFrameIds
                        });
                        return;
                    }

                    var frameId = frameIds[i];
                    // ping the next frame
                    // from the <code>frameIds</code> list
                    utils.sendToAll({
                        action: 'do-ping',
                        frameId: frameId
                    }, function (isAlive) {
                        if (isAlive) {
                            liveFrameIds.push(frameId);
                        }
                        pingFrame(i + 1);
                    });
                };

                pingFrame(0);
        }
    };

    chrome.runtime.onMessage.addListener(function (request, messageSender, sendResponse) {
        // Resolve incoming messages
        utils.resolveMessage({
            message: request,
            messageSender: messageSender,
            sendResponse: sendResponse,
            actions: messageHandler
        });

        utils.sendToAll(request);
    });

    chrome.runtime.onInstalled.addListener(() => {
        // Page actions are disabled by default and enabled on select tabs
        chrome.action.disable();
    });

    // ================================================================================
    // Prompt API Integration (Gemini Nano)
    // ================================================================================

    let promptAPISession = null;
    let promptAPIController = null;

    /**
     * Check if Prompt API is supported
     */
    function isPromptAPISupported() {
        return 'LanguageModel' in self;
    }

    /**
     * Initialize Prompt API session
     */
    async function initPromptAPISession(options, signal) {
        const availability = await self.LanguageModel.availability();

        if (availability === 'unavailable') {
            throw new Error('AI Model is not available on this device.');
        }

        const sessionOptions = {
            signal
        };

        // Add download progress monitoring if callback provided
        if (options.onProgress) {
            sessionOptions.monitor = function(m) {
                m.addEventListener('downloadprogress', (e) => {
                    options.onProgress(e.loaded || 0);
                });
            };
        }

        return await self.LanguageModel.create(sessionOptions);
    }

    /**
     * Handle check availability request
     */
    async function handleCheckAvailability(port) {

        if (!isPromptAPISupported()) {
            port.postMessage({
                type: 'availability',
                status: 'unavailable',
                message: 'Prompt API not supported - LanguageModel not found in self'
            });
            return;
        }

        try {
            const availability = await self.LanguageModel.availability();

            let status;
            let message;
            if (availability === 'available') {
                status = 'ready';
                message = 'Gemini Nano is ready to use';
            } else if (availability === 'downloadable') {
                status = 'needs-download';
                message = 'Gemini Nano needs to be downloaded (~22GB)';
            } else if (availability === 'downloading') {
                status = 'downloading';
                message = 'Gemini Nano is currently downloading';
            } else if (availability === 'unavailable') {
                status = 'unavailable';
                message = 'Gemini Nano is not available on this device';
            } else {
                status = 'unavailable';
                message = `Gemini Nano status unknown. Availability returned: "${availability}"`;
            }

            port.postMessage({
                type: 'availability',
                status: status,
                message: message
            });
        } catch (error) {
            console.error('[Background] Error checking availability:', error);
            port.postMessage({
                type: 'availability',
                status: 'error',
                message: `Error: ${error.message}`
            });
        }
    }

    /**
     * Handle download model request
     */
    async function handleDownloadModel(port) {

        if (!isPromptAPISupported()) {
            port.postMessage({
                type: 'error',
                message: 'Prompt API not supported'
            });
            return;
        }

        // Abort any existing operation
        if (promptAPIController) {
            promptAPIController.abort();
        }
        promptAPIController = new AbortController();

        try {
            promptAPISession = await initPromptAPISession({
                onProgress: (progress) => {
                    port.postMessage({
                        type: 'download-progress',
                        progress: progress
                    });
                }
            }, promptAPIController.signal);

            port.postMessage({
                type: 'download-complete'
            });
        } catch (error) {
            console.error('[Background] Error downloading model:', error);
            port.postMessage({
                type: 'error',
                message: error.message
            });
        } finally {
            promptAPIController = null;
        }
    }

    /**
     * Handle create session request
     */
    async function handleCreateSession(data, port) {

        if (!isPromptAPISupported()) {
            port.postMessage({
                type: 'error',
                message: 'Prompt API not supported'
            });
            return;
        }

        try {
            // Destroy existing session if any
            if (promptAPISession) {
                promptAPISession.destroy();
                promptAPISession = null;
            }

            promptAPISession = await initPromptAPISession({}, new AbortController().signal);

            port.postMessage({
                type: 'session-created'
            });
        } catch (error) {
            console.error('[Background] Error creating session:', error);
            port.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }

    /**
     * Handle streaming prompt request
     */
    async function handlePromptStreaming(data, port) {

        if (!promptAPISession) {
            port.postMessage({
                type: 'error',
                message: 'No active session'
            });
            return;
        }

        // Abort any existing operation
        if (promptAPIController) {
            promptAPIController.abort();
        }
        promptAPIController = new AbortController();

        try {
            const stream = await promptAPISession.promptStreaming(
                data.messages,
                { signal: promptAPIController.signal }
            );

            for await (const chunk of stream) {
                if (promptAPIController.signal.aborted) {
                    break;
                }

                port.postMessage({
                    type: 'chunk',
                    content: chunk
                });
            }

            if (!promptAPIController.signal.aborted) {
                port.postMessage({
                    type: 'complete'
                });
            }
        } catch (error) {
            console.error('[Background] Error during streaming:', error);
            port.postMessage({
                type: 'error',
                message: error.message
            });
        } finally {
            promptAPIController = null;
        }
    }

    /**
     * Handle get usage info request
     */
    function handleGetUsageInfo(port) {
        if (!promptAPISession) {
            port.postMessage({
                type: 'usage-info',
                data: null
            });
            return;
        }

        const inputUsage = promptAPISession.inputUsage || 0;
        const inputQuota = promptAPISession.inputQuota || 4096;
        const percentUsed = Math.round((inputUsage / inputQuota) * 100);

        port.postMessage({
            type: 'usage-info',
            data: {
                inputUsage: inputUsage,
                inputQuota: inputQuota,
                percentUsed: percentUsed
            }
        });
    }

    /**
     * Handle destroy session request
     */
    function handleDestroySession(port) {
        if (promptAPISession) {
            promptAPISession.destroy();
            promptAPISession = null;
        }

        if (promptAPIController) {
            promptAPIController.abort();
            promptAPIController = null;
        }

        port.postMessage({
            type: 'session-destroyed'
        });
    }

    // Listen for long-lived connections for Prompt API
    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === 'prompt-api') {
            port.onMessage.addListener((message) => {
                switch (message.type) {
                    case 'check-availability':
                        handleCheckAvailability(port);
                        break;
                    case 'download-model':
                        handleDownloadModel(port);
                        break;
                    case 'create-session':
                        handleCreateSession(message.data, port);
                        break;
                    case 'prompt-streaming':
                        handlePromptStreaming(message.data, port);
                        break;
                    case 'get-usage-info':
                        handleGetUsageInfo(port);
                        break;
                    case 'destroy-session':
                        handleDestroySession(port);
                        break;
                }
            });
        }
    });

}());
