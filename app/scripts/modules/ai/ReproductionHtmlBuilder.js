'use strict';

var DEFAULT_BOOTSTRAP = 'https://ui5.sap.com/resources/sap-ui-core.js';
var INDENT = '  ';

// ─── helpers ────────────────────────────────────────────────────────────────

function _splitType(type) {
    var lastDot = (type || '').lastIndexOf('.');
    if (lastDot === -1) {
        return { namespace: '', localName: type || '' };
    }
    return { namespace: type.substring(0, lastDot), localName: type.substring(lastDot + 1) };
}

function _escapeAttr(val) {
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// UI5 XML views treat '{' as the start of a binding expression; literal braces must be escaped.
function _escapeLiteral(val) {
    return String(val).replace(/[{}]/g, '\\$&');
}

function _collectNamespaces(nodes) {
    var counts = Object.create(null);
    function walk(list) {
        if (!Array.isArray(list)) { return; }
        list.forEach(function (n) {
            if (n.isControl && n.type) {
                var ns = _splitType(n.type).namespace;
                if (ns) { counts[ns] = (counts[ns] || 0) + 1; }
            }
            walk(n.children);
        });
    }
    walk(nodes);
    return counts;
}

// Public UI5 runtime libraries resolvable from the standard CDN. Used to turn the control types in
// the tree into a safe `data-sap-ui-libs` list. The crawler's `meta.libraries` is NOT used for the
// bootstrap because it reflects EVERY loaded library of the inspected app — including internal /
// adapter libraries (e.g. sap.cf.adapters, sap.ui.fl, sap.ushell.*) that are not on the public CDN.
// Declaring those makes UI5 request a missing `.../library.js` and the reproduction fails to boot.
var _KNOWN_LIBRARIES = [
    'sap.m', 'sap.f', 'sap.tnt', 'sap.uxap', 'sap.fe',
    'sap.ui.core', 'sap.ui.layout', 'sap.ui.table', 'sap.ui.unified', 'sap.ui.commons',
    'sap.ui.comp', 'sap.ui.mdc', 'sap.ui.generic.app', 'sap.ui.integration', 'sap.ui.export',
    'sap.ui.richtexteditor', 'sap.ui.codeeditor', 'sap.ui.documentation', 'sap.ui.suite',
    'sap.ui.webc.main', 'sap.ui.webc.fiori',
    'sap.suite.ui.commons', 'sap.suite.ui.generic.template', 'sap.suite.ui.microchart',
    'sap.chart', 'sap.viz', 'sap.ovp', 'sap.gantt', 'sap.ui.vk', 'sap.ui.vbm',
    'sap.me', 'sap.ndc', 'sap.ca.ui', 'sap.collaboration'
];

// Map a control type to the public library it belongs to (longest matching known-library prefix),
// or '' when none matches (an internal/unknown control — left to UI5's on-demand loading).
function _libraryForType(type) {
    var best = '';
    _KNOWN_LIBRARIES.forEach(function (lib) {
        if ((type === lib || type.indexOf(lib + '.') === 0) && lib.length > best.length) {
            best = lib;
        }
    });
    return best;
}

// The set of public libraries actually used by controls in the tree, in a stable order.
function _collectLibraries(nodes) {
    var seen = Object.create(null);
    function walk(list) {
        if (!Array.isArray(list)) { return; }
        list.forEach(function (n) {
            if (n.isControl && n.type) {
                var lib = _libraryForType(n.type);
                if (lib) { seen[lib] = true; }
            }
            walk(n.children);
        });
    }
    walk(nodes);
    return Object.keys(seen);
}

// The libraries to preload in the generated bootstrap: every PUBLIC library the inspected app had
// loaded (so a public lib needed only for a formatter/type, with no control in the tree, is still
// kept — maximizing fidelity), unioned with the libraries the control tree actually uses. Internal/
// adapter libraries that are not on the public CDN are excluded because they 404 and cannot be
// reproduced in a standalone app anyway. Falls back to sap.m so an empty tree still boots.
function _safeLibraries(nodes, metaLibraries) {
    var seen = Object.create(null);
    _collectLibraries(nodes).forEach(function (lib) {
        seen[lib] = true;
    });
    (metaLibraries || []).forEach(function (lib) {
        if (_KNOWN_LIBRARIES.indexOf(lib) !== -1) {
            seen[lib] = true;
        }
    });
    var libs = Object.keys(seen);
    return libs.length ? libs : ['sap.m'];
}

function _buildPrefixMap(nsCounts) {
    var namespaces = Object.keys(nsCounts);
    namespaces.sort(function (a, b) {
        return (nsCounts[b] - nsCounts[a]) || a.localeCompare(b);
    });

    var map = Object.create(null);
    var usedPrefixes = Object.create(null);

    namespaces.forEach(function (ns, idx) {
        if (idx === 0) {
            map[ns] = '';
            return;
        }
        var lastDot = ns.lastIndexOf('.');
        var base;
        if (ns === 'sap.ui.core') {
            base = 'core';
        } else if (lastDot === -1) {
            base = ns;
        } else {
            base = ns.substring(lastDot + 1);
        }
        var prefix = base;
        var counter = 2;
        while (usedPrefixes[prefix]) {
            prefix = base + counter;
            counter += 1;
        }
        usedPrefixes[prefix] = true;
        map[ns] = prefix;
    });

    if (map['sap.ui.core'] === undefined) {
        map['sap.ui.core'] = 'core';
    }
    return map;
}

function _qualifyType(type, prefixMap) {
    var parts = _splitType(type);
    var prefix = prefixMap[parts.namespace];
    return (prefix === '' || prefix === undefined) ? parts.localName : prefix + ':' + parts.localName;
}

function _renderBinding(binding) {
    if (!binding) { return ''; }
    var model = binding.model || '';
    var path = binding.path || '';
    var mode = binding.mode || '';
    if (!mode || mode === 'Default' || mode === 'TwoWay') {
        return '{' + (model ? model + '>' : '') + path + '}';
    }
    var inner = 'path:' + JSON.stringify(path);
    if (model) { inner += ', model:' + JSON.stringify(model); }
    inner += ', mode:' + JSON.stringify(mode);
    return '{' + inner + '}';
}

function _buildAttributes(node, prefixMap) {
    var attrs = [];
    var bindingProps = (node.bindings && node.bindings.properties) || {};

    if (node.id) { attrs.push('id="' + _escapeAttr(node.id) + '"'); }

    (node.properties || []).forEach(function (prop) {
        if (bindingProps[prop.name]) { return; }
        var val = prop.value;
        if (typeof val === 'boolean' || typeof val === 'number') {
            attrs.push(prop.name + '="' + val + '"');
        } else if (typeof val === 'string') {
            attrs.push(prop.name + '="' + _escapeAttr(_escapeLiteral(val)) + '"');
        }
    });

    Object.keys(bindingProps).forEach(function (name) {
        attrs.push(name + '="' + _escapeAttr(_renderBinding(bindingProps[name])) + '"');
    });

    return attrs;
}

function _groupChildrenByAggregation(children) {
    var groups = [];
    var byAgg = Object.create(null);
    children.forEach(function (child) {
        var key = child.aggregation || '';
        if (!byAgg[key]) {
            byAgg[key] = [];
            groups.push({ aggregation: child.aggregation, nodes: byAgg[key] });
        }
        byAgg[key].push(child);
    });
    return groups;
}

function _collectModels(nodes) {
    var modelMap = Object.create(null);
    function walk(list) {
        if (!Array.isArray(list)) { return; }
        list.forEach(function (n) {
            var props = (n.bindings && n.bindings.properties) || {};
            Object.keys(props).forEach(function (name) {
                var key = props[name].model || '';
                if (!modelMap[key]) { modelMap[key] = props[name].model || undefined; }
            });
            var aggs = (n.bindings && n.bindings.aggregations) || {};
            Object.keys(aggs).forEach(function (name) {
                var key = aggs[name].model || '';
                if (!modelMap[key]) { modelMap[key] = aggs[name].model || undefined; }
            });
            walk(n.children);
        });
    }
    walk(nodes);
    return Object.keys(modelMap).map(function (k) { return { name: modelMap[k] }; });
}

function _buildModelsJs(models) {
    if (!models || !models.length) { return '[]'; }
    var parts = models.map(function (m) {
        return '{ name: ' + (m.name ? JSON.stringify(m.name) : 'undefined') + ', data: {} }';
    });
    return '[\n        ' + parts.join(',\n        ') + '\n    ]';
}

// ─── HTML template ──────────────────────────────────────────────────────────
// Placeholders: {{TITLE}}, {{BOOTSTRAP_URL}}, {{LIBRARIES}}, {{THEME}}, {{XML_VIEW}}, {{MODELS_JS}}

var _HTML_TEMPLATE =
    '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head>\n' +
    '    <meta charset="utf-8">\n' +
    '    <title>{{TITLE}}</title>\n' +
    '    <style>html, body, #content { height: 100%; }</style>\n' +
    '    <script id="sap-ui-bootstrap"\n' +
    '        src="{{BOOTSTRAP_URL}}"\n' +
    '        data-sap-ui-libs="{{LIBRARIES}}"\n' +
    '        data-sap-ui-theme="{{THEME}}"\n' +
    '        data-sap-ui-compatVersion="edge"\n' +
    '        data-sap-ui-async="true"></scr' + 'ipt>\n' +
    '</head>\n' +
    '<body class="sapUiBody">\n' +
    '    <div id="content"></div>\n' +
    '    <script id="reproViewXml" type="sapui5/xmlview">{{XML_VIEW}}</scr' + 'ipt>\n' +
    '    <script>\n' +
    '        var aModels = {{MODELS_JS}};\n' +
    '        var sViewXml = document.getElementById("reproViewXml").textContent;\n' +
    '        sap.ui.require([\n' +
    '            "sap/ui/core/Core",\n' +
    '            "sap/ui/core/Element",\n' +
    '            "sap/ui/core/Fragment",\n' +
    '            "sap/ui/model/json/JSONModel"\n' +
    '        ], function (Core, Element, Fragment, JSONModel) {\n' +
    '            "use strict";\n' +
    '            function setUp(aRoots) {\n' +
    '                aModels.forEach(function (oEntry) {\n' +
    '                    var oModel = new JSONModel(oEntry.data || {});\n' +
    '                    aRoots.forEach(function (oRoot) {\n' +
    '                        oRoot.setModel(oModel, oEntry.name);\n' +
    '                    });\n' +
    '                });\n' +
    '            }\n' +
    '            Core.ready(function () {\n' +
    '                Fragment.load({ definition: sViewXml }).then(function (vContent) {\n' +
    '                    var aRoots = [].concat(vContent);\n' +
    '                    setUp(aRoots);\n' +
    '                    aRoots.forEach(function (oRoot) { oRoot.placeAt("content"); });\n' +
    '                }).catch(function (oError) {\n' +
    '                    var pre = document.createElement("pre");\n' +
    '                    pre.style.color = "#b00";\n' +
    '                    pre.textContent = "Could not load content: " + (oError && oError.message || oError);\n' +
    '                    document.body.insertBefore(pre, document.body.firstChild);\n' +
    '                });\n' +
    '            });\n' +
    '        });\n' +
    '    </scr' + 'ipt>\n' +
    '</body>\n' +
    '</html>';

// ─── constructor ─────────────────────────────────────────────────────────────

/**
 * Generates a standalone runnable HTML file from a reproduction crawler snapshot. The HTML file
 * bootstraps UI5 from CDN, embeds the control tree as an XML fragment, and wires placeholder
 * JSONModels for each binding model detected in the snapshot.
 * @constructor
 */
function ReproductionHtmlBuilder() {}

/**
 * Build the `<core:FragmentDefinition>` XML string from the crawler tree. Controls are emitted
 * with their non-default properties as XML attributes. Smart-generated children are omitted
 * (the smart control recreates them at runtime). Children in non-default aggregations are wrapped
 * in aggregation tags using the parent's namespace prefix.
 * @param {Array} tree
 * @returns {string}
 */
ReproductionHtmlBuilder.prototype._buildXmlFragment = function (tree) {
    var nsCounts = _collectNamespaces(tree);
    var prefixMap = _buildPrefixMap(nsCounts);

    var corePrefix = prefixMap['sap.ui.core'] || 'core';
    var openTag = (corePrefix === '' ? '' : corePrefix + ':') + 'FragmentDefinition';

    var decls = [];
    Object.keys(prefixMap).forEach(function (ns) {
        var prefix = prefixMap[ns];
        if (prefix === '') {
            decls.unshift('xmlns="' + ns + '"');
        } else {
            decls.push('xmlns:' + prefix + '="' + ns + '"');
        }
    });

    var fragmentOpen = '<' + openTag + '\n    ' + decls.join('\n    ') + '>';
    var lines = [fragmentOpen];

    var self = this;
    tree.forEach(function (node) {
        self._emitNode(node, 1, prefixMap, lines);
    });

    lines.push('</' + openTag + '>');
    return lines.join('\n');
};

/**
 * Recursively emit one control node into `lines`. Non-control grouping nodes (UIAreas) are
 * transparent — their children are emitted at the same depth. Smart-generated nodes are skipped.
 * @param {Object} node
 * @param {number} depth
 * @param {Object} prefixMap
 * @param {Array<string>} lines
 */
ReproductionHtmlBuilder.prototype._emitNode = function (node, depth, prefixMap, lines) {
    var self = this;
    if (!node || node.isSmartGenerated) { return; }

    if (!node.isControl) {
        (node.children || []).forEach(function (child) {
            self._emitNode(child, depth, prefixMap, lines);
        });
        return;
    }

    if (!node.type) { return; }

    var indent = INDENT.repeat(depth);
    var tag = _qualifyType(node.type, prefixMap);
    var attrs = _buildAttributes(node, prefixMap);
    var attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    var children = (node.children || []).filter(function (c) { return !c.isSmartGenerated; });

    if (!children.length) {
        lines.push(indent + '<' + tag + attrStr + '/>');
        return;
    }

    lines.push(indent + '<' + tag + attrStr + '>');

    var parentPrefix = prefixMap[_splitType(node.type).namespace] || '';
    var groups = _groupChildrenByAggregation(children);

    groups.forEach(function (group) {
        var aggName = group.aggregation;
        if (aggName) {
            var aggTag = parentPrefix ? parentPrefix + ':' + aggName : aggName;
            lines.push(indent + INDENT + '<' + aggTag + '>');
            group.nodes.forEach(function (child) {
                self._emitNode(child, depth + 2, prefixMap, lines);
            });
            lines.push(indent + INDENT + '</' + aggTag + '>');
        } else {
            group.nodes.forEach(function (child) {
                self._emitNode(child, depth + 1, prefixMap, lines);
            });
        }
    });

    lines.push(indent + '</' + tag + '>');
};

/**
 * Assemble the full HTML from already-generated parts.
 * @param {Object} meta - Snapshot metadata (`libraries`, `theme`, `title`).
 * @param {string} xmlFragment - Output of `_buildXmlFragment`.
 * @param {Array} models - Output of `_collectModels`.
 * @param {Object} options
 * @returns {string}
 */
ReproductionHtmlBuilder.prototype._buildHtml = function (meta, xmlFragment, models, options) {
    var bootstrap = (options && options.bootstrapUrl) || DEFAULT_BOOTSTRAP;
    var libs = ((meta && meta.libraries) || []).join(',');
    var theme = (meta && meta.theme) || 'sap_horizon';
    var title = (meta && meta.title) || 'UI5 Reproduction';

    return _HTML_TEMPLATE
        .replace('{{TITLE}}', _escapeAttr(title))
        .replace('{{BOOTSTRAP_URL}}', bootstrap)
        .replace('{{LIBRARIES}}', _escapeAttr(libs))
        .replace('{{THEME}}', _escapeAttr(theme))
        .replace('{{XML_VIEW}}', function () { return xmlFragment; })
        .replace('{{MODELS_JS}}', function () { return _buildModelsJs(models); });
};

/**
 * Generate a complete standalone HTML reproduction from a crawler snapshot.
 *
 * @param {Object} [snapshot] - Crawler snapshot from `reproductionCrawler.crawl()`.
 * @param {string} [snapshot.meta.title] - Page title.
 * @param {string} [snapshot.meta.theme] - UI5 theme.
 * @param {Array<string>} [snapshot.meta.libraries] - Loaded UI5 libraries.
 * @param {Array} [snapshot.tree] - Enriched control tree.
 * @param {Array} [snapshot.frames] - Per-frame sub-snapshots (multi-frame apps).
 * @param {Object} [options]
 * @param {string} [options.bootstrapUrl] - Override the CDN bootstrap URL.
 * @returns {string} A complete HTML string ready to save and open in a browser.
 */
ReproductionHtmlBuilder.prototype.build = function (snapshot, options) {
    snapshot = snapshot || {};
    options = options || {};

    var meta = snapshot.meta || {};
    var tree = snapshot.tree || [];

    if (Array.isArray(snapshot.frames) && snapshot.frames.length > 1) {
        tree = [];
        snapshot.frames.forEach(function (frame) {
            tree = tree.concat(frame.tree || []);
        });
    }

    var xmlFragment = this._buildXmlFragment(tree);
    var models = _collectModels(tree);

    // Bootstrap the public libraries the app loaded, unioned with those the control tree uses —
    // never the raw loadedLibraries, which can include internal/adapter libs that 404 on the CDN.
    var libraries = _safeLibraries(tree, meta.libraries);
    var safeMeta = Object.assign({}, meta, { libraries: libraries });

    return this._buildHtml(safeMeta, xmlFragment, models, options);
};

module.exports = ReproductionHtmlBuilder;
