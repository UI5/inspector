'use strict';

const reproductionCrawler = require('../../../app/scripts/modules/injected/reproductionCrawler.js');

/**
 * Build a fake ToolsAPI from plain fixtures. `properties`/`bindings` are keyed by control id.
 * @param {Object} config
 * @returns {Object}
 */
function createFakeToolsAPI(config) {
    config = config || {};
    return {
        getRenderedControlTree: function () {
            return config.tree || [];
        },
        getFrameworkInformation: function () {
            return Promise.resolve(config.frameworkInformation || {});
        },
        getControlProperties: function (id) {
            return (config.properties || {})[id];
        },
        getControlBindings: function (id) {
            return (config.bindings || {})[id];
        }
    };
}

/**
 * Build a fake getElement function from a map of id -> control-like objects.
 * @param {Object} controlsById
 * @returns {Function}
 */
function fakeGetElement(controlsById) {
    return function (id) {
        return (controlsById || {})[id];
    };
}

describe('reproductionCrawler', function () {

    describe('#crawl() meta', function () {
        it('should extract framework, version, theme, locale and libraries', function () {
            const toolsAPI = createFakeToolsAPI({
                frameworkInformation: {
                    commonInformation: { frameworkName: 'OpenUI5', version: '1.120.0' },
                    configurationComputed: { theme: 'sap_horizon', language: 'en' },
                    loadedLibraries: { 'sap.m': {}, 'sap.ui.core': {} },
                    configurationBootstrap: { 'data-sap-ui-theme': 'sap_horizon' },
                    URLParameters: { 'sap-ui-debug': ['true'] }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, { href: 'http://x/y', title: 'My App' }).then(function (snapshot) {
                snapshot.meta.framework.should.equal('OpenUI5');
                snapshot.meta.version.should.equal('1.120.0');
                snapshot.meta.theme.should.equal('sap_horizon');
                snapshot.meta.locale.should.equal('en');
                snapshot.meta.libraries.should.deep.equal(['sap.m', 'sap.ui.core']);
                snapshot.meta.url.should.equal('http://x/y');
                snapshot.meta.title.should.equal('My App');
                snapshot.meta.urlParameters['sap-ui-debug'].should.equal('true');
            });
        });

        it('should fall back to locale when language is absent and default empty fields', function () {
            const toolsAPI = createFakeToolsAPI({
                frameworkInformation: {
                    configurationComputed: { locale: 'de' }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.meta.locale.should.equal('de');
                snapshot.meta.framework.should.equal('');
                snapshot.meta.libraries.should.deep.equal([]);
            });
        });

        it('should carry console errors through from env', function () {
            const toolsAPI = createFakeToolsAPI({});
            const errors = [{ message: 'boom', count: 1 }];

            return reproductionCrawler.crawl(toolsAPI, { consoleErrors: errors }).then(function (snapshot) {
                snapshot.consoleErrors.should.deep.equal(errors);
            });
        });
    });

    describe('#crawl() tree', function () {
        it('should enrich controls with non-default properties only', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }],
                properties: {
                    btn: {
                        own: {
                            properties: {
                                text: { value: 'Hello', type: 'string', isDefault: false },
                                enabled: { value: true, type: 'boolean', isDefault: true }
                            }
                        },
                        inherited: [
                            { properties: { visible: { value: false, type: 'boolean', isDefault: false } } }
                        ]
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                const node = snapshot.tree[0];
                node.type.should.equal('sap.m.Button');
                node.isControl.should.equal(true);
                node.properties.should.have.length(2);
                node.properties[0].name.should.equal('text');
                node.properties[1].name.should.equal('visible');
                snapshot.stats.controlCount.should.equal(1);
            });
        });

        it('should let own properties win over inherited ones with the same name', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'c', name: 'X', type: 'sap-ui-control', content: [] }],
                properties: {
                    c: {
                        own: { properties: { width: { value: '10px', type: 'sap.ui.core.CSSSize', isDefault: false } } },
                        inherited: [{ properties: { width: { value: '20px', type: 'sap.ui.core.CSSSize', isDefault: false } } }]
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.have.length(1);
                snapshot.tree[0].properties[0].value.should.equal('10px');
            });
        });

        it('should collect property and aggregation bindings', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'lst', name: 'sap.m.List', type: 'sap-ui-control', content: [] }],
                bindings: {
                    lst: {
                        properties: { title: { path: '/name', model: 'app', mode: 'OneWay', value: 'X' } },
                        aggregations: { items: { model: 'app' } }
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                const bindings = snapshot.tree[0].bindings;
                bindings.properties.title.path.should.equal('/name');
                bindings.properties.title.model.should.equal('app');
                bindings.aggregations.items.model.should.equal('app');
            });
        });

        it('should keep grouping (non-control) nodes without enriching them and recurse into children', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{
                    id: 'area', name: 'sap-ui-area', type: 'data-sap-ui', content: [
                        { id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }
                    ]
                }]
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].isControl.should.equal(false);
                snapshot.tree[0].properties.should.have.length(0);
                snapshot.tree[0].children.should.have.length(1);
                snapshot.tree[0].children[0].isControl.should.equal(true);
                snapshot.stats.controlCount.should.equal(1);
            });
        });

        it('should stop descending and mark truncated once maxControls is reached', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [
                    { id: 'a', name: 'A', type: 'sap-ui-control', content: [] },
                    { id: 'b', name: 'B', type: 'sap-ui-control', content: [] },
                    { id: 'c', name: 'C', type: 'sap-ui-control', content: [] }
                ]
            });

            return reproductionCrawler.crawl(toolsAPI, {}, { maxControls: 2 }).then(function (snapshot) {
                snapshot.stats.controlCount.should.equal(2);
                snapshot.stats.truncated.should.equal(true);
                snapshot.tree.should.have.length(2);
            });
        });
    });

    describe('#crawl() aggregation & smart-control annotation', function () {
        it('should set aggregation from the live control instance when getElement is provided', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }]
            });
            const env = {
                getElement: fakeGetElement({ btn: { sParentAggregationName: 'content' } })
            };

            return reproductionCrawler.crawl(toolsAPI, env).then(function (snapshot) {
                snapshot.tree[0].aggregation.should.equal('content');
            });
        });

        it('should leave aggregation undefined when getElement is not provided', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }]
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                (snapshot.tree[0].aggregation === undefined).should.equal(true);
            });
        });

        it('should mark a child as isSmartGenerated when its id is derived from a smart ancestor', function () {
            // Parent is a sap.ui.comp smart control; child has a derived id.
            const smartParent = {
                sParentAggregationName: undefined,
                getMetadata: function () {
                    return { getLibraryName: function () { return 'sap.ui.comp'; } };
                }
            };
            const child = { sParentAggregationName: 'content' };

            const toolsAPI = createFakeToolsAPI({
                tree: [{
                    id: 'smart1',
                    name: 'sap.ui.comp.smarttable.SmartTable',
                    type: 'sap-ui-control',
                    content: [
                        { id: 'smart1-inner', name: 'sap.m.Table', type: 'sap-ui-control', content: [] }
                    ]
                }]
            });
            const env = {
                getElement: fakeGetElement({ 'smart1': smartParent, 'smart1-inner': child })
            };

            return reproductionCrawler.crawl(toolsAPI, env).then(function (snapshot) {
                (snapshot.tree[0].isSmartGenerated === undefined || snapshot.tree[0].isSmartGenerated === false).should.equal(true);
                snapshot.tree[0].children[0].isSmartGenerated.should.equal(true);
            });
        });

        it('should not mark a child as isSmartGenerated when its id uses the view scope separator "--"', function () {
            const smartParent = {
                sParentAggregationName: undefined,
                getMetadata: function () {
                    return { getLibraryName: function () { return 'sap.ui.comp'; } };
                }
            };
            const viewChild = { sParentAggregationName: 'content' };

            const toolsAPI = createFakeToolsAPI({
                tree: [{
                    id: 'smart1',
                    name: 'sap.ui.comp.smartform.SmartForm',
                    type: 'sap-ui-control',
                    content: [
                        { id: 'smart1--viewControl', name: 'sap.m.Input', type: 'sap-ui-control', content: [] }
                    ]
                }]
            });
            const env = {
                getElement: fakeGetElement({ 'smart1': smartParent, 'smart1--viewControl': viewChild })
            };

            return reproductionCrawler.crawl(toolsAPI, env).then(function (snapshot) {
                // "--" means view scope, not derived id — should not be marked
                (snapshot.tree[0].children[0].isSmartGenerated === undefined || snapshot.tree[0].children[0].isSmartGenerated === false).should.equal(true);
            });
        });
    });

    describe('#_isSmartControl', function () {
        it('should return true for sap.ui.comp.* controls', function () {
            const control = { getMetadata: function () { return { getLibraryName: function () { return 'sap.ui.comp'; } }; } };
            reproductionCrawler._isSmartControl(control).should.equal(true);
        });

        it('should return false for sap.m.* controls', function () {
            const control = { getMetadata: function () { return { getLibraryName: function () { return 'sap.m'; } }; } };
            reproductionCrawler._isSmartControl(control).should.equal(false);
        });

        it('should return false for null/undefined', function () {
            reproductionCrawler._isSmartControl(null).should.equal(false);
            reproductionCrawler._isSmartControl(undefined).should.equal(false);
        });
    });

    describe('#_isDerivedId', function () {
        it('should detect a single-dash derived id', function () {
            reproductionCrawler._isDerivedId('smart1-inner', 'smart1').should.equal(true);
        });

        it('should reject double-dash (view scope separator)', function () {
            reproductionCrawler._isDerivedId('smart1--inner', 'smart1').should.equal(false);
        });

        it('should reject an id that merely starts with the ancestor', function () {
            reproductionCrawler._isDerivedId('smart1', 'smart1').should.equal(false);
        });

        it('should handle a null ancestor gracefully', function () {
            reproductionCrawler._isDerivedId('smart1-inner', null).should.equal(false);
        });
    });

    describe('#crawl() resilience', function () {
        it('should tolerate a throwing getRenderedControlTree and return an empty tree', function () {
            const toolsAPI = createFakeToolsAPI({});
            toolsAPI.getRenderedControlTree = function () { throw new Error('nope'); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree.should.deep.equal([]);
                snapshot.stats.controlCount.should.equal(0);
            });
        });

        it('should tolerate throwing property and binding getters', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });
            toolsAPI.getControlProperties = function () { throw new Error('p'); };
            toolsAPI.getControlBindings = function () { throw new Error('b'); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.deep.equal([]);
                snapshot.tree[0].bindings.properties.should.deep.equal({});
            });
        });

        it('should tolerate missing property/binding data (undefined results)', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.deep.equal([]);
                snapshot.tree[0].bindings.properties.should.deep.equal({});
                snapshot.tree[0].bindings.aggregations.should.deep.equal({});
            });
        });

        it('should resolve framework information even when it is null', function () {
            const toolsAPI = createFakeToolsAPI({});
            toolsAPI.getFrameworkInformation = function () { return Promise.resolve(null); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.meta.framework.should.equal('');
            });
        });

        it('should tolerate a getElement that returns null for unknown ids', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });
            const env = { getElement: function () { return null; } };

            return reproductionCrawler.crawl(toolsAPI, env).then(function (snapshot) {
                (snapshot.tree[0].aggregation === undefined).should.equal(true);
            });
        });

        it('should not let a throwing getElement abort the crawl', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });
            const env = { getElement: function () { throw new Error('live control blew up'); } };

            return reproductionCrawler.crawl(toolsAPI, env).then(function (snapshot) {
                snapshot.tree.should.have.length(1);
                (snapshot.tree[0].aggregation === undefined).should.equal(true);
            });
        });

        it('should return a rejected promise (never throw synchronously) when getFrameworkInformation throws', function () {
            const toolsAPI = createFakeToolsAPI({});
            toolsAPI.getFrameworkInformation = function () { throw new Error('no framework info'); };

            // Must not throw synchronously — the injected dispatcher has no try/catch around it.
            const result = reproductionCrawler.crawl(toolsAPI, {});
            result.should.be.a('promise');
            return result.then(function (snapshot) {
                // getFrameworkInformation throw is swallowed and defaults to empty meta.
                snapshot.meta.framework.should.equal('');
            });
        });
    });
});


