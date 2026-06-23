'use strict';

var ConversationStore = require('./ConversationStore.js');

/**
 * ChatStorageManager - legacy entry point retained for AIChat compatibility
 * during the Assistant Architecture V1 refactor. Delegates all behavior
 * (key shape, retention, load/save/clear) to {@link ConversationStore}, the
 * named persistence boundary for Inspector AI Assistant Conversation Memory.
 *
 * No direct Chrome storage access lives in this module anymore. New
 * consumers should depend on `ConversationStore` directly.
 *
 * @param {Object} [options] - Options forwarded to the underlying
 *     `ConversationStore`. See `ConversationStore` for available fields.
 * @constructor
 */
function ChatStorageManager(options) {
    this._store = new ConversationStore(options);
}

/**
 * Load chat history for a specific URL.
 * @param {string} url - The URL to load history for
 * @returns {Promise<Array>} - Array of message objects
 */
ChatStorageManager.prototype.loadHistory = function (url) {
    return this._store.load(url);
};

/**
 * Save a message to chat history.
 * @param {string} url - The URL to save history for
 * @param {Object} message - Message object {role, content, timestamp}
 * @returns {Promise<void>}
 */
ChatStorageManager.prototype.saveMessage = function (url, message) {
    return this._store.append(url, message);
};

/**
 * Clear chat history for a specific URL.
 * @param {string} url - The URL to clear history for
 * @returns {Promise<void>}
 */
ChatStorageManager.prototype.clearHistory = function (url) {
    return this._store.clear(url);
};

module.exports = ChatStorageManager;
