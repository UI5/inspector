'use strict';

/**
 * @typedef {Object} ControlTree
 * @property {Object} data - This property should contain objects described in ControlTreeOptions
 * @function onSelectionChanged
 * @function onHoverChanged

 */

/**
 * @typedef {Object} ControlTreeOptions
 * @property {Object} versionInfo - JSON object with the fowling format:
 *  {
 *      framework: 'string',
 *      version: 'string'
 *  }
 * @property {Object} controls - Array with JSON object in the following format:
 *  [{
 *      id: 'string',
 *      name: 'string',
 *      type: 'string',
 *      content: 'Array'
 *  }]
 */

/**
 * @typedef {Object} controlTreeRenderingOptions
 * @property {string} id - The id of the control.
 * @property {Array} attributes - HTML attributes.
 */

/**
 * Check for JS object.
 * @param {Object} data
 * @returns {boolean}
 * @private
 */
function _isObject(data) {
    return (typeof data === 'object' && !Array.isArray(data) && data !== null);
}

/**
 * Create tree element that shows framework name and version.
 * @param {Object} versionInfo
 * @returns {string}
 * @private
 */
function _createTreeHeader(versionInfo) {
    if (!versionInfo) {
        console.warn('There is no version information in the data model');
        return '';
    }

    return '<ul><li visible><version>&#60;!' + versionInfo.framework + ' v' + versionInfo.version + '&#62;</version></li></ul>';
}

/**
 * @param {controlTreeRenderingOptions} options
 * @returns {string}
 * @private
 */
function _startControlTreeList(options) {
    return '<ul ' + options.attributes.join(' ') + '>';
}

/**
 * @returns {string}
 * @private
 */
function _endControlTreeList() {
    return '</ul>';
}

/**
 * @param {controlTreeRenderingOptions.controls} options
 * @returns {string}
 * @private
 */
function _startControlTreeListItem(options) {
    return '<li id="' + options.id + '">';
}

/**
 * @returns {string}
 * @private
 */
function _endControlTreeListItem() {
    return '</li>';
}

/**
 * Create HTML for the left part of the ControlTree list item.
 * @param {ControlTreeOptions.controls} controls
 * @param {number} paddingLeft
 * @returns {string}
 * @private
 */
function _getControlTreeLeftColumnOfListItem(controls, paddingLeft) {
    var html = '<offset style="padding-left:' + paddingLeft + 'px" >';

    if (controls.content.length > 0) {
        html += '<arrow down="true"></arrow>';
    } else {
        html += '<place-holder></place-holder>';
    }

    html += '</offset>';

    return html;
}

/**
 * Create HTML for the right part of the ControlTree list item.
 * @param {Object} control - JSON object form {ControlTreeOptions.controls}
 * @returns {string}
 * @private
 */
function _getControlTreeRightColumnOfListItem(control) {
    var splitControlName = control.name.split('.');
    var name = splitControlName[splitControlName.length - 1];
    var nameSpace = control.name.replace(name, '');

    return '<tag data-search="' + control.name + control.id + '">' +
        '&#60;' +
        '<namespace>' + nameSpace + '</namespace>' +
        name +
        '<attribute>&#32;id="<attribute-value>' + control.id + '</attribute-value>"</attribute>' +
        '&#62;' +
        '</tag>';
}

/**
 * Search for the nearest parent Node.
 * @param {element} element - HTML DOM element that will be the root of the search
 * @param {string} parentNodeName - The desired HTML parent element nodeName
 * @returns {Object} HTML DOM element
 * @private
 */
function _findNearestDOMParent(element, parentNodeName) {
    while (element.nodeName !== parentNodeName) {
        if (element.nodeName === 'CONTROL-TREE') {
            break;
        }
        element = element.parentNode;
    }

    return element;
}

/**
 * ControlTree constructor.
 * @param {string} id - The id of the DOM container
 * @param {ControlTree} instantiationOptions
 * @constructor
 */
