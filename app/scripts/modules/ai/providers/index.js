'use strict';

const GeminiNanoProvider = require('../GeminiNanoProvider.js');
const OpenAIProvider = require('../OpenAIProvider.js');

/**
 * Static registry of AI providers available to the assistant. Keys are provider names persisted in
 * storage and passed to {@link createProvider}. Values describe:
 *
 * - `displayName` — user-facing label shown in the settings modal.
 * - `ProviderClass` — constructor invoked as `new ProviderClass(config)`.
 * - `configSchema` — list of `{key, label, type, required, placeholder}` descriptors the settings
 *   modal uses to render its form. `placeholder` is optional and never included in an error
 *   message or written to storage. Empty for providers with no user-facing configuration.
 */
const PROVIDERS = {
    'gemini-nano': {
        displayName: 'Gemini Nano (on-device)',
        ProviderClass: GeminiNanoProvider,
        configSchema: []
    },
    'openai': {
        displayName: 'OpenAI-compatible',
        ProviderClass: OpenAIProvider,
        configSchema: [
            { key: 'baseUrl', label: 'Base URL', type: 'text', required: true, placeholder: 'https://host/v1' },
            { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'your API key' },
            { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'e.g. gpt-4o-mini' }
        ]
    }
};

/**
 * Construct a provider instance registered under `name`, passing `config` to its constructor.
 * Throws if the name is not registered.
 *
 * @param {string} name
 * @param {Object} [config]
 * @returns {Object}
 */
function createProvider(name, config) {
    const entry = PROVIDERS[name];
    if (!entry) {
        throw new Error('Unknown provider: ' + name);
    }
    return new entry.ProviderClass(config || {});
}

module.exports = {
    PROVIDERS: PROVIDERS,
    createProvider: createProvider
};
