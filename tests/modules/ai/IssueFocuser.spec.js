'use strict';

const IssueFocuser = require('../../../app/scripts/modules/ai/IssueFocuser.js');

function makeStream(chunks) {
    return {
        [Symbol.asyncIterator]: async function* () {
            for (let i = 0; i < chunks.length; i++) {
                yield chunks[i];
            }
        }
    };
}

function createFakeClient(overrides) {
    return Object.assign({
        checkAvailability: function () { return Promise.resolve({ status: 'ready' }); },
        createSession: function () { return Promise.resolve(true); },
        promptStreaming: function () { return Promise.resolve(makeStream(['["btnSave"]'])); },
        destroy: function () {}
    }, overrides || {});
}

function sampleSnapshot() {
    return {
        meta: {},
        stats: { controlCount: 5, truncated: false },
        tree: [
            {
                id: 'app', type: 'sap.m.App', isControl: true, properties: [], bindings: { properties: {}, aggregations: {} },
                children: [
                    {
                        id: 'page', type: 'sap.m.Page', isControl: true, properties: [], bindings: { properties: {}, aggregations: {} },
                        children: [
                            { id: 'btnSave', type: 'sap.m.Button', isControl: true, properties: [{ name: 'text', value: 'Save', type: 'string' }], bindings: { properties: {}, aggregations: {} }, children: [] },
                            { id: 'btnCancel', type: 'sap.m.Button', isControl: true, properties: [{ name: 'text', value: 'Cancel', type: 'string' }], bindings: { properties: {}, aggregations: {} }, children: [] },
                            {
                                id: 'list', type: 'sap.m.List', isControl: true, properties: [], bindings: { properties: {}, aggregations: {} },
                                children: [
                                    { id: 'item0', type: 'sap.m.StandardListItem', isControl: true, properties: [], bindings: { properties: {}, aggregations: {} }, children: [] }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

function idsOf(tree) {
    const ids = [];
    (function visit(nodes) {
        nodes.forEach(function (node) {
            ids.push(node.id);
            visit(node.children || []);
        });
    }(tree));
    return ids;
}

describe('IssueFocuser', function () {

    describe('#isAvailable()', function () {
        it('should resolve true when the model is ready', function () {
            const focuser = new IssueFocuser({ promptClient: createFakeClient() });
            return focuser.isAvailable().then(function (available) {
                available.should.equal(true);
            });
        });

        it('should resolve false when the model is not ready', function () {
            const client = createFakeClient({ checkAvailability: function () { return Promise.resolve({ status: 'unavailable' }); } });
            return new IssueFocuser({ promptClient: client }).isAvailable().then(function (available) {
                available.should.equal(false);
            });
        });

        it('should resolve false when availability rejects', function () {
            const client = createFakeClient({ checkAvailability: function () { return Promise.reject(new Error('x')); } });
            return new IssueFocuser({ promptClient: client }).isAvailable().then(function (available) {
                available.should.equal(false);
            });
        });
    });

    describe('#focus() short-circuits', function () {
        it('should not call the model when the issue is blank', function () {
            const client = createFakeClient({ createSession: sinon.stub().returns(Promise.resolve(true)) });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), '  ').then(function (result) {
                result.usedAI.should.equal(false);
                result.reason.should.equal('no-issue');
                client.createSession.called.should.equal(false);
            });
        });

        it('should return no-candidates for an empty tree', function () {
            return new IssueFocuser({ promptClient: createFakeClient() }).focus({ tree: [] }, 'bug').then(function (result) {
                result.usedAI.should.equal(false);
                result.reason.should.equal('no-candidates');
            });
        });

        it('should decline when there are more candidates than maxCandidates', function () {
            return new IssueFocuser({ promptClient: createFakeClient() })
                .focus(sampleSnapshot(), 'bug', { maxCandidates: 2 })
                .then(function (result) {
                    result.usedAI.should.equal(false);
                    result.reason.should.equal('too-large');
                });
        });
    });

    describe('#focus() pruning', function () {
        it('should prune to the selected control plus its ancestors', function () {
            return new IssueFocuser({ promptClient: createFakeClient() }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(true);
                result.focusedIds.should.deep.equal(['btnSave']);
                const ids = idsOf(result.tree);
                ids.should.contain('app');
                ids.should.contain('page');
                ids.should.contain('btnSave');
                ids.should.not.contain('btnCancel');
                ids.should.not.contain('list');
            });
        });

        it('should keep descendants of a selected container', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['["list"]'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'list issue').then(function (result) {
                const ids = idsOf(result.tree);
                ids.should.contain('list');
                ids.should.contain('item0');
                ids.should.not.contain('btnSave');
            });
        });
    });

    describe('#focus() parsing & validation', function () {
        it('should extract the id array even when wrapped in prose', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['Sure! ["btnSave"] are relevant.'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(true);
                result.focusedIds.should.deep.equal(['btnSave']);
            });
        });

        it('should drop hallucinated ids not present in the candidates', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['["btnSave","ghost"]'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.focusedIds.should.deep.equal(['btnSave']);
            });
        });

        it('should fall back when the model selects nothing valid', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['["ghost"]'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(false);
                result.reason.should.equal('empty-selection');
            });
        });

        it('should fall back when the reply has no JSON array', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['no array here'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(false);
                result.reason.should.equal('empty-selection');
            });
        });

        it('should fall back when the JSON is malformed', function () {
            const client = createFakeClient({ promptStreaming: function () { return Promise.resolve(makeStream(['[not json]'])); } });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(false);
            });
        });
    });

    describe('#focus() resilience', function () {
        it('should fall back and destroy the session on a model error', function () {
            const destroy = sinon.spy();
            const client = createFakeClient({
                promptStreaming: function () { return Promise.reject(new Error('boom')); },
                destroy: destroy
            });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function (result) {
                result.usedAI.should.equal(false);
                result.reason.should.equal('model-error');
                destroy.called.should.equal(true);
            });
        });

        it('should destroy the session after a successful focus', function () {
            const destroy = sinon.spy();
            const client = createFakeClient({ destroy: destroy });
            return new IssueFocuser({ promptClient: client }).focus(sampleSnapshot(), 'Save fails').then(function () {
                destroy.called.should.equal(true);
            });
        });
    });
});
