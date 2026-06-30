/* globals ResizeObserver */

'use strict';

const DataGrid = require('./datagrid/DataGrid.js');
const UIUtils = require('./datagrid/UIUtils.js');

const COLUMNS = [{
    id: 'type',
    title: 'TYPE',
    sortable: true,
    align: undefined,
    nonSelectable: false,
    weight: 30,
    visible: true,
    allowInSortByEvenWhenHidden: false,
    disclosure: true,
    /**
     * Sorts Items.
     * @param {Object} a
     * @param {Object} b
     */
    sortingFunction: function (a, b) {
        return DataGrid.SortableDataGrid.StringComparator('type', a, b);
    }
},
    {
        id: 'id',
        title: 'ID',
        sortable: true,
        align: undefined,
        nonSelectable: false,
        weight: 20,
        visible: true,
        allowInSortByEvenWhenHidden: false,
        /**
         * Sorts Items.
         * @param {Object} a
         * @param {Object} b
         */
        sortingFunction: function (a, b) {
            return DataGrid.SortableDataGrid.StringComparator('id', a, b);
        }
    },
    {
        id: 'parentId',
        title: 'parentId',
        sortable: true,
        align: undefined,
        nonSelectable: false,
        weight: 20,
        visible: true,
        allowInSortByEvenWhenHidden: false,
        /**
         * Sorts Items.
         * @param {Object} a
         * @param {Object} b
         */
        sortingFunction: function (a, b) {
            return DataGrid.SortableDataGrid.StringComparator('parentId', a, b);
        }
    },
    {
        id: 'aggregation',
        title: 'aggregation',
        sortable: true,
        align: undefined,
        nonSelectable: false,
        weight: 10,
        visible: true,
        allowInSortByEvenWhenHidden: false,
        /**
         * Sorts Items.
         * @param {Object} a
         * @param {Object} b
         */
        sortingFunction: function (a, b) {
            return DataGrid.SortableDataGrid.StringComparator('aggregation', a, b);
        }
    },
    {
        id: 'isRendered',
        title: 'rendered',
        sortable: true,
        align: undefined,
        nonSelectable: false,
        weight: 10,
        visible: true,
        allowInSortByEvenWhenHidden: false,
        /**
         * Sorts Items.
         * @param {Object} a
         * @param {Object} b
         */
        sortingFunction: function (a, b) {
            return DataGrid.SortableDataGrid.NumericComparator('isRendered', a, b);
        }
    },
    {
        id: 'isControl',
        title: 'control',
        sortable: true,
        align: undefined,
        nonSelectable: false,
        weight: 10,
        visible: true,
        allowInSortByEvenWhenHidden: false,
        /**
         * Sorts Items.
         * @param {Object} a
         * @param {Object} b
         */
        sortingFunction: function (a, b) {
            return DataGrid.SortableDataGrid.NumericComparator('isControl', a, b);
        }
    }];

/**
 * @param {string} domId - id of the DOM container
 * @param {Object} options - initial configuration
 * @constructor
 */
function OElementsRegistryMasterView(domId, options) {

    this.oContainerDOM = document.getElementById(domId);
    this.sNotSupportedMessage = '<h1>Current version of OpenUI5/SAPUI5 doesn\'t support element registry</h1>';
    this.XMLDetailView = options.XMLDetailView;
    this.ControllerDetailView = options.ControllerDetailView;

    /**
     * Selects an element.
     * @param {Object} oSelectedData
     */
    this.onSelectItem = function (oSelectedData) {};
    if (options) {
        this.onSelectItem = options.onSelectItem || this.onSelectItem;
        this.onRefreshButtonClicked = options.onRefreshButtonClicked || function () {};
    }

    /**
     * Fires when the hovered element in the DataGrid changes.
     * @param {string} sElementId
     */
    this.onHoverChanged = (options && options.onHoverChanged) || function (sElementId) {};

    /**
     * Fires when hover highlight should be hidden.
     */
    this.onHoverHide = (options && options.onHoverHide) || function () {};

    this.oContainerDOM.appendChild(this._createContent());
    this.oContainerDOM.appendChild(this._createMessage());

    this._setReferences();
    this._createHandlers();
}

/**
 *
 * @returns {HTMLElement} - Container holding the content
 */
