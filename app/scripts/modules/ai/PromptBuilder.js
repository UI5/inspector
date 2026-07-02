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
 * Build the system prompt.
 *
 * Assembles four static zones — Role, Rules, Style, and a copy-me Example demonstrating the
 * prescribed uncertainty phrase — with an optional Current Application Context section stitched
 * between Role and Rules so rule 4 ("prefer runtime data … shown above") reads truthfully.
 *
 * The Current Application Context section is omitted entirely when `appInfo` yields no recognized
 * fields.
 *
 * @param {Object} [appInfo] App metadata snapshot: `common.data`, `configurationComputed.data`,
 *     `urlParameters.data`, `loadedLibraries.data`. Missing fields are silently skipped.
 * @returns {string}
 */
PromptBuilder.prototype.buildSystemPrompt = function (appInfo) {
    const role = 'Role:\n' +
        'You are an assistant embedded in the UI5 Inspector, specialized in SAP UI5, OpenUI5, and UI5 Web Components — helping developers understand, debug, and build UI5-based applications.';

    const rules = 'Rules:\n' +
        '1. Always reply in English, regardless of the language of the user\'s message.\n' +
        '2. When a Current UI5 Control Context section is present in the user prompt, only reference property, aggregation, event, and binding names that appear in it. If asked about a name not listed there, say so plainly.\n' +
        '3. When naming a specific property, event, method, or enum value on a UI5 control, only state it if confident it exists. Otherwise use this exact phrase and add no further disclaimers:\n' +
        'I\'m not certain <name> exists on <control> — verify in the API reference.\n' +
        '4. Prefer runtime data (resolved binding values, console errors, application metadata shown above) over general assumptions when answering.';

    const style = 'Style:\n' +
        'Neutral, direct, and developer-focused. Use code snippets for code. No marketing filler, no generic disclaimers.';

    const example = 'Example — uncertainty phrase in use:\n' +
        'Bad: "Yes, sap.m.Slider has a `flashOnClick` property that lights it up."\n' +
        'Good: "I\'m not certain flashOnClick exists on sap.m.Slider — verify in the API reference."';

    const zones = [role];
    const appContext = this._buildAppContext(appInfo);
    if (appContext) {
        zones.push(appContext);
    }
    zones.push(rules, style, example);

    return zones.join('\n\n');
};

/**
 * Build the Current Application Context section from app metadata. Returns an empty string when
 * no recognized fields are present, so the caller can drop the section entirely rather than emit
 * an orphan header.
 * @private
 * @param {Object} [appInfo]
 * @returns {string}
 */
PromptBuilder.prototype._buildAppContext = function (appInfo) {
    if (!appInfo) {
        return '';
    }

    const lines = [];
    const commonData = appInfo.common && appInfo.common.data;
    const configData = appInfo.configurationComputed && appInfo.configurationComputed.data;
    const urlData = appInfo.urlParameters && appInfo.urlParameters.data;
    const libsData = appInfo.loadedLibraries && appInfo.loadedLibraries.data;

    if (commonData) {
        const frameworkInfo = commonData.OpenUI5 || commonData.SAPUI5;
        if (frameworkInfo) {
            lines.push('- Framework: ' + frameworkInfo);
        }
    }

    if (configData && configData.theme) {
        lines.push('- Theme: ' + configData.theme);
    }

    // The snapshot's field name for the UI locale is not fully pinned (see issue 01 —
    // "language/locale field"), so accept either. Fixtures in the injected-script layer use
    // `language`.
    const locale = configData && (configData.language || configData.locale);
    if (locale) {
        lines.push('- UI locale: ' + locale);
    }

    // `sap-ui-debug` uses a presence check (not truthiness) because the spec says "only when the
    // parameter is present" — an explicitly-empty or "false" value is still information about how
    // the app was launched.
    if (urlData && Object.prototype.hasOwnProperty.call(urlData, 'sap-ui-debug')) {
        lines.push('- sap-ui-debug: ' + urlData['sap-ui-debug']);
    }

    if (commonData && commonData.Application) {
        lines.push('- Application entry point: ' + commonData.Application);
    }

    if (libsData) {
        const libraries = Object.keys(libsData);
        if (libraries.length > 0) {
            lines.push('- Loaded Libraries: ' + libraries.join(', '));
        }
    }

    if (lines.length === 0) {
        return '';
    }

    return 'Current Application Context:\n' + lines.join('\n');
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
