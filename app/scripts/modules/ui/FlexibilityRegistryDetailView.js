'use strict';

/**
 * @param {string} containerId - id of the DOM container
 * @constructor
 */
function FlexibilityRegistryDetailView(containerId) {
    this.oContainer = document.getElementById(containerId);
    this.oEditorDOM = document.createElement('div');
    this.oEditorDOM.id = 'flexibility-editor';
    this.oContainer.appendChild(this.oEditorDOM);

    this.oEditor = ace.edit('flexibility-editor');
    this.oEditor.getSession().setUseWrapMode(true);
    this.oEditor.getSession().setTabSize(2);
    this.oEditor.getSession().setMode('ace/mode/json');

    this._setTheme();
}

/**
 * Updates data.
 * @param {Object} data - object structure as JSON
 */
FlexibilityRegistryDetailView.prototype.update = function (data) {
    const oEditor = this.oEditor;
    const oData = data;
    const oDataJSON = JSON.stringify(oData, null, '\t');

    oEditor.setValue(oDataJSON);
};

/**
 * Clears editor.
 */
FlexibilityRegistryDetailView.prototype.clear = function () {
    this.oEditor.setValue('', -1);
};

/**
 * Sets theme.
 */
FlexibilityRegistryDetailView.prototype._setTheme = function () {
    const bDarkMode = chrome.devtools.panels.themeName === 'dark';

    this.oEditor.setTheme(bDarkMode ? 'ace/theme/vibrant_ink' : 'ace/theme/chrome');
};

module.exports = FlexibilityRegistryDetailView;
