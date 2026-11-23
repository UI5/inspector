'use strict';

// Pure, deterministic fixer for generated reproduction HTML. Given the console errors a render
// check reported, it derives build adjustments (control types / libraries to exclude) that the next
// ReproductionHtmlBuilder.build() applies, so a broken reproduction is retried without the control
// or library that failed — no LLM involved.
//
// It is intentionally conservative: it only recognizes error signatures with an unambiguous culprit
// (a module that failed to load, a class that does not exist, a library whose preload failed). When
// an error batch yields nothing new it returns the previous adjustments unchanged, which the caller
// (ReproductionVerifier.verifyFixSave) uses as the "cannot fix further" signal to stop iterating.

// A loadable UI5 module path inside quotes, e.g. 'sap/ui/comp/smartfield/SmartField.js'.
var MODULE_PATH_PATTERN = /['"]([\w./-]+?)\.js['"]/g;
// "Class sap.x.Y does not exist" / "Cannot instantiate object: class sap.x.Y".
var CLASS_PATTERN = /(?:class|object)\s*:?\s*([a-z][\w.]*\.[A-Z]\w*)/gi;
// "failed to load library 'sap.ui.comp'" / "library 'sap.ui.comp'".
var LIBRARY_NAME_PATTERN = /library\s*['"]([a-z][\w.]+)['"]/gi;

/**
 * Convert a slash module path (minus the `.js`) to a dotted UI5 name.
 * `sap/ui/comp/smartfield/SmartField` → `sap.ui.comp.smartfield.SmartField`.
 * @param {string} modulePath
 * @returns {string}
 */
function _pathToDotted(modulePath) {
    return modulePath.replace(/\//g, '.');
}

/**
 * A dotted name whose last segment starts with an uppercase letter is a control/class; a path ending
 * in `library` (or a lowercased last segment) is a library module.
 * @param {string} dotted
 * @returns {boolean}
 */
function _looksLikeType(dotted) {
    var last = dotted.substring(dotted.lastIndexOf('.') + 1);
    return /^[A-Z]/.test(last);
}

function ReproductionHtmlFixer() {}

/**
 * Derive cumulative build adjustments from the render check's console errors.
 *
 * @param {Array<string>} errors - Console error lines from ReproductionVerifier.verify().
 * @param {{excludeTypes: Array<string>, excludeLibraries: Array<string>}} [prev] - Adjustments from
 *     the previous attempt; the result is a superset. Defaults to empty.
 * @returns {{excludeTypes: Array<string>, excludeLibraries: Array<string>}} A NEW object when at
 *     least one new exclusion was found, otherwise the exact `prev` reference (nothing new to try).
 */
ReproductionHtmlFixer.prototype.deriveAdjustments = function (errors, prev) {
    prev = prev || { excludeTypes: [], excludeLibraries: [] };
    var types = Object.create(null);
    var libs = Object.create(null);
    (prev.excludeTypes || []).forEach(function (t) { types[t] = true; });
    (prev.excludeLibraries || []).forEach(function (l) { libs[l] = true; });
    var before = Object.keys(types).length + Object.keys(libs).length;

    (errors || []).forEach(function (line) {
        if (typeof line !== 'string') { return; }
        var match;

        // Explicit "library 'sap.x'" mentions.
        LIBRARY_NAME_PATTERN.lastIndex = 0;
        while ((match = LIBRARY_NAME_PATTERN.exec(line)) !== null) {
            libs[match[1]] = true;
        }

        // Module paths that failed to load: 'sap/x/library.js' → library, '…/X.js' → control type.
        MODULE_PATH_PATTERN.lastIndex = 0;
        while ((match = MODULE_PATH_PATTERN.exec(line)) !== null) {
            var dotted = _pathToDotted(match[1]);
            var last = dotted.substring(dotted.lastIndexOf('.') + 1);
            if (last === 'library') {
                libs[dotted.substring(0, dotted.lastIndexOf('.'))] = true;
            } else if (_looksLikeType(dotted)) {
                types[dotted] = true;
            }
        }

        // "Class sap.x.Y does not exist" / "Cannot instantiate object: sap.x.Y".
        CLASS_PATTERN.lastIndex = 0;
        while ((match = CLASS_PATTERN.exec(line)) !== null) {
            types[match[1]] = true;
        }
    });

    var after = Object.keys(types).length + Object.keys(libs).length;
    if (after === before) {
        return prev; // nothing new recognized — caller stops iterating
    }
    return {
        excludeTypes: Object.keys(types),
        excludeLibraries: Object.keys(libs)
    };
};

module.exports = ReproductionHtmlFixer;
