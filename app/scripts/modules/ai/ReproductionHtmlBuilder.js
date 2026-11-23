'use strict';

var DEFAULT_BOOTSTRAP = 'https://ui5.sap.com/resources/sap-ui-core.js';
var INDENT = '  ';

// Bootstrap the reproduction from the app's ACTUAL UI5 version when the crawler captured it, so
// version-specific modules resolve (e.g. a web component whose dependency path differs between the
// app's version and the CDN's latest — the cause of spurious `sap/m/*.js` 404s). ui5.sap.com serves
// versioned SAPUI5 at `/<version>/resources/...`; falls back to the latest (version-less) bootstrap.
function _defaultBootstrap(meta) {
    var version = meta && meta.version;
    if (typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version)) {
        return 'https://ui5.sap.com/' + version + '/resources/sap-ui-core.js';
    }
    return DEFAULT_BOOTSTRAP;
}

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

// Emit `name="value"` for a primitive value, escaping XML and literal braces so an inlined value
// like "{x}" is not re-parsed as a binding. Non-primitive / empty values are skipped: a standalone
// reproduction has no live model to resolve them against, so there is nothing faithful to emit.
function _pushLiteralAttr(attrs, name, val) {
    if (typeof val === 'boolean' || typeof val === 'number') {
        attrs.push(name + '="' + val + '"');
    } else if (typeof val === 'string' && val !== '') {
        attrs.push(name + '="' + _escapeAttr(_escapeLiteral(val)) + '"');
    }
}

// UI5 assigns a runtime id of the form `__<lowercasedClassName><counter>` (e.g. `__image0`,
// `__button3`, `__xmlview0`) to every control the app created without an explicit id. These are NOT
// stable author ids — they come from UI5's global uid counter. Reproducing one verbatim as
// `id="__image0"` collides with the fresh `__image0` UI5 generates from that same counter at
// runtime, giving a "duplicate id" error. Such ids must be omitted so UI5 re-assigns its own.
function _isAutoGeneratedId(id) {
    return typeof id === 'string' && id.indexOf('__') === 0;
}

// Control-type namespaces that cannot run in a standalone CDN reproduction. `sap.ushell.*` are Fiori
// Launchpad shell controls: they reach into the FLP runtime (BootstrapConfig, shell models, the
// `sap-ushell-config` global) the moment they instantiate, which does not exist outside a launchpad.
// Emitting them makes the reproduction log "Config accessed before BootstrapConfig was initialized"
// and shell-header `getModel` TypeErrors. We inline their children (so real app content nested below
// the shell survives) but never emit the shell control element itself.
function _isNonReproducibleControl(type) {
    return typeof type === 'string' && type.indexOf('sap.ushell.') === 0;
}

// mvc.View subclasses declared with a `viewName` try to LOAD that named view module at runtime
// (e.g. an internal `sap.ushell.components.shell.ShellBar.view.ShellBar`), which does not exist in a
// standalone CDN reproduction and rejects Fragment.load. The crawler already captured the view's
// rendered content as child nodes, so we treat views as transparent: emit their children in place
// and drop the view element (and its unresolved `viewName`/bindings) entirely.
function _isTransparentView(type) {
    return type === 'sap.ui.core.mvc.XMLView' ||
        type === 'sap.ui.core.mvc.JSView' ||
        type === 'sap.ui.core.mvc.JSONView' ||
        type === 'sap.ui.core.mvc.HTMLView' ||
        type === 'sap.ui.core.mvc.View';
}

// Normalize a list of names into a map-like set for O(1) membership tests. Non-string / empty
// entries are ignored so callers can pass a loose array.
function _toSet(names) {
    var set = Object.create(null);
    (names || []).forEach(function (name) {
        if (typeof name === 'string' && name) { set[name] = true; }
    });
    return set;
}

// Return a copy of the tree with every control whose type is in `excludeSet` removed along with its
// entire subtree. Used by the deterministic fix loop (see ReproductionHtmlFixer): when the render
// check blames a control type that cannot load/instantiate in a standalone reproduction, the next
// build drops it so the rest of the app can still render. Non-control grouping nodes are kept and
// recursed into. Returns the same tree reference semantics (a new array of new nodes).
function _pruneExcludedTypes(nodes, excludeSet) {
    if (!Array.isArray(nodes)) { return []; }
    var result = [];
    nodes.forEach(function (node) {
        if (node && node.isControl && node.type && excludeSet[node.type]) {
            return; // drop this control and its whole subtree
        }
        var copy = {};
        Object.keys(node || {}).forEach(function (key) { copy[key] = node[key]; });
        copy.children = _pruneExcludedTypes(node && node.children, excludeSet);
        result.push(copy);
    });
    return result;
}

