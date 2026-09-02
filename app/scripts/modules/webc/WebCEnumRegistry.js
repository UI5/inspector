'use strict';

/**
 * Resolves UI5 Web Components enum properties to their possible values so the
 * DataView can render a dropdown for them.
 *
 * Why this exists
 * ---------------
 * The runtime metadata of a UI5 web component only exposes a property's type
 * as a JavaScript constructor (`String`, `Boolean`, ...). Enum types are
 * compiled to plain strings, so at runtime we cannot tell that `design` on
 * `ui5-button` is a `ButtonDesign` enum, let alone enumerate its values. This
 * is why pure web components and their React wrappers show a plain editable
 * string instead of a dropdown (unlike the OpenUI5 wrappers, which register
 * their enums as `sap/ui/base/DataType` and are handled in
 * modules/injected/controlUtils.js).
 *
 * The missing information lives in the Custom Elements Manifest published on
 * npm as `dist/custom-elements-internal.json`. For every component it lists
 * the attributes with their enum values inline as a union of string literals,
 * e.g. for `ui5-button`'s `design`:
 *
 *   "type": { "text": "\"Default\" | \"Emphasized\" | \"Positive\" | ..." }
 *
 * We fetch that manifest for the exact framework version detected on the page
 * (falling back to the nearest published minor) and build a
 * `tag -> property -> {label: value}` lookup that the panel uses to enrich the
 * property types before handing them to the DataView.
 *
 * Where this runs
 * ---------------
 * In an extension context (the DevTools panel), never in the inspected page:
 * the page's own CSP frequently blocks third-party hosts like jsDelivr. The
 * extension page CSP is relaxed in manifest.json to allow the CDN hosts.
 *
 * @param {Object} [options]
 * @param {Function} [options.fetch] - `fetch`-compatible function. Defaults to the global `fetch`.
 * @param {Object} [options.storage] - `chrome.storage.local`-compatible surface (`get`, `set`).
 *                                      Defaults to `chrome.storage.local`. Optional: without it the
 *                                      registry still works, just without cross-session caching.
 * @param {string[]} [options.packages] - npm package names to fetch manifests for.
 * @constructor
 */
function WebCEnumRegistry(options) {
    options = options || {};

    this._fetch = options.fetch ||
        (typeof fetch !== 'undefined' ? fetch.bind(typeof self !== 'undefined' ? self : this) : null);

    var storage = options.storage;
    if (!storage && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        storage = chrome.storage.local;
    }
    this._storage = storage || null;

    this._packages = options.packages || WebCEnumRegistry.DEFAULT_PACKAGES;

    // version -> {tag: {property: {label: value}}}
    this._memory = Object.create(null);
    // version -> Promise (in-flight prime, so concurrent selects share one fetch)
    this._pending = Object.create(null);
}

/**
 * Web Components family packages that publish a custom-elements-internal.json.
 * They share a single release version, so the detected runtime version is used
 * for all of them. Packages that don't resolve are skipped.
 * @type {string[]}
 */
WebCEnumRegistry.DEFAULT_PACKAGES = [
    '@ui5/webcomponents',
    '@ui5/webcomponents-fiori',
    '@ui5/webcomponents-compat',
    '@ui5/webcomponents-ai'
];

/**
 * CDN hosts, in preference order: jsDelivr first, unpkg as fallback.
 * @type {string[]}
 */
WebCEnumRegistry.CDN_HOSTS = [
    'https://cdn.jsdelivr.net/npm/',
    'https://unpkg.com/'
];

/**
 * @type {string}
 */
WebCEnumRegistry.MANIFEST_PATH = '/dist/custom-elements-internal.json';

/**
 * Maximum number of per-version enum maps kept in `chrome.storage.local`.
 * Bounds cache growth on machines that inspect many framework versions over
 * time (now more likely, since multi-runtime pages prime several versions);
 * the least-recently-saved version is evicted past this cap.
 * @type {number}
 */
WebCEnumRegistry.MAX_STORED_VERSIONS = 8;

/**
 * Storage key holding the ordered list of cached versions (oldest first) used
 * to drive least-recently-saved eviction.
 * @type {string}
 */
WebCEnumRegistry.INDEX_KEY = 'webc_enums_index';

/**
 * @param {string} version
 * @returns {string}
 * @private
 */
WebCEnumRegistry.storageKey = function (version) {
    return 'webc_enums_' + version;
};

