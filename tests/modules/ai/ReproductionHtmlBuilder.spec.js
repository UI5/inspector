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

        it('should embed a version-specific CDN bootstrap URL from the app version', function () {
            const html = builder.build(snapshotWith([]));
            // snapshotWith sets version 1.120.0, so the bootstrap matches that version (not latest).
            html.should.contain('https://ui5.sap.com/1.120.0/resources/sap-ui-core.js');
        });

        it('should fall back to the version-less CDN bootstrap when no version is known', function () {
            const html = builder.build(snapshotWith([], { version: undefined }));
            html.should.contain('https://ui5.sap.com/resources/sap-ui-core.js');
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

        it('should log a load failure to the console so an automated render check detects it', function () {
            const html = builder.build(snapshotWith([]));
            html.should.contain('console.error');
            html.should.contain('Could not load content');
        });
    });

    describe('#build() exclusions (deterministic fix loop)', function () {
        it('should drop a control whose type is in excludeTypes, along with its subtree', function () {
            const tree = [controlNode({
                id: 'page', type: 'sap.m.Page', children: [
                    controlNode({ id: 'ok', type: 'sap.m.Button', aggregation: 'content' }),
                    controlNode({ id: 'bad', type: 'sap.ui.comp.smartfield.SmartField', aggregation: 'content', children: [
                        controlNode({ id: 'inner', type: 'sap.m.Text', aggregation: 'content' })
                    ] })
                ]
            })];
            const html = builder.build(snapshotWith(tree), { excludeTypes: ['sap.ui.comp.smartfield.SmartField'] });
            html.should.contain('id="ok"');
            html.should.not.contain('id="bad"');
            html.should.not.contain('id="inner"');
        });

        it('should leave the tree untouched when excludeTypes is empty or omitted', function () {
            const tree = [controlNode({ id: 'b', type: 'sap.m.Button' })];
            builder.build(snapshotWith(tree)).should.contain('id="b"');
            builder.build(snapshotWith(tree), { excludeTypes: [] }).should.contain('id="b"');
        });

        it('should omit a library listed in excludeLibraries from data-sap-ui-libs', function () {
            const tree = [
                controlNode({ id: 'b', type: 'sap.m.Button' }),
                controlNode({ id: 'f', type: 'sap.ui.layout.form.Form' })
            ];
            const html = builder.build(snapshotWith(tree), { excludeLibraries: ['sap.ui.layout'] });
            const libs = html.match(/data-sap-ui-libs="([^"]*)"/)[1];
            libs.should.contain('sap.m');
            libs.should.not.contain('sap.ui.layout');
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
            const child = controlNode({ id: 'txt', type: 'sap.m.Text', aggregation: 'content' });
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

        it('should inline a bound property as its resolved value (literal), not a {model>path} binding', function () {
            const node = controlNode({
                bindings: { properties: { text: { path: '/name', model: { names: ['app'] }, mode: 'OneWay', value: 'Alice' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('text="Alice"');
            // No binding syntax and no serialized descriptor must leak into the attribute.
            html.should.not.contain('text="{');
            html.should.not.contain('[object Object]');
        });

        it('should inline a bound boolean value', function () {
            const node = controlNode({
                bindings: { properties: { visible: { path: '/v', model: { names: ['app'] }, mode: 'OneWay', value: false } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('visible="false"');
        });

        it('should omit a bound property whose resolved value is not a primitive', function () {
            const node = controlNode({
                id: 'x', type: 'sap.m.Button',
                bindings: { properties: { href: { path: '', model: { names: ['app'] }, mode: 'OneWay', value: { some: 'object' } } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.not.contain('href');
            html.should.not.contain('[object Object]');
        });

        it('should prefer the binding’s resolved value over a literal property of the same name', function () {
            const node = controlNode({
                properties: [{ name: 'text', value: 'literal', type: 'string' }],
                bindings: { properties: { text: { path: '/title', model: { names: ['app'] }, mode: 'OneWay', value: 'bound' } }, aggregations: {} }
            });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('text="bound"');
            html.should.not.contain('"literal"');
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

    describe('#build() ComponentContainer inlining', function () {
        it('should inline a ComponentContainer\'s content instead of emitting rootControl aggregation', function () {
            // Regression: `<core:ComponentContainer><core:rootControl>…` made UI5 reject the fragment
            // ("Cannot add direct child without default aggregation defined").
            const inner = controlNode({ id: 'rootView', type: 'sap.m.Page', aggregation: 'rootControl' });
            const container = controlNode({
                id: 'comp', type: 'sap.ui.core.ComponentContainer', children: [inner]
            });
            const html = builder.build(snapshotWith([container]));

            html.should.not.contain('ComponentContainer');
            html.should.not.contain('rootControl');
            // The inner content is emitted in the container's place.
            html.should.contain('id="rootView"');
        });

        it('should still render controls nested below an inlined ComponentContainer', function () {
            const button = controlNode({ id: 'btn', type: 'sap.m.Button', aggregation: 'content' });
            const page = controlNode({ id: 'rootView', type: 'sap.m.Page', aggregation: 'rootControl', children: [button] });
            const container = controlNode({
                id: 'comp', type: 'sap.ui.core.ComponentContainer', children: [page]
            });
            const html = builder.build(snapshotWith([container]));

            html.should.not.contain('rootControl');
            html.should.contain('id="rootView"');
            html.should.contain('id="btn"');
        });
    });

    describe('#build() non-reproducible shell controls', function () {
        it('should not emit a sap.ushell.* control (cannot run standalone)', function () {
            // Regression: Fiori Launchpad shell controls reach into the FLP runtime on instantiation
            // ("Config accessed before BootstrapConfig was initialized", shellHeader getModel errors),
            // which does not exist in a standalone CDN reproduction. They must be dropped.
            const shellTitle = controlNode({ id: 'shellTitle', type: 'sap.ushell.ui.shell.ShellAppTitle' });
            const html = builder.build(snapshotWith([shellTitle]));

            html.should.not.contain('ShellAppTitle');
            html.should.not.contain('shellTitle');
        });

        it('should inline real app content nested below a shell control', function () {
            const appButton = controlNode({ id: 'appBtn', type: 'sap.m.Button', aggregation: 'content' });
            const appPage = controlNode({ id: 'appPage', type: 'sap.m.Page', aggregation: 'content', children: [appButton] });
            const shell = controlNode({ id: 'shell', type: 'sap.ushell.renderers.fiori2.Shell', children: [appPage] });
            const html = builder.build(snapshotWith([shell]));

            // The shell wrapper element is gone, but the app content it contained survives. (A unused
            // xmlns declaration for the shell namespace may remain — harmless, UI5 ignores it.)
            html.should.not.contain('fiori2:Shell');
            html.should.not.contain('id="shell"');
            html.should.contain('id="appPage"');
            html.should.contain('id="appBtn"');
        });
    });

    describe('#build() transparent mvc views', function () {
        it('should inline an XMLView’s content and drop the view wrapper + viewName', function () {
            // Regression: a `<mvc:XMLView viewName="sap.ushell...ShellBar">` tried to LOAD that internal
            // view module standalone and rejected Fragment.load. The crawler already captured the view’s
            // rendered content, so the view must be transparent.
            const inner = controlNode({ id: 'sb', type: 'sap.f.ShellBar', aggregation: 'content' });
            const view = {
                id: 'v', type: 'sap.ui.core.mvc.XMLView', isControl: true,
                properties: [{ name: 'viewName', value: 'my.internal.ShellBar', type: 'string' }],
                bindings: { properties: {}, aggregations: {} }, children: [inner]
            };
            const html = builder.build(snapshotWith([view]));

            html.should.contain('id="sb"');
            html.should.not.contain('XMLView');
            html.should.not.contain('my.internal.ShellBar');
        });
    });

    describe('#build() private aggregation skipping', function () {
        it('should not emit a child sitting in an underscore-prefixed private aggregation', function () {
            // Regression: SysInfoBar's private `_bar` aggregation was emitted as `<shell:_bar>`, which
            // UI5 rejects ("Cannot add direct child without default aggregation defined"). The parent
            // rebuilds the private aggregation at runtime, so it must be dropped from the reproduction.
            const innerBar = controlNode({ id: 'bar0-bar', type: 'sap.m.Bar', aggregation: '_bar' });
            const panel = controlNode({
                id: 'bar0', type: 'sap.m.Panel', children: [innerBar]
            });
            const html = builder.build(snapshotWith([panel]));

            html.should.contain('id="bar0"');
            html.should.not.contain('_bar');
            html.should.not.contain('id="bar0-bar"');
            // With its only child dropped, the parent collapses to a self-closing tag.
            html.should.contain('id="bar0"/>');
        });

        it('should still emit sibling children in public aggregations when a private one is dropped', function () {
            const privateChild = controlNode({ id: 'priv', type: 'sap.m.Bar', aggregation: '_bar' });
            const publicChild = controlNode({ id: 'pub', type: 'sap.m.Button', aggregation: 'content' });
            const parent = controlNode({
                id: 'host', type: 'sap.m.Panel', children: [privateChild, publicChild]
            });
            const html = builder.build(snapshotWith([parent]));

            html.should.not.contain('id="priv"');
            html.should.contain('id="pub"');
        });

        it('should drop a child with no aggregation name (internal implementation child)', function () {
            // Regression: a control can hold an internal child (e.g. ShellAppTitle's slim-arrow-down
            // Icon) with sParentAggregationName = '' → aggregation: undefined in the snapshot. Emitting
            // it as a direct child causes "Cannot add direct child without default aggregation defined".
            const icon = controlNode({ id: 'icon0', type: 'sap.ui.core.Icon', aggregation: undefined });
            const title = controlNode({
                id: 'title0', type: 'sap.m.Panel', children: [icon]
            });
            const html = builder.build(snapshotWith([title]));

            html.should.contain('id="title0"');
            html.should.not.contain('id="icon0"');
            html.should.contain('id="title0"/>');
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

    describe('#build() duplicate ID deduplication', function () {
        it('should emit a control with a duplicate id only once in a flat tree', function () {
            // Regression: the crawler can capture the same control via two different traversal paths
            // (e.g. once through its UIArea, once as a sibling in an aggregation scan). Emitting both
            // produces `id="X"` twice, which causes UI5 to fail with "duplicate id X-describedby".
            const tree = [
                controlNode({ id: 'btn', type: 'sap.m.Button' }),
                controlNode({ id: 'btn', type: 'sap.m.Button' })
            ];
            const html = builder.build(snapshotWith(tree));
            const occurrences = html.split('id="btn"').length - 1;
            occurrences.should.equal(1);
        });

        it('should emit a control with a duplicate id only once across two frames', function () {
            const snapshot = {
                meta: { libraries: ['sap.m'], theme: 'sap_horizon', title: 'T' },
                frames: [
                    { frameId: 0, url: 'https://app/', tree: [controlNode({ id: 'shared', type: 'sap.m.Button' })] },
                    { frameId: 1, url: 'https://app/iframe', tree: [controlNode({ id: 'shared', type: 'sap.m.Button' })] }
                ],
                tree: [],
                stats: { controlCount: 2, truncated: false }
            };
            const html = builder.build(snapshot);
            const occurrences = html.split('id="shared"').length - 1;
            occurrences.should.equal(1);
        });

        it('should still emit controls without ids even if their type repeats', function () {
            const tree = [
                controlNode({ id: undefined, type: 'sap.m.Button' }),
                controlNode({ id: undefined, type: 'sap.m.Button' })
            ];
            const html = builder.build(snapshotWith(tree));
            const occurrences = html.split('<Button/>').length - 1;
            occurrences.should.equal(2);
        });

        it('should drop a control whose id is an auto-generated suffix of another control id', function () {
            // Regression: the crawler captures UI5-internal accessibility helpers (e.g. a Button's
            // "-describedby" InvisibleText) as their own control nodes. Emitting id="btn-describedby"
            // explicitly collides with the one UI5 auto-creates for the Button → "duplicate id" error.
            const button = controlNode({ id: 'supportChatBtn', type: 'sap.m.Button' });
            const helper = controlNode({ id: 'supportChatBtn-describedby', type: 'sap.ui.core.InvisibleText' });
            const html = builder.build(snapshotWith([button, helper]));

            html.should.contain('id="supportChatBtn"');
            html.should.not.contain('supportChatBtn-describedby');
            html.should.not.contain('InvisibleText');
        });

        it('should drop a nested auto-generated suffix child of its parent control', function () {
            const inner = controlNode({ id: 'myBtn-img', type: 'sap.m.Image', aggregation: 'content' });
            const button = controlNode({ id: 'myBtn', type: 'sap.m.Button', children: [inner] });
            const html = builder.build(snapshotWith([button]));

            html.should.contain('id="myBtn"');
            html.should.not.contain('myBtn-img');
        });

        it('should keep a control whose dashed id has no matching base control', function () {
            // A real, author-assigned dashed id (no base control of the prefix in the tree) is kept.
            const node = controlNode({ id: 'my-custom-button', type: 'sap.m.Button' });
            const html = builder.build(snapshotWith([node]));
            html.should.contain('id="my-custom-button"');
        });

        it('should not emit a UI5 auto-generated id, letting UI5 reassign it at runtime', function () {
            // Regression: `id="__image0"` (UI5's runtime uid) collides with the fresh `__image0` UI5
            // generates from its own counter → "duplicate id '__image0'". The control is still
            // emitted (we want the Image), just without the forced id.
            const node = controlNode({ id: '__image0', type: 'sap.m.Image' });
            const html = builder.build(snapshotWith([node]));
            html.should.not.contain('__image0');
            html.should.contain('<Image');
        });

        it('should drop the forced id but keep the control for an auto-generated parent with children', function () {
            const child = controlNode({ id: 'realChild', type: 'sap.m.Text', aggregation: 'content' });
            const parent = controlNode({ id: '__panel2', type: 'sap.m.Panel', children: [child] });
            const html = builder.build(snapshotWith([parent]));
            html.should.not.contain('__panel2');
            html.should.contain('<Panel');
            html.should.contain('id="realChild"');
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
