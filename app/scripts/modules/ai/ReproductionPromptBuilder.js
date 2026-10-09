'use strict';

// Defaults. The outline is bounded on three axes so a large app cannot produce a prompt that
// overflows the snippet-tool editor: `maxTreeLines`/`maxTreeChars` cap the whole outline, while
// `maxChildrenPerNode` collapses repeated siblings (lists/tables) and `maxDepth` stops runaway
// nesting. `maxOutputLines` is the budget the LLM is told to keep its generated code within.
var DEFAULT_MAX_VALUE_LENGTH = 60;
var DEFAULT_MAX_TREE_CHARS = 12000;
var DEFAULT_MAX_TREE_LINES = 280;
var DEFAULT_MAX_CHILDREN_PER_NODE = 8;
var DEFAULT_MAX_DEPTH = 12;
var DEFAULT_MAX_OUTPUT_LINES = 400;
var REDACTED = '<redacted>';
var INDENT_UNIT = '  ';

/**
 * Repeat a string unit `times` times.
 * @private
 * @param {string} unit
 * @param {number} times
 * @returns {string}
 */
function _repeat(unit, times) {
    var result = '';
    for (var i = 0; i < times; i++) {
        result += unit;
    }
    return result;
}

/**
 * Builds the reproduction prompt that a snippet-tool LLM turns into a minimal, runnable UI5
 * app. Pure string assembly — no DOM, Chrome, or network dependencies.
 * @constructor
 */
function ReproductionPromptBuilder() {
}

/**
 * Decide whether a short string value is a structural token (enum value, boolean-like, simple
 * identifier) that is safe to keep even when redacting. Anything with whitespace or longer than
 * 24 characters is treated as free-form data and masked.
 * @private
 * @param {string} value
 * @returns {boolean}
 */
ReproductionPromptBuilder.prototype._isStructuralToken = function (value) {
    return /^[A-Za-z0-9_.\-]{1,24}$/.test(value);
};

/**
 * Render a single value for the prompt, applying redaction unless `includeRealData` is set.
 * Booleans, numbers and null are always kept (structural). Strings are kept when real data is
 * allowed or when they look like structural tokens; otherwise masked.
 * @private
 * @param {*} value
 * @param {Object} options
 * @returns {string}
 */
ReproductionPromptBuilder.prototype._renderValue = function (value, options) {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'object') {
        if (options.includeRealData) {
            var serialized;
            try {
                serialized = JSON.stringify(value);
            } catch (e) {
                serialized = REDACTED;
            }
            return this._truncate(serialized, options.maxValueLength);
        }
        return REDACTED;
    }

    var asString = String(value);
    if (options.includeRealData) {
        return this._truncate(asString, options.maxValueLength);
    }
    if (this._isStructuralToken(asString)) {
        return asString;
    }
    return REDACTED;
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._truncate = function (text, maxLength) {
    if (typeof text === 'string' && text.length > maxLength) {
        return text.substring(0, maxLength) + '…';
    }
    return text;
};

/**
 * Render the lines for one control node and recurse into its children.
 * @private
 * @param {Object} node
 * @param {number} depth
 * @param {Object} options
 * @returns {Array<string>}
 */
ReproductionPromptBuilder.prototype._renderNode = function (node, depth, options) {
    var lines = [];
    var indent = _repeat(INDENT_UNIT, depth);

    if (node.isControl) {
        var header = indent + '- ' + (node.type || 'Unknown');
        if (node.id) {
            header += ' #' + node.id;
        }
        lines.push(header);

        var detailIndent = indent + INDENT_UNIT;
        var self = this;

        (node.properties || []).forEach(function (property) {
            lines.push(detailIndent + property.name + ' = ' + self._renderValue(property.value, options));
        });

        var bindings = node.bindings || {};
        Object.keys(bindings.properties || {}).forEach(function (name) {
            lines.push(detailIndent + name + ' ⟵ ' + self._renderBinding(bindings.properties[name], options));
        });
        Object.keys(bindings.aggregations || {}).forEach(function (name) {
            var model = bindings.aggregations[name].model;
            lines.push(detailIndent + name + ' ⟵ aggregation binding' + (model ? ' (model: ' + model + ')' : ''));
        });
    }

    return lines.concat(this._renderChildren(node, depth, options));
};

/**
 * Render a node's children, applying the depth and per-node child caps. Children beyond the cap are
 * collapsed into a type histogram so a 200-row list costs a few lines instead of hundreds.
 * @private
 * @param {Object} node
 * @param {number} depth
 * @param {Object} options
 * @returns {Array<string>}
 */
