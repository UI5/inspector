'use strict';

/**
 * Escape HTML special characters in page-derived strings before they are
 * concatenated into markup that is rendered via innerHTML.
 *
 * Kept dependency-free on purpose: this module is required from both the
 * extension panel bundle and the injected page bundle, so it must not touch
 * any browser/DOM/chrome globals.
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

// The only markup legitimately present in a DataView section title, built by
// the title builders in controlUtils/webcMain. Everything else in a title is
// page-forgeable (a hostile page can send a crafted on-control-select message
// whose options.title never passed through those builders), so the panel must
// treat titles as untrusted: the whole title is HTML-escaped first, then only
// this exact vocabulary is restored.
//
// The builders now pass the RAW control id (no pre-escaping); sanitizeSectionTitle
// is the single place that escapes it. So after the initial escape the id is
// single-escaped (a literal '&' in an id is '&amp;' here, a '"' is '&quot;').
// The data-control-id capture therefore stops at the first '&quot;', which is
// the attribute's real closing delimiter — a forged id containing a quote still
// cannot terminate the attribute early or break out, because its '"' is '&quot;'
// at this point and ends the capture exactly where the delimiter does.
//
// The captured id ($1) is single-escaped. For the data-control-id attribute we
// keep it escaped (quotes/ampersands must stay entity-encoded inside the
// attribute), but for the human-readable inner text (handled in _restoreSpan)
// we decode it once so the id displays correctly instead of as '&amp;'.
var CONTROL_ID_WITH_TITLE = /&lt;span class=&quot;controlId&quot; data-control-id=&quot;((?:(?!&quot;).)*)&quot; title=&quot;Click to copy control to console&quot;&gt;((?:(?!&lt;\/span&gt;).)*)&lt;\/span&gt;/g;
var CONTROL_ID_PLAIN = /&lt;span class=&quot;controlId&quot; data-control-id=&quot;((?:(?!&quot;).)*)&quot;&gt;((?:(?!&lt;\/span&gt;).)*)&lt;\/span&gt;/g;

/**
 * Decode a control id for display as TEXT CONTENT inside the restored span.
 *
 * Only entities that are safe inside a text node are decoded: '&amp;' -> '&',
 * '&quot;' -> '"', '&#39;' -> "'". '&lt;' and '&gt;' are DELIBERATELY left
 * encoded: the display text ($2) is attacker-influenced (a forged title can put
 * anything between the span tags), and decoding '&lt;'/'&gt;' would let that
 * content reconstruct a live tag (e.g. a forged '&lt;img&gt;' turning into a
 * real <img> once placed between the real <span></span> we restore). Leaving
 * them encoded means the worst case renders as harmless literal text.
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
    // $1 = id in attribute context (kept escaped), $2 = id as display text (text-safe decode)
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
    // <span gray> ... </span> (the wrapper is scaffold; inner text stays escaped)
    { from: /&lt;span gray&gt;/g, to: '<span gray>' },
    // <opaque> ... </opaque> (binding/aggregation "(property)"/"(aggregation)"
    // scaffold from controlUtils; a styled grey element, no attributes)
    { from: /&lt;opaque&gt;/g, to: '<opaque>' },
    { from: /&lt;\/opaque&gt;/g, to: '</opaque>' },
    // </span>
    { from: /&lt;\/span&gt;/g, to: '</span>' }
];

/**
 * Sanitise a DataView section title. All titles are treated as untrusted
 * (the panel is the trust boundary): the title is fully HTML-escaped, then
 * only the exact span vocabulary legitimate titles use is restored. The
 * dynamic parts (the data-control-id value captured by $1, and all inner
 * text) stay escaped, so a forged title cannot inject markup or break out of
 * the attribute context.
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