OElementsRegistryMasterView.prototype._createContent = function () {
    const oContainer = document.createElement('div');
    oContainer.setAttribute('id', 'elementsRegistryContent');

    oContainer.appendChild(this._createRefreshButton());
    oContainer.innerHTML += this._createFilter();

    this.oDataGrid = this._createDataGrid();
    oContainer.appendChild(this.oDataGrid.element);

    return oContainer;
};

/**
 *
 * @returns {HTMLElement} - Container/placeholder for the ('not supported') message
 */
OElementsRegistryMasterView.prototype._createMessage = function () {
    const oContainer = document.createElement('div');
    oContainer.setAttribute('id', 'elementsRegistryMessage');
    oContainer.style.display = 'none';

    return oContainer;
};

/**
 * Hides the content and displays a message
 * @param {String} sMessage html of the message to be displayed
 */
OElementsRegistryMasterView.prototype._showMessage = function (sMessage) {
    if (this._oMessageContainer && this._oContentContainer) {
        this._oMessageContainer.innerHTML = sMessage;
        this._oContentContainer.style.display = 'none';
        this._oMessageContainer.style.display = 'block';
    }
};

/**
 * Show the content and hides the message
 */
OElementsRegistryMasterView.prototype._showContent = function () {
    if (this._oMessageContainer && this._oContentContainer) {
        this._oMessageContainer.style.display = 'none';
        this._oContentContainer.style.display = 'flex';
    }
};

/**
 * Creates Refresh button.
 * @returns {Object} - Refresh button Icon
 * @private
 */
OElementsRegistryMasterView.prototype._createRefreshButton = function () {
    const oIcon = UIUtils.Icon.create('', 'toolbar-glyph hidden');
    oIcon.setIconType('largeicon-refresh');

    return oIcon;
};

/**
 * Create the HTML needed for filtering.
 * @returns {string}
 * @private
 */
OElementsRegistryMasterView.prototype._createFilter = function () {
    return '<filter>' +
        '<start>' +
        '<input id="elementsRegistrySearch" type="search" placeholder="Search" search/>' +
        '<label><input id="elementsRegistryCheckbox" type="checkbox" filter />Filter results <results id="elementsRegistryResults"></label>' +
        '</start>';
};

/**
 * Create all event handlers for the Search filter.
 * @private
 */
OElementsRegistryMasterView.prototype._createHandlers = function () {
    this._oFilterContainer.onkeyup = this._onSearchInput.bind(this);
    this._oFilterContainer.onsearch = this._onSearchEvent.bind(this);
    this._oFilterCheckBox.onchange = this._onOptionsChange.bind(this);
    this._oRefreshButton.onclick = this._onRefresh.bind(this);
    this.oDataGrid.element.onmouseover = this._onDataGridMouseOver.bind(this);
    this.oDataGrid.element.onmouseleave = this._onDataGridMouseLeave.bind(this);
};

/**
 * Save references of the Search filter elements and refresh button.
 * @private
 */
OElementsRegistryMasterView.prototype._setReferences = function () {
    this._oContentContainer = this.oContainerDOM.querySelector('#elementsRegistryContent');
    this._oMessageContainer = this.oContainerDOM.querySelector('#elementsRegistryMessage');
    this._oFilterContainer = this.oContainerDOM.querySelector('#elementsRegistrySearch');
    this._oFilterCheckBox = this.oContainerDOM.querySelector('#elementsRegistryCheckbox');
    this._oFilterResults = this.oContainerDOM.querySelector('#elementsRegistryResults');
    this._oRefreshButton = this.oContainerDOM.querySelector('.largeicon-refresh');
};

/**
 * Event handler for user input in "search" input.
 * @param {Object} event - keyup event
 * @private
 */
OElementsRegistryMasterView.prototype._onSearchInput = function (event) {
    const target = event.target;

    if (target.getAttribute('search') !== null) {
        if (target.value.length !== 0) {
            this._searchElements(target.value);

            if (this._oFilterCheckBox.checked) {
                this._filterResults();
            }
        } else {
            this._removeAttributesFromSearch('matching');
        }
    }
};

/**
 * Event handler for Refresh icon clicked.
 * @private
 */