ReproductionPromptBuilder.prototype._renderChildren = function (node, depth, options) {
    var children = node.children || [];
    // Non-control grouping nodes do not add indentation depth.
    var childDepth = node.isControl ? depth + 1 : depth;
    var childIndent = _repeat(INDENT_UNIT, childDepth);
    var lines = [];

    if (childDepth > options.maxDepth) {
        if (children.length) {
            lines.push(childIndent + '… (' + children.length + ' nested controls omitted — depth limit)');
        }
        return lines;
    }

    var shown = Math.min(children.length, options.maxChildrenPerNode);
    for (var i = 0; i < shown; i++) {
        lines = lines.concat(this._renderNode(children[i], childDepth, options));
    }
    if (children.length > shown) {
        var omitted = children.slice(shown);
        lines.push(childIndent + '… + ' + omitted.length + ' more (' + this._summarizeTypes(omitted) + ')');
    }

    return lines;
};

/**
 * Summarize a list of sibling nodes as an insertion-ordered type histogram, e.g.
 * "sap.m.StandardListItem × 12, sap.m.GroupHeaderListItem × 2".
 * @private
 * @param {Array} nodes
 * @returns {string}
 */
ReproductionPromptBuilder.prototype._summarizeTypes = function (nodes) {
    var histogram = Object.create(null);
    var order = [];
    nodes.forEach(function (node) {
        var type = node.type || '?';
        if (!Object.prototype.hasOwnProperty.call(histogram, type)) {
            histogram[type] = 0;
            order.push(type);
        }
        histogram[type] += 1;
    });
    return order.map(function (type) {
        return type + ' × ' + histogram[type];
    }).join(', ');
};

/**
 * @private
 * @param {{path: string, model: string, mode: string, value: *}} binding
 * @param {Object} options
 * @returns {string}
 */
