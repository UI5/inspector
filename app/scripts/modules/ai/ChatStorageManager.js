'use strict';

/**
 * ChatStorageManager - Manages chat history persistence in chrome.storage.local.
 * @constructor
 */
function ChatStorageManager() {
    this._maxMessages = 50;
}

/**
 * Get storage key for a URL.
 * @private
 * @param {string} url
 * @returns {string}
 */
ChatStorageManager.prototype._getKey = function (url) {
    return 'ai_chat_' + (url || 'default').replace(/[^a-zA-Z0-9]/g, '_');
};

/**
 * Load chat history for a specific URL.
 * @param {string} url - The URL to load history for
 * @returns {Promise<Array>} - Array of message objects
 */
ChatStorageManager.prototype.loadHistory = function (url) {
    return new Promise((resolve, reject) => {
        const key = this._getKey(url);

        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            resolve(result[key] || []);
        });
    });
};

/**
 * Save a message to chat history.
 * @param {string} url - The URL to save history for
 * @param {Object} message - Message object {role, content, timestamp}
 * @returns {Promise<void>}
 */
ChatStorageManager.prototype.saveMessage = function (url, message) {
    return new Promise((resolve, reject) => {
        const key = this._getKey(url);

        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            let messages = result[key] || [];
            messages.push({ role: message.role, content: message.content });

            if (messages.length > this._maxMessages) {
                messages = messages.slice(-this._maxMessages);
            }

            chrome.storage.local.set({ [key]: messages }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                resolve();
            });
        });
    });
};

/**
 * Clear chat history for a specific URL.
 * @param {string} url - The URL to clear history for
 * @returns {Promise<void>}
 */
ChatStorageManager.prototype.clearHistory = function (url) {
    return new Promise((resolve, reject) => {
        const key = this._getKey(url);

        chrome.storage.local.remove([key], () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
};

module.exports = ChatStorageManager;
