'use strict';

const AIProviderSettings = require('../../../app/scripts/modules/ui/AIProviderSettings.js');

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

describe('AIProviderSettings', function () {
    const fixtures = document.getElementById('fixtures');
    let settings;
    let savedName;
    let savedConfig;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="ai-settings-host"></div>';
        savedName = null;
        savedConfig = null;
        settings = new AIProviderSettings('ai-settings-host', {
            providers: FAKE_PROVIDERS,
            onSave: function (name, config) {
                savedName = name;
                savedConfig = config;
            }
        });
    });

    afterEach(function () {
        settings.destroy();
        fixtures.innerHTML = '';
    });

    describe('provider select', function () {
        it('should populate the select with one option per provider', function () {
            const select = document.getElementById('ai-provider-select');
            select.options.length.should.equal(2);
            select.options[0].value.should.equal('gemini-nano');
            select.options[1].value.should.equal('openai');
        });
    });

    describe('#open()', function () {
        it('should make the dialog visible', function () {
            settings.open('gemini-nano', {});
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('flex');
        });

        it('should pre-select the given provider in the dropdown', function () {
            settings.open('openai', {});
            const select = document.getElementById('ai-provider-select');
            select.value.should.equal('openai');
        });

        it('should render no fields for gemini-nano (empty configSchema)', function () {
            settings.open('gemini-nano', {});
            const fields = document.querySelectorAll('#ai-provider-fields .settings-input');
            fields.length.should.equal(0);
        });

        it('should render one field per configSchema entry for openai', function () {
            settings.open('openai', {});
            const fields = document.querySelectorAll('#ai-provider-fields .settings-input');
            fields.length.should.equal(3);
        });

        it('should pre-fill fields with the given config values', function () {
            settings.open('openai', { baseUrl: 'http://localhost:6655', apiKey: 'test-key', model: 'gpt-4o' });
            document.getElementById('ai-field-baseUrl').value.should.equal('http://localhost:6655');
            document.getElementById('ai-field-apiKey').value.should.equal('test-key');
            document.getElementById('ai-field-model').value.should.equal('gpt-4o');
        });

        it('should render the apiKey field as type="password"', function () {
            settings.open('openai', {});
            document.getElementById('ai-field-apiKey').type.should.equal('password');
        });

        it('should render text fields as type="text"', function () {
            settings.open('openai', {});
            document.getElementById('ai-field-baseUrl').type.should.equal('text');
        });
    });

    describe('#close()', function () {
        it('should hide the dialog', function () {
            settings.open('gemini-nano', {});
            settings.close();
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('none');
        });
    });

    describe('provider change', function () {
        it('should re-render fields when the user picks a different provider', function () {
            settings.open('gemini-nano', {});
            const select = document.getElementById('ai-provider-select');
            select.value = 'openai';
            select.dispatchEvent(new Event('change'));
            const fields = document.querySelectorAll('#ai-provider-fields .settings-input');
            fields.length.should.equal(3);
        });

        it('should clear fields when switching away from a configured provider', function () {
            settings.open('openai', { baseUrl: 'http://x' });
            const select = document.getElementById('ai-provider-select');
            select.value = 'gemini-nano';
            select.dispatchEvent(new Event('change'));
            const fields = document.querySelectorAll('#ai-provider-fields .settings-input');
            fields.length.should.equal(0);
        });
    });

    describe('Save button', function () {
        it('should call onSave with the selected providerName and collected config', function () {
            settings.open('openai', {});
            document.getElementById('ai-field-baseUrl').value = 'http://localhost:6655';
            document.getElementById('ai-field-apiKey').value = 'my-key';
            document.getElementById('ai-field-model').value = 'gpt-4o';
            document.getElementById('ai-settings-save').click();
            savedName.should.equal('openai');
            savedConfig.should.deep.equal({ baseUrl: 'http://localhost:6655', apiKey: 'my-key', model: 'gpt-4o' });
        });

        it('should close the dialog after Save', function () {
            settings.open('openai', {});
            document.getElementById('ai-settings-save').click();
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('none');
        });

        it('should call onSave with an empty config for gemini-nano (no fields)', function () {
            settings.open('gemini-nano', {});
            document.getElementById('ai-settings-save').click();
            savedName.should.equal('gemini-nano');
            savedConfig.should.deep.equal({});
        });
    });

    describe('Cancel button', function () {
        it('should close the dialog without calling onSave', function () {
            settings.open('openai', {});
            document.getElementById('ai-settings-cancel').click();
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('none');
            (savedName === null).should.be.true;
        });
    });

    describe('overlay click', function () {
        it('should close the dialog without calling onSave', function () {
            settings.open('openai', {});
            document.querySelector('#ai-settings-dialog .settings-overlay').click();
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('none');
            (savedName === null).should.be.true;
        });
    });

    describe('Escape key', function () {
        it('should close the dialog', function () {
            settings.open('gemini-nano', {});
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const dialog = document.getElementById('ai-settings-dialog');
            dialog.style.display.should.equal('none');
        });
    });
});