describe('reproductionCrawler', function () {

    describe('#crawl() meta', function () {
        it('should extract framework, version, theme, locale and libraries', function () {
            const toolsAPI = createFakeToolsAPI({
                frameworkInformation: {
                    commonInformation: { frameworkName: 'OpenUI5', version: '1.120.0' },
                    configurationComputed: { theme: 'sap_horizon', language: 'en' },
                    loadedLibraries: { 'sap.m': {}, 'sap.ui.core': {} },
                    configurationBootstrap: { 'data-sap-ui-theme': 'sap_horizon' },
                    URLParameters: { 'sap-ui-debug': ['true'] }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, { href: 'http://x/y', title: 'My App' }).then(function (snapshot) {
                snapshot.meta.framework.should.equal('OpenUI5');
                snapshot.meta.version.should.equal('1.120.0');
                snapshot.meta.theme.should.equal('sap_horizon');
                snapshot.meta.locale.should.equal('en');
                snapshot.meta.libraries.should.deep.equal(['sap.m', 'sap.ui.core']);
                snapshot.meta.url.should.equal('http://x/y');
                snapshot.meta.title.should.equal('My App');
                snapshot.meta.urlParameters['sap-ui-debug'].should.equal('true');
            });
        });

        it('should fall back to locale when language is absent and default empty fields', function () {
            const toolsAPI = createFakeToolsAPI({
                frameworkInformation: {
                    configurationComputed: { locale: 'de' }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.meta.locale.should.equal('de');
                snapshot.meta.framework.should.equal('');
                snapshot.meta.libraries.should.deep.equal([]);
            });
        });

        it('should carry console errors through from env', function () {
            const toolsAPI = createFakeToolsAPI({});
            const errors = [{ message: 'boom', count: 1 }];

            return reproductionCrawler.crawl(toolsAPI, { consoleErrors: errors }).then(function (snapshot) {
                snapshot.consoleErrors.should.deep.equal(errors);
            });
        });
    });

    describe('#crawl() tree', function () {
        it('should enrich controls with non-default properties only', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }],
                properties: {
                    btn: {
                        own: {
                            properties: {
                                text: { value: 'Hello', type: 'string', isDefault: false },
                                enabled: { value: true, type: 'boolean', isDefault: true }
                            }
                        },
                        inherited: [
                            { properties: { visible: { value: false, type: 'boolean', isDefault: false } } }
                        ]
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                const node = snapshot.tree[0];
                node.type.should.equal('sap.m.Button');
                node.isControl.should.equal(true);
                node.properties.should.have.length(2);
                node.properties[0].name.should.equal('text');
                node.properties[1].name.should.equal('visible');
                snapshot.stats.controlCount.should.equal(1);
            });
        });

        it('should let own properties win over inherited ones with the same name', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'c', name: 'X', type: 'sap-ui-control', content: [] }],
                properties: {
                    c: {
                        own: { properties: { width: { value: '10px', type: 'sap.ui.core.CSSSize', isDefault: false } } },
                        inherited: [{ properties: { width: { value: '20px', type: 'sap.ui.core.CSSSize', isDefault: false } } }]
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.have.length(1);
                snapshot.tree[0].properties[0].value.should.equal('10px');
            });
        });

        it('should collect property and aggregation bindings', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'lst', name: 'sap.m.List', type: 'sap-ui-control', content: [] }],
                bindings: {
                    lst: {
                        properties: { title: { path: '/name', model: 'app', mode: 'OneWay', value: 'X' } },
                        aggregations: { items: { model: 'app' } }
                    }
                }
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                const bindings = snapshot.tree[0].bindings;
                bindings.properties.title.path.should.equal('/name');
                bindings.properties.title.model.should.equal('app');
                bindings.aggregations.items.model.should.equal('app');
            });
        });

        it('should keep grouping (non-control) nodes without enriching them and recurse into children', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{
                    id: 'area', name: 'sap-ui-area', type: 'data-sap-ui', content: [
                        { id: 'btn', name: 'sap.m.Button', type: 'sap-ui-control', content: [] }
                    ]
                }]
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].isControl.should.equal(false);
                snapshot.tree[0].properties.should.have.length(0);
                snapshot.tree[0].children.should.have.length(1);
                snapshot.tree[0].children[0].isControl.should.equal(true);
                snapshot.stats.controlCount.should.equal(1);
            });
        });

        it('should stop descending and mark truncated once maxControls is reached', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [
                    { id: 'a', name: 'A', type: 'sap-ui-control', content: [] },
                    { id: 'b', name: 'B', type: 'sap-ui-control', content: [] },
                    { id: 'c', name: 'C', type: 'sap-ui-control', content: [] }
                ]
            });

            return reproductionCrawler.crawl(toolsAPI, {}, { maxControls: 2 }).then(function (snapshot) {
                snapshot.stats.controlCount.should.equal(2);
                snapshot.stats.truncated.should.equal(true);
                snapshot.tree.should.have.length(2);
            });
        });
    });

    describe('#crawl() resilience', function () {
        it('should tolerate a throwing getRenderedControlTree and return an empty tree', function () {
            const toolsAPI = createFakeToolsAPI({});
            toolsAPI.getRenderedControlTree = function () { throw new Error('nope'); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree.should.deep.equal([]);
                snapshot.stats.controlCount.should.equal(0);
            });
        });

        it('should tolerate throwing property and binding getters', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });
            toolsAPI.getControlProperties = function () { throw new Error('p'); };
            toolsAPI.getControlBindings = function () { throw new Error('b'); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.deep.equal([]);
                snapshot.tree[0].bindings.properties.should.deep.equal({});
            });
        });

        it('should tolerate missing property/binding data (undefined results)', function () {
            const toolsAPI = createFakeToolsAPI({
                tree: [{ id: 'x', name: 'X', type: 'sap-ui-control', content: [] }]
            });

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.tree[0].properties.should.deep.equal([]);
                snapshot.tree[0].bindings.properties.should.deep.equal({});
                snapshot.tree[0].bindings.aggregations.should.deep.equal({});
            });
        });

        it('should resolve framework information even when it is null', function () {
            const toolsAPI = createFakeToolsAPI({});
            toolsAPI.getFrameworkInformation = function () { return Promise.resolve(null); };

            return reproductionCrawler.crawl(toolsAPI, {}).then(function (snapshot) {
                snapshot.meta.framework.should.equal('');
            });
        });
    });
});