/**
 * Parse a single attribute `type.text` into an enum value map, or null if it
 * is not an enum (i.e. not a union of two-or-more quoted string literals).
 *
 * @param {string} typeText - e.g. `"Default" | "Emphasized" | "Positive"`
 * @returns {Object|null} `{Default: "Default", ...}` or null
 */
WebCEnumRegistry.parseEnumUnion = function (typeText) {
    if (typeof typeText !== 'string' || typeText.indexOf('|') === -1) {
        return null;
    }

    var members = typeText.split('|');
    var values = Object.create(null);
    var count = 0;

    for (var i = 0; i < members.length; i++) {
        var member = members[i].trim();
        var match = /^"([^"]*)"$/.exec(member) || /^'([^']*)'$/.exec(member);
        if (!match) {
            // A non-literal member (e.g. `undefined`, `string`, `ButtonDesign`)
            // means this is not a plain string-literal enum — bail out.
            return null;
        }
        var value = match[1];
        values[value] = value;
        count++;
    }

    return count >= 2 ? values : null;
};

/**
 * Parse a Custom Elements Manifest into (or merged onto) a
 * `tag -> property -> {label: value}` map.
 *
 * @param {Object} manifest - parsed custom-elements-internal.json
 * @param {Object} [into] - existing map to merge onto
 * @returns {Object}
 */
WebCEnumRegistry.parseManifest = function (manifest, into) {
    into = into || Object.create(null);

    if (!manifest || !Array.isArray(manifest.modules)) {
        return into;
    }

    manifest.modules.forEach(function (mod) {
        var declarations = (mod && mod.declarations) || [];
        declarations.forEach(function (decl) {
            if (!decl || !decl.tagName || !Array.isArray(decl.attributes)) {
                return;
            }
            var tag = decl.tagName;
            decl.attributes.forEach(function (attr) {
                var values = WebCEnumRegistry.parseEnumUnion(attr && attr.type && attr.type.text);
                if (!values) {
                    return;
                }
                // `fieldName` is the class property (camelCase, matching the
                // runtime property key); `name` may be the kebab-case attribute.
                var property = attr.fieldName || attr.name;
                if (!property) {
                    return;
                }
                if (!into[tag]) {
                    into[tag] = Object.create(null);
                }
                into[tag][property] = values;
            });
        });
    });

    return into;
};

/**
 * Build the ordered list of candidate manifest URLs for a package: exact
 * version on each host first, then the nearest published minor (jsDelivr and
 * unpkg both resolve `@<major>.<minor>` to the latest matching patch) so
 * internal/nightly builds still get a dropdown from the closest release.
 *
 * @param {string} pkg
 * @param {string} version
 * @returns {string[]}
 */
WebCEnumRegistry.prototype._candidateUrls = function (pkg, version) {
    var specifiers = [version];

    var parts = String(version).split('.');
    if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        var minor = parts[0] + '.' + parts[1];
        if (minor !== version) {
            specifiers.push(minor);
        }
    }

    var urls = [];
    specifiers.forEach(function (specifier) {
        WebCEnumRegistry.CDN_HOSTS.forEach(function (host) {
            urls.push(host + pkg + '@' + specifier + WebCEnumRegistry.MANIFEST_PATH);
        });
    });
    return urls;
};

/**
 * Fetch and parse the manifest for one package, trying each candidate URL until
 * one succeeds. Resolves to a partial map (possibly empty on total failure).
 *
 * @param {string} pkg
 * @param {string} version
 * @returns {Promise<Object>}
 * @private
 */
WebCEnumRegistry.prototype._fetchPackage = function (pkg, version) {
    var self = this;
    var urls = this._candidateUrls(pkg, version);

    var attempt = function (index) {
        if (index >= urls.length) {
            return Promise.resolve(Object.create(null));
        }
        return self._fetch(urls[index])
            .then(function (response) {
                if (!response || !response.ok) {
                    return attempt(index + 1);
                }
                return response.json().then(function (json) {
                    return WebCEnumRegistry.parseManifest(json);
                });
            })
            .catch(function () {
                return attempt(index + 1);
            });
    };

    return attempt(0);
};

/**
 * @param {string} version
 * @returns {Promise<Object|null>}
 * @private
 */
WebCEnumRegistry.prototype._loadFromStorage = function (version) {
    var self = this;
    if (!this._storage) {
        return Promise.resolve(null);
    }
    var key = WebCEnumRegistry.storageKey(version);
    return new Promise(function (resolve) {
        try {
            self._storage.get([key], function (result) {
                resolve((result && result[key]) || null);
            });
        } catch (e) {
            resolve(null);
        }
    });
};

