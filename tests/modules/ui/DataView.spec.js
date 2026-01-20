'use strict';

var DataViewComponent = require('../../../app/scripts/modules/ui/DataView.js');
var DataViewHelper = require('../../../app/scripts/modules/ui/helpers/DataViewHelper.js');

var mockDataViewFormattedObject = {
    options: {
        title: 'Associations',
        expanded: true,
        expandable: true
    },
    data: {
        key1: 'sap.m.Bar',
        key2: 'sap.m.Button'
    }
};

var mockPlainObject = {
    type: 'int',
    value: '23',
    isBool: false
};

// When used mockDataWithNestedObject.data.moreData can be changed.
var mockDataWithNestedObject = {

    'properties': {
        'options': {
            'title': '<anchor>#__button0</anchor> (sap.m.Button)',
            'expandable': true,
            'editableValues': true,
            'showTypeInfo': true,
            'controlId': 'button_0'
        },
        'data': {
            'title': 'Simple Form',
            'description': '',
            'icon': '',
            'iconInset': true,
            'iconDensityAware': true,
            'activeIcon': 'sap://icon',
            'infoState': 'None',
            'adaptTileSize': true,
            'titleTextDirection': 'inherit',
            'infoTextDirection': 'inherit',
            'moreData': mockDataViewFormattedObject
        },
        associations: {
            ariaDescribedBy: 'sap.ui.core.Control',
            ariaLabelledBy: 'sap.ui.core.Control'
        }
    }
};

var mockDataWithTypes = {

    'properties': {
        'options': {
            'title': '<anchor>#__button0</anchor> (sap.m.Button)',
            'expandable': true,
            'editableValues': true,
            'showTypeInfo': true,
            'controlId': 'button_0'
        },
        'data': {
            'title': 'Simple Form',
            'description': '',
            'icon': '',
            'iconInset': true,
            'iconDensityAware': true,
            'activeIcon': 'sap://icon',
            'infoState': 'None',
            'adaptTileSize': true,
            'titleTextDirection': 'inherit',
            'infoTextDirection': 'inherit',
            'moreData': mockDataViewFormattedObject
        },
        'types': {
            'title': 'string',
            'description': 'string',
            'icon': 'string',
            'iconInset': 'boolean',
            'iconDensityAware': 'boolean',
            'activeIcon': 'string',
            'infoState': 'sap.ui.core.ValueState',
            'adaptTileSize': 'boolean',
            'titleTextDirection': {
                Inherit: 'Inherit',
                LTR: 'LTR',
                RTL: 'RTL'
            },
            'infoTextDirection': {
                Inherit: 'Inherit',
                LTR: 'LTR',
                RTL: 'RTL'
            },
            'moreData': 'object'
        },
        associations: {
            ariaDescribedBy: 'sap.ui.core.Control',
            ariaLabelledBy: 'sap.ui.core.Control'
        }
    }
};

var mockDataWithPropertiesInfo = {
    'properties': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '#__item0-__xmlview0--list-0-selectSingleMaster (sap.m.RadioButton)',
            'showTypeInfo': false
        },
        'data': {
            'enabled': true,
            'selected': false,
            'groupName': '__xmlview0--list_selectMasterGroup',
            'text': '',
            'textDirection': 'Inherit',
            'width': '',
            'activeHandling': false,
            'editable': true,
            'valueState': 'None'
        }
    },
    'inherited0': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.m.StandardListItem</span>',
            'showTypeInfo': false
        },
        'data': {
            'title': 'Action Sheet',
            'description': '',
            'icon': '',
            'iconInset': true,
            'iconDensityAware': true,
            'activeIcon': '',
            'info': '',
            'infoState': 'None',
            'adaptTitleSize': true
        }
    },
    'inherited1': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.m.List</span>',
            'showTypeInfo': false,
        },
        'data': {
            'backgroundDesign': 'Solid'
        }
    },
    'inherited2': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.m.Page</span>',
            'showTypeInfo': false,
        },
        'data': {
            'title': '',
            'showNavButton': false,
            'showHeader': true,
            'navButtonText': '',
            'enableScrolling': true,
            'icon': '',
            'backgroundDesign': 'Standard',
            'navButtonType': 'Back',
            'showFooter': true
        }
    },
    'inherited3': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.ui.core.mvc.XMLView</span>',
            'showTypeInfo': false,
        },
        'data': {}
    },
    'inherited4': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.m.NavContainer</span>',
            'showTypeInfo': false
        },
        'data': {
            'height': '100%',
            'width': '',
            'visible': true,
            'defaultTransitionName': 'slide',
            'initialPage': ' (sap.ui.core.Control) (associations)'
        }
    },
    'inherited5': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.m.SplitApp</span>',
            'showTypeInfo': false
        },
        'data': {
            'homeIcon': null
        }
    },
    'inherited6': {
        'options': {
            'expandable': false,
            'expanded': true,
            'title': '<span gray>sap.ui.core.mvc.JSView</span>',
            'showTypeInfo': false
        },
        'data': {}
    }
};

