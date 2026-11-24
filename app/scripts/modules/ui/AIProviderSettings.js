'use strict';

/**
 * Modal UI for selecting and configuring the AI provider.
 *
 * Renders a hidden overlay into an existing host element. Call `open(name, config)` to show it
 * pre-filled with the current selection; `onSave(name, config)` is invoked when the user
 * confirms.
 *
 * Form fields are generated dynamically from each provider's `configSchema`. An empty `configSchema`
 * (Gemini Nano) renders no fields beyond the picker itself.
 *
 * @param {string} hostId - ID of the container element inside `.ai-chat-wrapper`.
 * @param {Object} options
 * @param {Object} options.providers - The `PROVIDERS` map from `providers/index.js`.
 * @param {Function} options.onSave - `(providerName, providerConfig) => void` called on Save.
 * @constructor
 */
function AIProviderSettings(hostId, { providers = {}, onSave = function () {} } = {}) {
    this._host = document.getElementById(hostId);
    this._providers = providers;
    this._onSave = onSave;
    this._currentName = null;
    this._currentConfig = {};
    this._previousFocus = null;
    this._onEscape = null;
    this._render();
    this._attachListeners();
}

AIProviderSettings.prototype._render = function () {
    this._host.innerHTML = `
        <div class="ai-settings-dialog" id="ai-settings-dialog" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
            <div class="settings-overlay"></div>
            <div class="settings-content">
                <div class="settings-title" id="settings-dialog-title">AI Provider Settings</div>
                <div class="settings-body">
                    <div class="settings-field">
                        <label class="settings-label" for="ai-provider-select">Provider</label>
                        <select class="settings-select" id="ai-provider-select" aria-label="Select AI provider"></select>
                    </div>
                    <div id="ai-provider-fields"></div>
                </div>
                <div class="settings-buttons">
                    <button class="settings-button settings-cancel" id="ai-settings-cancel">Cancel</button>
                    <button class="settings-button settings-save" id="ai-settings-save">Save</button>
                </div>
            </div>
        </div>
    `;
    this._dialog = this._host.querySelector('.ai-settings-dialog');
    this._select = this._host.querySelector('#ai-provider-select');
    this._fieldsContainer = this._host.querySelector('#ai-provider-fields');
    this._saveBtn = this._host.querySelector('#ai-settings-save');
    this._cancelBtn = this._host.querySelector('#ai-settings-cancel');

    this._populateProviderSelect();
};

AIProviderSettings.prototype._populateProviderSelect = function () {
    this._select.innerHTML = '';
    Object.keys(this._providers).forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = this._providers[key].displayName;
        this._select.appendChild(option);
    });
};

/**
 * @private
 * @param {string} providerName
 * @param {Object} [prefill] - Current config values to pre-fill into the fields.
 */
AIProviderSettings.prototype._renderFields = function (providerName, prefill) {
    const entry = this._providers[providerName];
    const schema = (entry && entry.configSchema) || [];
    const values = prefill || {};

    if (schema.length === 0) {
        this._fieldsContainer.innerHTML = '';
        return;
    }

    this._fieldsContainer.innerHTML = schema.map((field) => {
        const inputType = field.type === 'password' ? 'password' : 'text';
        const value = values[field.key] !== undefined ? String(values[field.key]) : '';
        const escapedValue = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return `
            <div class="settings-field">
                <label class="settings-label" for="ai-field-${field.key}">${field.label}${field.required ? ' *' : ''}</label>
                <input
                    type="${inputType}"
                    class="settings-input"
                    id="ai-field-${field.key}"
                    data-key="${field.key}"
                    value="${escapedValue}"
                    placeholder="${field.label}"
                    aria-label="${field.label}"
                    ${field.required ? 'required' : ''}
                />
            </div>
        `;
    }).join('');
};

AIProviderSettings.prototype._collectConfig = function () {
    const config = {};
    const inputs = this._fieldsContainer.querySelectorAll('.settings-input[data-key]');
    inputs.forEach((input) => {
        config[input.dataset.key] = input.value;
    });
    return config;
};

AIProviderSettings.prototype._attachListeners = function () {
    this._select.addEventListener('change', () => {
        const newName = this._select.value;
        const prefill = newName === this._currentName ? this._currentConfig : {};
        this._renderFields(newName, prefill);
    });

    this._saveBtn.addEventListener('click', () => {
        const name = this._select.value;
        const config = this._collectConfig();
        this.close();
        this._onSave(name, config);
    });

    this._cancelBtn.addEventListener('click', () => {
        this.close();
    });

    this._dialog.querySelector('.settings-overlay').addEventListener('click', () => {
        this.close();
    });

    this._onEscape = (e) => {
        if (e.key === 'Escape' && this._dialog.style.display !== 'none') {
            this.close();
        }
    };
    document.addEventListener('keydown', this._onEscape);
};

/**
 * Open the modal pre-filled with the current provider selection and config.
 * @param {string} currentName
 * @param {Object} [currentConfig]
 */
AIProviderSettings.prototype.open = function (currentName, currentConfig) {
    this._currentName = currentName;
    this._currentConfig = currentConfig || {};

    this._select.value = currentName;
    this._renderFields(currentName, this._currentConfig);

    this._dialog.style.display = 'flex';

    this._previousFocus = document.activeElement;
    const firstInput = this._fieldsContainer.querySelector('input') || this._cancelBtn;
    if (firstInput) {
        firstInput.focus();
    }
};

AIProviderSettings.prototype.close = function () {
    this._dialog.style.display = 'none';
    if (this._previousFocus) {
        this._previousFocus.focus();
        this._previousFocus = null;
    }
};

AIProviderSettings.prototype.destroy = function () {
    if (this._onEscape) {
        document.removeEventListener('keydown', this._onEscape);
        this._onEscape = null;
    }
};

module.exports = AIProviderSettings;
