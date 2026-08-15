/* globals ResizeObserver */

'use strict';

const DataGrid = require('./datagrid/DataGrid.js');
const UIUtils = require('./datagrid/UIUtils.js');

const COLUMNS = [{
    id: 'changeType',
    title: 'changeType',
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
        return DataGrid.SortableDataGrid.StringComparator('changeType', a, b);
    }
}, {
    id: 'selector.id',
    title: 'selector.id',
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
        return DataGrid.SortableDataGrid.StringComparator('selector.id', a, b);
    }
}, {
    id: 'selector.type',
    title: 'selector.type',
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
        return DataGrid.SortableDataGrid.StringComparator('selector.type', a, b);
    }
}, {
    id: 'content.property',
    title: 'content.property',
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
        return DataGrid.SortableDataGrid.StringComparator('content.property', a, b);
    }
}, {
    id: 'content.newValue',
    title: 'content.newValue',
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
        return DataGrid.SortableDataGrid.StringComparator('content.newValue', a, b);
    }
}];

/**
 * @param {string} domId - id of the DOM container
 * @param {Object} options - initial configuration
 * @constructor
 */
function FlexibilityRegistryMasterView(domId, options) {

    this.oContainerDOM = document.getElementById(domId);
    this._data = [];

    /**
     * Selects a flexibility entry log item.
     * @param {Object} oSelectedData
     */
    this.onSelectItem = function (oSelectedData) {};

    /**
     * Clears all flexibility entry log items.
     */
    this.onClearItems = function () {};

    /**
     * Downloads all flexibility entry log items.
     */
    this.onDownloadItems = function () {};

    if (options) {
        this.onSelectItem = options.onSelectItem || this.onSelectItem;
        this.onClearItems = options.onClearItems || this.onClearItems;
        this.onDownloadItems = options.onDownloadItems || this.onDownloadItems;
    }

    const oDownloadButton = this._createDownloadButton();
    const oClearButton = this._createClearButton();
    this.oContainerDOM.appendChild(oDownloadButton);
    this.oContainerDOM.appendChild(oClearButton);

    this.oDataGrid = this._createDataGrid();
    this.oContainerDOM.appendChild(this.oDataGrid.element);
}

/**
 * Gets the currently registered flexibility changes.
 * @returns {Array}
 */
FlexibilityRegistryMasterView.prototype.getData = function () {
    return this._data;
};

/**
 * Sets the registered flexibility changes.
 * @param {Array} data
 * @returns {Object} - the view instance
 */
FlexibilityRegistryMasterView.prototype.setData = function (data) {
    const oldData = this.getData();
    const aData = Array.isArray(data) ? data : [];

    if (JSON.stringify(oldData) === JSON.stringify(aData)) {
        return;
    }

    this._data = aData;
    this.oDataGrid.rootNode().removeChildren();

    this._data.forEach(function (oElement) {
        const oNode = new DataGrid.SortableDataGridNode(oElement);
        if (oNode) {
            this.oDataGrid.insertChild(oNode);
        }
    }, this);

    return this;
};

/**
 * Creates Clear button.
 * @returns {Object} - Clear button Icon
 * @private
 */
FlexibilityRegistryMasterView.prototype._createClearButton = function () {
    const oIcon = UIUtils.Icon.create('', 'toolbar-glyph hidden');
    oIcon.setIconType('largeicon-clear');

    /**
     * Clear Icon click handler.
     */
    oIcon.onclick = function () {
        this.oDataGrid.rootNode().removeChildren();
        this.onClearItems();
    }.bind(this);

    return oIcon;
};

/**
 * Creates Download button.
 * @returns {Object} - Download button Icon
 * @private
 */
FlexibilityRegistryMasterView.prototype._createDownloadButton = function () {
    const oIcon = UIUtils.Icon.create('', 'toolbar-glyph hidden');
    oIcon.setIconType('largeicon-download');

    /**
     * Download Icon click handler.
     */
    oIcon.onclick = function () {
        this.onDownloadItems();
    }.bind(this);

    return oIcon;
};

/**
 * Creates DataGrid.
 * @returns {Object} - DataGrid
 * @private
 */
FlexibilityRegistryMasterView.prototype._createDataGrid = function () {
    const oDataGrid = new DataGrid.SortableDataGrid({
        displayName: 'test',
        columns: COLUMNS
    });

    oDataGrid.addEventListener(DataGrid.Events.SortingChanged, this.sortHandler, this);
    oDataGrid.addEventListener(DataGrid.Events.SelectedNode, this.selectHandler, this);

    /**
     * Resize Handler for DataGrid.
     */
    const oResizeObserver = new ResizeObserver(function () {
        oDataGrid.onResize();
    });
    oResizeObserver.observe(oDataGrid.element);

    return oDataGrid;
};

/**
 * Sorts Columns of the DataGrid.
 */
FlexibilityRegistryMasterView.prototype.sortHandler = function () {
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
 * Selects clicked log entry.
 * @param {Object} oEvent
 */
FlexibilityRegistryMasterView.prototype.selectHandler = function (oEvent) {
    const oSelectedNode = oEvent.data;

    if (!oSelectedNode) {
        return;
    }

    this.onSelectItem(oSelectedNode.data);
};

module.exports = FlexibilityRegistryMasterView;
