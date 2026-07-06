'use strict';

// Per-section size caps. Truncation appends `... [truncated]`.
const PROPERTIES_CAP = 800;
const BINDINGS_CAP = 800;
const AGGREGATIONS_CAP = 400;
const CONSOLE_ERRORS_CAP = 400;
const BINDING_VALUE_CAP = 100;

const UNSERIALIZABLE_PLACEHOLDER = '(Data available but cannot serialize)';

/**
 * @private
 * @param {*} value
 * @returns {string}
 */
function _stringifyValue(value) {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'undefined') {
        return 'undefined';
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (e) {
            return UNSERIALIZABLE_PLACEHOLDER;
        }
    }
    return String(value);
}

/**
 * @private
 * @param {*} value
 * @returns {string}
 */
function _stringifyBindingValue(value) {
    const rendered = _stringifyValue(value);
    if (rendered.length > BINDING_VALUE_CAP) {
        return rendered.substring(0, BINDING_VALUE_CAP) + '...';
    }
    return rendered;
}

/**
 * @private
 */
function _renderAggregationLine(name, children) {
    if (!Array.isArray(children) || children.length === 0) {
        return '- ' + name + ': empty';
    }

    const count = children.length;

    if (count <= 3) {
        const ids = children.map(function (child) {
            return (child && child.id) || '?';
        });
        return '- ' + name + ': ' + count + ' children — ' + ids.join(', ');
    }

    // Preserve insertion order.
    const histogram = Object.create(null);
    const order = [];
    for (let i = 0; i < children.length; i++) {
        const type = (children[i] && children[i].type) || '?';
        if (!Object.prototype.hasOwnProperty.call(histogram, type)) {
            histogram[type] = 0;
            order.push(type);
        }
        histogram[type] += 1;
    }
    const parts = order.map(function (type) {
        return type + ' × ' + histogram[type];
    });

    return '- ' + name + ': ' + count + ' children (' + parts.join(', ') + ')';
}

/**
 * Builds assistant prompts.
 * @constructor
 */
function PromptBuilder() {
}

/**
 * Build the system prompt. Adds a Current Application Context section between Role and Rules
 * when `appInfo` has usable fields.
 *
 * @param {Object} [appInfo] - `common.data`, `configurationComputed.data`, `urlParameters.data`,
 *     `loadedLibraries.data`.
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

    const locale = configData && (configData.language || configData.locale);
    if (locale) {
        lines.push('- UI locale: ' + locale);
    }

    // Presence check, not truthiness — `sap-ui-debug=` (empty) is still information.
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
 * Build the per-turn user prompt. If Inspection Context or Recent Console Errors are present,
 * wrap the message with `User asked: ...` / `Now answer: ...` around a middle block. Otherwise
 * return `userMessage` as-is.
 *
 * @param {string} userMessage
 * @param {Object} [inspectionContext]
 * @param {Array<{type: string, message: string, frame: string, count: number}>} [consoleErrors]
 * @returns {string}
 */
PromptBuilder.prototype.buildUserPrompt = function (userMessage, inspectionContext, consoleErrors) {
    const hasControl = inspectionContext && inspectionContext.control;
    const hasErrors = Array.isArray(consoleErrors) && consoleErrors.length > 0;

    if (!hasControl && !hasErrors) {
        return userMessage;
    }

    const middleSections = [];

    if (hasControl) {
        middleSections.push(this._buildControlContextBlock(inspectionContext.control));
    }

    if (hasErrors) {
        middleSections.push(this._buildConsoleErrorsBlock(consoleErrors));
    }

    return 'User asked: ' + userMessage + '\n\n' +
        middleSections.join('\n\n') + '\n\n' +
        'Now answer: ' + userMessage;
};

/**
 * @private
 * @param {Object} control
 * @returns {string}
 */
PromptBuilder.prototype._buildControlContextBlock = function (control) {
    const identityLines = [
        '- Type: ' + (control.type || 'Unknown'),
        '- ID: ' + (control.id || 'None')
    ];

    const sections = [];
    const propertiesSection = this._renderPropertiesSection(control.properties);
    if (propertiesSection) {
        sections.push(propertiesSection);
    }
    const bindingsSection = this._renderBindingsSection(control.bindings);
    if (bindingsSection) {
        sections.push(bindingsSection);
    }
    const aggregationsSection = this._renderAggregationsSection(control.aggregations);
    if (aggregationsSection) {
        sections.push(aggregationsSection);
    }

    const contextBody = identityLines.concat(sections).join('\n');
    return 'Current UI5 Control Context:\n' + contextBody;
};

/**
 * Render the Recent Console Errors block, newest-first.
 * @private
 * @param {Array<{type: string, message: string, frame: string, count: number}>} consoleErrors
 * @returns {string}
 */