OElementsRegistryMasterView.prototype._onRefresh = function () {
    this.oDataGrid.rootNode().removeChildren();
    this._data = [];
    this.onRefreshButtonClicked();

    this._oFilterCheckBox.checked = false;
    this.oContainerDOM.removeAttribute('show-filtered-elements');
};

/**
 * Event handler for onsearch event.
 * @param {Object} event - onsearch event
 * @private
 */
OElementsRegistryMasterView.prototype._onSearchEvent = function (event) {
    if (event.target.value.length === 0) {
        this._removeAttributesFromSearch('matching');

        this._oFilterResults.innerHTML = '(0)';
    }
};

/**
 * Event handler for options change of Search filter.
 * @param {Object} event - click event
 * @private
 */
OElementsRegistryMasterView.prototype._onOptionsChange = function (event) {
    const target = event.target;

    this._oSelectedNode = this.oDataGrid.selectedNode || this._oSelectedNode;

    if (target.getAttribute('filter') !== null) {
        if (target.checked) {
            this.oContainerDOM.setAttribute('show-filtered-elements', true);
        } else {
            this.oContainerDOM.removeAttribute('show-filtered-elements');
        }
    }

    this._filterResults();
};

/**
 * Filters results.
 * @private
 */
OElementsRegistryMasterView.prototype._filterResults = function () {
    const sSearchInput = this._oFilterContainer.value.toLocaleLowerCase();
    const bChecked = this._oFilterCheckBox.checked;
    let sSelectedNodeId;
    let sId;
    let sType;

    sSelectedNodeId = this._oSelectedNode && this._oSelectedNode._data.id.toLocaleLowerCase();
    this.oDataGrid.rootNode().removeChildren();

    if (sSearchInput !== '' && bChecked) {
        this.getData().forEach(function (oElement) {
            sId = oElement.id.toLocaleLowerCase();
            sType = oElement.type.toLocaleLowerCase();

            if ((sId.indexOf(sSearchInput) !== -1 || sType.indexOf(sSearchInput) !== -1)) {
                this._createNode(oElement, sSelectedNodeId);
            }
        }, this);
    } else {
        this.getData().forEach(function (oElement) {
            this._createNode(oElement, sSelectedNodeId);
        }, this);
    }
};

/**
 * Creates table Node.
 * @param {Object} oElement
 * @param {string} sSelectedNodeId - Already selected NodeId
 * @private
 */
OElementsRegistryMasterView.prototype._createNode = function (oElement, sSelectedNodeId) {
    const oNode = new DataGrid.SortableDataGridNode(oElement);

    if (oNode) {
        this.oDataGrid.insertChild(oNode);

        if (sSelectedNodeId === oElement.id.toLocaleLowerCase()) {
            oNode.select();
        }
    }
};

/**
 * Search elements that match given criteria.
 * @param {string} sUserInput - Search criteria
 * @private
 */
OElementsRegistryMasterView.prototype._searchElements = function (sUserInput) {
    const aSearchableElements = this.oDataGrid._visibleNodes;
    const sSearchInput = sUserInput.toLocaleLowerCase();
    let sId;
    let sType;

    aSearchableElements.forEach(function (oElement) {
        sId = oElement._data.id.toLocaleLowerCase(),
        sType = oElement._data.type.toLocaleLowerCase();

        if ((sId.indexOf(sSearchInput) !== -1 || sType.indexOf(sSearchInput) !== -1) && sSearchInput !== '') {
            oElement._element.classList.add('matching');
        } else {
            oElement._element.classList.remove('matching');
        }
    });

    this._setResultsCount(sSearchInput);
};

/**
 * Sets search results count.
 * @param {string} sSearchInput - Search criteria
 * @private
 */
OElementsRegistryMasterView.prototype._setResultsCount = function (sSearchInput) {
    let iCount;

    if (sSearchInput === '') {
        iCount = 0;
    } else {
        iCount = this.getData().filter(function (oElement) {
            const sId = oElement.id.toLocaleLowerCase();
            const sType = oElement.type.toLocaleLowerCase();

            if ((sId.indexOf(sSearchInput) !== -1 || sType.indexOf(sSearchInput) !== -1)) {
                return oElement;
            }
        }).length;
    }

    this._oFilterResults.innerHTML = '(' + iCount + ')';
};

/**
 * Remove  "matching" attribute from the search.
 * @private
 */
