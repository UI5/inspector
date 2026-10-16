'use strict';

var ReproductionPromptBuilder = require('../ai/ReproductionPromptBuilder.js');
var ReproductionHtmlBuilder = require('../ai/ReproductionHtmlBuilder.js');
var IssueFocuser = require('../ai/IssueFocuser.js');

/**
 * View for the "Reproduce" tab. Lets the user crawl the inspected application into a snapshot and
 * turn it into either a copy-pasteable LLM prompt or a standalone runnable HTML file. The actual
 * page crawl is delegated to the host via `onRequestSnapshot`; the view owns rendering, the privacy
 * toggle, and clipboard copy.
 *
 * @param {string} containerId
 * @param {Object} [options]
 * @param {Function} [options.onRequestSnapshot] - Called when the user clicks either Generate button.
 * @param {ReproductionPromptBuilder} [options.promptBuilder] - Test seam.
 * @param {ReproductionHtmlBuilder} [options.htmlBuilder] - Test seam.
 * @param {IssueFocuser} [options.issueFocuser] - Test seam for AI-driven issue focusing.
 * @param {Object} [options.verifier] - ReproductionVerifier. When present, "Generate app code"
 *     validates the generated HTML via the Playwright + Snippix MCP servers and reports the verdict.
 * @constructor
 */
function ReproductionView(containerId, options) {
    options = options || {};
    this._container = document.getElementById(containerId);
    this._onRequestSnapshot = options.onRequestSnapshot || function () {};
    this._promptBuilder = options.promptBuilder || new ReproductionPromptBuilder();
    this._htmlBuilder = options.htmlBuilder || new ReproductionHtmlBuilder();
    this._issueFocuser = options.issueFocuser || new IssueFocuser();
    // Optional ReproductionVerifier. When wired, "Generate app code" additionally validates the
    // generated HTML renders clean via the Playwright MCP server and stores it via the Snippix MCP
    // server, reporting the verdict in the status line. Absent in isolated tests / without a bridge.
    this._verifier = options.verifier || null;
    this._snapshot = null;
    this._mode = 'prompt'; // 'prompt' | 'html'
    // Set when an AI focus run succeeds; a clone of `_snapshot` with a pruned tree. Cleared when the
    // issue text changes or a new snapshot arrives so stale focuses never linger.
    this._focusedSnapshot = null;
    this._focusInfo = null;
    this._isFocusing = false;

    this._render();
    this._attachEventListeners();
}

/**
 * @private
 */
ReproductionView.prototype._render = function () {
    this._container.innerHTML =
        '<div class="reproduction-view">' +
            '<div class="reproduction-issue">' +
                '<label class="reproduction-issue-label" for="reproduction-issue-input">Issue to reproduce (optional — focuses and shrinks the reproduction)</label>' +
                '<textarea id="reproduction-issue-input" class="reproduction-issue-input" rows="2" ' +
                    'placeholder="e.g. Pressing Save on the order form throws a binding error"></textarea>' +
            '</div>' +
            '<div class="reproduction-toolbar">' +
                '<button class="reproduction-generate" type="button">Generate prompt</button>' +
                '<button class="reproduction-generate-html" type="button">Generate app code</button>' +
                '<button class="reproduction-focus" type="button">Focus with AI</button>' +
                '<label class="reproduction-realdata">' +
                    '<input class="reproduction-realdata-input" type="checkbox"> Include real data' +
                '</label>' +
                '<button class="reproduction-copy" type="button" disabled>Copy</button>' +
                '<span class="reproduction-status" role="status"></span>' +
            '</div>' +
            '<textarea class="reproduction-output" readonly ' +
                'placeholder="Click \u201CGenerate prompt\u201D or \u201CGenerate app code\u201D to crawl the application."></textarea>' +
        '</div>';

    this._issueInput = this._container.querySelector('.reproduction-issue-input');
    this._generateButton = this._container.querySelector('.reproduction-generate');
    this._generateHtmlButton = this._container.querySelector('.reproduction-generate-html');
    this._focusButton = this._container.querySelector('.reproduction-focus');
    this._realDataInput = this._container.querySelector('.reproduction-realdata-input');
    this._copyButton = this._container.querySelector('.reproduction-copy');
    this._status = this._container.querySelector('.reproduction-status');
    this._output = this._container.querySelector('.reproduction-output');
};

