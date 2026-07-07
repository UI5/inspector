'use strict';

const AISettingsModal = require('../../../app/scripts/modules/ui/AISettingsModal.js');

const FAKE_PROVIDERS = {
    'gemini-nano': {
        displayName: 'Gemini Nano (on-device)',
        configSchema: []
    },
    'openai': {
        displayName: 'OpenAI-compatible',
        configSchema: [
            { key: 'baseUrl', label: 'Base URL', type: 'text', required: true },
            { key: 'apiKey', label: 'API Key', type: 'password', required: true },
            { key: 'model', label: 'Model', type: 'text', required: true }
        ]
    }
};

describe('AISettingsModal', function () {
    const fixtures = document.getElementById('fixtures');
    let modal;
    let savedPayload;
    let cancelledCount;

    beforeEach(function () {
        fixtures.innerHTML = '';
        savedPayload = null;
        cancelledCount = 0;
    });

    afterEach(function () {
        if (modal) {
            modal.close();
            modal = null;
        }
        fixtures.innerHTML = '';
    });

    function build(overrides) {
        const options = Object.assign({
            host: fixtures,
            providers: FAKE_PROVIDERS,
            initialProviderName: 'gemini-nano',
            initialConfigByProvider: {},
            onSave: function (name, config) { savedPayload = { name: name, config: config }; },
            onCancel: function () { cancelledCount++; }
        }, overrides || {});
        modal = new AISettingsModal(options);
        modal.open();
    }

    describe('Rendering', function () {
        it('should render a modal with role=dialog and aria-modal=true', function () {
            build();
            const dialog = fixtures.querySelector('.ai-settings-modal');
            dialog.should.exist;
            dialog.getAttribute('role').should.equal('dialog');
            dialog.getAttribute('aria-modal').should.equal('true');
        });

        it('should render a provider dropdown listing all registered providers by display name', function () {
            build();
            const select = fixtures.querySelector('.ai-settings-provider-select');
            select.should.exist;
            const options = Array.prototype.slice.call(select.querySelectorAll('option'));
            options.length.should.equal(2);
            options[0].value.should.equal('gemini-nano');
            options[0].textContent.should.equal('Gemini Nano (on-device)');
            options[1].value.should.equal('openai');
            options[1].textContent.should.equal('OpenAI-compatible');
        });

        it('should preselect the dropdown to the initial provider name', function () {
            build({ initialProviderName: 'openai' });
            const select = fixtures.querySelector('.ai-settings-provider-select');
            select.value.should.equal('openai');
        });

        it('should render one form field per configSchema entry for the selected provider', function () {
            build({ initialProviderName: 'openai' });
            const fields = fixtures.querySelectorAll('.ai-settings-field');
            fields.length.should.equal(3);
            const labels = Array.prototype.map.call(fields, function (f) {
                return f.querySelector('label').textContent;
            });
            labels.should.include('Base URL');
            labels.should.include('API Key');
            labels.should.include('Model');
        });

        [
            { type: 'password', expected: 'password' },
            { type: 'text', expected: 'text' },
            { type: undefined, expected: 'text' }
        ].forEach(function (row) {
            it('should render input[type=' + row.expected + '] when the schema entry type is ' + row.type, function () {
                const providers = {
                    p: {
                        displayName: 'P',
                        configSchema: [{ key: 'k', label: 'K', type: row.type, required: true }]
                    }
                };
                build({ providers: providers, initialProviderName: 'p' });
                const input = fixtures.querySelector('.ai-settings-field input');
                input.getAttribute('type').should.equal(row.expected);
            });
        });

        [
            { placeholder: 'https://api.example.com', expectAttr: true },
            { placeholder: undefined, expectAttr: false }
        ].forEach(function (row) {
            it('should ' + (row.expectAttr ? 'set' : 'omit') + ' the placeholder attribute when the schema entry placeholder is ' + row.placeholder, function () {
                const entry = { key: 'k', label: 'K', type: 'text', required: true };
                if (row.placeholder !== undefined) {
                    entry.placeholder = row.placeholder;
                }
                const providers = { p: { displayName: 'P', configSchema: [entry] } };
                build({ providers: providers, initialProviderName: 'p' });
                const input = fixtures.querySelector('.ai-settings-field input');
                input.hasAttribute('placeholder').should.equal(row.expectAttr);
                if (row.expectAttr) {
                    input.getAttribute('placeholder').should.equal(row.placeholder);
                }
            });
        });
    });

    describe('Pre-fill from storage', function () {
        it('should pre-fill inputs from initialConfigByProvider for the selected provider', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: {
                    openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abc', model: 'gpt-4' }
                }
            });
            const inputs = fixtures.querySelectorAll('.ai-settings-field input');
            const byLabel = {};
            Array.prototype.forEach.call(inputs, function (input) {
                const label = input.closest('.ai-settings-field').querySelector('label').textContent;
                byLabel[label] = input.value;
            });
            byLabel['Base URL'].should.equal('https://api.openai.com/v1');
            byLabel['API Key'].should.equal('sk-abc');
            byLabel.Model.should.equal('gpt-4');
        });

        it('should re-render the form and pre-fill from stored config for the newly-selected provider when the dropdown changes', function () {
            build({
                initialProviderName: 'gemini-nano',
                initialConfigByProvider: {
                    openai: { baseUrl: 'https://x', apiKey: 'k', model: 'm' }
                }
            });

            const select = fixtures.querySelector('.ai-settings-provider-select');
            select.value = 'openai';
            select.dispatchEvent(new Event('change'));

            const fields = fixtures.querySelectorAll('.ai-settings-field');
            fields.length.should.equal(3);
            const baseUrl = Array.prototype.find.call(fields, function (f) {
                return f.querySelector('label').textContent === 'Base URL';
            }).querySelector('input');
            baseUrl.value.should.equal('https://x');
        });
    });

    describe('Save button state', function () {
        it('should enable Save even when required fields are empty, so the user can save an empty config to remove credentials — the provider surfaces the missing-config state via checkAvailability', function () {
            build({ initialProviderName: 'openai' });
            const save = fixtures.querySelector('.ai-settings-save');
            save.disabled.should.be.false;
        });

        it('should enable Save when all fields have non-empty values', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: {
                    openai: { baseUrl: 'a', apiKey: 'b', model: 'c' }
                }
            });
            const save = fixtures.querySelector('.ai-settings-save');
            save.disabled.should.be.false;
        });

        it('should enable Save immediately for a provider with an empty configSchema', function () {
            build({ initialProviderName: 'gemini-nano' });
            const save = fixtures.querySelector('.ai-settings-save');
            save.disabled.should.be.false;
        });

        it('should let the user save an empty value into a previously-filled required field, so credentials can be cleared', function () {
            const saved = [];
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: {
                    openai: { baseUrl: 'https://x', apiKey: 'secret', model: 'gpt-4' }
                },
                onSave: function (name, config) { saved.push({ name: name, config: config }); }
            });

            const inputs = fixtures.querySelectorAll('.ai-settings-field input');
            Array.prototype.forEach.call(inputs, function (input) {
                if (input.dataset.key === 'apiKey') {
                    input.value = '';
                    input.dispatchEvent(new Event('input'));
                }
            });

            const save = fixtures.querySelector('.ai-settings-save');
            save.disabled.should.be.false;
            save.click();

            saved.length.should.equal(1);
            saved[0].config.apiKey.should.equal('');
        });
    });

    describe('Save', function () {
        it('should call onSave with the selected provider name and a config object built from the form values', function () {
            build({ initialProviderName: 'openai' });
            const inputs = fixtures.querySelectorAll('.ai-settings-field input');
            Array.prototype.forEach.call(inputs, function (input) {
                const label = input.closest('.ai-settings-field').querySelector('label').textContent;
                if (label === 'Base URL') { input.value = 'https://api.example/v1'; }
                if (label === 'API Key') { input.value = 'sk-xyz'; }
                if (label === 'Model') { input.value = 'gpt-5'; }
                input.dispatchEvent(new Event('input'));
            });
            fixtures.querySelector('.ai-settings-save').click();

            savedPayload.name.should.equal('openai');
            savedPayload.config.should.deep.equal({
                baseUrl: 'https://api.example/v1',
                apiKey: 'sk-xyz',
                model: 'gpt-5'
            });
        });

        it('should close the modal after Save', function () {
            build({ initialProviderName: 'gemini-nano' });
            fixtures.querySelector('.ai-settings-save').click();
            (fixtures.querySelector('.ai-settings-modal') === null).should.be.true;
        });

        it('should not call onSave when Cancel is clicked', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: { openai: { baseUrl: 'a', apiKey: 'b', model: 'c' } }
            });
            fixtures.querySelector('.ai-settings-cancel').click();
            (savedPayload === null).should.be.true;
        });
    });

    describe('Cancel', function () {
        it('should call onCancel and close the modal', function () {
            build();
            fixtures.querySelector('.ai-settings-cancel').click();
            cancelledCount.should.equal(1);
            (fixtures.querySelector('.ai-settings-modal') === null).should.be.true;
        });

        it('should close on Escape key without persisting', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: { openai: { baseUrl: 'a', apiKey: 'b', model: 'c' } }
            });
            const evt = new window.KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(evt);
            (savedPayload === null).should.be.true;
            cancelledCount.should.equal(1);
            (fixtures.querySelector('.ai-settings-modal') === null).should.be.true;
        });

        it('should close when the backdrop is clicked', function () {
            build();
            fixtures.querySelector('.ai-settings-backdrop').click();
            cancelledCount.should.equal(1);
            (fixtures.querySelector('.ai-settings-modal') === null).should.be.true;
        });
    });

    describe('Focus management', function () {
        it('should move focus into the modal on open', function () {
            build();
            const dialog = fixtures.querySelector('.ai-settings-modal');
            dialog.contains(document.activeElement).should.be.true;
        });

        it('should trap Tab from the last focusable back to the first', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: { openai: { baseUrl: 'a', apiKey: 'b', model: 'c' } }
            });
            const focusables = fixtures.querySelectorAll(
                '.ai-settings-modal select, .ai-settings-modal input, .ai-settings-modal button'
            );
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            last.focus();

            const evt = new window.KeyboardEvent('keydown', { key: 'Tab' });
            document.dispatchEvent(evt);

            document.activeElement.should.equal(first);
        });

        it('should trap Shift+Tab from the first focusable back to the last', function () {
            build({
                initialProviderName: 'openai',
                initialConfigByProvider: { openai: { baseUrl: 'a', apiKey: 'b', model: 'c' } }
            });
            const focusables = fixtures.querySelectorAll(
                '.ai-settings-modal select, .ai-settings-modal input, .ai-settings-modal button'
            );
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            first.focus();

            const evt = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
            document.dispatchEvent(evt);

            document.activeElement.should.equal(last);
        });
    });
});
