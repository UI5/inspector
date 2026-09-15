'use strict';

var _ = require('lodash');

/**
 * Escape HTML special characters.
 * @param {string} value - String to escape
 * @returns {string} - Escaped string
 * @private
 */
function _escapeHTML(value) {
    return _.escape(value);
}

/**
 * Generates attributes in HTML.
 * @param {Object} attributes
 * @returns {string}
 * @private
 */
function _generateTagAttributes(attributes) {

    var html = '';
    if (attributes) {
        for (var key in attributes) {
            html += ' ' + key + '="' + attributes[key] + '"';
        }
    }
    return html;
}

/**
 * @param {Object} attributes
 * @returns {string}
 * @private
 */
function _openUL(attributes) {
    var html = '';
    var attributesHTML = _generateTagAttributes(attributes);

    html = '<ul' + attributesHTML + '>';
    return html;
}

/**
 * Create "ul" closing tag.
 * @returns {string}
 * @private
 */
function _closeUL() {
    return '</ul>';
}

/**
 * Create "li" opening tag.
 * @returns {string}
 * @private
 */
function _openLI() {
    return '<li>';
}

/**
 * Create "li" closing tag.
 * @returns {string}
 * @private
 */
function _closeLI() {
    return '</li>';
}

/**
 * Create "invalidate" and "focus" buttons.
 * @returns {string}
 * @private
 */
function _addToolsButtons(options, type) {
    return '<button class="tools-button" id="control-' + type.toLowerCase() + '" data-control-id="' + options.controlId + '">' + type + '</button>';
}

/**
 * Create text line with text, requiring attention.
 * @returns {string}
 * @private
 */
 function _addDisclaimer(text) {
    return '<div class="disclaimer">' + text + '</div>';
}

/**
 * @param {Object|Array} element
 * @returns {number}
 * @private
 */
function _getObjectLength(element) {

    if (element && typeof element === 'object') {
        return Object.keys(element).length;
    }

    return 0;
}

/**
 * @param {boolean} isExpanded - configures the direction of the arrow
 * @returns {string}
 * @private
 */
function _addArrow(isExpanded) {
    var direction = isExpanded ? 'down' : 'right';
    return '<arrow ' + direction + '="true"></arrow>';
}

/**
 * Adding 'select' HTML Element options with data for the property variations.
 * @param {string} value
 * @param {Object} type
 * @returns {string}
 * @private
 */
function _generateValueOptions(value, type) {
    var html = '';
    var types;
    var i;

    if (Object.keys(type).length) {
        types = Object.keys(type);

        for (i = 0; i < types.length; i++) {
            html += '<option value="' + _escapeHTML(type[types[i]]) + '"' + (type[types[i]] === value ? ' selected' : '') + '>' +
                _escapeHTML(types[i]) + '</option>';
        }

    }

    return html;
}

/**
 * @param {string} tag - name of HTML tag
 * @param {string|number|boolean} value
 * @param {Object} attributes
 * @returns {string}
 * @private
 */
function _wrapInTag(tag, value, attributes) {
    var html = '';

    if (!tag || typeof tag !== 'string') {
        return html;
    }

    html += '<' + tag;
    html += _generateTagAttributes(attributes);
    html += '>' + value + '</' + tag + '>';
    return html;
}

/**
 * @param {string|number|boolean} value
 * @param {Object} attributes
 * @param {Object} type - predefined type
 * @returns {string}
 * @private
 */
function _wrapInSelectTag (value, attributes, type) {
    var html = '';

    html += '<select';
    html += _generateTagAttributes(attributes);
    html += '>' + (type ? _generateValueOptions(value, type) : value) + '</select>';
    return html;
}

/**
 * @param {boolean} value
 * @param {Object} attributes
 * @returns {string}
 * @private
 */
function _wrapInCheckBox (value, attributes) {
    var html = '';

    attributes.id = attributes['data-property-name'];

    html = '<input verical-aligment type="checkbox"';
    html += _generateTagAttributes(attributes);
    html += value ? ' checked />' : ' />';
    html += '<label verical-aligment for="';
    html += attributes.id;
    html += '" gray>';
    html += value;
    html += '</label>';

    return html;
}

/**
 * Check if property value needs quotes.
 * @param {string|boolean|number|null} value
 * @param {string} valueWrappedInHTML
 * @returns {string|boolean|number|null}
 * @private
 */
function _valueNeedsQuotes(value, valueWrappedInHTML) {

    if (typeof value === 'string') {
        return '&quot;' + valueWrappedInHTML + '&quot;';
    }

    return valueWrappedInHTML;
}

/**
 * Creates span for default value.
 * @returns {string}
 * @private
 */
function _createDefaultSpan() {

    return '<span gray>(default value)</span>';
}

/**
 * @param {Array|Object} element
 * @returns {string}
 * @private
 */
function _addKeyTypeInfoBegin(element) {

    if (Array.isArray(element)) {
        return '[';
    }

    return '{';
}

/**
 * @param {Array|Object} element
 * @returns {string}
 * @private
 */
function _addKeyTypeInfoEnd(element) {
    var html = '';
    var noOfElements = _getObjectLength(element);
    var collapsedInfo = Array.isArray(element) ? noOfElements : '...';

    if (noOfElements) {
        html += _wrapInTag('collapsed-typeinfo', collapsedInfo);
    }

    if (Array.isArray(element)) {
        html += ']';
    } else {
        html += '}';
    }

    return html;
}