function ControlTree(id, instantiationOptions) {
    var areInstantiationOptionsAnObject = _isObject(instantiationOptions);
    var options;

    /**
     * Make sure that the options parameter is Object and
     * that the ControlTree can be instantiate without initial options.
     */
    if (areInstantiationOptionsAnObject) {
        options = instantiationOptions;
    } else {
        options = {
            data: {}
        };
    }

    // Save DOM reference
    this._controlTreeContainer = document.getElementById(id);

    /**
     * Method fired when the selected element in the ControlTree is changed.
     * @param {string} selectedElementId - The selected element id
     */
    this.onSelectionChanged = options.onSelectionChanged ? options.onSelectionChanged : function (selectedElementId) {
    };

    /**
     * Method fired when the hovered element in the ControlTree is changed.
     * @param {string} hoveredElementId - The hovered element id
     */
    this.onHoverChanged = options.onHoverChanged ? options.onHoverChanged : function (hoveredElementId) {
    };

    /**
     * Method fired when the initial ControlTree rendering is done.
     */
    this.onInitialRendering = options.onInitialRendering ? options.onInitialRendering : function () {
    };

    // Object with the tree model that will be visualized
    this.setData(options.data);
}

/**
 * Initialize Tree.
 */
ControlTree.prototype.init = function () {
    this._createHTML();
    this._initFocus();
    this._createHandlers();

    // Fire event to notify that the ControlTree is initialized
    this.onInitialRendering();
};

/**
 * Get the data model used for the tree.
 * @returns {ControlTreeOptions} the data that is used for the tree
 */
ControlTree.prototype.getData = function () {
    return this._data;
};

/**
 * Set the data model used for the tree.
 * @param {ControlTreeOptions} data
 * @returns {ControlTree}
 */
ControlTree.prototype.setData = function (data) {
    var oldData = this.getData();
    var isDataAnObject = _isObject(data);

    if (isDataAnObject === false) {
        console.warn('The parameter should be an Object');
        return;
    }

    // Make sure that the new data is different from the old one
    if (JSON.stringify(oldData) === JSON.stringify(data)) {
        return;
    }

    this._data = data;

    // Initialize ControlTree on first rendering
    // If it is a second rendering, render only the tree elements
    if (this._isFirstRendering === undefined) {
        this.init();
        this._isFirstRendering = true;
    } else {
        this._createTree();
    }

    return this;
};

/**
 * Returns the selected <li> element of the tree.
 * @returns {Element} HTML DOM element
 */
ControlTree.prototype.getSelectedElement = function () {
    return this._selectedElement;
};

/**
 * Set the selected <li> element of the tree.
 * @param {string} elementID - HTML DOM element id
 * @returns {ControlTree}
 */
ControlTree.prototype.setSelectedElement = function (elementID) {
    var selectedElement;

    if (typeof elementID !== 'string') {
        console.warn('Please use a valid string parameter');
        return;
    }

    selectedElement = this._controlTreeContainer.querySelector(`[id="${elementID}"]`);

    if (selectedElement === null) {
        console.warn('The selected element is not a child of the ControlTree');
        return;
    }

    this._selectedElement = selectedElement;
    this._selectTreeElement(selectedElement);

    return this;
};

/**
 * Create and places the ControlTree HTML.
 * @private
 */
ControlTree.prototype._createHTML = function () {
    var html;

    html = this._createFilter();
    html += this._createTreeContainer();

    this._controlTreeContainer.innerHTML = html;
    // Save reverences for future use
    this._setReferences();

    if (this.getData() !== undefined) {
        this._createTree();
    }
};

/**
 * Sets initial focus.
 * @private
 */
ControlTree.prototype._initFocus = function () {
    var searchInput = document.querySelector('input[type="search"]');
    searchInput && searchInput.focus();
};

/**
 * Create the HTML needed for filtering.
 * @returns {string}
 * @private
 */
ControlTree.prototype._createFilter = function () {
    return '<filter>' +
        '<start>' +
        '<input type="search" placeholder="Search" search/>' +
        '<label><input type="checkbox" filter />Filter results <results>(0)</results></label>' +
        '</start>' +
        '<end>' +
        '<label><input type="checkbox" namespaces checked/>Show Namespace</label>' +
        '<label><input type="checkbox" attributes checked/>Show Attributes</label>' +
        '</end>' +
        '</filter>';
};

