'use strict';

/**
 * PromptBuilder - Deterministic builder for Inspector AI Assistant prompts.
 *
 * Owns the system prompt, application metadata formatting, selected-control
 * (Inspection Context) formatting, truncation rules, and session seed message
 * construction. Free of Chrome APIs so it can be unit-tested as part of the
 * Agent Validation Loop.
 *
 * @constructor
 */
function PromptBuilder() {
}

/**
 * Build the system prompt content for the Inspector AI Assistant.
 *
 * Includes a Current Application Context section when application metadata
 * (framework version, theme, loaded libraries) is provided.
 *
 * @param {Object} [appInfo] - Application metadata snapshot from UI5 Inspector.
 * @returns {string}
 */
PromptBuilder.prototype.buildSystemPrompt = function (appInfo) {
    var prompt = 'You are an AI assistant embedded in the UI5 Inspector, specialized in SAP UI5, OpenUI5, and UI5 Web Components. Your role is to help developers understand, debug, and build UI5-based applications.\n' +
        'Provide clear, accurate, and practical guidance on components, APIs, accessibility, theming, layout, performance, and best practices. Prefer concise answers, but explain reasoning when needed. Use code snippets where helpful and format code clearly.\n' +
        'Assume familiarity with JavaScript, HTML, and modern frameworks. When information is uncertain or version-dependent, say so clearly. Do not invent APIs or unsupported features.\n' +
        'You cannot browse the web or open links. If external content is required, ask the user to paste it.\n' +
        'Be neutral, direct, and developer-focused. Avoid marketing language, unnecessary filler, and generic disclaimers. Respond in the user\'s language and adapt tone to the context.';

    if (appInfo) {
        prompt += '\n\nCurrent Application Context:\n';

        if (appInfo.common && appInfo.common.data) {
            var frameworkInfo = appInfo.common.data.OpenUI5 || appInfo.common.data.SAPUI5;
            if (frameworkInfo) {
                prompt += '- Framework: ' + frameworkInfo + '\n';
            }
        }

        if (appInfo.configurationComputed && appInfo.configurationComputed.data && appInfo.configurationComputed.data.theme) {
            prompt += '- Theme: ' + appInfo.configurationComputed.data.theme + '\n';
        }

        if (appInfo.loadedLibraries && appInfo.loadedLibraries.data) {
            var libraries = Object.keys(appInfo.loadedLibraries.data);
            if (libraries.length > 0) {
                prompt += '- Loaded Libraries: ' + libraries.join(', ') + '\n';
            }
        }
    }

    return prompt;
};

/**
 * Build a formatted user prompt that prefixes a single-turn Inspection Context
 * section (selected control type, id, properties, bindings, aggregations) ahead
 * of the developer's question. Returns the user message unchanged when no
 * inspection context is provided.
 *
 * Inspection Context is injected per user prompt and is never stored as
 * Conversation Memory by the assistant.
 *
 * @param {string} userMessage - The developer's question.
 * @param {Object} [inspectionContext] - Optional Inspection Context with a `control` snapshot.
 * @returns {string}
 */
PromptBuilder.prototype.buildUserPrompt = function (userMessage, inspectionContext) {
    if (!inspectionContext || !inspectionContext.control) {
        return userMessage;
    }

    var MAX_SECTION_LENGTH = 2000;
    var control = inspectionContext.control;
    var contextString = 'Current UI5 Control Context:\n';
    contextString += '- Type: ' + (control.type || 'Unknown') + '\n';
    contextString += '- ID: ' + (control.id || 'None') + '\n';
    contextString += this._addPropertiesContext(control, MAX_SECTION_LENGTH);
    contextString += this._addBindingsContext(control.bindings, MAX_SECTION_LENGTH);
    contextString += this._addAggregationsContext(control.aggregations, MAX_SECTION_LENGTH);

    return contextString + '\nUser Question: ' + userMessage;
};

/**
 * Truncate JSON serialization of arbitrary data to a maximum length, returning
 * a friendly placeholder string for circular or non-serializable input.
 * @private
 * @param {*} data
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._truncateJson = function (data, maxLength) {
    try {
        var json = JSON.stringify(data, null, 2);
        if (json.length > maxLength) {
            return json.substring(0, maxLength) + '... [truncated]';
        }
        return json;
    } catch (e) {
        return '(Data available but cannot serialize)';
    }
};

/**
 * Format the selected-control "own" properties as a truncated JSON line.
 * Returns an empty string when the control has no own properties to report.
 * @private
 * @param {Object} control
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addPropertiesContext = function (control, maxLength) {
    var props = control.properties;
    if (!props || !props.own || !props.own.data) {
        return '';
    }
    var keys = Object.keys(props.own.data);
    if (keys.length === 0) {
        return '';
    }
    var propsJson = JSON.stringify(props.own.data);
    if (propsJson.length > maxLength) {
        propsJson = propsJson.substring(0, maxLength) + '... [truncated]';
    }
    return '- Properties: ' + propsJson + '\n';
};

/**
 * Format the selected-control bindings as a truncated JSON block.
 * @private
 * @param {Object} bindings
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addBindingsContext = function (bindings, maxLength) {
    if (!bindings || Object.keys(bindings).length === 0) {
        return '';
    }
    var result = '- Bindings (' + Object.keys(bindings).length + '):\n';
    result += this._truncateJson(bindings, maxLength) + '\n';
    return result;
};

/**
 * Format the selected-control "own" aggregations as a truncated JSON block.
 * @private
 * @param {Object} aggregations
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._addAggregationsContext = function (aggregations, maxLength) {
    if (!aggregations || !aggregations.own || !aggregations.own.data) {
        return '';
    }
    var keys = Object.keys(aggregations.own.data);
    if (keys.length === 0) {
        return '';
    }
    var result = '- Aggregations (' + keys.length + '):\n';
    result += this._truncateJson(aggregations.own.data, maxLength) + '\n';
    return result;
};

/**
 * Build the seed message array used to create a new local AI session.
 *
 * Always emits a leading system message produced by `buildSystemPrompt`,
 * followed by any user/assistant turns from the supplied Conversation Memory.
 * Non-user/assistant entries (UI-only system notices) and empty placeholders
 * are skipped so that mid-stream slots from the view layer never leak in.
 *
 * @param {Object} [appInfo] - Application metadata snapshot for the system prompt.
 * @param {Array} [conversationMemory] - Prior chat turns ({role, content}) to replay.
 * @returns {Array<{role: string, content: string}>}
 */
PromptBuilder.prototype.buildSeedMessages = function (appInfo, conversationMemory) {
    var seed = [
        { role: 'system', content: this.buildSystemPrompt(appInfo) }
    ];

    if (conversationMemory && conversationMemory.length) {
        for (var i = 0; i < conversationMemory.length; i++) {
            var turn = conversationMemory[i];
            if ((turn.role === 'user' || turn.role === 'assistant') && turn.content) {
                seed.push({ role: turn.role, content: turn.content });
            }
        }
    }

    return seed;
};

module.exports = PromptBuilder;