OElementsRegistryMasterView.prototype._removeAttributesFromSearch = function () {
    const aElements = this.oContainerDOM.querySelectorAll('.matching');

    aElements.forEach(function (oElement) {
        oElement.classList.remove('matching');
    });
};

/**
 * Event handler when elements table is scrolled up/down.
 * @private
 */
OElementsRegistryMasterView.prototype._onViewPortCalculated = function () {
    const sSearchInput = this._oFilterContainer.value;

    this._searchElements(sSearchInput);
};

/**
 * Returns data.
 * @returns {Array} data - elements registry data
 * @private
 */
OElementsRegistryMasterView.prototype.getData = function () {
    return this._data;
};

/**
 * Sets all registered elements.
 * @param {Array} data - Array with all registered elements
 * @returns {ElementTable}
 */
OElementsRegistryMasterView.prototype.setData = function (data) {
    const oldData = this.getData();
    let aData = data.aRegisteredElements;
    let oNode;

    if (!data.isSupported) {
        this._showMessage(this.sNotSupportedMessage);
        return;
    } else {
        this._showContent();
    }

    if (JSON.stringify(oldData) === JSON.stringify(aData)) {
        return;
    }

    this._data = aData;

    this.oDataGrid.rootNode().removeChildren();

    this._data.forEach(function (oElement) {
        oNode = new DataGrid.SortableDataGridNode(oElement);

        if (oNode) {
            this.oDataGrid.insertChild(oNode);
        }
    }, this);

    return this;
};

/**
 * Creates DataGrid.
 * @returns {Object} - DataGrid
 * @private
 */
OElementsRegistryMasterView.prototype._createDataGrid = function () {
    const oDataGrid = new DataGrid.SortableDataGrid({
        displayName: 'test',
        columns: COLUMNS
    });

    oDataGrid.addEventListener(DataGrid.Events.SortingChanged, this.sortHandler, this);
    oDataGrid.addEventListener(DataGrid.Events.SelectedNode, this.selectHandler, this);
    oDataGrid.addEventListener(DataGrid.Events.ViewportCalculated, this._onViewPortCalculated, this);

    /**
     * Resize Handler for DataGrid.
     */
    const oResizeObserver = new ResizeObserver(function (oEntries) {
        oDataGrid.onResize();
    });
    oResizeObserver.observe(oDataGrid.element);

    return oDataGrid;
};

/**
 * Sorts Columns of the DataGrid.
 */
OElementsRegistryMasterView.prototype.sortHandler = function () {
    const columnId = this.oDataGrid.sortColumnId();
    /**
     * Finds Column config by Id.
     * @param {Object} columnConfig
     */
    const columnConfig = COLUMNS.find(columnConfig => columnConfig.id === columnId);
    if (!columnConfig || !columnConfig.sortingFunction) {
        return;
    }
    this.oDataGrid.sortNodes(columnConfig.sortingFunction, !this.oDataGrid.isSortOrderAscending());
};

/**
 * Selects clicked Control.
 * @param {Object} oEvent
 */
OElementsRegistryMasterView.prototype.selectHandler = function (oEvent) {
    this.onSelectItem(oEvent.data._data.id);
    this.XMLDetailView.update(oEvent.data._data);
    this.ControllerDetailView.update(oEvent.data._data.controllerInfo);
    this._sSelectedItem = oEvent.data._data.id;
};

/**
 * Event handler for mouseover on the DataGrid element.
 * Walks up the DOM to find the nearest row with a _dataGridNode and calls onHoverChanged with its element id.
 * @param {MouseEvent} event
 * @private
 */
OElementsRegistryMasterView.prototype._onDataGridMouseOver = function (event) {
    let target = event.target;

    while (target && target !== this.oDataGrid.element && !target._dataGridNode) {
        target = target.parentElement;
    }

    if (target && target._dataGridNode && target._dataGridNode._data && target._dataGridNode._data.id) {
        this.onHoverChanged(target._dataGridNode._data.id);
    }
};

/**
 * Event handler for mouseleave on the DataGrid element.
 * Hides the page highlight when the mouse exits the table.
 * @private
 */
OElementsRegistryMasterView.prototype._onDataGridMouseLeave = function () {
    this.onHoverHide();
};

module.exports = OElementsRegistryMasterView;