/**
 * Persist a version's enum map, maintaining a bounded, least-recently-saved
 * cache: the version is moved to the most-recent slot and any versions past
 * `MAX_STORED_VERSIONS` are removed. Best-effort — storage errors are ignored,
 * and the read-modify-write of the index is not transactional (concurrent
 * saves of different versions may under-evict, never lose the current entry).
 *
 * @param {string} version
 * @param {Object} map
 * @private
 */
WebCEnumRegistry.prototype._saveToStorage = function (version, map) {
    var self = this;
    if (!this._storage) {
        return;
    }
    try {
        this._storage.get([WebCEnumRegistry.INDEX_KEY], function (result) {
            var index = (result && result[WebCEnumRegistry.INDEX_KEY]) || [];
            if (!Array.isArray(index)) {
                index = [];
            }
            // Move this version to the most-recent slot (end), de-duplicated.
            index = index.filter(function (v) { return v !== version; });
            index.push(version);

            // Evict the oldest versions beyond the cap.
            var removeKeys = [];
            while (index.length > WebCEnumRegistry.MAX_STORED_VERSIONS) {
                removeKeys.push(WebCEnumRegistry.storageKey(index.shift()));
            }

            var items = Object.create(null);
            items[WebCEnumRegistry.INDEX_KEY] = index;
            items[WebCEnumRegistry.storageKey(version)] = map;

            if (removeKeys.length && typeof self._storage.remove === 'function') {
                try {
                    self._storage.remove(removeKeys, function () { /* best-effort */ });
                } catch (e) {
                    // best-effort
                }
            }
            try {
                self._storage.set(items, function () { /* best-effort */ });
            } catch (e) {
                // best-effort
            }
        });
    } catch (e) {
        // best-effort
    }
};

/**
 * Ensure the enum map for `version` is loaded (memory -> storage -> CDN).
 * Concurrent calls for the same version share one in-flight fetch. Resolves to
 * the map; on total failure the map is empty and `getEnumValues` returns null
 * (the caller then keeps the plain-string behaviour).
 *
 * @param {string} version
 * @returns {Promise<Object>}
 */
WebCEnumRegistry.prototype.prime = function (version) {
    var self = this;

    if (!version || !this._fetch) {
        return Promise.resolve(Object.create(null));
    }
    if (this._memory[version]) {
        return Promise.resolve(this._memory[version]);
    }
    if (this._pending[version]) {
        return this._pending[version];
    }

    var promise = this._loadFromStorage(version).then(function (cached) {
        if (cached) {
            self._memory[version] = cached;
            return cached;
        }

        return Promise.all(self._packages.map(function (pkg) {
            return self._fetchPackage(pkg, version);
        })).then(function (partials) {
            var merged = Object.create(null);
            partials.forEach(function (partial) {
                Object.keys(partial).forEach(function (tag) {
                    if (!merged[tag]) {
                        merged[tag] = Object.create(null);
                    }
                    Object.keys(partial[tag]).forEach(function (prop) {
                        merged[tag][prop] = partial[tag][prop];
                    });
                });
            });

            self._memory[version] = merged;
            // Only persist a non-empty result so a transient network failure
            // doesn't get cached as "this version has no enums".
            if (Object.keys(merged).length) {
                self._saveToStorage(version, merged);
            }
            return merged;
        });
    }).then(function (map) {
        delete self._pending[version];
        return map;
    }, function (error) {
        delete self._pending[version];
        // Cache an empty map in memory so we don't refetch on every select in
        // this session; a DevTools reload re-primes.
        self._memory[version] = self._memory[version] || Object.create(null);
        return self._memory[version];
    });

    this._pending[version] = promise;
    return promise;
};

/**
 * Synchronous lookup of a property's enum values. Returns null unless the
 * version has been primed and the tag/property is a known enum.
 *
 * @param {string} version
 * @param {string} tag - custom element tag, e.g. `ui5-button`
 * @param {string} property - property name, e.g. `design`
 * @returns {Object|null} `{label: value}` map or null
 */
WebCEnumRegistry.prototype.getEnumValues = function (version, tag, property) {
    var map = this._memory[version];
    if (!map || !map[tag]) {
        return null;
    }
    return map[tag][property] || null;
};

module.exports = WebCEnumRegistry;
