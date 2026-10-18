'use strict';

const ReproductionHtmlBuilder = require('../../../app/scripts/modules/ai/ReproductionHtmlBuilder.js');

function controlNode(overrides) {
    return Object.assign({
        id: 'ctrl',
        type: 'sap.m.Button',
        isControl: true,
        properties: [],
        bindings: { properties: {}, aggregations: {} },
        children: [],
        aggregation: undefined,
        isSmartGenerated: undefined
    }, overrides);
}

function snapshotWith(tree, metaOverrides) {
    return {
        meta: Object.assign({
            framework: 'OpenUI5',
            version: '1.120.0',
            theme: 'sap_horizon',
            locale: 'en',
            libraries: ['sap.m', 'sap.ui.layout'],
            title: 'Test App'
        }, metaOverrides || {}),
        consoleErrors: [],
        tree: tree || [],
        stats: { controlCount: (tree || []).length, truncated: false }
    };
}

describe('ReproductionHtmlBuilder', function () {
    let builder;

    beforeEach(function () {
        builder = new ReproductionHtmlBuilder();
    });

    afterEach(function () {
        builder = null;
    });

    describe('#build() basic HTML structure', function () {
        it('should produce a complete HTML document', function () {
            const html = builder.build(snapshotWith([]));

            html.should.contain('<!DOCTYPE html>');
            html.should.contain('<html>');
            html.should.contain('</html>');
            html.should.contain('<body class="sapUiBody">');
        });

        it('should embed the CDN bootstrap URL', function () {
            const html = builder.build(snapshotWith([]));
            html.should.contain('ui5.sap.com/resources/sap-ui-core.js');
        });

        it('should allow overriding the bootstrap URL via options', function () {
            const html = builder.build(snapshotWith([]), { bootstrapUrl: 'https://my.cdn/sap-ui-core.js' });
            html.should.contain('https://my.cdn/sap-ui-core.js');
        });

        it('should derive data-sap-ui-libs from the public libraries the controls actually use', function () {
            const html = builder.build(snapshotWith([
                controlNode({ id: 'b', type: 'sap.m.Button' }),
                controlNode({ id: 'f', type: 'sap.ui.layout.form.Form' })
            ]));
            html.should.contain('data-sap-ui-libs="');
            html.should.contain('sap.m');
            html.should.contain('sap.ui.layout');
        });

        it('should NOT declare internal/adapter libraries that are not on the public CDN', function () {
            // Regression: meta.libraries listed every loaded library (incl. sap.cf.adapters), which
            // made the generated app 404 on sap/cf/adapters/library.js and fail to boot in Snippix.
            const snapshot = snapshotWith([controlNode({ id: 'b', type: 'sap.m.Button' })], {
                libraries: ['sap.m', 'sap.cf.adapters', 'sap.ui.fl', 'sap.ushell']
            });
            const html = builder.build(snapshot);
            html.should.contain('sap.m');
            html.should.not.contain('sap.cf.adapters');
            html.should.not.contain('sap.ui.fl');
            html.should.not.contain('sap.ushell');
        });

        it('should keep a public library the app loaded even when no control in the tree uses it', function () {
            // Fidelity: a public lib may be needed only for a formatter/type used in a binding, with
            // no control of its own in the tree. Keep it (it is on the CDN) rather than drop it.
            const snapshot = snapshotWith([controlNode({ id: 'b', type: 'sap.m.Button' })], {
                libraries: ['sap.m', 'sap.ui.unified']
            });
            const html = builder.build(snapshot);
            html.should.contain('sap.m');
            html.should.contain('sap.ui.unified');
        });

        it('should fall back to sap.m when neither the tree nor meta yield a public library', function () {
            const snapshot = snapshotWith([], { libraries: ['sap.cf.adapters', 'sap.ui.fl'] });
            const html = builder.build(snapshot);
            html.should.contain('data-sap-ui-libs="sap.m"');
        });

        it('should map smart controls to their sap.ui.comp library', function () {
            const html = builder.build(snapshotWith([
                controlNode({ id: 'st', type: 'sap.ui.comp.smarttable.SmartTable' })
            ]));
            html.should.contain('sap.ui.comp');
        });

        it('should embed the theme from meta', function () {
            const html = builder.build(snapshotWith([]));
            html.should.contain('sap_horizon');
        });

        it('should embed the page title', function () {
            const html = builder.build(snapshotWith([], { title: 'My Repro' }));
            html.should.contain('<title>My Repro</title>');
        });

        it('should tolerate an empty or undefined snapshot', function () {
            builder.build().should.contain('<!DOCTYPE html>');
            builder.build({}).should.contain('<!DOCTYPE html>');
        });

        it('should include the Fragment.load bootstrap pattern', function () {
            const html = builder.build(snapshotWith([]));
            html.should.contain('Fragment.load');
            html.should.contain('Core.ready');
            html.should.contain('placeAt("content")');
        });
    });

    describe('#build() XML fragment generation', function () {
        it('should wrap the fragment in a FragmentDefinition element', function () {
            const html = builder.build(snapshotWith([controlNode({ type: 'sap.m.Button' })]));
            html.should.contain('FragmentDefinition');
        });

        it('should use the most-frequent namespace as the default xmlns', function () {
            const tree = [
                controlNode({ id: 'b1', type: 'sap.m.Button' }),
                controlNode({ id: 'b2', type: 'sap.m.Text' }),
                controlNode({ id: 'b3', type: 'sap.m.List' })
            ];
            const html = builder.build(snapshotWith(tree));
            html.should.contain('xmlns="sap.m"');
        });

        it('should assign a short prefix to non-default namespaces', function () {
            const tree = [
                controlNode({ id: 'b1', type: 'sap.m.Button' }),
                controlNode({ id: 'b2', type: 'sap.m.Text' }),
                controlNode({ id: 'f1', type: 'sap.ui.layout.form.Form' })
            ];
            const html = builder.build(snapshotWith(tree));
            html.should.contain('xmlns:form="sap.ui.layout.form"');
        });

        it('should always declare the core namespace for FragmentDefinition', function () {
            const html = builder.build(snapshotWith([controlNode({ type: 'sap.m.Button' })]));
            html.should.contain('xmlns:core="sap.ui.core"');
        });

        it('should render a simple control as a self-closing XML element', function () {
            const html = builder.build(snapshotWith([controlNode({ id: 'btn', type: 'sap.m.Button' })]));
            html.should.contain('<Button id="btn"/>');
        });

        it('should render a control with children using open/close tags', function () {
            const child = controlNode({ id: 'txt', type: 'sap.m.Text' });
            const parent = controlNode({ id: 'page', type: 'sap.m.Page', children: [child] });
            const html = builder.build(snapshotWith([parent]));
            html.should.contain('<Page id="page">');
            html.should.contain('</Page>');
            html.should.contain('<Text id="txt"/>');
        });

        it('should wrap children in aggregation tags when aggregation is set', function () {
            const footer = controlNode({ id: 'toolbar', type: 'sap.m.Toolbar', aggregation: 'footer' });
            const page = controlNode({ id: 'page', type: 'sap.m.Page', children: [footer] });
            const html = builder.build(snapshotWith([page]));
            html.should.contain('<footer>');
            html.should.contain('</footer>');
        });

        it('should emit UIArea grouping nodes transparently (no extra element)', function () {
            const child = controlNode({ id: 'btn', type: 'sap.m.Button' });
            const uiArea = { id: 'sap-ui-content', type: 'sap-ui-area', isControl: false, properties: [], bindings: { properties: {}, aggregations: {} }, children: [child] };
            const html = builder.build(snapshotWith([uiArea]));
            html.should.not.contain('sap-ui-area');
            html.should.contain('<Button id="btn"/>');
        });

        it('should generate a valid empty fragment for an empty tree', function () {
            const html = builder.build(snapshotWith([]));
            html.should.contain('FragmentDefinition');
            html.should.contain('</');
        });
    });

    describe('#build() properties and bindings', function () {
        it('should render boolean properties as XML attributes', function () {
            const node = controlNode({ properties: [{ name: 'enabled', value: false, type: 'boolean' }] });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('enabled="false"');
        });

        it('should render number properties as XML attributes', function () {
            const node = controlNode({ properties: [{ name: 'width', value: 200, type: 'int' }] });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('width="200"');
        });

        it('should render string properties as XML attributes', function () {
            const node = controlNode({ properties: [{ name: 'type', value: 'Emphasized', type: 'string' }] });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('type="Emphasized"');
        });

        it('should escape curly braces in literal string values', function () {
            const node = controlNode({ properties: [{ name: 'text', value: '{notABinding}', type: 'string' }] });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('\\{notABinding\\}');
        });

        it('should render property bindings as {model>path}', function () {
            const node = controlNode({
                bindings: { properties: { text: { path: '/name', model: 'app', mode: '' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('text=');
            // '>' is XML-escaped in attribute values; the XML parser decodes it at runtime
            html.should.contain('app&gt;/name');
        });

        it('should render bindings without a model using {/path} syntax', function () {
            const node = controlNode({
                bindings: { properties: { value: { path: '/total', model: '', mode: 'TwoWay' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('{/total}');
        });

        it('should use full binding syntax for non-default modes', function () {
            const node = controlNode({
                bindings: { properties: { text: { path: '/n', model: 'app', mode: 'OneWay' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('mode');
        });

        it('should prefer the binding over a property of the same name', function () {
            const node = controlNode({
                properties: [{ name: 'text', value: 'literal', type: 'string' }],
                bindings: { properties: { text: { path: '/title', model: '', mode: '' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.not.contain('"literal"');
            html.should.contain('/title');
        });
    });

    describe('#build() smart-generated filtering', function () {
        it('should omit controls with isSmartGenerated: true', function () {
            const smart = controlNode({ id: 'smart-inner', type: 'sap.m.Table', isSmartGenerated: true });
            const html = builder.build(snapshotWith([smart]));
            html.should.not.contain('smart-inner');
            html.should.not.contain('<Table');
        });

        it('should emit the smart parent control but skip its generated children', function () {
            const inner = controlNode({ id: 'sf-filter', type: 'sap.m.Input', isSmartGenerated: true });
            const sf = controlNode({ id: 'sf', type: 'sap.ui.comp.smartfilterbar.SmartFilterBar', children: [inner] });
            const html = builder.build(snapshotWith([sf]));
            html.should.contain('sf');
            html.should.not.contain('sf-filter');
        });
    });

    describe('#build() model collection', function () {
        it('should include a JSONModel entry for each unique binding model', function () {
            const node = controlNode({
                bindings: {
                    properties: {
                        text: { path: '/name', model: 'app', mode: '' },
                        value: { path: '/val', model: 'data', mode: '' }
                    },
                    aggregations: {}
                }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('"app"');
            html.should.contain('"data"');
        });

        it('should include the default (unnamed) model when a binding uses no model name', function () {
            const node = controlNode({
                bindings: { properties: { text: { path: '/n', model: '', mode: '' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('JSONModel');
            html.should.contain('name: undefined');
        });

        it('should not add any JSONModel entries when there are no bindings', function () {
            const html = builder.build(snapshotWith([controlNode()]));
            html.should.contain('aModels = []');
        });
    });

    describe('#build() multi-frame snapshot', function () {
        it('should concatenate trees from multiple frames', function () {
            const snapshot = {
                meta: { libraries: ['sap.m'], theme: 'sap_horizon', title: 'T' },
                frames: [
                    { frameId: 0, url: 'https://app/', tree: [controlNode({ id: 'root', type: 'sap.m.Shell' })] },
                    { frameId: 1, url: 'https://app/iframe', tree: [controlNode({ id: 'inner', type: 'sap.m.Page' })] }
                ],
                tree: [],
                stats: { controlCount: 2, truncated: false }
            };
            const html = builder.build(snapshot);
            html.should.contain('id="root"');
            html.should.contain('id="inner"');
        });

        it('should use snapshot.tree directly when only one frame is present', function () {
            const snapshot = {
                meta: { libraries: ['sap.m'], theme: 'sap_horizon', title: 'T' },
                frames: [{ frameId: 0, url: 'https://app/', tree: [controlNode({ id: 'solo' })] }],
                tree: [controlNode({ id: 'solo' })],
                stats: { controlCount: 1, truncated: false }
            };
            const html = builder.build(snapshot);
            html.should.contain('id="solo"');
        });

        it('should fall back to snapshot.tree when no frames array is present', function () {
            const html = builder.build(snapshotWith([controlNode({ id: 'fallback' })]));
            html.should.contain('id="fallback"');
        });
    });
});
