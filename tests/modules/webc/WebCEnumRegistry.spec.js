'use strict';

const WebCEnumRegistry = require('../../../app/scripts/modules/webc/WebCEnumRegistry.js');

/**
 * In-memory fake of the `chrome.storage.local` surface.
 * @returns {{storage: Object, data: Object}}
 */
function createFakeStorage() {
    const data = {};
    const storage = {
        get: function (keys, callback) {
            const result = {};
            keys.forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            });
            callback(result);
        },
        set: function (items, callback) {
            Object.keys(items).forEach(function (key) {
                data[key] = items[key];
            });
            callback && callback();
        },
        remove: function (keys, callback) {
            (Array.isArray(keys) ? keys : [keys]).forEach(function (key) {
                delete data[key];
            });
            callback && callback();
        }
    };
    return { storage: storage, data: data };
}

/**
 * Fake `fetch` returning a manifest for URLs matching `okMatcher`, 404 otherwise.
 * Records every requested URL.
 * @param {Object} manifestByPredicate - map of matcher -> manifest
 * @returns {{fetch: Function, calls: string[]}}
 */
function createFakeFetch(routes) {
    const calls = [];
    const fetchFn = function (url) {
        calls.push(url);
        for (let i = 0; i < routes.length; i++) {
            if (routes[i].match(url)) {
                return Promise.resolve({
                    ok: true,
                    json: function () { return Promise.resolve(routes[i].manifest); }
                });
            }
        }
        return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
    };
    return { fetch: fetchFn, calls: calls };
}

const BUTTON_MANIFEST = {
    modules: [{
        declarations: [{
            kind: 'class',
            tagName: 'ui5-button',
            attributes: [
                { name: 'design', fieldName: 'design', type: { text: '"Default" | "Emphasized" | "Positive"' } },
                { name: 'text', fieldName: 'text', type: { text: 'string' } },
                { name: 'disabled', fieldName: 'disabled', type: { text: 'boolean' } }
            ]
        }]
    }]
};

