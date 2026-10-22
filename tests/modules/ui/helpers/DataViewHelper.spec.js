var DVHelper = require('../../../../app/scripts/modules/ui/helpers/DataViewHelper.js');

var ATTRIBUTES_LIST = {
    expanded: true,
    title: 'Hello'
};
var EXPECTED_HTML_ATTRIBUTES_LIST = '<ul expanded="true" title="Hello">';

var COLLAPSED_ARROW_HTML = '<arrow right="true"></arrow>';
var EXPANDED_ARROW_HTML = '<arrow down="true"></arrow>';

var TAG_NO_VALUE_NO_ATTRIBUTES_HTML = '<key>undefined</key>';
var TAG_VALUE_NO_ATTRIBUTES_HTML = '<value>true</value>';
var TAG_VALUE_ATTRIBUTES_HTML = '<key expanded="true" title="Hello">from House</key>';

var VALUE_DOES_NOT_NEED_QUOTES_HTML = '<value>3</value>';
var VALUE_NEEDS_QUOTES_HTML = '&quot;<value>title</value>&quot;';

var FIND_NEAREST_DOM_ELEMENT_DOM_MOCK = {
    nodeName: 'VALUE',
    parentNode: {
        nodeName: 'LI',
        parentNode: {
            nodeName: 'UL',
            parentNode: {
                nodeName: 'DATA-VIEW'
            }
        }
    }
};

var NO_AVAILABLE_DATA_HTML_TAG_TEXT = '<no-data>No Available Data</no-data>';
var NO_AVAILABLE_DATA_HTML_STRING_FOR_DATAVIEW = '<ul expanded="true"><li>' + NO_AVAILABLE_DATA_HTML_TAG_TEXT + '</li></ul>';

