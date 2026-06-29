'use strict';

/**
 * Persists assistant conversation memory.
 *
 * Owns the storage key shape for each inspected URL, the retention limit (50 most recent turns),
 * and load / append / clear. Hides Chrome storage from the rest of the assistant.
 *
 * Only chat turns are persisted. Inspection context must not be stored here.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] - A `chrome.storage.local`-compatible surface (`get`, `set`,
 *                                     `remove`). Defaults to `chrome.storage.local`. Construction
 *                                     throws if no storage is available.
 * @constructor
 */
function ConversationStore({ storage } = {}) {
    if (!storage && typeof chrome !== 'undefined' && chrome.storage) {
        storage = chrome.storage.local;
    }
    if (!storage) {
        throw new Error('ConversationStore requires a chrome.storage.local-compatible storage surface.');
    }
    this._storage = storage;
}

/**
 * Max stored chat turns per inspected URL. Older turns drop from the front when exceeded.
 * @type {number}
 */
ConversationStore.RETENTION_LIMIT = 50;

/**
 * @param {string} url
 * @returns {string}
 */
ConversationStore.prototype.keyForUrl = function (url) {
    return 'ai_chat_' + (url || 'default').replace(/[^a-zA-Z0-9]/g, '_');
};

/**
 * @private
 * @returns {*|null}
 */
ConversationStore.prototype._lastError = function () {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        return chrome.runtime.lastError;
    }
    return null;
};

/**
 * @param {string} url
 * @returns {Promise<Array>} Array of {role, content} turns, or empty array.
 */
ConversationStore.prototype.load = function (url) {
    return new Promise((resolve, reject) => {
        const key = this.keyForUrl(url);

        this._storage.get([key], (result) => {
            const err = this._lastError();
            if (err) {
                reject(err);
                return;
            }
            resolve(result[key] || []);
        });
    });
};

/**
 * Append a chat turn. Only `role` and `content` are persisted.
 * @param {string} url
 * @param {{role: string, content: string}} message
 * @returns {Promise<void>}
 */
ConversationStore.prototype.append = function (url, message) {
    return new Promise((resolve, reject) => {
        const key = this.keyForUrl(url);

        this._storage.get([key], (result) => {
            const err = this._lastError();
            if (err) {
                reject(err);
                return;
            }

            let messages = result[key] || [];
            messages.push({ role: message.role, content: message.content });

            if (messages.length > ConversationStore.RETENTION_LIMIT) {
                messages = messages.slice(-ConversationStore.RETENTION_LIMIT);
            }

            const items = {};
            items[key] = messages;
            this._storage.set(items, () => {
                const setErr = this._lastError();
                if (setErr) {
                    reject(setErr);
                    return;
                }
                resolve();
            });
        });
    });
};

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
ConversationStore.prototype.clear = function (url) {
    return new Promise((resolve, reject) => {
        const key = this.keyForUrl(url);

        this._storage.remove([key], () => {
            const err = this._lastError();
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};

module.exports = ConversationStore;
