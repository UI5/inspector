'use strict';

/**
 * Builds assistant prompts. Owns the system prompt, app metadata formatting, selected-control
 * formatting, truncation rules, and session seed construction. Free of Chrome APIs.
 *
 * @constructor
 */
function PromptBuilder() {
}

/**
 * Adds a Current Application Context section when app metadata is provided.
 *
 * @param {Object} [appInfo]
 * @returns {string}
 */
PromptBuilder.prototype.buildSystemPrompt = function (appInfo) {
    let prompt = 'You are an AI assistant embedded in the UI5 Inspector, specialized in SAP UI5, OpenUI5, and UI5 Web Components. Your role is to help developers understand, debug, and build UI5-based applications.\n' +
        'Provide clear, accurate, and practical guidance on components, APIs, accessibility, theming, layout, performance, and best practices. Prefer concise answers, but explain reasoning when needed. Use code snippets where helpful and format code clearly.\n' +
        'Assume familiarity with JavaScript, HTML, and modern frameworks. When information is uncertain or version-dependent, say so clearly. Do not invent APIs or unsupported features.\n' +
        'You cannot browse the web or open links. If external content is required, ask the user to paste it.\n' +
        'Be neutral, direct, and developer-focused. Avoid marketing language, unnecessary filler, and generic disclaimers. Respond in the user\'s language and adapt tone to the context.';

    if (appInfo) {
        prompt += '\n\nCurrent Application Context:\n';

        if (appInfo.common && appInfo.common.data) {
            const frameworkInfo = appInfo.common.data.OpenUI5 || appInfo.common.data.SAPUI5;
            if (frameworkInfo) {
                prompt += '- Framework: ' + frameworkInfo + '\n';
            }
        }

        if (appInfo.configurationComputed && appInfo.configurationComputed.data && appInfo.configurationComputed.data.theme) {
            prompt += '- Theme: ' + appInfo.configurationComputed.data.theme + '\n';
        }

        if (appInfo.loadedLibraries && appInfo.loadedLibraries.data) {
            const libraries = Object.keys(appInfo.loadedLibraries.data);
            if (libraries.length > 0) {
                prompt += '- Loaded Libraries: ' + libraries.join(', ') + '\n';
            }
        }
    }

    return prompt;
};

/**
 * Prefix a user prompt with a single-turn inspection context section (selected control type, id,
 * properties, bindings, aggregations). Returns the message unchanged when no context is provided.
 *
 * Inspection context is injected per prompt and never stored as conversation memory.
 *
 * @param {string} userMessage
 * @param {Object} [inspectionContext]
 * @returns {string}
 */
PromptBuilder.prototype.buildUserPrompt = function (userMessage, inspectionContext) {
    if (!inspectionContext || !inspectionContext.control) {
        return userMessage;
    }

    const MAX_SECTION_LENGTH = 2000;
    const control = inspectionContext.control;
    let contextString = 'Current UI5 Control Context:\n';
    contextString += '- Type: ' + (control.type || 'Unknown') + '\n';
    contextString += '- ID: ' + (control.id || 'None') + '\n';
    contextString += this._addPropertiesContext(control, MAX_SECTION_LENGTH);
    contextString += this._addBindingsContext(control.bindings, MAX_SECTION_LENGTH);
    contextString += this._addAggregationsContext(control.aggregations, MAX_SECTION_LENGTH);

    return contextString + '\nUser Question: ' + userMessage;
};

/**
 * Truncate JSON serialization to a maximum length. Returns a placeholder for circular or
 * non-serializable input.
 * @private
 * @param {*} data
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._truncateJson = function (data, maxLength) {
    try {
        const json = JSON.stringify(data, null, 2);
        if (json.length > maxLength) {
            return json.substring(0, maxLength) + '... [truncated]';
        }
        return json;
    } catch (e) {
        return '(Data available but cannot serialize)';
    }
};

/**
 * Format control "own" properties as a truncated JSON line. Empty when there are no own properties.
 * @private
 * @param {Object} control
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addPropertiesContext = function (control, maxLength) {
    const props = control.properties;
    if (!props || !props.own || !props.own.data) {
        return '';
    }
    const keys = Object.keys(props.own.data);
    if (keys.length === 0) {
        return '';
    }
    let propsJson = JSON.stringify(props.own.data);
    if (propsJson.length > maxLength) {
        propsJson = propsJson.substring(0, maxLength) + '... [truncated]';
    }
    return '- Properties: ' + propsJson + '\n';
};

/**
 * @private
 * @param {Object} bindings
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addBindingsContext = function (bindings, maxLength) {
    if (!bindings || Object.keys(bindings).length === 0) {
        return '';
    }
    let result = '- Bindings (' + Object.keys(bindings).length + '):\n';
    result += this._truncateJson(bindings, maxLength) + '\n';
    return result;
};

/**
 * @private
 * @param {Object} aggregations
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addAggregationsContext = function (aggregations, maxLength) {
    if (!aggregations || !aggregations.own || !aggregations.own.data) {
        return '';
    }
    const keys = Object.keys(aggregations.own.data);
    if (keys.length === 0) {
        return '';
    }
    let result = '- Aggregations (' + keys.length + '):\n';
    result += this._truncateJson(aggregations.own.data, maxLength) + '\n';
    return result;
};

/**
 * Build the seed message array for a new session.
 *
 * Emits a leading system message from `buildSystemPrompt`, followed by user/assistant turns from
 * the supplied conversation memory. Non-user/assistant entries and empty placeholders are skipped.
 *
 * @param {Object} [appInfo]
 * @param {Array} [conversationMemory] - Prior {role, content} turns.
 * @returns {Array<{role: string, content: string}>}
 */
PromptBuilder.prototype.buildSeedMessages = function (appInfo, conversationMemory) {
    const seed = [
        { role: 'system', content: this.buildSystemPrompt(appInfo) }
    ];

    if (conversationMemory && conversationMemory.length) {
        for (let i = 0; i < conversationMemory.length; i++) {
            const turn = conversationMemory[i];
            if ((turn.role === 'user' || turn.role === 'assistant') && turn.content) {
                seed.push({ role: turn.role, content: turn.content });
            }
        }
    }

    return seed;
};

module.exports = PromptBuilder;
