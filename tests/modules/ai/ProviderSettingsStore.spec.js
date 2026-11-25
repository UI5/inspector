'use strict';

const ProviderSettingsStore = require('../../../app/scripts/modules/ai/ProviderSettingsStore.js');

function createFakeStorage() {
    const data = {};
    const storage = {
        get: function (keys, callback) {
            const result = {};
            keys.forEach(function (key) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            });
            callback(result);
        },
        set: function (items, callback) {
            Object.keys(items).forEach(function (key) {
                data[key] = items[key];
            });
            callback();
        }
    };
    return { storage: storage, data: data };
}

describe('ProviderSettingsStore', function () {
    describe('constructor', function () {
        it('should throw when no storage surface is available', function () {
            const originalChrome = window.chrome;
            window.chrome = undefined;
            try {
                (function () { new ProviderSettingsStore(); }).should.throw(/storage/);
            } finally {
                window.chrome = originalChrome;
            }
        });
    });

    describe('#load()', function () {
        it('should return gemini-nano defaults when nothing is stored', function () {
            const { storage } = createFakeStorage();
            const store = new ProviderSettingsStore({ storage: storage });
            return store.load().then(function (settings) {
                settings.providerName.should.equal('gemini-nano');
                settings.providerConfig.should.deep.equal({});
            });
        });

        it('should return the stored providerName and providerConfig', function () {
            const { storage } = createFakeStorage();
            const store = new ProviderSettingsStore({ storage: storage });
            return store.save('openai', { baseUrl: 'http://localhost:1234', apiKey: 'k', model: 'm' })
                .then(function () { return store.load(); })
                .then(function (settings) {
                    settings.providerName.should.equal('openai');
                    settings.providerConfig.should.deep.equal({ baseUrl: 'http://localhost:1234', apiKey: 'k', model: 'm' });
                });
        });

        it('should return an empty providerConfig when stored entry has no providerConfig field', function () {
            const { storage, data } = createFakeStorage();
            data.aiProviderSettings = { providerName: 'openai' };
            const store = new ProviderSettingsStore({ storage: storage });
            return store.load().then(function (settings) {
                settings.providerName.should.equal('openai');
                settings.providerConfig.should.deep.equal({});
            });
        });
    });

    describe('#save()', function () {
        it('should persist the providerName and providerConfig under the correct storage key', function () {
            const { storage, data } = createFakeStorage();
            const store = new ProviderSettingsStore({ storage: storage });
            return store.save('openai', { baseUrl: 'http://x', apiKey: 'secret', model: 'gpt-4o' })
                .then(function () {
                    data.aiProviderSettings.providerName.should.equal('openai');
                    data.aiProviderSettings.providerConfig.should.deep.equal({ baseUrl: 'http://x', apiKey: 'secret', model: 'gpt-4o' });
                });
        });

        it('should treat a missing config argument as an empty object', function () {
            const { storage, data } = createFakeStorage();
            const store = new ProviderSettingsStore({ storage: storage });
            return store.save('gemini-nano').then(function () {
                data.aiProviderSettings.providerConfig.should.deep.equal({});
            });
        });

        it('should overwrite a previously saved value', function () {
            const { storage } = createFakeStorage();
            const store = new ProviderSettingsStore({ storage: storage });
            return store.save('openai', { model: 'first' })
                .then(function () { return store.save('openai', { model: 'second' }); })
                .then(function () { return store.load(); })
                .then(function (settings) {
                    settings.providerConfig.model.should.equal('second');
                });
        });
    });
});