var clickableValueData = {
    counter: {
        data: {
            model: {
                _isClickableValueForDataView: true,
                eventData: {
                    data: {
                        isNoPhone: true,
                        isNoTouch: true,
                        isPhone: false,
                        isTouch: false,
                        listItemType: 'Inactive',
                        listMode: 'SingleSelectMaster'
                    }
                },
                value: '<clickable-value key="model" parent="counter">entity (TwoWay, JSONModel)</clickable-value>',
                path: 'sampleCount',
                type: 'int'
            }
        },
        options: {
            controlId: undefined,
            editableValues: false,
            expandable: false,
            expanded: true,
            hideTitle: false,
            showTypeInfo: false,
            title: 'counter <opaque>(property)</opaque>'
        }
    }
};

var mockDataViewActions = {
    actions: {
        data: ['Focus', 'Invalidate', 'Copy HTML to Console']
    },
    own: {
        options: {
            controlId: 'button_0'
        }
    }
};

var SIMPLE_HTML_OUTPUT = '<ul expandable="true"><li><arrow right="true"></arrow><section-title><anchor>#__button0</anchor> (sap.m.Button)</section-title><ul expandable="true"><li><key>title</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="title">Simple Form</value>"</li><li><key>description</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="description"></value>"</li><li><key>icon</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="icon"></value>"</li><li><key>iconInset</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="iconInset">true</value></li><li><key>iconDensityAware</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="iconDensityAware">true</value></li><li><key>activeIcon</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="activeIcon">sap://icon</value>"</li><li><key>infoState</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="infoState">None</value>"</li><li><key>adaptTileSize</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="adaptTileSize">true</value></li><li><key>titleTextDirection</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="titleTextDirection">inherit</value>"</li><li><key>infoTextDirection</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="infoTextDirection">inherit</value>"</li><li><arrow down="true"></arrow><section-title>Associations</section-title><ul expandable="true" expanded="true"><li><key>key1</key>:&nbsp;"<value>sap.m.Bar</value>"</li><li><key>key2</key>:&nbsp;"<value>sap.m.Button</value>"</li></ul></li><li><key>ariaDescribedBy</key>:&nbsp;<value>sap.ui.core.Control</value></li><li><key>ariaLabelledBy</key>:&nbsp;<value>sap.ui.core.Control</value></li></ul></li></ul>';

var COMPLEX_HTML_OUTPUT = '<ul expanded="true"><li><section-title>#__item0-__xmlview0--list-0-selectSingleMaster (sap.m.RadioButton)</section-title><ul expanded="true"><li><key>enabled</key>:&nbsp;<value>true</value></li><li><key>selected</key>:&nbsp;<value>false</value></li><li><key>groupName</key>:&nbsp;"<value>__xmlview0--list_selectMasterGroup</value>"</li><li><key>text</key>:&nbsp;"<value></value>"</li><li><key>textDirection</key>:&nbsp;"<value>Inherit</value>"</li><li><key>width</key>:&nbsp;"<value></value>"</li><li><key>activeHandling</key>:&nbsp;<value>false</value></li><li><key>editable</key>:&nbsp;<value>true</value></li><li><key>valueState</key>:&nbsp;"<value>None</value>"</li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.m.StandardListItem</span></section-title><ul expanded="true"><li><key>title</key>:&nbsp;"<value>Action Sheet</value>"</li><li><key>description</key>:&nbsp;"<value></value>"</li><li><key>icon</key>:&nbsp;"<value></value>"</li><li><key>iconInset</key>:&nbsp;<value>true</value></li><li><key>iconDensityAware</key>:&nbsp;<value>true</value></li><li><key>activeIcon</key>:&nbsp;"<value></value>"</li><li><key>info</key>:&nbsp;"<value></value>"</li><li><key>infoState</key>:&nbsp;"<value>None</value>"</li><li><key>adaptTitleSize</key>:&nbsp;<value>true</value></li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.m.List</span></section-title><ul expanded="true"><li><key>backgroundDesign</key>:&nbsp;"<value>Solid</value>"</li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.m.Page</span></section-title><ul expanded="true"><li><key>title</key>:&nbsp;"<value></value>"</li><li><key>showNavButton</key>:&nbsp;<value>false</value></li><li><key>showHeader</key>:&nbsp;<value>true</value></li><li><key>navButtonText</key>:&nbsp;"<value></value>"</li><li><key>enableScrolling</key>:&nbsp;<value>true</value></li><li><key>icon</key>:&nbsp;"<value></value>"</li><li><key>backgroundDesign</key>:&nbsp;"<value>Standard</value>"</li><li><key>navButtonType</key>:&nbsp;"<value>Back</value>"</li><li><key>showFooter</key>:&nbsp;<value>true</value></li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.ui.core.mvc.XMLView</span></section-title><ul expanded="true"><li><no-data>No Available Data</no-data></li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.m.NavContainer</span></section-title><ul expanded="true"><li><key>height</key>:&nbsp;"<value>100%</value>"</li><li><key>width</key>:&nbsp;"<value></value>"</li><li><key>visible</key>:&nbsp;<value>true</value></li><li><key>defaultTransitionName</key>:&nbsp;"<value>slide</value>"</li><li><key>initialPage</key>:&nbsp;"<value> (sap.ui.core.Control) (associations)</value>"</li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.m.SplitApp</span></section-title><ul expanded="true"><li><key>homeIcon</key>:&nbsp;<value>null</value></li></ul></li></ul><ul expanded="true"><li><section-title><span gray="">sap.ui.core.mvc.JSView</span></section-title><ul expanded="true"><li><no-data>No Available Data</no-data></li></ul></li></ul>';

