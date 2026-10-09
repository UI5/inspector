'use strict';

// Hard ceiling so a huge app cannot freeze the page or blow up the message payload.
// When the tree has more controls than this, the crawl stops descending and marks the
// snapshot as truncated.
var DEFAULT_MAX_CONTROLS = 2000;

/**
 * Flatten a framework URLParameters map (`{key: [values]}`) into `{key: 'a, b'}`.
 * @param {Object} urlParameters
 * @returns {Object}
 * @private
 */
function _flattenUrlParameters(urlParameters) {
    var result = {};
    if (!urlParameters) {
        return result;
    }
    Object.keys(urlParameters).forEach(function (key) {
        var value = urlParameters[key];
        result[key] = Array.isArray(value) ? value.join(', ') : value;
    });
    return result;
}

/**
 * Collect the non-default properties of a control, merging own and inherited metadata groups.
 * Own definitions win over inherited ones with the same name.
 * @param {Object} toolsAPI
 * @param {string} controlId
 * @returns {Array<{name: string, value: *, type: string}>}
 * @private
 */
function _collectProperties(toolsAPI, controlId) {
    var collected = [];
    var seen = Object.create(null);
    var data;

    try {
        data = toolsAPI.getControlProperties(controlId);
    } catch (e) {
        return collected;
    }

    if (!data) {
        return collected;
    }

    function addGroup(group) {
        if (!group || !group.properties) {
            return;
        }
        Object.keys(group.properties).forEach(function (name) {
            if (seen[name]) {
                return;
            }
            var property = group.properties[name];
            // Only non-default values matter for a reproduction — defaults are implied.
            if (property && property.isDefault === false) {
                seen[name] = true;
                collected.push({
                    name: name,
                    value: property.value,
                    type: property.type || ''
                });
            }
        });
    }

    addGroup(data.own);
    if (Array.isArray(data.inherited)) {
        data.inherited.forEach(addGroup);
    }

    return collected;
}

/**
 * Collect the binding information of a control: property bindings (path, model, mode) and
 * aggregation bindings (model only — ToolsAPI does not expose the aggregation path).
 * @param {Object} toolsAPI
 * @param {string} controlId
 * @returns {{properties: Object, aggregations: Object}}
 * @private
 */
function _collectBindings(toolsAPI, controlId) {
    var result = { properties: {}, aggregations: {} };
    var data;

    try {
        data = toolsAPI.getControlBindings(controlId);
    } catch (e) {
        return result;
    }

    if (!data) {
        return result;
    }

    if (data.properties) {
        Object.keys(data.properties).forEach(function (key) {
            var binding = data.properties[key];
            result.properties[key] = {
                path: binding.path || '',
                model: binding.model || '',
                mode: binding.mode || '',
                value: binding.value
            };
        });
    }

    if (data.aggregations) {
        Object.keys(data.aggregations).forEach(function (key) {
            result.aggregations[key] = {
                model: (data.aggregations[key] && data.aggregations[key].model) || ''
            };
        });
    }

    return result;
}

/**
 * Walk the rendered control-tree model depth-first, enriching each control node with its
 * non-default properties and bindings. Honors `state.max`; once reached, descent stops and
 * `state.truncated` is set.
 * @param {Object} toolsAPI
 * @param {Array} nodes - ToolsAPI.getRenderedControlTree() output (or a `content` sub-array).
 * @param {{count: number, max: number, truncated: boolean}} state
 * @returns {Array}
 * @private
 */
function _walk(toolsAPI, nodes, state) {
    var out = [];

    if (!Array.isArray(nodes)) {
        return out;
    }

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];

        if (state.count >= state.max) {
            state.truncated = true;
            break;
        }

        // Non-control grouping nodes (UIAreas) carry no inspectable data; keep their
        // structure and recurse into their content.
        var isControl = node.type === 'sap-ui-control';

        var enriched = {
            id: node.id,
            type: node.name || '',
            isControl: isControl,
            properties: isControl ? _collectProperties(toolsAPI, node.id) : [],
            bindings: isControl ? _collectBindings(toolsAPI, node.id) : { properties: {}, aggregations: {} },
            children: []
        };

        if (isControl) {
            state.count += 1;
        }

        enriched.children = _walk(toolsAPI, node.content, state);
        out.push(enriched);
    }

    return out;
}

/**
 * Build the application metadata block from framework information and page env.
 * @param {Object} frameworkInformation
 * @param {Object} env
 * @returns {Object}
 * @private
 */
function _buildMeta(frameworkInformation, env) {
    var info = frameworkInformation || {};
    var common = info.commonInformation || {};
    var computed = info.configurationComputed || {};

    return {
        framework: common.frameworkName || '',
        version: common.version || '',
        url: env.href || '',
        title: env.title || '',
        theme: computed.theme || '',
        locale: computed.language || computed.locale || '',
        libraries: info.loadedLibraries ? Object.keys(info.loadedLibraries) : [],
        bootstrap: info.configurationBootstrap || {},
        urlParameters: _flattenUrlParameters(info.URLParameters)
    };
}

/**
 * Crawl the inspected UI5 application into a serializable snapshot the ReproductionPromptBuilder
 * turns into an LLM prompt. Pure given its dependencies — `toolsAPI` and `env` are injected so the
 * crawler is unit-testable without a live page.
 *
 * @param {Object} toolsAPI - The page `ToolsAPI`. Needs `getRenderedControlTree`,
 *     `getFrameworkInformation`, `getControlProperties`, `getControlBindings`.
 * @param {Object} [env] - Page environment facts.
 * @param {string} [env.href] - `location.href` of the inspected page.
 * @param {string} [env.title] - `document.title` of the inspected page.
 * @param {Array} [env.consoleErrors] - Recent console-error snapshot from the error buffer.
 * @param {Object} [options]
 * @param {number} [options.maxControls] - Descent ceiling. Defaults to {@link DEFAULT_MAX_CONTROLS}.
 * @returns {Promise<Object>} Resolves with `{meta, consoleErrors, tree, stats}`.
 */
function crawl(toolsAPI, env, options) {
    env = env || {};
    options = options || {};

    var state = {
        count: 0,
        max: typeof options.maxControls === 'number' ? options.maxControls : DEFAULT_MAX_CONTROLS,
        truncated: false
    };

    var treeModel;
    try {
        treeModel = toolsAPI.getRenderedControlTree();
    } catch (e) {
        treeModel = [];
    }

    var tree = _walk(toolsAPI, treeModel, state);

    return Promise.resolve(toolsAPI.getFrameworkInformation()).then(function (frameworkInformation) {
        return {
            meta: _buildMeta(frameworkInformation, env),
            consoleErrors: Array.isArray(env.consoleErrors) ? env.consoleErrors : [],
            tree: tree,
            stats: {
                controlCount: state.count,
                truncated: state.truncated
            }
        };
    });
}

module.exports = {
    DEFAULT_MAX_CONTROLS: DEFAULT_MAX_CONTROLS,
    crawl: crawl
};
