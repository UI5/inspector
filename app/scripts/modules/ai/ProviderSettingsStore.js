'use strict';

const STORAGE_KEY = 'aiProviderSettings';

/**
 * Persists the user's AI provider selection and configuration.
 *
 * Owns the storage key shape for `{providerName, providerConfig}`. Hides Chrome storage from the
 * rest of the assistant. Provides sensible defaults when nothing is stored yet.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] - A `chrome.storage.local`-compatible surface (`get`, `set`).
 *                                     Defaults to `chrome.storage.local`. Construction throws if
 *                                     no storage is available.
 * @constructor
 */
function ProviderSettingsStore({ storage } = {}) {
    if (!storage && typeof chrome !== 'undefined' && chrome.storage) {
        storage = chrome.storage.local;
    }
    if (!storage) {
        throw new Error('ProviderSettingsStore requires a chrome.storage.local-compatible storage surface.');
    }
    this._storage = storage;
}

/**
 * @private
 * @returns {*|null}
 */
ProviderSettingsStore.prototype._lastError = function () {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        return chrome.runtime.lastError;
    }
    return null;
};

/**
 * Load the persisted provider settings. Returns defaults when nothing is stored.
 * @returns {Promise<{providerName: string, providerConfig: Object}>}
 */
ProviderSettingsStore.prototype.load = function () {
    return new Promise((resolve, reject) => {
        this._storage.get([STORAGE_KEY], (result) => {
            const err = this._lastError();
            if (err) {
                reject(err);
                return;
            }
            const stored = result[STORAGE_KEY];
            if (stored && stored.providerName) {
                resolve({
                    providerName: stored.providerName,
                    providerConfig: stored.providerConfig || {}
                });
            } else {
                resolve({ providerName: 'gemini-nano', providerConfig: {} });
            }
        });
    });
};

/**
 * Persist a provider selection and its configuration.
 * @param {string} providerName
 * @param {Object} providerConfig
 * @returns {Promise<void>}
 */
ProviderSettingsStore.prototype.save = function (providerName, providerConfig) {
    return new Promise((resolve, reject) => {
        const items = {};
        items[STORAGE_KEY] = { providerName: providerName, providerConfig: providerConfig || {} };
        this._storage.set(items, () => {
            const err = this._lastError();
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};

module.exports = ProviderSettingsStore;