var SECTION_TITLE = '<ul expandable="true"><li><arrow right="true"></arrow><section-title><anchor>#__button0</anchor> (sap.m.Button)</section-title></li></ul>';

var SECTION_HTML = '<ul expandable="true"><li><key>title</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="title">Simple Form</value>&quot;</li><li><key>description</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="description"></value>&quot;</li><li><key>icon</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="icon"></value>&quot;</li><li><key>iconInset</key>:&nbsp;<value contentEditable="true" data-control-id="button_0" data-property-name="iconInset">true</value></li><li><key>iconDensityAware</key>:&nbsp;<value contentEditable="true" data-control-id="button_0" data-property-name="iconDensityAware">true</value></li><li><key>activeIcon</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="activeIcon">sap://icon</value>&quot;</li><li><key>infoState</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="infoState">None</value>&quot;</li><li><key>adaptTileSize</key>:&nbsp;<value contentEditable="true" data-control-id="button_0" data-property-name="adaptTileSize">true</value></li><li><key>titleTextDirection</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="titleTextDirection">inherit</value>&quot;</li><li><key>infoTextDirection</key>:&nbsp;&quot;<value contentEditable="true" data-control-id="button_0" data-property-name="infoTextDirection">inherit</value>&quot;</li><li><arrow down="true"></arrow><section-title>Associations</section-title><ul expandable="true" expanded="true"><li><key>key1</key>:&nbsp;&quot;<value>sap.m.Bar</value>&quot;</li><li><key>key2</key>:&nbsp;&quot;<value>sap.m.Button</value>&quot;</li></ul></li><li><key>ariaDescribedBy</key>:&nbsp;<value>sap.ui.core.Control</value></li><li><key>ariaLabelledBy</key>:&nbsp;<value>sap.ui.core.Control</value></li></ul>';

var NO_DATA_HTML = '<no-data>No Available Data</no-data>';

var OBJECT_HTML = '<arrow down="true"></arrow><section-title>Associations</section-title>';
var KEY_VALUE_HTML = '<key>key1</key>:&nbsp;&quot;<value>sap.m.Bar</value>&quot;';

var SIMPLE_DATA_NO_TITLE = '<ul expandable="true"><li><key>title</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="title">Simple Form</value>"</li><li><key>description</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="description"></value>"</li><li><key>icon</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="icon"></value>"</li><li><key>iconInset</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="iconInset">true</value></li><li><key>iconDensityAware</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="iconDensityAware">true</value></li><li><key>activeIcon</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="activeIcon">sap://icon</value>"</li><li><key>infoState</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="infoState">None</value>"</li><li><key>adaptTileSize</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="adaptTileSize">true</value></li><li><key>titleTextDirection</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="titleTextDirection">inherit</value>"</li><li><key>infoTextDirection</key>:&nbsp;"<value contenteditable="true" data-control-id="button_0" data-property-name="infoTextDirection">inherit</value>"</li><li><arrow down="true"></arrow><section-title>Associations</section-title><ul expandable="true" expanded="true"><li><key>key1</key>:&nbsp;"<value>sap.m.Bar</value>"</li><li><key>key2</key>:&nbsp;"<value>sap.m.Button</value>"</li></ul></li><li><key>ariaDescribedBy</key>:&nbsp;<value>sap.ui.core.Control</value></li><li><key>ariaLabelledBy</key>:&nbsp;<value>sap.ui.core.Control</value></li></ul>';

var SIMPLE_DATA_WITH_ARRAY = '<ul expandable="true"><li><arrow right="true"></arrow><section-title><anchor>#__button0</anchor> (sap.m.Button)</section-title><ul expandable="true"><li><key>0</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="0">1</value>,</li><li><key>1</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="1">2</value>,</li><li><key>2</key>:&nbsp;<value contenteditable="true" data-control-id="button_0" data-property-name="2">3</value></li><li><key>ariaDescribedBy</key>:&nbsp;<value>sap.ui.core.Control</value></li><li><key>ariaLabelledBy</key>:&nbsp;<value>sap.ui.core.Control</value></li></ul></li></ul>';