PromptBuilder.prototype._buildConsoleErrorsBlock = function (consoleErrors) {
    // Buffer is oldest-first; show newest at top.
    const reversed = consoleErrors.slice().reverse();

    const lines = reversed.map(function (entry) {
        const count = entry.count > 1 ? ' (×' + entry.count + ')' : '';
        let line = '- ' + entry.message + count;
        if (entry.frame) {
            line += '\n  at ' + entry.frame;
        }
        return line;
    });

    return this._capSection('Recent Console Errors:', lines.join('\n'), CONSOLE_ERRORS_CAP);
};

/**
 * Truncate `body` to `maxLength`, keeping `header` intact.
 * @private
 */
PromptBuilder.prototype._capSection = function (header, body, maxLength) {
    if (body.length > maxLength) {
        return header + '\n' + body.substring(0, maxLength) + '... [truncated]';
    }
    return header + '\n' + body;
};

/**
 * @private
 * @param {Object} properties
 * @returns {string}
 */
PromptBuilder.prototype._renderPropertiesSection = function (properties) {
    if (!properties || !properties.own || !properties.own.data) {
        return '';
    }
    const data = properties.own.data;
    const keys = Object.keys(data);
    if (keys.length === 0) {
        return '';
    }

    const lines = keys.map(function (key) {
        return '- ' + key + ': ' + _stringifyValue(data[key]);
    });

    return this._capSection('Properties:', lines.join('\n'), PROPERTIES_CAP);
};

/**
 * Render each binding as one line. Composite bindings (with a `parts` array) collapse to
 * `<prop> ← <composite>`. Circular graphs fall back to the placeholder.
 * @private
 * @param {Object} bindings
 * @returns {string}
 */
PromptBuilder.prototype._renderBindingsSection = function (bindings) {
    if (!bindings || typeof bindings !== 'object' || Object.keys(bindings).length === 0) {
        return '';
    }

    const self = this;
    let body;
    try {
        // JSON.stringify throws on cycles — use it as a probe.
        JSON.stringify(bindings);

        const lines = Object.keys(bindings).map(function (propertyName) {
            return self._renderBindingLine(propertyName, bindings[propertyName]);
        });
        body = lines.join('\n');
    } catch (e) {
        body = UNSERIALIZABLE_PLACEHOLDER;
    }

    return this._capSection('Bindings:', body, BINDINGS_CAP);
};

/**
 * @private
 */
PromptBuilder.prototype._renderBindingLine = function (propertyName, binding) {
    if (!binding || typeof binding !== 'object') {
        return '- ' + propertyName + ' ← <invalid>';
    }

    // Composite bindings not handled yet.
    if (Array.isArray(binding.parts)) {
        return '- ' + propertyName + ' ← <composite>';
    }

    let line = '- ' + propertyName + ' ← "' + (binding.path || '') + '"';

    // Print `null` and `undefined` literally so they're distinguishable from strings.
    if (Object.prototype.hasOwnProperty.call(binding, 'value')) {
        line += ' = ' + _stringifyBindingValue(binding.value);
    }

    const annotations = [];
    annotations.push('model: ' + (binding.model || 'default'));
    if (binding.type) {
        annotations.push('type: ' + binding.type);
    }
    if (binding.formatter) {
        annotations.push('formatter: yes');
    }
    line += ' (' + annotations.join(', ') + ')';

    return line;
};

/**
 * @private
 * @param {Object} aggregations
 * @returns {string}
 */
PromptBuilder.prototype._renderAggregationsSection = function (aggregations) {
    if (!aggregations || !aggregations.own || !aggregations.own.data) {
        return '';
    }
    const data = aggregations.own.data;
    const keys = Object.keys(data);
    if (keys.length === 0) {
        return '';
    }

    const lines = keys.map(function (name) {
        return _renderAggregationLine(name, data[name]);
    });

    return this._capSection('Aggregations:', lines.join('\n'), AGGREGATIONS_CAP);
};

/**
 * Build the full messages array for a send: `[system, ...history, wrappedUser]`. The wrapped user
 * message injects Inspection Context and Recent Console Errors when present.
 *
 * @param {Object} params
 * @param {Object} [params.appInfo]
 * @param {Array<{role: string, content: string}>} [params.history]
 * @param {string} params.userMessage
 * @param {Object} [params.inspectionContext]
 * @param {Array} [params.consoleErrors]
 * @returns {Array<{role: string, content: string}>}
 */
PromptBuilder.prototype.buildMessages = function (params) {
    const p = params || {};
    const messages = [
        { role: 'system', content: this.buildSystemPrompt(p.appInfo) }
    ];

    if (p.history && p.history.length) {
        for (let i = 0; i < p.history.length; i++) {
            const turn = p.history[i];
            if ((turn.role === 'user' || turn.role === 'assistant') && turn.content) {
                messages.push({ role: turn.role, content: turn.content });
            }
        }
    }

    messages.push({
        role: 'user',
        content: this.buildUserPrompt(p.userMessage, p.inspectionContext, p.consoleErrors)
    });

    return messages;
};

module.exports = PromptBuilder;