describe('Helpers for DataView', function () {

    describe('#openUL', function () {

        it('Should return correct string with HTML markup for set of attributes for UL', function () {
            var resultHTML = DVHelper.openUL(ATTRIBUTES_LIST);
            resultHTML.should.equal(EXPECTED_HTML_ATTRIBUTES_LIST);
        });

        it('Should return string with HTML markup for UL tag without any attributes', function () {
            var resultHTML = DVHelper.openUL();
            resultHTML.should.equal('<ul>');
        });
    });

    describe('#getObjectLength', function () {

        it('should return 2 for length', function () {
            var resultLength = DVHelper.getObjectLength(ATTRIBUTES_LIST);
            resultLength.should.equal(2);
        });

        it('should return 0 if parameter is null', function () {
            var resultLength = DVHelper.getObjectLength(null);
            resultLength.should.equal(0);
        });

        it('should return 0 if parameter is a number', function () {
            var resultLength = DVHelper.getObjectLength(3);
            resultLength.should.equal(0);
        });

        it('should return 0 if parameter is a string', function () {
            var resultLength = DVHelper.getObjectLength('string');
            resultLength.should.equal(0);
        });

        it('should return 0 if parameter is undefined', function () {
            var resultLength = DVHelper.getObjectLength(undefined);
            resultLength.should.equal(0);
        });

        it('should return 0 if parameter is boolean', function () {
            var resultLength = DVHelper.getObjectLength(true);
            resultLength.should.equal(0);
        });
    });

    describe('#addArrow', function () {

        it('should return a string with expanded arrow HTML markup', function () {
            var arrowMarkup = DVHelper.addArrow(true);
            arrowMarkup.should.equal(EXPANDED_ARROW_HTML);
        });

        it('should return a string with collapsed arrow HTML markup if ', function () {
            var arrowMarkup = DVHelper.addArrow();
            arrowMarkup.should.equal(COLLAPSED_ARROW_HTML);
        });

    });

    describe('#wrapInTag', function () {

        it('should produce empty string if there is no tag supplied', function () {
            var resultMarkupString = DVHelper.wrapInTag(null);
            resultMarkupString.should.equal('');
        });

        it('should produce correct HTML markup as a string with no value and attributes supplied', function () {
            var resultMarkupString = DVHelper.wrapInTag('key');
            resultMarkupString.should.equal(TAG_NO_VALUE_NO_ATTRIBUTES_HTML);
        });

        it('should produce correct HTML markup as a string with no attributes supplied', function () {
            var resultMarkupString = DVHelper.wrapInTag('value', true);
            resultMarkupString.should.equal(TAG_VALUE_NO_ATTRIBUTES_HTML);
        });

        it('should produce correct HTML markup as a string with all three parameters', function () {
            var resultMarkupString = DVHelper.wrapInTag('key', 'from House', ATTRIBUTES_LIST);
            resultMarkupString.should.equal(TAG_VALUE_ATTRIBUTES_HTML);
        });
    });

    describe('#valueNeedsQuotes', function () {

        it('should return the same value when not a string is passed in', function () {
            var resultValue = DVHelper.valueNeedsQuotes(3, '<value>3</value>');
            resultValue.should.equal(VALUE_DOES_NOT_NEED_QUOTES_HTML);
        });

        it('should return the quoted value when a string is passed in', function () {
            var resultValue = DVHelper.valueNeedsQuotes('title', '<value>title</value>');
            resultValue.should.equal(VALUE_NEEDS_QUOTES_HTML);
        });
    });

    describe('#addKeyTypeInfo', function () {

        it('should return the correct string with an array of values', function () {
            var array = ['one', 'two', 'three'];
            var resultString = DVHelper.addKeyTypeInfoBegin(array) + DVHelper.addKeyTypeInfoEnd(array);
            resultString.should.equal('[<collapsed-typeinfo>' + array.length + '</collapsed-typeinfo>]');
        });

        it('should return the correct string with a simple array', function () {
            var array = [ ];
            var resultString = DVHelper.addKeyTypeInfoBegin(array) + DVHelper.addKeyTypeInfoEnd(array);
            resultString.should.equal('[]');
        });

        it('should return the correct string with an DataView object (nested)', function () {
            var DVObject = {data: {one: 1, two: 2, three: 3, bool: false}};
            var resultString = DVHelper.addKeyTypeInfoBegin(DVObject) + DVHelper.addKeyTypeInfoEnd(DVObject);
            resultString.should.equal('{<collapsed-typeinfo>...</collapsed-typeinfo>}');
        });

        it('should return the correct string with an DataView object', function () {
            var DVObject = {one: 1, two: 2, three: 3, bool: false};
            var resultString = DVHelper.addKeyTypeInfoBegin(DVObject) + DVHelper.addKeyTypeInfoEnd(DVObject);
            resultString.should.equal('{<collapsed-typeinfo>...</collapsed-typeinfo>}');
        });

        it('should return the correct string with a simple object', function () {
            var DVObject = {};
            var resultString = DVHelper.addKeyTypeInfoBegin(DVObject) + DVHelper.addKeyTypeInfoEnd(DVObject);
            resultString.should.equal('{}');
        });
    });

    describe('#findNearestDOMElement', function () {

        it('should find the LI tag in the DOM tree', function () {
            var searchResult = DVHelper.findNearestDOMElement(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK, 'LI');

            searchResult.should.deep.equal(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK.parentNode);
        });

        it('should find the UL tag in the DOM tree', function () {
            var searchResult = DVHelper.findNearestDOMElement(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK, 'UL');

            searchResult.should.deep.equal(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK.parentNode.parentNode);
        });

        it('should not return undefined if searched element is DATA-VIEW tag', function () {
            var searchResult = DVHelper.findNearestDOMElement(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK, 'DATA-VIEW');

            searchResult.nodeName.should.equal('DATA-VIEW');
        });

        it('should return undefined for the KEY tag, if not in the DOM tree', function () {
            var searchResult = DVHelper.findNearestDOMElement(FIND_NEAREST_DOM_ELEMENT_DOM_MOCK, 'KEY');

            expect(searchResult).to.be.undefined;
        });
    });

    describe('#toggleCollapse', function () {

        var collapsableDOMStructure;
        var collapsableLiTag;
        var rootLiTag;
        var arrowTag;
        var ulTag;
        var nestedUlTag;

        beforeEach(function () {
            collapsableDOMStructure = document.createDocumentFragment();

            rootLiTag = document.createElement('li');
            ulTag = document.createElement('ul');
            collapsableLiTag = document.createElement('li');
            nestedUlTag = document.createElement('ul');
            arrowTag = document.createElement('arrow');
            arrowTag.setAttribute('right', 'true');

            rootLiTag.appendChild(ulTag);
            ulTag.appendChild(collapsableLiTag);
            collapsableLiTag.appendChild(arrowTag);
            collapsableLiTag.appendChild(nestedUlTag);
            collapsableDOMStructure.appendChild(rootLiTag);
        });

        afterEach(function () {
            collapsableDOMStructure = null;
        });

        it('should set the arrow position to expanded (down)', function () {
            // Action
            var result = DVHelper.toggleCollapse(collapsableLiTag);

            // Assertion
            expect(result).to.be.true;
            arrowTag.getAttribute('down').should.equal('true');
        });

        it('should set the arrow position to collapsed (right)', function () {
            // Setup
            arrowTag.removeAttribute('right');
            arrowTag.setAttribute('down', 'true');

            // Action
            var result = DVHelper.toggleCollapse(collapsableLiTag);

            // Assertion
            expect(result).to.be.true;
            arrowTag.getAttribute('right').should.equal('true');
        });

        it('should not find an arrow element', function () {
            // Action
            var result = DVHelper.toggleCollapse(rootLiTag);

            // Assertion
            expect(result).to.be.false;
        });

        it('should NOT change the arrow position to expanded (down)', function () {
            // Action
            var result = DVHelper.toggleCollapse(rootLiTag);

            // Assertion
            expect(result).to.be.false;
            expect(arrowTag.getAttribute('down')).to.be.null;
            arrowTag.getAttribute('right').should.equal('true');
        });

        it('should NOT change the arrow position to collapsed (right)', function () {
            // Setup
            arrowTag.removeAttribute('right');
            arrowTag.setAttribute('down', 'true');

            // Action
            var result = DVHelper.toggleCollapse(rootLiTag);

            // Assertion
            expect(result).to.be.false;
            expect(arrowTag.getAttribute('right')).to.be.null;
            arrowTag.getAttribute('down').should.equal('true');
        });
    });

    describe('#getULAttributesFromOptions', function () {

        var options;

        beforeEach(function () {
            options = {
                title: 'Hello',
                showTypeInfo: true,
                expanded: true,
                expandable: true
            };
        });

        afterEach(function () {
            options = null;
        });

        it('should return attributes object with expanded and expandable property set', function () {
            var attributes = DVHelper.getULAttributesFromOptions(options);

            attributes.should.deep.equal({expanded: 'true', expandable: 'true'});
        });

        it('should return attributes object with only expandable property set', function () {
            delete options.expanded;
            var attributes = DVHelper.getULAttributesFromOptions(options);

            attributes.should.deep.equal({expandable: 'true'});
        });

        it('should return attributes object with only expanded property set', function () {
            delete options.expandable;
            var attributes = DVHelper.getULAttributesFromOptions(options);

            attributes.should.deep.equal({expanded: 'true'});
        });

        it('should return empty attributes object', function () {
            delete options.expandable;
            delete options.expanded;

            var attributes = DVHelper.getULAttributesFromOptions(options);

            attributes.should.deep.equal({});
        });
    });

    describe('#getNoDataHTML', function () {
        it('should return the correct No Available Data HTML string', function () {
            var noDataWrappedHTMLString = DVHelper.getNoDataHTML(NO_AVAILABLE_DATA_HTML_TAG_TEXT);

            noDataWrappedHTMLString.should.equal(NO_AVAILABLE_DATA_HTML_STRING_FOR_DATAVIEW);
        });
    });

    describe('#selectEditableContent', function () {
        var inputElement;

        beforeEach(function () {
            inputElement = document.createElement('value');
            inputElement.innerText = 'UI5';
        });

        afterEach(function () {
            inputElement = null;
        });

        it('should add the value to be changed to the selection', function () {
            var range = DVHelper.selectEditableContent(inputElement, true);

            range.toString().should.equal('UI5');
        });

        it('should not add the value to be changed to the selection', function () {
            var range = DVHelper.selectEditableContent(inputElement, false);

            expect(range).to.be.undefined;
        });

    });

    describe('#selectEditableContent', function () {
        var sampleObject;
        var key;
        var requiredFormat;

        beforeEach(function () {
            key = 'title';
            sampleObject = {
                type: 'string',
                value: 'Hello'
            };

            requiredFormat = {data: {}};
            requiredFormat.data[key] = sampleObject.value;
        });

        afterEach(function () {
            sampleObject = null;
            requiredFormat = null;
            key = null;
        });

        it('should add the value to be changed to the selection', function () {
            var formattedValueForDataView = DVHelper.formatValueForDataView(key, sampleObject);

            formattedValueForDataView.should.deep.equal(requiredFormat);
        });
    });

    describe('#getCorrectedValue', function () {

        it('should return the correct value for boolean true from string', function () {
            var booleanTrue = DVHelper.getCorrectedValue('true');
            booleanTrue.should.be.true;
        });

        it('should return the correct value for boolean false from string', function () {
            var booleanFalse = DVHelper.getCorrectedValue('false');
            booleanFalse.should.be.false;
        });

        it('should return the correct value for "43"', function () {
            var number = DVHelper.getCorrectedValue('43');
            number.should.equal(43);
        });

        it('should return the "x43"', function () {
            var numberLikeString = DVHelper.getCorrectedValue('x43');
            numberLikeString.should.equal('x43');
        });

        it('should return the "4x3"', function () {
            var numberLikeString = DVHelper.getCorrectedValue('4x3');
            numberLikeString.should.equal('4x3');
        });

        it('should return the passed in undefined value', function () {
            var undef = DVHelper.getCorrectedValue(undefined);
            expect(undef).to.equal(undefined);
        });

        it('should return the passed in array', function () {
            var passedInArray = [1,2,3];
            var array = DVHelper.getCorrectedValue(passedInArray);
            array.should.deep.equal(passedInArray);
        });

        it('should return the passed in object', function () {
            var passedInObject = {1:1, 2:2, 3:3};
            var correctedObject = DVHelper.getCorrectedValue(passedInObject);
            correctedObject.should.deep.equal(passedInObject);
        });

        it('should return the passed in null', function () {
            var nil = null;
            var shouldReturnNull = DVHelper.getCorrectedValue(nil);
            expect(shouldReturnNull).to.equal(nil);
        });

        it('should return null if empty string passed in', function () {
            var shouldReturnEmpty = DVHelper.getCorrectedValue('');
            expect(shouldReturnEmpty).to.equal(null);
        });
    });

    describe('#wrapInSelectTag', function () {
        it('escapes HTML in option labels and values', function () {
            var malicious = '</option><img src=x onerror=alert(1)>';
            var type = {};
            type[malicious] = malicious;
            var html = DVHelper.wrapInSelectTag('', {}, type);
            expect(html).to.not.include('<img');
            expect(html).to.include('&lt;/option&gt;');
        });

        it('preserves correct selected state after escaping', function () {
            var type = { Default: 'Default', Emphasized: 'Emphasized' };
            var html = DVHelper.wrapInSelectTag('Emphasized', {}, type);
            expect(html).to.include('value="Emphasized" selected');
            expect(html).to.include('value="Default"');
            expect(html).to.not.include('value="Default" selected');
        });
    });
});
