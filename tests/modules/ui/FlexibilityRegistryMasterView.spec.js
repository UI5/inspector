'use strict';

const FlexibilityRegistryMasterView = require('../../../app/scripts/modules/ui/FlexibilityRegistryMasterView.js');

describe('FlexibilityRegistryMasterView', function () {
    var fixtures = document.getElementById('fixtures');
    var view;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="flexibility-tab-master"></div>';

        view = new FlexibilityRegistryMasterView('flexibility-tab-master');
    });

    afterEach(function () {
        fixtures.innerHTML = '';
    });

    describe('Constructor', function () {
        it('should have a default no-op onSelectItem callback', function () {
            view.onSelectItem.should.be.a('function');
            (function () { view.onSelectItem({}); }).should.not.throw();
        });

        it('should have a default no-op onClearItems callback', function () {
            view.onClearItems.should.be.a('function');
            (function () { view.onClearItems(); }).should.not.throw();
        });

        it('should have a default no-op onDownloadItems callback', function () {
            view.onDownloadItems.should.be.a('function');
            (function () { view.onDownloadItems(); }).should.not.throw();
        });

        it('should overwrite the callbacks if provided in options', function () {
            var called = 0;
            var v = new FlexibilityRegistryMasterView('flexibility-tab-master', {
                onSelectItem: function () { called++; },
                onClearItems: function () { called++; },
                onDownloadItems: function () { called++; }
            });

            v.onSelectItem({});
            v.onClearItems();
            v.onDownloadItems();

            called.should.equal(3);
        });

        it('should render the download and clear buttons and the DataGrid', function () {
            view.oContainerDOM.querySelector('.largeicon-download').should.exist;
            view.oContainerDOM.querySelector('.largeicon-clear').should.exist;
            view.oDataGrid.element.should.exist;
        });
    });

    describe('setData', function () {
        it('should store the given data', function () {
            var data = [{ changeType: 'propertyChange' }];

            view.setData(data);

            view.getData().should.equal(data);
        });

        it('should insert a node for every registered change', function () {
            view.setData([{ changeType: 'propertyChange' }, { changeType: 'propertyBindingChange' }]);

            view.oDataGrid.rootNode().children.length.should.equal(2);
        });

        it('should not insert duplicate nodes when the same data is set again', function () {
            var data = [{ changeType: 'propertyChange' }];

            view.setData(data);
            view.setData(data);

            view.oDataGrid.rootNode().children.length.should.equal(1);
        });

        it('should handle undefined data without throwing', function () {
            (function () { view.setData(undefined); }).should.not.throw();

            view.oDataGrid.rootNode().children.length.should.equal(0);
        });

        it('should handle null data without throwing', function () {
            (function () { view.setData(null); }).should.not.throw();
        });

        it('should be chainable', function () {
            view.setData([{ changeType: 'propertyChange' }]).should.equal(view);
        });
    });

    describe('selectHandler', function () {
        it('should call onSelectItem with the selected node data', function () {
            var selected = null;
            var data = { changeType: 'propertyChange' };
            var v = new FlexibilityRegistryMasterView('flexibility-tab-master', {
                onSelectItem: function (oData) { selected = oData; }
            });

            v.selectHandler({ data: { data: data } });

            selected.should.equal(data);
        });

        it('should not throw when the event has no selected node', function () {
            (function () { view.selectHandler({ data: undefined }); }).should.not.throw();
        });
    });

    describe('Clear button', function () {
        it('should remove all grid nodes and call onClearItems', function () {
            var cleared = false;

            fixtures.innerHTML = '<div id="flexibility-tab-master"></div>';
            var v = new FlexibilityRegistryMasterView('flexibility-tab-master', {
                onClearItems: function () { cleared = true; }
            });

            v.setData([{ changeType: 'propertyChange' }, { changeType: 'propertyBindingChange' }]);
            v.oDataGrid.rootNode().children.length.should.equal(2);

            v.oContainerDOM.querySelector('.largeicon-clear').onclick();

            cleared.should.equal(true);
            v.oDataGrid.rootNode().children.length.should.equal(0);
        });
    });
});