/**
 * Create the HTML container for the tree.
 * @returns {string}
 * @private
 */
ControlTree.prototype._createTreeContainer = function () {
    return '<tree show-namespaces show-attributes></tree>';
};

/**
 * Create ControlTree HTML.
 */
ControlTree.prototype._createTree = function () {
    var versionInfo = this.getData().versionInfo;
    var controls = this.getData().controls;

    this._treeContainer.innerHTML = _createTreeHeader(versionInfo) + this._createTreeHTML(controls);
};

/**
 * Create HTML tree from JSON.
 * @param {ControlTreeOptions.controls} controls
 * @param {number} level - nested level
 * @returns {string} HTML ControlTree in form of a string
 * @private
 */
ControlTree.prototype._createTreeHTML = function (controls, level) {
    if (controls === undefined || controls.length === 0) {
        return '';
    }

    var html = '';
    var nestedLevel = level || 0;
    var paddingLeft = ++nestedLevel * 10;
    var that = this;

    controls.forEach(function (control) {
        html += _startControlTreeList({
            attributes: ['expanded="true"']
        });

        html += _startControlTreeListItem({
            id: control.id
        });

        html += _getControlTreeLeftColumnOfListItem(control, paddingLeft);

        html += _getControlTreeRightColumnOfListItem(control);

        html += _endControlTreeListItem();

        html += that._createTreeHTML(control.content, nestedLevel);

        html += _endControlTreeList();
    });

    return html;
};

/**
 * Hide/Show nested "<ul>" in "<li>" elements.
 * @param {Element} target - DOM element
 * @private
 */
ControlTree.prototype._toggleCollapse = function (target) {
    var targetParent = _findNearestDOMParent(target.parentNode, 'UL');

    if (target.getAttribute('right') === 'true') {
        target.removeAttribute('right');
        target.setAttribute('down', 'true');

        targetParent.setAttribute('expanded', 'true');
    } else if (target.getAttribute('down') === 'true') {
        target.removeAttribute('down');

        targetParent.removeAttribute('expanded');
        target.setAttribute('right', 'true');
    }
};

/**
 * Add visual selection to clicked "<li>" elements.
 * @param {Element} targetElement - DOM element
 * @private
 */
ControlTree.prototype._selectTreeElement = function (targetElement) {
    var selectedList = this._controlTreeContainer.querySelector('[selected]');
    var target = _findNearestDOMParent(targetElement, 'LI');

    // Prevent tree element selection for allowing proper multiple tree element selection for copy/paste
    if (target.id === this._controlTreeContainer.id) {
        return;
    }

    if (selectedList) {
        selectedList.removeAttribute('selected');
    }

    target.setAttribute('selected', 'true');

    this._scrollToElement(target);
    this.onSelectionChanged(target.id);
};

/**
 * Scroll to element in the ControlTree.
 * @param {Element} target - DOM element to which need to be scrolled
 */
ControlTree.prototype._scrollToElement = function (target) {
    // Guard against null elements or missing layout properties (e.g., in test environments)
    if (!target || !this._treeContainer || this._treeContainer.offsetHeight === undefined) {
        return;
    }

    var desiredViewBottomPosition = this._treeContainer.offsetHeight - this._treeContainer.offsetTop + this._treeContainer.scrollTop;

    if (target.offsetTop > desiredViewBottomPosition || target.offsetTop < this._treeContainer.scrollTop) {
        this._treeContainer.scrollTop = target.offsetTop - window.innerHeight / 6;
    }
};

/**
 * Search tree elements that match given criteria.
 * @param {string} userInput - Search criteria
 * @private
 */
ControlTree.prototype._searchInTree = function (userInput) {
    var searchableElements = this._controlTreeContainer.querySelectorAll('[data-search]');
    var searchInput = userInput.toLocaleLowerCase();
    var elementInformation;

    for (var i = 0; i < searchableElements.length; i++) {
        elementInformation = searchableElements[i].getAttribute('data-search').toLocaleLowerCase();

        if (elementInformation.indexOf(searchInput) !== -1) {
            searchableElements[i].parentNode.setAttribute('matching', true);
        } else {
            searchableElements[i].parentNode.removeAttribute('matching');
        }
    }
};

