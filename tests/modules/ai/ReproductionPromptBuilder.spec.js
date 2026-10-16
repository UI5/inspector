'use strict';

const ReproductionPromptBuilder = require('../../../app/scripts/modules/ai/ReproductionPromptBuilder.js');

function controlNode(overrides) {
    return Object.assign({
        id: 'ctrl',
        type: 'sap.m.Button',
        isControl: true,
        properties: [],
        bindings: { properties: {}, aggregations: {} },
        children: []
    }, overrides);
}

function snapshotWith(tree, overrides) {
    return Object.assign({
        meta: { framework: 'OpenUI5', version: '1.120.0', theme: 'sap_horizon', locale: 'en', libraries: ['sap.m'] },
        consoleErrors: [],
        tree: tree || [],
        stats: { controlCount: (tree || []).length, truncated: false }
    }, overrides);
}

describe('ReproductionPromptBuilder', function () {
    let builder;

    beforeEach(function () {
        builder = new ReproductionPromptBuilder();
    });

    afterEach(function () {
        builder = null;
    });

    describe('#build() structure', function () {
        it('should include intro, environment, control tree, instructions and notes sections', function () {
            const prompt = builder.build(snapshotWith([controlNode()]));

            prompt.should.contain('# UI5 Reproduction Request');
            prompt.should.contain('## Environment');
            prompt.should.contain('## Control tree');
            prompt.should.contain('## What to produce');
            prompt.should.contain('## Notes');
        });

        it('should render environment facts', function () {
            const prompt = builder.build(snapshotWith([]));

            prompt.should.contain('- Framework: OpenUI5 1.120.0');
            prompt.should.contain('- Theme: sap_horizon');
            prompt.should.contain('- Locale: en');
            prompt.should.contain('- Loaded libraries: sap.m');
        });

        it('should mention both the standalone index.html and the Component-based skeleton output options', function () {
            const prompt = builder.build(snapshotWith([]));

            prompt.should.contain('index.html');
            prompt.should.contain('Component.js');
            prompt.should.contain('manifest.json');
        });

        it('should state "(no controls found)" for an empty tree', function () {
            const prompt = builder.build(snapshotWith([]));
            prompt.should.contain('(no controls found)');
        });

        it('should tolerate an empty snapshot', function () {
            const prompt = builder.build();
            prompt.should.contain('# UI5 Reproduction Request');
        });
    });

    describe('#build() control outline', function () {
        it('should render a control with its id and non-default properties', function () {
            const node = controlNode({
                id: 'btn0', type: 'sap.m.Button',
                properties: [{ name: 'enabled', value: true, type: 'boolean' }]
            });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('- sap.m.Button #btn0');
            prompt.should.contain('enabled = true');
        });

        it('should indent children under their parent and skip depth for grouping nodes', function () {
            const child = controlNode({ id: 'child', type: 'sap.m.Text' });
            const group = { id: 'area', type: 'sap-ui-area', isControl: false, properties: [], bindings: { properties: {}, aggregations: {} }, children: [child] };
            const prompt = builder.build(snapshotWith([group]));

            // Grouping node adds no indentation, so the child sits at depth 0.
            prompt.should.contain('\n- sap.m.Text #child');
        });

        it('should render property bindings with model and path', function () {
            const node = controlNode({
                bindings: { properties: { title: { path: '/name', model: 'app', mode: 'OneWay' } }, aggregations: {} }
            });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('title ⟵ {app>/name} [OneWay]');
        });

        it('should render aggregation bindings with their model', function () {
            const node = controlNode({
                bindings: { properties: {}, aggregations: { items: { model: 'app' } } }
            });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('items ⟵ aggregation binding (model: app)');
        });

        it('should truncate a very large tree outline', function () {
            const many = [];
            for (let i = 0; i < 50; i++) {
                many.push(controlNode({ id: 'c' + i, properties: [{ name: 'text', value: 'LongTokenValueHere', type: 'string' }] }));
            }
            const prompt = builder.build(snapshotWith(many), { maxTreeChars: 100 });
            prompt.should.contain('[tree truncated]');
        });
    });

    describe('#build() redaction (default)', function () {
        it('should keep boolean and number values', function () {
            const node = controlNode({ properties: [
                { name: 'enabled', value: false, type: 'boolean' },
                { name: 'width', value: 42, type: 'int' }
            ] });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('enabled = false');
            prompt.should.contain('width = 42');
        });

        it('should keep short structural string tokens (enum values)', function () {
            const node = controlNode({ properties: [{ name: 'type', value: 'Emphasized', type: 'string' }] });
            const prompt = builder.build(snapshotWith([node]));
            prompt.should.contain('type = Emphasized');
        });

        it('should mask free-form string values', function () {
            const node = controlNode({ properties: [{ name: 'text', value: 'Secret customer order #4471', type: 'string' }] });
            const prompt = builder.build(snapshotWith([node]));
            prompt.should.contain('text = <redacted>');
            prompt.should.not.contain('Secret customer order');
        });

        it('should mask object values and the URL', function () {
            const node = controlNode({ properties: [{ name: 'data', value: { a: 1 }, type: 'object' }] });
            const prompt = builder.build(snapshotWith([node], { meta: { url: 'http://secret/app' } }));
            prompt.should.contain('data = <redacted>');
            prompt.should.not.contain('http://secret/app');
        });

        it('should note that values were masked', function () {
            const prompt = builder.build(snapshotWith([]));
            prompt.should.contain('masked for privacy');
        });
    });

    describe('#build() with real data', function () {
        it('should include free-form string values when includeRealData is set', function () {
            const node = controlNode({ properties: [{ name: 'text', value: 'Hello World sentence', type: 'string' }] });
            const prompt = builder.build(snapshotWith([node]), { includeRealData: true });
            prompt.should.contain('Hello World sentence');
        });

        it('should include the URL and a sensitivity warning', function () {
            const prompt = builder.build(snapshotWith([], { meta: { url: 'http://real/app' } }), { includeRealData: true });
            prompt.should.contain('http://real/app');
            prompt.should.contain('may contain sensitive data');
        });

        it('should append resolved binding values when real data is included', function () {
            const node = controlNode({
                bindings: { properties: { title: { path: '/n', model: 'app', mode: 'OneWay', value: 'Resolved' } }, aggregations: {} }
            });
            const prompt = builder.build(snapshotWith([node]), { includeRealData: true });
            prompt.should.contain('= Resolved');
        });

        it('should truncate long real values', function () {
            const longValue = new Array(200).join('x');
            const node = controlNode({ properties: [{ name: 'text', value: longValue, type: 'string' }] });
            const prompt = builder.build(snapshotWith([node]), { includeRealData: true, maxValueLength: 10 });
            prompt.should.contain('…');
        });
    });

    describe('#build() console errors & stats', function () {
        it('should render console errors newest-first with counts', function () {
            const snapshot = snapshotWith([], { consoleErrors: [
                { message: 'first', count: 1 },
                { message: 'second', count: 3 }
            ] });
            const prompt = builder.build(snapshot);

            prompt.should.contain('## Reported console errors');
            const firstIdx = prompt.indexOf('first');
            const secondIdx = prompt.indexOf('second');
            secondIdx.should.be.lessThan(firstIdx);
            prompt.should.contain('(×3)');
        });

        it('should omit the errors section when there are none', function () {
            const prompt = builder.build(snapshotWith([]));
            prompt.should.not.contain('## Reported console errors');
        });

        it('should note truncation in the notes section', function () {
            const snapshot = snapshotWith([controlNode()], { stats: { controlCount: 5, truncated: true } });
            const prompt = builder.build(snapshot);
            prompt.should.contain('truncated');
            prompt.should.contain('first 5 controls');
        });
    });

    describe('#build() issue-driven reduction', function () {
        it('should include an "Issue to reproduce" section when an issue is provided', function () {
            const prompt = builder.build(snapshotWith([]), { issue: 'Save button throws' });
            prompt.should.contain('## Issue to reproduce');
            prompt.should.contain('Save button throws');
        });

        it('should omit the issue section when the issue is blank or whitespace', function () {
            builder.build(snapshotWith([]), { issue: '   ' }).should.not.contain('## Issue to reproduce');
            builder.build(snapshotWith([])).should.not.contain('## Issue to reproduce');
        });

        it('should switch instruction 5 to aggressive reduction when an issue is provided', function () {
            const withIssue = builder.build(snapshotWith([]), { issue: 'binding error' });
            withIssue.should.contain('Reduce aggressively');

            const withoutIssue = builder.build(snapshotWith([]));
            withoutIssue.should.not.contain('Reduce aggressively');
        });
    });

    describe('#build() output budget', function () {
        it('should always include an output budget section referencing the line limit and file splitting', function () {
            const prompt = builder.build(snapshotWith([]));
            prompt.should.contain('## Output budget');
            prompt.should.contain('400 lines');
            prompt.should.contain('ONE file at a time');
        });

        it('should honor a custom maxOutputLines', function () {
            const prompt = builder.build(snapshotWith([]), { maxOutputLines: 250 });
            prompt.should.contain('250 lines');
        });
    });

    describe('#build() compaction', function () {
        it('should collapse repeated siblings beyond the child cap into a type histogram', function () {
            const children = [];
            for (let i = 0; i < 5; i++) {
                children.push(controlNode({ id: 'item' + i, type: 'sap.m.StandardListItem' }));
            }
            const list = controlNode({ id: 'list', type: 'sap.m.List', children: children });
            const prompt = builder.build(snapshotWith([list]), { maxChildrenPerNode: 2 });

            prompt.should.contain('+ 3 more (sap.m.StandardListItem × 3)');
        });

        it('should stop at maxDepth and note the omitted nested controls', function () {
            const inner = controlNode({ id: 'c3', type: 'C' });
            const middle = controlNode({ id: 'c2', type: 'B', children: [inner] });
            const root = controlNode({ id: 'c1', type: 'A', children: [middle] });
            const prompt = builder.build(snapshotWith([root]), { maxDepth: 1 });

            prompt.should.contain('nested controls omitted — depth limit');
        });

        it('should truncate the outline to the line budget', function () {
            const many = [];
            for (let i = 0; i < 60; i++) {
                many.push(controlNode({ id: 'c' + i, properties: [{ name: 'x', value: true, type: 'boolean' }] }));
            }
            const prompt = builder.build(snapshotWith(many), { maxTreeLines: 20, maxChildrenPerNode: 100 });

            prompt.should.contain('outline truncated to fit the editor line budget');
        });
    });

    describe('#build() aggregation & smart-control annotation', function () {
        it('should render the aggregation name in brackets after the control id', function () {
            const node = controlNode({ id: 'btn', type: 'sap.m.Button', aggregation: 'content' });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('- sap.m.Button #btn [content]');
        });

        it('should mark smart-generated controls', function () {
            const node = controlNode({ id: 'smart-inner', type: 'sap.m.Table', isSmartGenerated: true });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('(smart-generated)');
        });

        it('should omit aggregation brackets when aggregation is undefined', function () {
            const node = controlNode({ id: 'btn', type: 'sap.m.Button', aggregation: undefined });
            const prompt = builder.build(snapshotWith([node]));

            prompt.should.contain('- sap.m.Button #btn');
            prompt.should.not.contain('[undefined]');
        });
    });

    describe('#build() multi-frame snapshot', function () {
        function frameSnapshot(frames) {
            return {
                meta: { framework: 'OpenUI5', version: '1.120.0', theme: 'sap_horizon', locale: 'en', libraries: ['sap.m'] },
                consoleErrors: [],
                frames: frames,
                tree: frames[0] ? frames[0].tree : [],
                stats: { controlCount: 1, truncated: false }
            };
        }

        it('should render frame sub-headings when multiple frames are present', function () {
            const snapshot = frameSnapshot([
                { frameId: 0, url: 'https://app/', tree: [controlNode({ id: 'root', type: 'sap.m.Shell' })] },
                { frameId: 1, url: 'https://app/iframe', tree: [controlNode({ id: 'inner', type: 'sap.m.Page' })] }
            ]);
            const prompt = builder.build(snapshot);

            prompt.should.contain('### main frame');
            prompt.should.contain('### frame 1');
            prompt.should.contain('sap.m.Shell #root');
            prompt.should.contain('sap.m.Page #inner');
        });

        it('should include the frame URL in the sub-heading', function () {
            const snapshot = frameSnapshot([
                { frameId: 0, url: 'https://app/', tree: [] },
                { frameId: 1, url: 'https://app/nested', tree: [] }
            ]);
            const prompt = builder.build(snapshot);

            prompt.should.contain('https://app/nested');
        });

        it('should use single-frame path when only one frame is present', function () {
            const snapshot = frameSnapshot([
                { frameId: 0, url: 'https://app/', tree: [controlNode({ id: 'btn' })] }
            ]);
            const prompt = builder.build(snapshot);

            // No frame sub-headings for a single frame
            prompt.should.not.contain('### main frame');
            prompt.should.contain('## Control tree');
        });

        it('should fall back to snapshot.tree when no frames array is present', function () {
            const prompt = builder.build(snapshotWith([controlNode({ id: 'btn' })]));
            prompt.should.contain('sap.m.Button #btn');
        });
    });
});

