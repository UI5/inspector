'use strict';

const ReproductionHtmlFixer = require('../../../app/scripts/modules/ai/ReproductionHtmlFixer.js');

describe('ReproductionHtmlFixer', function () {
    let fixer;

    beforeEach(function () {
        fixer = new ReproductionHtmlFixer();
    });

    afterEach(function () {
        fixer = null;
    });

    describe('#deriveAdjustments()', function () {
        it('should exclude the control type behind a failed module load', function () {
            const errors = ['[ERROR] failed to load "sap/ui/comp/smartfield/SmartField.js" from https://ui5.sap.com/...: 404'];
            const adj = fixer.deriveAdjustments(errors);
            adj.excludeTypes.should.contain('sap.ui.comp.smartfield.SmartField');
            adj.excludeLibraries.should.have.length(0);
        });

        it('should exclude the library behind a failed library.js load', function () {
            const errors = ['[ERROR] failed to load "sap/ui/comp/library.js"'];
            const adj = fixer.deriveAdjustments(errors);
            adj.excludeLibraries.should.contain('sap.ui.comp');
            adj.excludeTypes.should.have.length(0);
        });

        it('should exclude a library named explicitly in the error', function () {
            const errors = ['[ERROR] failed to load library "sap.ui.comp"'];
            const adj = fixer.deriveAdjustments(errors);
            adj.excludeLibraries.should.contain('sap.ui.comp');
        });

        it('should exclude a class reported as non-existent', function () {
            const errors = ['[ERROR] Error: Class sap.m.Foo does not exist'];
            const adj = fixer.deriveAdjustments(errors);
            adj.excludeTypes.should.contain('sap.m.Foo');
        });

        it('should exclude a class that could not be instantiated', function () {
            const errors = ['[ERROR] Cannot instantiate object: class sap.ui.table.Table is abstract'];
            const adj = fixer.deriveAdjustments(errors);
            adj.excludeTypes.should.contain('sap.ui.table.Table');
        });

        it('should accumulate onto the previous adjustments', function () {
            const prev = { excludeTypes: ['sap.m.A'], excludeLibraries: [] };
            const adj = fixer.deriveAdjustments(['failed to load "sap/m/B.js"'], prev);
            adj.excludeTypes.should.contain('sap.m.A');
            adj.excludeTypes.should.contain('sap.m.B');
        });

        it('should return the previous reference unchanged when no new signature is recognized', function () {
            const prev = { excludeTypes: ['sap.m.A'], excludeLibraries: [] };
            const adj = fixer.deriveAdjustments(['some opaque runtime error'], prev);
            adj.should.equal(prev); // identity — the fix loop uses this to stop iterating
        });

        it('should return the previous reference when the same error repeats', function () {
            const first = fixer.deriveAdjustments(['failed to load "sap/m/B.js"']);
            const second = fixer.deriveAdjustments(['failed to load "sap/m/B.js"'], first);
            second.should.equal(first);
        });

        it('should be safe with empty / missing input', function () {
            const adj = fixer.deriveAdjustments();
            adj.excludeTypes.should.have.length(0);
            adj.excludeLibraries.should.have.length(0);
        });
    });
});
