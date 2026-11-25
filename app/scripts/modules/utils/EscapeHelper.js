'use strict';

/**
 * Escape HTML special characters in strings before they are concatenated into
 * markup rendered via innerHTML.
 *
 * Dependency-free on purpose: required from both the panel bundle and the
 * injected page bundle, so it must not touch any browser/DOM/chrome globals.
 *
 * @param {string|number|boolean} value
 * @returns {string}
 * @private
 */
function _escapeHTML(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Section titles are escaped in full, then only this fixed span/opaque
// vocabulary is restored. Builders pass the raw control id; this is the single
// place it gets escaped, so after escaping the id is single-encoded and the
// data-control-id capture stops at the first '&quot;' (the attribute delimiter).
var CONTROL_ID_WITH_TITLE = /&lt;span class=&quot;controlId&quot; data-control-id=&quot;((?:(?!&quot;).)*)&quot; title=&quot;Click to copy control to console&quot;&gt;((?:(?!&lt;\/span&gt;).)*)&lt;\/span&gt;/g;
var CONTROL_ID_PLAIN = /&lt;span class=&quot;controlId&quot; data-control-id=&quot;((?:(?!&quot;).)*)&quot;&gt;((?:(?!&lt;\/span&gt;).)*)&lt;\/span&gt;/g;

/**
 * Decode a control id for display as text inside the restored span. Only
 * text-safe entities are decoded; '&lt;'/'&gt;' stay encoded so the display
 * text can never reconstruct a live tag.
 * @param {string} value
 * @returns {string}
 * @private
 */
function _decodeControlIdText(value) {
    return String(value)
        .replace(/&#39;/g, '\'')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

var TITLE_SPAN_PATTERNS = [
    // <span class="controlId" data-control-id="ID" title="...">ID</span>
    // $1 = id in attribute (kept encoded), $2 = id as display text (text-safe decode)
    { from: CONTROL_ID_WITH_TITLE,
      to: function (match, idAttr, idText) {
          return '<span class="controlId" data-control-id="' + idAttr +
              '" title="Click to copy control to console">' + _decodeControlIdText(idText) + '</span>';
      } },
    // <span class="controlId" data-control-id="ID">ID</span>
    { from: CONTROL_ID_PLAIN,
      to: function (match, idAttr, idText) {
          return '<span class="controlId" data-control-id="' + idAttr + '">' +
              _decodeControlIdText(idText) + '</span>';
      } },
    // <span gray> wrapper (scaffold; inner text stays encoded)
    { from: /&lt;span gray&gt;/g, to: '<span gray>' },
    // <opaque> scaffold used by binding/aggregation titles (styled element, no attributes)
    { from: /&lt;opaque&gt;/g, to: '<opaque>' },
    { from: /&lt;\/opaque&gt;/g, to: '</opaque>' },
    // </span>
    { from: /&lt;\/span&gt;/g, to: '</span>' }
];

/**
 * Sanitise a DataView section title: escape it in full, then restore only the
 * fixed span/opaque vocabulary legitimate titles use. Dynamic parts (the
 * data-control-id attribute value and inner text) stay encoded.
 * @param {string|number|boolean} value
 * @returns {string}
 * @private
 */
function _sanitizeSectionTitle(value) {
    var escaped = _escapeHTML(value);
    TITLE_SPAN_PATTERNS.forEach(function (pattern) {
        escaped = escaped.replace(pattern.from, pattern.to);
    });
    return escaped;
}

module.exports = {
    escapeHTML: _escapeHTML,
    sanitizeSectionTitle: _sanitizeSectionTitle
};