ReproductionPromptBuilder.prototype._renderBinding = function (binding, options) {
    var location = binding.model ? binding.model + '>' + (binding.path || '') : (binding.path || '(composite)');
    var rendered = '{' + location + '}';
    if (binding.mode) {
        rendered += ' [' + binding.mode + ']';
    }
    if (options.includeRealData && binding.value !== undefined) {
        rendered += ' = ' + this._renderValue(binding.value, options);
    }
    return rendered;
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._buildEnvironmentSection = function (meta, options) {
    var lines = ['## Environment'];
    if (meta.framework) {
        lines.push('- Framework: ' + meta.framework + (meta.version ? ' ' + meta.version : ''));
    }
    if (meta.theme) {
        lines.push('- Theme: ' + meta.theme);
    }
    if (meta.locale) {
        lines.push('- Locale: ' + meta.locale);
    }
    if (meta.libraries && meta.libraries.length) {
        lines.push('- Loaded libraries: ' + meta.libraries.join(', '));
    }
    if (meta.title) {
        lines.push('- Page title: ' + this._renderValue(meta.title, options));
    }
    if (meta.url) {
        lines.push('- URL: ' + (options.includeRealData ? meta.url : REDACTED));
    }
    return lines.join('\n');
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._buildErrorsSection = function (consoleErrors) {
    if (!Array.isArray(consoleErrors) || consoleErrors.length === 0) {
        return '';
    }
    // Buffer is oldest-first; show newest first so the triggering error leads.
    var reversed = consoleErrors.slice().reverse();
    var lines = ['## Reported console errors'];
    reversed.forEach(function (entry) {
        var count = entry.count > 1 ? ' (×' + entry.count + ')' : '';
        lines.push('- ' + (entry.message || '') + count);
    });
    return lines.join('\n');
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._buildTreeSection = function (tree, options) {
    var lines = ['## Control tree'];
    var body = [];
    for (var i = 0; i < tree.length; i++) {
        body = body.concat(this._renderNode(tree[i], 0, options));
    }
    if (body.length > options.maxTreeLines) {
        body = body.slice(0, options.maxTreeLines);
        body.push('… [outline truncated to fit the editor line budget]');
    }
    var rendered = body.join('\n');
    if (rendered.length > options.maxTreeChars) {
        rendered = rendered.substring(0, options.maxTreeChars) + '\n… [tree truncated]';
    }
    lines.push(rendered || '(no controls found)');
    return lines.join('\n');
};

/**
 * The issue the reproduction must surface. Drives the reduction: when present, the LLM is told to
 * keep only what is on the path to this issue.
 * @private
 * @param {string} issue
 * @returns {string}
 */
ReproductionPromptBuilder.prototype._buildIssueSection = function (issue) {
    if (!issue || !issue.trim()) {
        return '';
    }
    return '## Issue to reproduce\n' + issue.trim();
};

/**
 * Output budget guidance. Mirrors the snippet tool's own advice: stay under the editor line limit,
 * and split into one-file-at-a-time responses when the reproduction would exceed it.
 * @private
 * @param {Object} options
 * @returns {string}
 */
ReproductionPromptBuilder.prototype._buildOutputBudgetSection = function (options) {
    return '## Output budget (important)\n' +
        'The target editor accepts at most ' + options.maxOutputLines + ' lines, so keep every response under ' + options.maxOutputLines + ' lines.\n' +
        '- Produce the smallest reproduction that still shows the issue; omit anything unrelated and do not pad with comments or boilerplate.\n' +
        '- If the reproduction would exceed the limit, split it into separate files and output ONE file at a time — start with index.html, then each *.view.xml, *.controller.js and the model JSON — and wait for "continue" before the next file.';
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._buildInstructions = function (hasIssue) {
    var reductionRule = hasIssue ?
        '5. Reduce aggressively: include ONLY the controls, bindings and data on the path to the issue above. Drop sibling branches, decorative controls and unrelated views.' :
        '5. Keep it minimal — include only what is needed to reproduce the reported issue.';

    return '## What to produce\n' +
        '1. Primary: a single self-contained index.html that bootstraps UI5 from the CDN, defines the UI as an inline XMLView, and wires behaviour in one Controller.\n' +
        '2. If the app is complex (routing, several views, a Component), instead produce a Component-based skeleton: Component.js, manifest.json, one *.view.xml and *.controller.js per view.\n' +
        '3. Recreate the control tree exactly: keep the same control types, the same ids, and the same non-default properties shown in the outline.\n' +
        '4. For every binding, create a JSONModel under the named model with the same path shape, and fill it with representative mock data (real values were redacted for privacy).\n' +
        reductionRule;
};

/**
 * @private
 */
ReproductionPromptBuilder.prototype._buildNotes = function (stats, options) {
    var notes = ['## Notes'];
    if (!options.includeRealData) {
        notes.push('- Values shown as ' + REDACTED + ' were masked for privacy; substitute representative mock data.');
    } else {
        notes.push('- Real values are included and may contain sensitive data — handle accordingly.');
    }
    if (stats && stats.truncated) {
        notes.push('- The control tree was large and has been truncated; only the first ' + stats.controlCount + ' controls are described.');
    }
    return notes.join('\n');
};

/**
 * Resolve caller options against the module defaults.
 * @private
 * @param {Object} options
 * @returns {Object}
 */
ReproductionPromptBuilder.prototype._resolveOptions = function (options) {
    return {
        includeRealData: options.includeRealData === true,
        issue: typeof options.issue === 'string' ? options.issue : '',
        maxValueLength: typeof options.maxValueLength === 'number' ? options.maxValueLength : DEFAULT_MAX_VALUE_LENGTH,
        maxTreeChars: typeof options.maxTreeChars === 'number' ? options.maxTreeChars : DEFAULT_MAX_TREE_CHARS,
        maxTreeLines: typeof options.maxTreeLines === 'number' ? options.maxTreeLines : DEFAULT_MAX_TREE_LINES,
        maxChildrenPerNode: typeof options.maxChildrenPerNode === 'number' ? options.maxChildrenPerNode : DEFAULT_MAX_CHILDREN_PER_NODE,
        maxDepth: typeof options.maxDepth === 'number' ? options.maxDepth : DEFAULT_MAX_DEPTH,
        maxOutputLines: typeof options.maxOutputLines === 'number' ? options.maxOutputLines : DEFAULT_MAX_OUTPUT_LINES
    };
};

/**
 * Build the full reproduction prompt from a crawler snapshot.
 *
 * @param {Object} snapshot - Output of `reproductionCrawler.crawl()`.
 * @param {Object} [options]
 * @param {boolean} [options.includeRealData=false] - Include real property/model values instead of
 *     masking them. Opt-in because production apps contain sensitive data.
 * @param {string} [options.issue] - Description of the reported issue. When set, the prompt tells
 *     the LLM to reduce the reproduction to only what reproduces this issue.
 * @param {number} [options.maxValueLength] - Per-value truncation length.
 * @param {number} [options.maxTreeChars] - Control-tree outline character cap.
 * @param {number} [options.maxTreeLines] - Control-tree outline line cap.
 * @param {number} [options.maxChildrenPerNode] - Representative children kept before collapsing.
 * @param {number} [options.maxDepth] - Deepest nesting level rendered.
 * @param {number} [options.maxOutputLines] - Line budget the LLM is told to keep generated code within.
 * @returns {string}
 */
ReproductionPromptBuilder.prototype.build = function (snapshot, options) {
    snapshot = snapshot || {};
    var resolved = this._resolveOptions(options || {});

    var meta = snapshot.meta || {};
    var tree = Array.isArray(snapshot.tree) ? snapshot.tree : [];

    var intro = '# UI5 Reproduction Request\n' +
        'You are a SAPUI5 expert. Using the application description below, recreate a minimal, runnable reproduction so customer support can reproduce a reported issue. Preserve the structure and behaviour; do not add anything that is not described.';

    var sections = [intro];

    var issueSection = this._buildIssueSection(resolved.issue);
    if (issueSection) {
        sections.push(issueSection);
    }

    sections.push(this._buildEnvironmentSection(meta, resolved));

    var errors = this._buildErrorsSection(snapshot.consoleErrors);
    if (errors) {
        sections.push(errors);
    }

    sections.push(this._buildTreeSection(tree, resolved));
    sections.push(this._buildInstructions(!!resolved.issue));
    sections.push(this._buildOutputBudgetSection(resolved));
    sections.push(this._buildNotes(snapshot.stats, resolved));

    return sections.join('\n\n');
};

module.exports = ReproductionPromptBuilder;