function _buildAttributes(node, prefixMap) {
    var attrs = [];
    var bindingProps = (node.bindings && node.bindings.properties) || {};

    if (node.id && !_isAutoGeneratedId(node.id)) { attrs.push('id="' + _escapeAttr(node.id) + '"'); }

    (node.properties || []).forEach(function (prop) {
        if (bindingProps[prop.name]) { return; }
        _pushLiteralAttr(attrs, prop.name, prop.value);
    });

    // A reproduction is a static snapshot: inline each bound property's RESOLVED value (captured by
    // the crawler as binding.value = control.getBinding(key).getValue()) as a literal, rather than
    // reconstructing a {model>path} binding to a model that does not exist standalone. ToolsAPI
    // returns binding.model as a descriptor OBJECT (not a model name), so the old reconstruction
    // produced invalid syntax ("{[object Object]>}", full-JSON dumps) that crashed Fragment.load.
    Object.keys(bindingProps).forEach(function (name) {
        _pushLiteralAttr(attrs, name, bindingProps[name].value);
    });

    return attrs;
}

// Private aggregations (conventionally underscore-prefixed, e.g. SysInfoBar's `_bar`) hold controls
// the parent builds and manages itself. They cannot be set from an XML view — UI5 rejects the
// fragment with "Cannot add direct child without default aggregation defined". The parent recreates
// them at runtime, so emittable reproduction output must drop any child sitting in one. A child with
// no aggregation name (sParentAggregationName === '') is an internal implementation child too.
function _isPrivateAggregationChild(child) {
    const agg = child && child.aggregation;
    return !agg || agg.charAt(0) === '_';
}

