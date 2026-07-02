'use strict';

const OElementsRegistryMasterView = require('../../../app/scripts/modules/ui/OElementsRegistryMasterView.js');

describe('OElementsRegistryMasterView', function () {
    var fixtures = document.getElementById('fixtures');
    var view;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="elements-registry-tab-master"></div>';

        // Minimal stubs for required options
        view = new OElementsRegistryMasterView('elements-registry-tab-master', {
            XMLDetailView: { update: function () {} },
            ControllerDetailView: { update: function () {} }
        });
    });

    afterEach(function () {
        fixtures.innerHTML = '';
    });

    describe('Constructor', function () {
        it('should have a default no-op onHoverChanged callback', function () {
            view.onHoverChanged.should.be.a('function');
            (function () { view.onHoverChanged('someId'); }).should.not.throw();
        });

        it('should have a default no-op onHoverHide callback', function () {
            view.onHoverHide.should.be.a('function');
            (function () { view.onHoverHide(); }).should.not.throw();
        });

        it('should overwrite onHoverChanged if provided in options', function () {
            var called = false;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverChanged: function () { called = true; }
            });
            v.onHoverChanged('id');
            called.should.equal(true);
        });

        it('should overwrite onHoverHide if provided in options', function () {
            var called = false;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverHide: function () { called = true; }
            });
            v.onHoverHide();
            called.should.equal(true);
        });
    });

    describe('_onDataGridMouseOver', function () {
        it('should call onHoverChanged with the element id when hovering a data row', function () {
            var hoveredId = null;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverChanged: function (id) { hoveredId = id; }
            });

            // Simulate a <tr> with a _dataGridNode attached (as DataGrid does)
            var fakeRow = document.createElement('tr');
            fakeRow._dataGridNode = { _data: { id: '__button0' } };

            var fakeEvent = { target: fakeRow };
            v._onDataGridMouseOver(fakeEvent);

            hoveredId.should.equal('__button0');
        });

        it('should not throw when the target has no _dataGridNode', function () {
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} }
            });

            var fakeEvent = { target: document.createElement('td') };
            (function () { v._onDataGridMouseOver(fakeEvent); }).should.not.throw();
        });

        it('should call onHoverChanged when the event target is a child of the row', function () {
            var hoveredId = null;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverChanged: function (id) { hoveredId = id; }
            });

            // Simulate a <td> inside a <tr> — the walk-up path
            var fakeRow = document.createElement('tr');
            fakeRow._dataGridNode = { _data: { id: '__button2' } };
            var fakeCell = document.createElement('td');
            fakeRow.appendChild(fakeCell);

            var fakeEvent = { target: fakeCell };
            v._onDataGridMouseOver(fakeEvent);

            hoveredId.should.equal('__button2');
        });

        it('should not call onHoverChanged when _data.id is empty', function () {
            var called = false;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverChanged: function () { called = true; }
            });

            var fakeRow = document.createElement('tr');
            fakeRow._dataGridNode = { _data: { id: '' } };

            var fakeEvent = { target: fakeRow };
            v._onDataGridMouseOver(fakeEvent);

            called.should.equal(false);
        });
    });

    describe('_onDataGridMouseLeave', function () {
        it('should call onHoverHide', function () {
            var hideCalled = false;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverHide: function () { hideCalled = true; }
            });

            v._onDataGridMouseLeave();

            hideCalled.should.equal(true);
        });
    });

    describe('_createHandlers (hover wiring)', function () {
        it('should wire mouseover on the DataGrid element to _onDataGridMouseOver', function () {
            var hoveredId = null;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverChanged: function (id) { hoveredId = id; }
            });

            var fakeRow = document.createElement('tr');
            fakeRow._dataGridNode = { _data: { id: '__button1' } };
            v.oDataGrid.element.appendChild(fakeRow);

            var event = new MouseEvent('mouseover', { bubbles: true });
            fakeRow.dispatchEvent(event);

            hoveredId.should.equal('__button1');
        });

        it('should wire mouseleave on the DataGrid element to _onDataGridMouseLeave', function () {
            var hideCalled = false;
            var v = new OElementsRegistryMasterView('elements-registry-tab-master', {
                XMLDetailView: { update: function () {} },
                ControllerDetailView: { update: function () {} },
                onHoverHide: function () { hideCalled = true; }
            });

            var event = new MouseEvent('mouseleave', { bubbles: false });
            v.oDataGrid.element.dispatchEvent(event);

            hideCalled.should.equal(true);
        });
    });
});
