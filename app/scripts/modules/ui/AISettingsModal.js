'use strict';

/**
 * Modal for picking a provider and entering its config. Dependencies are injected — the modal
 * does not touch storage or the controller directly. The caller supplies:
 *
 * - `providers` — the registry `{name: {displayName, configSchema}}`.
 * - `initialProviderName` — dropdown preselection.
 * - `initialConfigByProvider` — `{[name]: config}`; the form pre-fills from the entry matching the
 *   currently selected dropdown value.
 * - `onSave(name, config)` — invoked when the user clicks Save. Modal closes after the callback.
 * - `onCancel()` — invoked on Cancel, Escape, or backdrop click.
 *
 * @param {Object} options
 * @constructor
 */
function AISettingsModal(options) {
    this._host = options.host || document.body;
    this._providers = options.providers || {};
    this._selectedName = options.initialProviderName;
    this._configByProvider = options.initialConfigByProvider || {};
    this._onSave = options.onSave || function () {};
    this._onCancel = options.onCancel || function () {};

    this._root = null;
    this._keydownHandler = null;
    this._previousFocus = null;
}

AISettingsModal.prototype.open = function () {
    if (this._root) {
        return;
    }
    this._previousFocus = document.activeElement;

    this._root = document.createElement('div');
    this._root.className = 'ai-settings-modal-root';
    this._root.innerHTML = this._template();
    this._host.appendChild(this._root);

    this._attachHandlers();
    this._renderFieldsForSelected();

    const dialog = this._root.querySelector('.ai-settings-modal');
    const firstFocusable = dialog.querySelector('select, input, button');
    if (firstFocusable) {
        firstFocusable.focus();
    }
};

AISettingsModal.prototype.close = function () {
    if (!this._root) {
        return;
    }
    if (this._keydownHandler) {
        document.removeEventListener('keydown', this._keydownHandler, true);
        this._keydownHandler = null;
    }
    if (this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
        this._previousFocus.focus();
    }
    this._previousFocus = null;
};

AISettingsModal.prototype._template = function () {
    const options = Object.keys(this._providers).map((name) => {
        const selected = name === this._selectedName ? ' selected' : '';
        return '<option value="' + this._escape(name) + '"' + selected + '>' +
            this._escape(this._providers[name].displayName) + '</option>';
    }).join('');

    return '' +
        '<div class="ai-settings-backdrop"></div>' +
        '<div class="ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">' +
            '<div class="ai-settings-title" id="ai-settings-title">AI Assistant Settings</div>' +
            '<div class="ai-settings-body">' +
                '<div class="ai-settings-provider-row">' +
                    '<label for="ai-settings-provider-select">Provider</label>' +
                    '<select class="ai-settings-provider-select" id="ai-settings-provider-select">' + options + '</select>' +
                '</div>' +
                '<div class="ai-settings-fields"></div>' +
            '</div>' +
            '<div class="ai-settings-buttons">' +
                '<button class="ai-settings-cancel" type="button">Cancel</button>' +
                '<button class="ai-settings-save" type="button">Save</button>' +
            '</div>' +
        '</div>';
};

AISettingsModal.prototype._attachHandlers = function () {
    const backdrop = this._root.querySelector('.ai-settings-backdrop');
    backdrop.addEventListener('click', () => { this._cancel(); });

    const cancelBtn = this._root.querySelector('.ai-settings-cancel');
    cancelBtn.addEventListener('click', () => { this._cancel(); });

    const saveBtn = this._root.querySelector('.ai-settings-save');
    saveBtn.addEventListener('click', () => { this._save(); });

    const select = this._root.querySelector('.ai-settings-provider-select');
    select.addEventListener('change', () => {
        this._selectedName = select.value;
        this._renderFieldsForSelected();
    });

    this._keydownHandler = (e) => {
        if (e.key === 'Escape' && this._root) {
            e.preventDefault();
            e.stopPropagation();
            this._cancel();
        } else if (e.key === 'Tab' && this._root) {
            this._trapTab(e);
        }
    };
    document.addEventListener('keydown', this._keydownHandler, true);
};

AISettingsModal.prototype._trapTab = function (e) {
    const all = this._root.querySelectorAll(
        'select, input, button, [tabindex]:not([tabindex="-1"])'
    );
    const focusables = Array.prototype.filter.call(all, function (el) {
        return !el.disabled;
    });
    if (focusables.length === 0) {
        return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
    }
};

AISettingsModal.prototype._renderFieldsForSelected = function () {
    const container = this._root.querySelector('.ai-settings-fields');
    container.innerHTML = '';

    const schema = (this._providers[this._selectedName] || {}).configSchema || [];
    const config = this._configByProvider[this._selectedName] || {};

    schema.forEach((entry) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-settings-field';

        const label = document.createElement('label');
        const inputId = 'ai-settings-input-' + entry.key;
        label.setAttribute('for', inputId);
        label.textContent = entry.label;

        const input = document.createElement('input');
        input.id = inputId;
        input.type = entry.type === 'password' ? 'password' : 'text';
        input.dataset.key = entry.key;
        input.dataset.required = entry.required ? 'true' : 'false';
        if (entry.placeholder) {
            input.placeholder = entry.placeholder;
        }
        if (config[entry.key] !== undefined && config[entry.key] !== null) {
            input.value = config[entry.key];
        }

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
};

AISettingsModal.prototype._collectFormConfig = function () {
    const config = {};
    const inputs = this._root.querySelectorAll('.ai-settings-fields input');
    Array.prototype.forEach.call(inputs, (input) => {
        config[input.dataset.key] = input.value;
    });
    return config;
};

AISettingsModal.prototype._save = function () {
    const name = this._selectedName;
    const config = this._collectFormConfig();
    this._onSave(name, config);
    this.close();
};

AISettingsModal.prototype._cancel = function () {
    this._onCancel();
    this.close();
};

AISettingsModal.prototype._escape = function (text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

module.exports = AISettingsModal;