// Collect every control id in the tree into a lookup set. Used to detect auto-generated suffix ids:
// if "btn-describedby" is in the tree alongside "btn", the former is an internal implementation
// node (ARIA helper, inner span, icon element…) that UI5 recreates at runtime — emitting it
// explicitly causes a "duplicate id" error.
function _collectAllIds(nodes) {
    var ids = Object.create(null);
    function walk(list) {
        if (!Array.isArray(list)) { return; }
        list.forEach(function (n) {
            if (n.isControl && n.id) { ids[n.id] = true; }
            walk(n.children);
        });
    }
    walk(nodes);
    return ids;
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
    // ToolsAPI reports binding.model as a descriptor OBJECT, not a model name. Only a plain string
    // model name can be wired as a placeholder JSONModel; object models are skipped so they never
    // leak into `aModels` as `[object Object]`. (Bound values are inlined as literals anyway.)
    function add(binding) {
        var name = binding && binding.model;
        if (typeof name !== 'string') { return; }
        if (!(name in modelMap)) { modelMap[name] = name || undefined; }
    }
    function walk(list) {
        if (!Array.isArray(list)) { return; }
        list.forEach(function (n) {
            var props = (n.bindings && n.bindings.properties) || {};
            Object.keys(props).forEach(function (name) { add(props[name]); });
            var aggs = (n.bindings && n.bindings.aggregations) || {};
            Object.keys(aggs).forEach(function (name) { add(aggs[name]); });
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
    '                    var sMessage = "Could not load content: " + (oError && oError.message || oError);\n' +
    '                    // Log to the console so an automated render check (Playwright) detects the\n' +
    '                    // failure — a reproduction that throws here must never be reported as clean.\n' +
    '                    console.error(sMessage);\n' +
    '                    var pre = document.createElement("pre");\n' +
    '                    pre.style.color = "#b00";\n' +
    '                    pre.textContent = sMessage;\n' +
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

    // Bundle the walk state (prefix map, output lines, seen/known ids) into one context object so the
    // recursive emit helpers stay within jshint's max-parameter limit.
    var ctx = { prefixMap: prefixMap, lines: lines, seenIds: Object.create(null), allIds: _collectAllIds(tree) };
    var self = this;
    tree.forEach(function (node) {
        self._emitNode(node, 1, ctx);
    });

    lines.push('</' + openTag + '>');
    return lines.join('\n');
};

/**
 * Whether a node contributes only its children at the same depth, with no element of its own:
 * non-control grouping nodes, and control wrappers that cannot be declared in an XML fragment
 * (ComponentContainer, and non-reproducible shells like sap.ushell.*).
 * @private
 */
ReproductionHtmlBuilder.prototype._shouldInlineChildren = function (node) {
    return !node.isControl ||
        node.type === 'sap.ui.core.ComponentContainer' ||
        _isTransparentView(node.type) ||
        _isNonReproducibleControl(node.type);
};

/**
 * Decide whether a control must be skipped entirely (not emitted). Records the id as seen as a side
 * effect so later duplicates are caught. Skips a control whose id was already emitted, or whose id
 * looks like a UI5 auto-generated suffix of another id in the tree (UI5 recreates those at runtime).
 * @private
 */
ReproductionHtmlBuilder.prototype._shouldSkipControl = function (node, ctx) {
    if (node.id && ctx.seenIds[node.id]) { return true; }
    if (node.id) { ctx.seenIds[node.id] = true; }
    if (node.id) {
        var lastDash = node.id.lastIndexOf('-');
        if (lastDash > 0 && ctx.allIds && ctx.allIds[node.id.substring(0, lastDash)]) { return true; }
    }
    return false;
};

/**
 * Emit the open/close tags, attributes and aggregation-grouped children for one control.
 * @private
 */
ReproductionHtmlBuilder.prototype._emitControl = function (node, depth, ctx) {
    var self = this;
    var indent = INDENT.repeat(depth);
    var tag = _qualifyType(node.type, ctx.prefixMap);
    var attrs = _buildAttributes(node, ctx.prefixMap);
    var attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    var children = (node.children || []).filter(function (c) {
        return !c.isSmartGenerated && !_isPrivateAggregationChild(c);
    });

    if (!children.length) {
        ctx.lines.push(indent + '<' + tag + attrStr + '/>');
        return;
    }

    ctx.lines.push(indent + '<' + tag + attrStr + '>');

    var parentPrefix = ctx.prefixMap[_splitType(node.type).namespace] || '';
    var groups = _groupChildrenByAggregation(children);

    groups.forEach(function (group) {
        var aggName = group.aggregation;
        if (aggName) {
            var aggTag = parentPrefix ? parentPrefix + ':' + aggName : aggName;
            ctx.lines.push(indent + INDENT + '<' + aggTag + '>');
            group.nodes.forEach(function (child) {
                self._emitNode(child, depth + 2, ctx);
            });
            ctx.lines.push(indent + INDENT + '</' + aggTag + '>');
        } else {
            group.nodes.forEach(function (child) {
                self._emitNode(child, depth + 1, ctx);
            });
        }
    });

    ctx.lines.push(indent + '</' + tag + '>');
};

/**
 * Append the XML for one control tree node to `ctx.lines`. See {@link #_shouldInlineChildren} and
 * {@link #_shouldSkipControl} for the guard clauses; the actual element emission lives in
 * {@link #_emitControl}.
 * @private
 * @param {Object} node
 * @param {number} depth
 * @param {Object} ctx - Walk state: `{prefixMap, lines, seenIds, allIds}`.
 */
ReproductionHtmlBuilder.prototype._emitNode = function (node, depth, ctx) {
    if (!node || node.isSmartGenerated) { return; }

    // Non-control nodes and inlined wrappers contribute only their children at the same depth.
    if (this._shouldInlineChildren(node)) {
        var self = this;
        (node.children || []).forEach(function (child) {
            self._emitNode(child, depth, ctx);
        });
        return;
    }

    if (!node.type) { return; }
    if (this._shouldSkipControl(node, ctx)) { return; }

    this._emitControl(node, depth, ctx);
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
    var bootstrap = (options && options.bootstrapUrl) || _defaultBootstrap(meta);
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
 * @param {Array<string>} [options.excludeTypes] - Control types to drop (with their subtrees) before
 *     building. The deterministic fix loop passes types the render check blamed so a retry omits a
 *     control that cannot load standalone.
 * @param {Array<string>} [options.excludeLibraries] - Libraries to omit from the bootstrap
 *     `data-sap-ui-libs` list, for a library whose preload 404s in a standalone reproduction.
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

    var excludeTypeSet = _toSet(options.excludeTypes);
    if (Object.keys(excludeTypeSet).length) {
        tree = _pruneExcludedTypes(tree, excludeTypeSet);
    }

    var xmlFragment = this._buildXmlFragment(tree);
    var models = _collectModels(tree);

    // Bootstrap the public libraries the app loaded, unioned with those the control tree uses —
    // never the raw loadedLibraries, which can include internal/adapter libs that 404 on the CDN.
    var libraries = _safeLibraries(tree, meta.libraries);
    var excludeLibSet = _toSet(options.excludeLibraries);
    if (Object.keys(excludeLibSet).length) {
        libraries = libraries.filter(function (lib) { return !excludeLibSet[lib]; });
    }
    var safeMeta = Object.assign({}, meta, { libraries: libraries });

    return this._buildHtml(safeMeta, xmlFragment, models, options);
};

module.exports = ReproductionHtmlBuilder;