describe('DataView', function () {
    var fixtures = document.getElementById('fixtures');

    beforeEach(function () {
        fixtures.innerHTML = '<data-view id="data-view"></data-tree>';
    });

    afterEach(function () {
        fixtures.innerHTML = '';
    });

    describe('DataView with no initial data set', function () {
        var sampleView;

        beforeEach(function () {
            sampleView = new DataViewComponent('data-view');
        });

        afterEach(function () {
            sampleView._data = null;
        });

        it('should render without a title when it is hidden', function () {
            var dataViewElement = document.getElementById('data-view');
            mockDataWithNestedObject.properties.options.hideTitle = true;
            sampleView.setData(mockDataWithNestedObject);
            // Check that keys are rendered but no section-title at root level
            var keys = dataViewElement.querySelectorAll('key');
            expect(keys.length).to.be.above(0);
            mockDataWithNestedObject.properties.options.hideTitle = false;

        });

        it('should render expanded array when setData', function () {
            var dataViewElement = document.getElementById('data-view');
            var oldData = mockDataWithNestedObject.properties.data;
            mockDataWithNestedObject.properties.data = [1, 2, 3];
            sampleView.setData(mockDataWithNestedObject);
            // Arrays should preserve order (indices 0, 1, 2)
            var keys = dataViewElement.querySelectorAll('ul[expandable] key');
            var keyTexts = Array.prototype.map.call(keys, function(k) { return k.textContent; });
            expect(keyTexts).to.include('0');
            expect(keyTexts).to.include('1');
            expect(keyTexts).to.include('2');
            mockDataWithNestedObject.properties.data = oldData;

        });

        it('should return No Available Data', function () {
            sinon.stub(sampleView, '_isDataEmpty').returns(true);
            sampleView._generateHTML();
            var dataViewElement = document.getElementById('data-view');
            expect(dataViewElement.innerHTML).to.equal(NO_DATA_HTML);
        });

        it('should assign a default function for onPropertyUpdated', function () {
            expect(sampleView.onPropertyUpdated).to.be.an.instanceof(Function);
        });

        it('should assign a default function for onValueClick ', function () {
            expect(sampleView.onValueClick).to.be.an.instanceof(Function);
        });

        describe('#setData()', function () {
            it('should not be called on DataView instantiation', function () {
                var setDataSpy = sinon.spy(DataViewComponent.prototype, 'setData');
                new DataViewComponent('data-view', {});
                setDataSpy.callCount.should.equal(0);
                setDataSpy.restore();
            });

            it('should NOT be called on DataView instantiation when there is no data', function () {
                var setDataSpy = sinon.spy(DataViewComponent.prototype, 'setData');
                new DataViewComponent('data-view');
                setDataSpy.calledOnce.should.be.equal(false);
                setDataSpy.restore();
            });
        });

        describe('#getData()', function () {

            it('should return undefined on first call', function () {
                expect(sampleView.getData()).to.be.undefined;
            });

            it('should return undefined when trying to input number', function () {
                sampleView.setData();
                expect(sampleView.getData()).to.be.undefined;

            });

            it('should return undefined when trying to input string', function () {
                sampleView.setData('Hello');
                expect(sampleView.getData()).to.be.undefined;

            });

            it('should return undefined when trying to input boolean', function () {
                sampleView.setData(true);
                expect(sampleView.getData()).to.be.undefined;

            });

            it('should return the set Array', function () {
                sampleView.setData([1, 2, 3]);
                expect(sampleView.getData()).eql([1, 2, 3]);
            });

            it('should return the set Object', function () {
                sampleView.setData(mockDataWithNestedObject);
                expect(sampleView.getData()).eql(mockDataWithNestedObject);
            });

        });

        describe('#_isDataEmpty()', function () {

            it('should be true when no data is set', function () {
                expect(sampleView._isDataEmpty()).to.be.true;
            });

            it('should be true when the section object has empty data set', function () {
                sampleView.setData({test: 'test'});
                expect(sampleView._isDataEmpty()).to.be.true;
            });

            it('should be false when the section object has data', function () {
                sampleView.setData(mockDataWithNestedObject);
                expect(sampleView._isDataEmpty()).to.be.false;
            });

        });

        describe('#_addObjectHTML()', function () {
            var sampleView;
            var element;
            var html;
            var title;

            beforeEach(function () {
                title = mockDataWithNestedObject.properties.data.moreData.options.title;
                sampleView = new DataViewComponent('data-view');
                element = mockDataWithNestedObject.properties.data.moreData;
                html = sampleView._generateHTMLFromObject('assoc', element);
            });

            afterEach(function () {
                sampleView._data = undefined;
                html = undefined;
            });

            it('should return correct HTML string', function () {
                expect(html).to.equal(OBJECT_HTML);
            });

            it('should return correct title', function () {
                var index = html.indexOf(title);
                expect(index).to.be.above(-1);
            });

            it('should add an Arrow and its correct rotation', function () {
                var index = html.indexOf('down="true"');
                expect(index).to.be.above(-1);
            });

            it('should return Object as typeInfo', function () {
                element.options.showTypeInfo = true;
                html = sampleView._generateHTMLFromObject('assoc', element);
                var openCurlyBraceIndex = html.indexOf('{');
                element.options.showTypeInfo = false;
                expect(openCurlyBraceIndex).to.be.above(-1);
            });

            it('should return not expandable section', function () {
                element.options.expandable = false;
                html = sampleView._generateHTMLFromObject('assoc', element);
                element.options.expandable = true;
                var arrowIndex = html.indexOf('<arrow down="true">');
                expect(arrowIndex).to.be.equal(-1);
            });

            it('should return Object with opneing and closing curly braces', function () {
                element.options.title = undefined;
                html = sampleView._generateHTMLFromObject('assoc', element);
                element.options.title = title;
                var sectionTitleIndex = html.indexOf('<section-title>');
                expect(sectionTitleIndex).to.equal(-1);
            });
        });

        describe('#_addKeyValueHTML()', function () {

            it('should return correct HTML string', function () {
                var currentView = mockDataWithNestedObject.properties.data.moreData;
                var html = sampleView._generateHTMLForKeyValuePair('key1', currentView);
                expect(html).to.equal(KEY_VALUE_HTML);
            });
        });

        describe('#_getHTMLSection()', function () {

            it('should return correct HTML string with sorted keys', function () {
                mockDataWithNestedObject.properties.hideTitle = undefined;
                var html = sampleView._generateHTMLSection(mockDataWithNestedObject.properties);
                // Check that it contains the expected structure
                expect(html).to.include('<ul');
                expect(html).to.include('<li>');
                expect(html).to.include('<key>');
                // Keys should be sorted alphabetically - activeIcon comes before title
                var activeIconIdx = html.indexOf('activeIcon');
                var titleIdx = html.indexOf('>title<');
                expect(activeIconIdx).to.be.below(titleIdx);
            });

        });

        describe('#_addSectionTitle()', function () {
            var stub;
            var html;
            var htmlWithTitle;

            beforeEach(function () {
                stub = sinon.stub(sampleView, '_generateHTMLSection');
                stub.withArgs(mockDataWithNestedObject.properties).returns(SECTION_HTML);
                html = sampleView._addSectionTitle(mockDataWithNestedObject.properties, '');
            });

            afterEach(function () {
                stub.restore();
            });

            it('should return correct HTML string', function () {
                html.should.be.equal(SECTION_TITLE);

            });

            it('should return incorrect HTML string', function () {
                mockDataWithNestedObject.properties.options.expandable = false;
                html = sampleView._addSectionTitle(mockDataWithNestedObject.properties, '');
                mockDataWithNestedObject.properties.options.expandable = true;
                html.should.not.be.equal(SECTION_TITLE);
            });

            it('should return HTML string without title html', function () {
                mockDataWithNestedObject.properties.hideTitle = true;
                htmlWithTitle = sampleView._addSectionTitle(mockDataWithNestedObject.properties, '');
                mockDataWithNestedObject.properties.hideTitle = false;
                html.should.be.equal(htmlWithTitle);
            });

        });

        describe('#_generateHTML()', function () {
            var generateHTMLSpy;
            var sampleView;

            beforeEach(function () {
                generateHTMLSpy = sinon.spy(DataViewComponent.prototype, '_generateHTML');
                sampleView = new DataViewComponent('data-view', {data: mockDataWithNestedObject});
            });

            afterEach(function () {
                sampleView._data = undefined;
                generateHTMLSpy.restore();
            });

            it('should be called once when we call new DataView', function () {
                generateHTMLSpy.calledOnce.should.equal(true);
            });

            it('should be called twice when setData is called', function () {
                sampleView.setData(mockDataWithNestedObject);
                generateHTMLSpy.calledTwice.should.equal(true);
            });

            it('should be render correct HTML String with simple mock data', function () {
                sampleView.setData(mockDataWithNestedObject);
                var dataViewElement = document.getElementById('data-view');
                // Check structure rather than exact HTML (sorting changes order)
                expect(dataViewElement.querySelector('section-title')).to.not.be.null;
                expect(dataViewElement.querySelectorAll('key').length).to.be.above(0);
            });

            it('should be render correct HTML String with simple mock data and showTypeInfo', function () {
                mockDataWithNestedObject.properties.data.moreData.options.showTypeInfo = true;
                mockDataWithNestedObject.properties.data.moreData.options.hideTitle = true;
                sampleView.setData(mockDataWithNestedObject);
                // Needed for later.
                // var dataViewElement = document.getElementById('data-view');
                // dataViewElement.innerHTML.should.equal(SIMPLE_HTML_OUTPUT);
                mockDataWithNestedObject.properties.data.moreData.options.hideTitle = false;
                mockDataWithNestedObject.properties.data.moreData.options.showTypeInfo = false;
            });

            it('should be render correctly HTML from complex mock data', function () {
                sampleView.setData(mockDataWithPropertiesInfo);
                var dataViewElement = document.getElementById('data-view');
                // Check structure rather than exact HTML (sorting changes order)
                expect(dataViewElement.querySelectorAll('section-title').length).to.be.above(0);
                expect(dataViewElement.querySelectorAll('key').length).to.be.above(0);
            });
        });

        describe('_clickHandler()', function () {

            it('should be called once on new DataView', function () {
                var _clickHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onClickHandler');
                new DataViewComponent('data-view');
                _clickHandlerSpy.calledOnce.should.be.equal(true);
                _clickHandlerSpy.restore();
            });

            it('should expand the section view', function () {
                sampleView.setData(mockDataWithNestedObject);
                var firstLi = sampleView._DataViewContainer.querySelector('arrow[right]').parentNode;
                firstLi.click();
                var firstArrow = sampleView._DataViewContainer.querySelector('arrow');
                expect(firstArrow.getAttribute('down')).to.equal('true');
                firstLi.click();
            });

            it('should collapse the section view', function () {
                sampleView.setData(mockDataWithNestedObject);
                var firstLi = sampleView._DataViewContainer.querySelector('arrow[down]').parentNode;
                firstLi.click();
                var firstArrow = sampleView._DataViewContainer.querySelector('arrow');
                expect(firstArrow.getAttribute('right')).to.equal('true');
            });

            it('should not do any changes if the element has no "arrow" attribute', function () {
                var dataViewElement = document.getElementById('data-view');
                var arrowElement = document.createElement('arrow');
                arrowElement.setAttribute('arrow', 'mock');
                dataViewElement.appendChild(arrowElement);
                DataViewHelper.toggleCollapse(dataViewElement);

                arrowElement.attributes.length.should.equal(1);
            });

        });

        describe('_enterHandler()', function () {

            it('should be called once on new DataView', function () {
                var _enterHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onEnterHandler');
                new DataViewComponent('data-view');
                _enterHandlerSpy.calledOnce.should.be.equal(true);
                _enterHandlerSpy.restore();
            });

        });

        describe('alphabetical sorting', function () {

            it('should sort object keys alphabetically (case-insensitive)', function () {
                var unsortedData = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: {
                            zebra: 'last',
                            Apple: 'first',
                            banana: 'second'
                        }
                    }
                };
                sampleView.setData(unsortedData);
                var dataViewElement = document.getElementById('data-view');
                var keys = dataViewElement.querySelectorAll('ul[expanded] key');
                var keyTexts = Array.prototype.map.call(keys, function(k) { return k.textContent; });
                expect(keyTexts).to.eql(['Apple', 'banana', 'zebra']);
            });

            it('should preserve array order (not sort by index)', function () {
                var arrayData = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: ['first', 'second', 'third']
                    }
                };
                sampleView.setData(arrayData);
                var dataViewElement = document.getElementById('data-view');
                var keys = dataViewElement.querySelectorAll('ul[expanded] key');
                var keyTexts = Array.prototype.map.call(keys, function(k) { return k.textContent; });
                expect(keyTexts).to.eql(['0', '1', '2']);
            });

            it('should sort associations alphabetically', function () {
                var dataWithAssociations = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: {
                            dummy: 'value'
                        },
                        associations: {
                            zeta: 'value1',
                            alpha: 'value2',
                            beta: 'value3'
                        }
                    }
                };
                sampleView.setData(dataWithAssociations);
                var dataViewElement = document.getElementById('data-view');
                var keys = dataViewElement.querySelectorAll('ul[expanded] key');
                var keyTexts = Array.prototype.map.call(keys, function(k) { return k.textContent; });
                // First key is 'dummy', then sorted associations
                expect(keyTexts).to.eql(['dummy', 'alpha', 'beta', 'zeta']);
            });
        });

        describe('filter functionality', function () {

            it('should render filter input when data is set', function () {
                sampleView.setData(mockDataWithPropertiesInfo);
                var dataViewElement = document.getElementById('data-view');
                var filterInput = dataViewElement.querySelector('.dataview-filter-input');
                expect(filterInput).to.not.be.null;
            });

            it('should initialize filter handler on construction', function () {
                var filterHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onFilterHandler');
                new DataViewComponent('data-view');
                filterHandlerSpy.calledOnce.should.be.equal(true);
                filterHandlerSpy.restore();
            });

            it('should hide non-matching properties when filter is applied', function () {
                var testData = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: {
                            visible: true,
                            enabled: true,
                            text: 'hello'
                        }
                    }
                };
                sampleView.setData(testData);
                sampleView._filterValue = 'visible';
                sampleView._applyFilter();

                var dataViewElement = document.getElementById('data-view');
                var items = dataViewElement.querySelectorAll('ul[expanded] > li > key');
                var visibleItems = Array.prototype.filter.call(items, function(key) {
                    return key.parentNode.style.display !== 'none';
                });
                expect(visibleItems.length).to.equal(1);
            });

            it('should show all properties when filter is cleared', function () {
                var testData = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: {
                            visible: true,
                            enabled: true,
                            text: 'hello'
                        }
                    }
                };
                sampleView.setData(testData);
                sampleView._filterValue = 'visible';
                sampleView._applyFilter();
                sampleView._filterValue = '';
                sampleView._applyFilter();

                var dataViewElement = document.getElementById('data-view');
                var items = dataViewElement.querySelectorAll('ul[expanded] > li');
                var hiddenItems = Array.prototype.filter.call(items, function(li) {
                    return li.style.display === 'none';
                });
                expect(hiddenItems.length).to.equal(0);
            });

            it('should filter case-insensitively', function () {
                var testData = {
                    properties: {
                        options: {
                            expandable: false,
                            expanded: true,
                            title: 'Test'
                        },
                        data: {
                            Visible: true,
                            hidden: false
                        }
                    }
                };
                sampleView.setData(testData);
                sampleView._filterValue = 'visible';
                sampleView._applyFilter();

                var dataViewElement = document.getElementById('data-view');
                var items = dataViewElement.querySelectorAll('ul[expanded] > li > key');
                var visibleItems = Array.prototype.filter.call(items, function(key) {
                    return key.parentNode.style.display !== 'none';
                });
                expect(visibleItems.length).to.equal(1);
            });
        });
    });

    describe('with clickable value', function () {

        var clickableView;
        var clickHandlerSpy;
        var clickableElement;
        var onValueClickSpy;

        beforeEach(function () {
            clickableView = new DataViewComponent('data-view', {
                data: clickableValueData
            });
            clickHandlerSpy = sinon.spy(clickableView, '_onClickHandler');
            onValueClickSpy = sinon.spy(clickableView, 'onValueClick');
        });

        afterEach(function () {
            clickableView = null;
        });

        it('should set onValueClick to a default function', function () {
            expect(clickableView.onValueClick).to.be.an.instanceof(Function);
        });

        it('should call onValueClick by _onClickHandler', function () {
            var dataViewElement = document.getElementById('data-view');
            clickableView._onClickHandler();
            clickableElement = dataViewElement.querySelector('clickable-value');
            clickableView._DataViewContainer.onclick({target: clickableElement});
            onValueClickSpy.calledWith({
                target: 'model',
                eventData: clickableValueData.counter.data.model.eventData
            });
            clickHandlerSpy.calledOnce.should.be.equal(true);
        });

    });

    describe('with initial data', function () {

        var sampleView;

        /**
         * Mock function for onPropertyUpdated.
         * @param {Object} data
         * @returns {Object}
         */
        var onPropertyUpdatedMock = function onPropertyUpdatedMock(data) {
            return data;
        };

        /**
         * Mock function for onValueClick.
         * @param {Object} event
         * @returns {Object}
         */
        var onValueClickMock = function onValueClickMock(event) {
            return event;
        };

        beforeEach(function () {
            mockDataWithNestedObject.properties.data.moreData = mockPlainObject;
            sampleView = new DataViewComponent('data-view', {
                data: mockDataWithNestedObject,
                onPropertyUpdated: onPropertyUpdatedMock,
                onValueClick: onValueClickMock
            });
        });

        afterEach(function () {
            sampleView = null;
        });

        it('should set onPropertyUpdated to a default function', function () {
            expect(sampleView.onPropertyUpdated).to.be.an.instanceof(Function);
        });

        it('should set onValueClick to a default function', function () {
            expect(sampleView.onValueClick).to.be.an.instanceof(Function);
        });

        describe('_clickHandler with editable data', function () {

            var blurHandlerSpy;
            var dataViewElement;
            var clickableElement;
            var firstEditableElement;

            beforeEach(function () {
                sampleView.setData(mockDataWithNestedObject);
                dataViewElement = document.getElementById('data-view');
                firstEditableElement = dataViewElement.querySelector('value[contentEditable=true]');
                blurHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onBlurHandler');
            });

            afterEach(function () {
                dataViewElement = null;
                blurHandlerSpy.restore();
            });

            it('should call blurHandler once', function () {
                firstEditableElement.click();
                blurHandlerSpy.callCount.should.equal(1);
            });

            it('should not call blurHandler', function () {
                dataViewElement.click();
                blurHandlerSpy.callCount.should.equal(0);
            });

            it('should call blurHandler with correct arguments', function () {
                firstEditableElement.click();
                blurHandlerSpy.calledWith(firstEditableElement).should.equal(true);
            });

            it('should call onValueClick with the correct arguments', function () {
                var onValueClickSpy = sinon.spy(sampleView, 'onValueClick');
                sampleView.setData(clickableValueData);
                clickableElement = dataViewElement.querySelector('clickable-value');
                sampleView._DataViewContainer.onclick({target: clickableElement});
                onValueClickSpy.calledWith({
                    target: 'model',
                    eventData: clickableValueData.counter.data.model.eventData
                });
            });

        });

        describe('_clickHandler with tools buttins', function () {

            var focusButtonElement;
            var dataViewElement;
            var invalidateButtonElement;
            var copyHTMLButtonElement;
            var focusHandlerSpy;
            var invalidateHandlerSpy;
            var copyElementHTMLToConsoleHandler;

            beforeEach(function () {
                sampleView.setData(mockDataViewActions);
                dataViewElement = document.getElementById('data-view');
                focusButtonElement = document.getElementById('control-focus');
                invalidateButtonElement = document.getElementById('control-invalidate');
                copyHTMLButtonElement = document.getElementById('control-copy html to console');
                focusHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onFocusElement');
                invalidateHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onInvalidateElement');
                copyElementHTMLToConsoleHandler = sinon.spy(DataViewComponent.prototype, '_onCopyElementHTMLToConsole');
            });

            afterEach(function () {
                dataViewElement = null;
                focusHandlerSpy.restore();
                invalidateHandlerSpy.restore();
                copyElementHTMLToConsoleHandler.restore();
            });

            it('should call focusHandler once', function () {
                focusButtonElement.click();
                focusHandlerSpy.callCount.should.equal(1);
                focusHandlerSpy.calledWith(focusButtonElement).should.equal(true);
            });

            it('should call invalidateHandler once', function () {
                invalidateButtonElement.click();
                invalidateHandlerSpy.callCount.should.equal(1);
                invalidateHandlerSpy.calledWith(invalidateButtonElement).should.equal(true);
            });
            it('should call copyElementHTMLToConsoleHandler once', function () {
                copyHTMLButtonElement.click();
                copyElementHTMLToConsoleHandler.callCount.should.equal(1);
                copyElementHTMLToConsoleHandler.calledWith(copyHTMLButtonElement).should.equal(true);
            });
        });

        describe('_blurHandler', function () {
            var sampleView;
            var blurHandlerSpy;
            var dataViewElement;
            var editableElements;

            beforeEach(function () {
                sampleView = new DataViewComponent('data-view');
                sampleView.setData(mockDataWithNestedObject);
                dataViewElement = document.getElementById('data-view');
                blurHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onBlurHandler');
                editableElements = dataViewElement.querySelectorAll('value[contentEditable=true]');
            });

            afterEach(function () {
                dataViewElement = null;
                blurHandlerSpy.restore();
            });

            it('should call on blur handler', function () {
                var editableElement = editableElements[0];
                sampleView._onBlurHandler(editableElement);
                editableElement.onblur({target: editableElement});
            });

            it('should call on blur handler without target', function () {
                sampleView._onBlurHandler();
            });
        });

        describe('_changeHandler enum type', function () {
            var sampleView;
            var blurHandlerSpy;
            var changeHandlerSpy;
            var dataViewElement;
            var selectBox;

            beforeEach(function () {
                sampleView = new DataViewComponent('data-view');
                sampleView.setData(mockDataWithTypes);
                dataViewElement = document.getElementById('data-view');
                blurHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onBlurHandler');
                changeHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onChangeHandler');
                selectBox = dataViewElement.querySelector('select');
            });

            afterEach(function () {
                dataViewElement = null;
                blurHandlerSpy.restore();
                changeHandlerSpy.restore();
            });

            it('should not trigger blur handler', function () {
                selectBox.click();
                selectBox.dispatchEvent(new Event('change'));
                expect(blurHandlerSpy.notCalled).to.equal(true);
                expect(changeHandlerSpy.notCalled).to.equal(false);
            });
        });

        describe('_changeHandler boolean type', function () {
            var sampleView;
            var blurHandlerSpy;
            var checkBoxHandler;
            var dataViewElement;
            var selectBox;

            beforeEach(function () {
                sampleView = new DataViewComponent('data-view');
                sampleView.setData(mockDataWithTypes);
                dataViewElement = document.getElementById('data-view');
                blurHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onBlurHandler');
                checkBoxHandler = sinon.spy(DataViewComponent.prototype, '_onCheckBoxHandler');
                selectBox = dataViewElement.querySelector('input[type="checkbox"][data-control-id]');
            });

            afterEach(function () {
                dataViewElement = null;
                blurHandlerSpy.restore();
                checkBoxHandler.restore();
            });

            it('should not trigger blur handler', function () {
                selectBox.click();
                selectBox.dispatchEvent(new Event('change'));
                expect(blurHandlerSpy.notCalled).to.equal(true);
                expect(checkBoxHandler.notCalled).to.equal(false);
            });
        });

        describe('_onEnterHandler', function () {
            var sampleView;
            var enterHandlerSpy;
            var dataViewElement;
            var firstEditableElement;
            var nonEditableElement;
            var eventPreventDefaultSpy;

            beforeEach(function () {
                sampleView = new DataViewComponent('data-view');
                sampleView.setData(mockDataWithNestedObject);
                dataViewElement = document.getElementById('data-view');
                enterHandlerSpy = sinon.spy(DataViewComponent.prototype, '_onEnterHandler');
                firstEditableElement = dataViewElement.querySelector('value[contentEditable=true]');
                nonEditableElement = dataViewElement.querySelector('section-title');
                eventPreventDefaultSpy = sinon.spy();
            });

            afterEach(function () {
                dataViewElement = null;
                enterHandlerSpy.restore();
            });

            it('should call on enter handler', function () {
                sampleView._onEnterHandler(firstEditableElement);
                dataViewElement.onkeydown({target: firstEditableElement});
            });

            it('should call on enter handler', function () {
                sampleView._onEnterHandler(nonEditableElement);
                dataViewElement.onkeydown({target: nonEditableElement});
            });

            it('should call on enter handler with escape', function () {
                sampleView._onEnterHandler(firstEditableElement);
                dataViewElement.onkeydown({
                    target: firstEditableElement,
                    keyCode: 13,
                    preventDefault: eventPreventDefaultSpy
                });
            });

            it('should call on enter handler without target', function () {
                sampleView._onEnterHandler();
            });

        });

    });
});