describe('WebCEnumRegistry', function () {

    describe('parseEnumUnion', function () {
        it('parses a union of quoted string literals into a label->value map', function () {
            const values = WebCEnumRegistry.parseEnumUnion('"Default" | "Emphasized" | "Positive"');
            expect(values).to.deep.equal({ Default: 'Default', Emphasized: 'Emphasized', Positive: 'Positive' });
        });

        it('handles single-quoted literals', function () {
            const values = WebCEnumRegistry.parseEnumUnion('\'A\' | \'B\'');
            expect(values).to.deep.equal({ A: 'A', B: 'B' });
        });

        it('returns null for a single literal (not an enum)', function () {
            expect(WebCEnumRegistry.parseEnumUnion('"Default"')).to.equal(null);
        });

        it('returns null when a member is not a string literal', function () {
            expect(WebCEnumRegistry.parseEnumUnion('"Default" | ButtonDesign')).to.equal(null);
            expect(WebCEnumRegistry.parseEnumUnion('string')).to.equal(null);
            expect(WebCEnumRegistry.parseEnumUnion('boolean')).to.equal(null);
        });

        it('returns null for non-string input', function () {
            expect(WebCEnumRegistry.parseEnumUnion(undefined)).to.equal(null);
            expect(WebCEnumRegistry.parseEnumUnion(null)).to.equal(null);
        });
    });

    describe('parseManifest', function () {
        it('builds a tag -> property -> values map for enum attributes only', function () {
            const map = WebCEnumRegistry.parseManifest(BUTTON_MANIFEST);
            expect(map['ui5-button'].design).to.deep.equal({ Default: 'Default', Emphasized: 'Emphasized', Positive: 'Positive' });
            expect(map['ui5-button'].text).to.equal(undefined);
            expect(map['ui5-button'].disabled).to.equal(undefined);
        });

        it('prefers fieldName over attribute name', function () {
            const map = WebCEnumRegistry.parseManifest({
                modules: [{ declarations: [{
                    tagName: 'ui5-x',
                    attributes: [{ name: 'my-prop', fieldName: 'myProp', type: { text: '"a" | "b"' } }]
                }] }]
            });
            expect(map['ui5-x'].myProp).to.deep.equal({ a: 'a', b: 'b' });
            expect(map['ui5-x']['my-prop']).to.equal(undefined);
        });

        it('ignores declarations without a tagName or attributes', function () {
            const map = WebCEnumRegistry.parseManifest({
                modules: [{ declarations: [{ kind: 'variable', name: 'foo' }] }]
            });
            expect(Object.keys(map)).to.have.length(0);
        });

        it('tolerates malformed input', function () {
            expect(WebCEnumRegistry.parseManifest(null)).to.deep.equal({});
            expect(WebCEnumRegistry.parseManifest({})).to.deep.equal({});
        });
    });

    describe('_candidateUrls', function () {
        it('lists exact version on both hosts, then nearest minor on both', function () {
            const registry = new WebCEnumRegistry({ fetch: function () {}, storage: createFakeStorage().storage });
            const urls = registry._candidateUrls('@ui5/webcomponents', '2.26.3');
            expect(urls).to.deep.equal([
                'https://cdn.jsdelivr.net/npm/@ui5/webcomponents@2.26.3/dist/custom-elements-internal.json',
                'https://unpkg.com/@ui5/webcomponents@2.26.3/dist/custom-elements-internal.json',
                'https://cdn.jsdelivr.net/npm/@ui5/webcomponents@2.26/dist/custom-elements-internal.json',
                'https://unpkg.com/@ui5/webcomponents@2.26/dist/custom-elements-internal.json'
            ]);
        });

        it('does not add a minor specifier when version is already a bare minor', function () {
            const registry = new WebCEnumRegistry({ fetch: function () {}, storage: createFakeStorage().storage });
            const urls = registry._candidateUrls('@ui5/webcomponents', '2.26');
            expect(urls).to.have.length(2);
        });
    });

    describe('prime / getEnumValues', function () {
        it('fetches, parses and exposes enum values', function () {
            const fake = createFakeFetch([{
                match: function (url) { return url.indexOf('@ui5/webcomponents@2.26.0') !== -1; },
                manifest: BUTTON_MANIFEST
            }]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: createFakeStorage().storage,
                packages: ['@ui5/webcomponents']
            });

            return registry.prime('2.26.0').then(function () {
                expect(registry.getEnumValues('2.26.0', 'ui5-button', 'design'))
                    .to.deep.equal({ Default: 'Default', Emphasized: 'Emphasized', Positive: 'Positive' });
                expect(registry.getEnumValues('2.26.0', 'ui5-button', 'text')).to.equal(null);
                expect(registry.getEnumValues('2.26.0', 'ui5-unknown', 'x')).to.equal(null);
            });
        });

        it('returns null lookups before priming', function () {
            const registry = new WebCEnumRegistry({ fetch: function () {}, storage: createFakeStorage().storage });
            expect(registry.getEnumValues('2.26.0', 'ui5-button', 'design')).to.equal(null);
        });

        it('falls back to the nearest minor when the exact version is unpublished', function () {
            const fake = createFakeFetch([{
                match: function (url) { return url.indexOf('@ui5/webcomponents@2.26/') !== -1; },
                manifest: BUTTON_MANIFEST
            }]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: createFakeStorage().storage,
                packages: ['@ui5/webcomponents']
            });

            return registry.prime('2.26.99-nightly').then(function () {
                expect(registry.getEnumValues('2.26.99-nightly', 'ui5-button', 'design'))
                    .to.deep.equal({ Default: 'Default', Emphasized: 'Emphasized', Positive: 'Positive' });
            });
        });

        it('serves a cached map from storage without fetching', function () {
            const fakeStorage = createFakeStorage();
            fakeStorage.data[WebCEnumRegistry.storageKey('2.26.0')] = {
                'ui5-button': { design: { Default: 'Default' } }
            };
            const fake = createFakeFetch([]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: fakeStorage.storage,
                packages: ['@ui5/webcomponents']
            });

            return registry.prime('2.26.0').then(function () {
                expect(fake.calls).to.have.length(0);
                expect(registry.getEnumValues('2.26.0', 'ui5-button', 'design')).to.deep.equal({ Default: 'Default' });
            });
        });

        it('persists a fetched map to storage', function () {
            const fakeStorage = createFakeStorage();
            const fake = createFakeFetch([{
                match: function (url) { return url.indexOf('@2.26.0') !== -1; },
                manifest: BUTTON_MANIFEST
            }]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: fakeStorage.storage,
                packages: ['@ui5/webcomponents']
            });

            return registry.prime('2.26.0').then(function () {
                expect(fakeStorage.data[WebCEnumRegistry.storageKey('2.26.0')]['ui5-button'].design)
                    .to.deep.equal({ Default: 'Default', Emphasized: 'Emphasized', Positive: 'Positive' });
            });
        });

        it('shares one in-flight fetch across concurrent primes', function () {
            const fake = createFakeFetch([{
                match: function (url) { return url.indexOf('@2.26.0') !== -1; },
                manifest: BUTTON_MANIFEST
            }]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: createFakeStorage().storage,
                packages: ['@ui5/webcomponents']
            });

            const callsBefore = fake.calls.length;
            return Promise.all([registry.prime('2.26.0'), registry.prime('2.26.0')]).then(function () {
                // Only one URL resolved (the first candidate); no duplicate fan-out.
                expect(fake.calls.length).to.equal(callsBefore + 1);
            });
        });

        it('resolves to an empty map (null lookups) when all fetches fail', function () {
            const fake = createFakeFetch([]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: createFakeStorage().storage,
                packages: ['@ui5/webcomponents']
            });

            return registry.prime('9.9.9').then(function () {
                expect(registry.getEnumValues('9.9.9', 'ui5-button', 'design')).to.equal(null);
            });
        });

        it('evicts the least-recently-saved version past the cap', function () {
            const fakeStorage = createFakeStorage();
            const fake = createFakeFetch([{
                match: function () { return true; },
                manifest: BUTTON_MANIFEST
            }]);
            const registry = new WebCEnumRegistry({
                fetch: fake.fetch,
                storage: fakeStorage.storage,
                packages: ['@ui5/webcomponents']
            });

            // Prime one more distinct version than the cap allows, in order.
            const versions = [];
            for (let i = 0; i <= WebCEnumRegistry.MAX_STORED_VERSIONS; i++) {
                versions.push('2.' + i + '.0');
            }

            return versions.reduce(function (chain, v) {
                return chain.then(function () { return registry.prime(v); });
            }, Promise.resolve()).then(function () {
                const index = fakeStorage.data[WebCEnumRegistry.INDEX_KEY];
                expect(index).to.have.length(WebCEnumRegistry.MAX_STORED_VERSIONS);
                // Oldest (first primed) evicted; newest retained.
                expect(fakeStorage.data[WebCEnumRegistry.storageKey(versions[0])]).to.equal(undefined);
                expect(fakeStorage.data[WebCEnumRegistry.storageKey(versions[versions.length - 1])])
                    .to.not.equal(undefined);
            });
        });
    });
});