/**
 * Search for the nearest parent Node within the bounds of the DATA-VIEW parent.
 * @param {element} element - HTML DOM element that will be the root of the search
 * @param {string} targetElementName - The desired HTML parent element nodeName
 * @returns {Object} HTML DOM element
 * @private
 */
function _findNearestDOMElement(element, targetElementName) {
    while (element.nodeName !== targetElementName) {
        if (element.nodeName === 'DATA-VIEW') {
            element = undefined;
            break;
        }
        element = element.parentNode;
    }

    return element;
}

/**
 * @param {element} target - HTML DOM element
 * @returns {boolean}
 * @private
 */
function _toggleCollapse(target) {
    var expandableLIChild = target.querySelector(':scope > ul');
    var arrow = target.querySelector(':scope > arrow');

    if (!arrow) {
        return false;
    }

    if (arrow.getAttribute('right') === 'true') {
        arrow.removeAttribute('right');
        arrow.setAttribute('down', 'true');

        expandableLIChild.setAttribute('expanded', 'true');
    } else if (arrow.getAttribute('down') === 'true') {
        arrow.removeAttribute('down');
        arrow.setAttribute('right', 'true');

        expandableLIChild.removeAttribute('expanded');
    }

    return true;
}

/**
 * Get the needed attributes for an opening UL tag.
 * @param {Object} options
 * @returns {Object}
 * @private
 */
function _getULAttributesFromOptions(options) {
    var attributes = {};

    if (options.expandable) {
        attributes.expandable = 'true';
    }

    if (options.expanded) {
        attributes.expanded = 'true';
    }

    return attributes;
}

/**
 * Appropriately wraps in HTML the No Available Data text.
 * @param {string} html
 * @returns {string}
 * @private
 */
function _getNoDataHTML(html) {
    var htmlString = '';
    htmlString += _openUL({
        'expanded': 'true'
    });
    htmlString += _openLI();
    htmlString += html;
    htmlString += _closeLI();
    htmlString += _closeUL();

    return htmlString;
}

/**
 * This function selects the content of an editable value holder.
 * @param {HTMLElement} element
 * @param {boolean} shouldSelect
 * @returns {Range} range the range that is selected
 * @private
 */
function _selectEditableContent(element, shouldSelect) {
    if (shouldSelect) {
        var range = document.createRange();
        range.selectNodeContents(element);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        return range;
    }
}

/**
 *
 * @param {string} key
 * @param {Object} currentElement
 * @returns {Object}
 * @private
 */
function _formatValueForDataView(key, currentElement) {
    var requiredFormat = {
        data: {}
    };
    requiredFormat.data[key] = currentElement.value;

    return requiredFormat;
}

/**
 * Determines if value is boolean, number or string.
 * @param {string|number|boolean} value
 * @returns {boolean|string|number}
 * @private
 */
function _getCorrectedValue(value) {

    if (value === 'true' || value === 'false') {
        value = (value === 'true');
    } else if (value === '') {
        value = null;
    } else if (!isNaN(+value) && value !== null) {
        value = +value;
    }

    return value;
}
/**
 * Access (nested) object properties by a full path similar to.
 * @param {Object} sourceObject
 * @param {string} path
 * @returns {any}
 * @private
 */
function _getObjectProperty(sourceObject, path) {
    if (path === undefined || path === null) {
        return undefined;
    }
    // Strip leading slash.
    path = path.replace(/^\//, '');
    return path.split('/').reduce(function (currentObject, currentPath) {
        return currentObject ? currentObject[currentPath] : undefined;
    }, sourceObject);
}

/**
 * Clean up duplicate classes in HTML string.
 * @param {string} value - HTML string that might contain class attributes
 * @returns {string} - HTML string with unique classes
 * @private
 */
function _cleanDuplicateClasses(value) {
    if (!value.includes('class="')) {
        return value;
    }
    return value.replace(/class="([^"]*)"/g, function(match, classString) {
        var uniqueClasses = [...new Set(classString.split(/\s+/).filter(Boolean))];
        return 'class="' + uniqueClasses.join(' ') + '"';
    });
}

/**
 * Format HTML string value by cleaning classes and escaping
 * @param {string} value - String to process
 * @returns {string} - Processed string
 * @private
 */
function _formatHTMLString(value) {
    if (value.includes('clickable-value')) {
        return value;
    }
    return _escapeHTML(_cleanDuplicateClasses(value));
}

module.exports = {
    addArrow: _addArrow,
    addToolsButtons: _addToolsButtons,
    addDisclaimer: _addDisclaimer,
    addKeyTypeInfoBegin: _addKeyTypeInfoBegin,
    addKeyTypeInfoEnd: _addKeyTypeInfoEnd,
    closeLI: _closeLI,
    closeUL: _closeUL,
    findNearestDOMElement: _findNearestDOMElement,
    formatValueForDataView: _formatValueForDataView,
    getCorrectedValue: _getCorrectedValue,
    getObjectLength: _getObjectLength,
    getObjectProperty: _getObjectProperty,
    getULAttributesFromOptions: _getULAttributesFromOptions,
    getNoDataHTML: _getNoDataHTML,
    openUL: _openUL,
    openLI: _openLI,
    selectEditableContent: _selectEditableContent,
    toggleCollapse: _toggleCollapse,
    wrapInTag: _wrapInTag,
    wrapInSelectTag: _wrapInSelectTag,
    wrapInCheckBox: _wrapInCheckBox,
    valueNeedsQuotes: _valueNeedsQuotes,
    createDefaultSpan: _createDefaultSpan,
    formatHTMLString: _formatHTMLString
};
