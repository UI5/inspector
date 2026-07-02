'use strict';

// Per-section safety-net caps. The shape-driven curation below is the primary volume control;
// these caps only trigger on adversarial inputs (a control with 500 properties, a runaway
// aggregation, etc.). Truncation appends `... [truncated]` so the model sees the boundary.
const PROPERTIES_CAP = 800;
const BINDINGS_CAP = 800;
const AGGREGATIONS_CAP = 400;
const CONSOLE_ERRORS_CAP = 400;

// Bindings render their resolved values inline, so a single overlarge value cannot burn the
// whole bindings-section budget on its own.
const BINDING_VALUE_CAP = 100;

// Placeholder for adversarial input that cannot be JSON-serialized (e.g. a circular graph).
// Kept identical to the string the previous JSON-dump implementation emitted, so log-grep
// muscle memory keeps working.
const UNSERIALIZABLE_PLACEHOLDER = '(Data available but cannot serialize)';

/**
 * Stringify an arbitrary value for a prompt line. Objects go through JSON.stringify so we
 * do not accidentally emit `[object Object]`; primitives print literally. `null` and
 * `undefined` render as those exact words so the model can tell them apart from the strings.
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
 * Stringify a resolved binding value for the `= <value>` segment. Truncates at ~100 chars
 * so a single overlarge value cannot burn the whole bindings-section budget on its own.
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
 * Render one aggregation entry.
 *   - empty aggregation → `- <name>: empty`
 *   - ≤ 3 children       → `- <name>: N children — id1, id2, id3`
 *   - > 3 children       → `- <name>: N children (<Type> × N, ...)`
 * @private
 * @param {string} name
 * @param {Array} children
 * @returns {string}
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

    // Type histogram, insertion order preserved so the model sees the "dominant" type first
    // if children were listed in that order (they typically are — a Page's `content` is a
    // Text-heavy list, then a Button tail).
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
 * Assemble the per-turn user prompt.
 *
 * When Inspection Context or Recent Console Errors are present, wraps the user's message in a
 * sandwich:
 *
 *   User asked: <msg>
 *
 *   Current UI5 Control Context:
 *   - Type: ...
 *   - ID: ...
 *   Properties:
 *   - key: value
 *   Bindings:
 *   - prop ← "path" = value (model: ..., type: ..., formatter: yes)
 *   Aggregations:
 *   - name: N children (Type × N, Other × M)
 *
 *   Recent Console Errors:
 *   - <message> (×N)
 *     at <frame>
 *
 *   Now answer: <msg>
 *
 * Each sub-section is emitted only when its underlying data is non-empty. When both Inspection
 * Context and Recent Console Errors are absent, returns the raw user message unchanged.
 *
 * Inspection Context is injected per prompt and never stored as Conversation Memory. Recent
 * Console Errors are likewise per-turn — the ring buffer that produces them lives in the injected
 * script layer, not in Conversation Memory.
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
 * Render the Current UI5 Control Context block for a single control snapshot.
 * @private
 * @param {Object} control
 * @returns {string}
 */
PromptBuilder.prototype._buildControlContextBlock = function (control) {
    const identityLines = [
        '- Type: ' + (control.type || 'Unknown'),
        '- ID: ' + (control.id || 'None')
    ];

    // Each renderer returns a full section body (header + lines) or an empty string. Empty
    // sections are dropped so we never emit an orphan "Properties:" header.
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
 * Render the Recent Console Errors block. Errors are rendered newest-first, with each entry
 * annotated `(×N)` when count > 1 and followed by an indented `at <frame>` line when a frame
 * is present. The whole section is capped at `CONSOLE_ERRORS_CAP` — a runaway page firing
 * hundreds of distinct errors will still hit the section cap before it can dilute the prompt.
 * @private
 * @param {Array<{type: string, message: string, frame: string, count: number}>} consoleErrors
 * @returns {string}
 */
PromptBuilder.prototype._buildConsoleErrorsBlock = function (consoleErrors) {
    // The buffer stores oldest-first (natural FIFO). The model gets more value from the most
    // recent error at the top, so we render in reverse.
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
 * Truncate a rendered section body to a per-section cap. Appends `... [truncated]` past the
 * cap so the model sees the boundary. The cap is applied to the *body* (lines after the
 * header) so the header stays intact.
 * @private
 * @param {string} header
 * @param {string} body
 * @param {number} maxLength
 * @returns {string}
 */
PromptBuilder.prototype._capSection = function (header, body, maxLength) {
    if (body.length > maxLength) {
        return header + '\n' + body.substring(0, maxLength) + '... [truncated]';
    }
    return header + '\n' + body;
};

/**
 * Render own properties as `- key: value` lines. Returns an empty string when the property set
 * is empty or absent, so the caller drops the section header.
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
 * Render bindings as one line each. Composite bindings (with a `parts` array) collapse to a
 * degenerate `<prop> ← <composite>` line — a follow-up will replace this with a real
 * multi-part rendering. Circular binding graphs bail out to the `cannot serialize` placeholder
 * that the previous JSON-dump implementation emitted, keeping the invariant that adversarial
 * input never throws.
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
        // Cheap circularity probe: JSON.stringify throws on cycles. We do not use the JSON
        // itself; we only need the throw signal so the placeholder path stays in one place.
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
 * Render one binding entry.
 *   `- <prop> ← "<path>"[ = <value>] (model: <model>[, type: <type>][, formatter: yes])`
 * @private
 * @param {string} propertyName
 * @param {Object} binding
 * @returns {string}
 */
PromptBuilder.prototype._renderBindingLine = function (propertyName, binding) {
    if (!binding || typeof binding !== 'object') {
        return '- ' + propertyName + ' ← <invalid>';
    }

    // Composite bindings are represented by a `parts` array. This issue does not curate them —
    // see the follow-up filed in the PRD. Emit a degenerate line so the sandwich stays intact.
    if (Array.isArray(binding.parts)) {
        return '- ' + propertyName + ' ← <composite>';
    }

    let line = '- ' + propertyName + ' ← "' + (binding.path || '') + '"';

    // `= <value>` appears only when the snapshot explicitly carries a `value` key. `null` and
    // `undefined` print literally so the model can tell "no value" from "null value" from "the
    // string 'undefined'".
    if (Object.prototype.hasOwnProperty.call(binding, 'value')) {
        line += ' = ' + _stringifyBindingValue(binding.value);
    }

    // Annotations. `model` falls back to `default` per the AC — a binding with a path but no
    // explicit model is bound to the default model.
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
 * Render own aggregations as one line each. Rules from the PRD:
 *   - empty aggregation → `- <name>: empty`
 *   - ≤ 3 children       → `- <name>: N children — id1, id2, id3`
 *   - > 3 children       → `- <name>: N children (<Type> × N, ...)`
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