/**
 * @private
 */
ReproductionView.prototype._attachEventListeners = function () {
    var self = this;

    this._generateButton.addEventListener('click', function () {
        self._mode = 'prompt';
        self._setStatus('Crawling application…');
        self._generateButton.disabled = true;
        self._generateHtmlButton.disabled = true;
        self._onRequestSnapshot();
    });

    this._generateHtmlButton.addEventListener('click', function () {
        self._mode = 'html';
        self._setStatus('Crawling application…');
        self._generateButton.disabled = true;
        self._generateHtmlButton.disabled = true;
        self._onRequestSnapshot();
    });

    // Toggling privacy rebuilds from the cached snapshot — no re-crawl needed.
    this._realDataInput.addEventListener('change', function () {
        if (self._snapshot) {
            self._rebuild();
        }
    });

    // Editing the issue re-focuses the reproduction without re-crawling. Any existing AI focus is
    // now stale, so drop it and fall back to the deterministic outline.
    this._issueInput.addEventListener('input', function () {
        self._focusedSnapshot = null;
        self._focusInfo = null;
        if (self._snapshot) {
            self._rebuild();
        }
    });

    this._focusButton.addEventListener('click', function () {
        self._focusWithAI();
    });

    this._copyButton.addEventListener('click', function () {
        self._copyToClipboard();
    });
};

/**
 * Receive a crawl result from the host and render the prompt. Called after the page responds to the
 * request started by `onRequestSnapshot`.
 *
 * @param {Object|null} snapshot - Crawler snapshot, or `null` when the crawl failed.
 * @param {string} [error] - Error message when `snapshot` is `null`.
 */
ReproductionView.prototype.showSnapshot = function (snapshot, error) {
    this._generateButton.disabled = false;
    this._generateHtmlButton.disabled = false;
    this._focusedSnapshot = null;
    this._focusInfo = null;

    if (!snapshot) {
        this._snapshot = null;
        this._copyButton.disabled = true;
        this._output.value = '';
        this._setStatus(error || 'Could not crawl the application.');
        return null;
    }

    this._snapshot = snapshot;
    return this._rebuild();
};

/**
 * @private
 */
ReproductionView.prototype._rebuild = function () {
    if (this._mode === 'html') {
        return this._rebuildHtml();
    }

    var active = this._focusedSnapshot || this._snapshot;
    var prompt = this._promptBuilder.build(active, {
        includeRealData: this._realDataInput.checked,
        issue: this._issueInput.value
    });
    this._output.value = prompt;
    this._copyButton.disabled = false;

    var lineCount = prompt ? prompt.split('\n').length : 0;

    if (this._focusedSnapshot && this._focusInfo) {
        this._setStatus('AI-focused to ' + this._focusInfo.focusedIds.length + ' controls — ' + lineCount + ' lines.');
        return null;
    }

    var count = this._snapshot.stats ? this._snapshot.stats.controlCount : 0;
    var suffix = this._snapshot.stats && this._snapshot.stats.truncated ? ' (truncated)' : '';
    this._setStatus('Prompt ready — ' + count + ' controls' + suffix + ', ' + lineCount + ' lines.');
    return null;
};

/**
 * Build a standalone runnable HTML app from the snapshot and show it in the output field. When a
 * verifier is wired, additionally validate the app renders clean (Playwright MCP) and store it
 * (Snippix MCP), reporting the verdict + Snippix URL in the status line. Returns a promise (or null
 * when no verifier) so tests can await the async validation.
 * @private
 * @returns {Promise|null}
 */
ReproductionView.prototype._rebuildHtml = function () {
    var self = this;
    var active = this._focusedSnapshot || this._snapshot;
    var html = this._htmlBuilder.build(active);
    this._output.value = html;
    this._copyButton.disabled = false;

    var lineCount = html ? html.split('\n').length : 0;
    var count = this._snapshot.stats ? this._snapshot.stats.controlCount : 0;
    var suffix = this._snapshot.stats && this._snapshot.stats.truncated ? ' (truncated)' : '';
    var ready = 'App code ready — ' + count + ' controls' + suffix + ', ' + lineCount + ' lines.';

    if (!this._verifier) {
        this._setStatus(ready);
        return null;
    }

    this._setStatus(ready + ' Validating (Playwright + Snippix)…');
    return this._verifier.verifyAndSave(html).then(function (result) {
        self._setStatus(ready + ' ' + self._validationStatus(result));
    }, function () {
        self._setStatus(ready + ' Validation unavailable (is the MCP bridge running?).');
    });
};

