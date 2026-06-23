'use strict';

/**
 * ConversationStore - persistence boundary for Inspector AI Assistant
 * Conversation Memory.
 *
 * Owns the storage-key shape for an inspected URL, the retention limit on
 * stored chat turns (50 most recent), and the load / append / clear
 * operations. Hides the underlying Chrome storage surface from the rest of
 * the assistant so that the Assistant Controller can talk to a small,
 * fakeable interface.
 *
 * Conversation Memory is strictly chat turns. Inspection Context must never
 * be persisted through this store.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] - A storage surface compatible with
 *     `chrome.storage.local` (`get(keys, cb)`, `set(items, cb)`,
 *     `remove(keys, cb)`). Defaults to `chrome.storage.local`. Required to
 *     resolve to a real object — construction throws if no storage is
 *     available so that the failure is loud rather than deferred to the
 *     first `load` / `append` / `clear` call.
 * @constructor
 */
function ConversationStore(options) {
    options = options || {};
    var storage = options.storage;
    if (!storage && typeof chrome !== 'undefined' && chrome.storage) {
        storage = chrome.storage.local;
    }
    if (!storage) {
        throw new Error('ConversationStore requires a chrome.storage.local-compatible storage surface.');
    }
    this._storage = storage;
}

/**
 * Maximum number of stored chat turns per inspected URL. Older turns are
 * dropped from the front when this limit is exceeded.
 * @type {number}
 */
ConversationStore.RETENTION_LIMIT = 50;

/**
 * Build the storage key for an inspected URL.
 * @param {string} url - The inspected URL.
 * @returns {string}
 */
ConversationStore.prototype.keyForUrl = function (url) {
    return 'ai_chat_' + (url || 'default').replace(/[^a-zA-Z0-9]/g, '_');
};

/**
 * Report a runtime error from the storage surface, if any.
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
 * Load stored Conversation Memory for an inspected URL.
 * @param {string} url - The inspected URL.
 * @returns {Promise<Array>} Resolves with the array of stored chat turns
 *     (each with `role` and `content`), or an empty array if no
 *     Conversation Memory has been stored for the URL yet.
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
 * Append a chat turn to the Conversation Memory for an inspected URL.
 * Only `role` and `content` are persisted — Inspection Context and
 * transient fields like timestamps are intentionally excluded.
 * @param {string} url - The inspected URL.
 * @param {{role: string, content: string}} message - The chat turn to append.
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
 * Clear stored Conversation Memory for an inspected URL.
 * @param {string} url - The inspected URL.
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