/**
 * Remove  "matching" attribute from the search.
 * @private
 */
ControlTree.prototype._removeAttributesFromSearch = function () {
    var elements = this._treeContainer.querySelectorAll('[matching]');

    for (var i = 0; i < elements.length; i++) {
        elements[i].removeAttribute('matching');
    }
};

/**
 * Visualize the number of elements which satisfy the search.
 * @private
 */
ControlTree.prototype._setSearchResultCount = function (count) {
    this._filterContainer.querySelector('results').innerHTML = '(' + count + ')';
};

/**
 * Event handler for mouse click on a tree element arrow.
 * @param {Object} event - click event
 * @private
 */
ControlTree.prototype._onArrowClick = function (event) {
    var target = event.target;

    if (target.nodeName === 'ARROW') {
        this._toggleCollapse(target);
    } else {
        this._selectTreeElement(target);
    }
};

/**
 * Event handler for user input in "search" input.
 * @param {Object} event - keyup event
 * @private
 */
ControlTree.prototype._onSearchInput = function (event) {
    var target = event.target;
    var searchResultCount;

    if (target.getAttribute('search') !== null) {

        if (target.value.length !== 0) {
            this._searchInTree(target.value);
        } else {
            this._removeAttributesFromSearch('matching');
        }

        searchResultCount = this._treeContainer.querySelectorAll('[matching]').length;
        this._setSearchResultCount(searchResultCount);
    }
};

/**
 * Event handler for onsearch event.
 * @param {Object} event - onsearch event
 * @private
 */
ControlTree.prototype._onSearchEvent = function (event) {
    var searchResultCount;

    if (event.target.value.length === 0) {
        this._removeAttributesFromSearch('matching');

        searchResultCount = this._treeContainer.querySelectorAll('[matching]').length;
        this._setSearchResultCount(searchResultCount);
    }

};

/**
 * Event handler for ControlTree options change.
 * @param {Object} event - click event
 * @private
 */
ControlTree.prototype._onOptionsChange = function (event) {
    var target = event.target;

    if (target.getAttribute('filter') !== null) {
        if (target.checked) {
            this._treeContainer.setAttribute('show-filtered-elements', true);
        } else {
            this._treeContainer.removeAttribute('show-filtered-elements');
        }
    }

    if (target.getAttribute('namespaces') !== null) {
        if (target.checked) {
            this._treeContainer.setAttribute('show-namespaces', true);
        } else {
            this._treeContainer.removeAttribute('show-namespaces');
        }
    }

    if (target.getAttribute('attributes') !== null) {
        if (target.checked) {
            this._treeContainer.setAttribute('show-attributes', true);
        } else {
            this._treeContainer.removeAttribute('show-attributes');
        }
    }

};

/**
 * Event handler for mouse hover on tree element.
 * @param {Object} event - mouse event
 * @private
 */
ControlTree.prototype._onTreeElementMouseHover = function (event) {
    var target = _findNearestDOMParent(event.target, 'LI');
    this.onHoverChanged(target.id);
};

/**
 * Create all event handlers for the ControlTree.
 * @private
 */
ControlTree.prototype._createHandlers = function () {
    this._treeContainer.onclick = this._onArrowClick.bind(this);
    this._filterContainer.onkeyup = this._onSearchInput.bind(this);
    this._filterContainer.onsearch = this._onSearchEvent.bind(this);
    this._filterContainer.onchange = this._onOptionsChange.bind(this);
    this._controlTreeContainer.onmouseover = this._onTreeElementMouseHover.bind(this);
};

/**
 * Save references to ControlTree different sections.
 * @private
 */
ControlTree.prototype._setReferences = function () {
    this._filterContainer = this._controlTreeContainer.querySelector(':scope > filter');
    this._treeContainer = this._controlTreeContainer.querySelector(':scope > tree');
};

module.exports = ControlTree;