/**
 * Compose the validation status from a verifyAndSave result: render verdict + Snippix link.
 * @private
 * @param {{verification: Object, snippet: Object}} result
 * @returns {string}
 */
ReproductionView.prototype._validationStatus = function (result) {
    var verification = (result && result.verification) || {};
    var snippet = (result && result.snippet) || {};
    var parts = [];
    if (verification.ok === true) {
        parts.push('Rendered with no console errors');
    } else if (verification.ok === false) {
        parts.push(verification.errors.length + ' console error(s): ' + verification.errors.join(' | '));
    } else {
        parts.push('Render check skipped (' + (verification.reason || 'unavailable') + ')');
    }
    if (snippet.ok && snippet.url) {
        parts.push('Snippix: ' + snippet.url);
    } else if (snippet.ok === false) {
        parts.push('Snippix save failed (' + (snippet.reason || 'error') + ')');
    } else {
        parts.push('Snippix save skipped (' + (snippet.reason || 'unavailable') + ')');
    }
    return parts.join(' — ');
};

/**
 * Ask the on-device model which controls are relevant to the typed issue and rebuild from the
 * pruned tree. Falls back to the deterministic outline on any failure or when the model declines.
 * @private
 */
ReproductionView.prototype._focusWithAI = function () {
    var self = this;

    if (!this._snapshot) {
        this._setStatus('Generate a prompt first.');
        return;
    }
    var issue = this._issueInput.value;
    if (!issue.trim()) {
        this._setStatus('Type an issue to focus on first.');
        return;
    }
    if (this._isFocusing) {
        return;
    }

    this._isFocusing = true;
    this._focusButton.disabled = true;
    this._generateButton.disabled = true;
    this._generateHtmlButton.disabled = true;
    this._setStatus('Focusing with AI…');

    return this._issueFocuser.focus(this._snapshot, issue).then(function (result) {
        self._isFocusing = false;
        self._focusButton.disabled = false;
        self._generateButton.disabled = false;
        self._generateHtmlButton.disabled = false;

        if (result && result.usedAI) {
            self._focusedSnapshot = Object.assign({}, self._snapshot, { tree: result.tree });
            self._focusInfo = { focusedIds: result.focusedIds || [] };
            self._rebuild();
            return;
        }

        self._focusedSnapshot = null;
        self._focusInfo = null;
        self._rebuild();
        self._setStatus(self._status.textContent + ' (AI focus skipped: ' + self._reasonText(result && result.reason) + ')');
    }, function () {
        self._isFocusing = false;
        self._focusButton.disabled = false;
        self._generateButton.disabled = false;
        self._generateHtmlButton.disabled = false;
        self._setStatus('AI focus failed — using the full outline.');
    });
};

/**
 * @private
 * @param {string} reason
 * @returns {string}
 */
ReproductionView.prototype._reasonText = function (reason) {
    var map = {
        'no-issue': 'no issue provided',
        'no-candidates': 'no controls found',
        'too-large': 'app too large for the on-device model',
        'empty-selection': 'model found nothing specific',
        'model-error': 'on-device model unavailable'
    };
    return map[reason] || 'unavailable';
};

/**
 * @private
 */
ReproductionView.prototype._copyToClipboard = function () {
    var self = this;
    var text = this._output.value;

    if (!text) {
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
            self._setStatus('Copied to clipboard.');
        }, function () {
            self._fallbackCopy();
        });
        return;
    }

    this._fallbackCopy();
};

/**
 * @private
 */
ReproductionView.prototype._fallbackCopy = function () {
    this._output.focus();
    this._output.select();
    var copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (e) {
        copied = false;
    }
    this._setStatus(copied ? 'Copied to clipboard.' : 'Copy failed — select the text and copy manually.');
};

/**
 * @private
 * @param {string} message
 */
ReproductionView.prototype._setStatus = function (message) {
    this._status.textContent = message;
};

module.exports = ReproductionView;
