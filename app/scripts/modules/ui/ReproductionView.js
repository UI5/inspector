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
    // Monotonic token identifying the current focus run; bumped on cancel/supersede so a stale async
    // result is ignored when it settles.
    this._focusToken = 0;

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

    // Toggling privacy rebuilds from the cached snapshot — no re-crawl needed. Real data changes the
    // generated HTML, so re-verify in app-code mode.
    this._realDataInput.addEventListener('change', function () {
        if (self._snapshot) {
            self._rebuild({ verify: true });
        }
    });

    // Editing the issue must NOT generate anything — generation only happens when the user presses a
    // button. Any existing AI focus is now stale, so drop it (and cancel an in-flight focus run) so
    // the next explicit Generate/Focus starts from a clean state.
    this._issueInput.addEventListener('input', function () {
        if (self._isFocusing) {
            self._cancelFocus();
        }
        self._focusedSnapshot = null;
        self._focusInfo = null;
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
    return this._rebuild({ verify: true });
};

/**
 * @private
 * @param {Object} [options]
 * @param {boolean} [options.verify] - Run the Playwright render check and save to Snippix. Only the
 *     explicit user actions (Generate app code, Focus with AI, real-data toggle) set this; passive
 *     rebuilds such as typing in the issue field never verify, so they cannot spam Snippix with a
 *     new snippet (and a racing render check) on every keystroke.
 */
ReproductionView.prototype._rebuild = function (options) {
    if (this._mode === 'html') {
        return this._rebuildHtml(options);
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
        this._setStatus(this._focusPrefix() + ' — ' + lineCount + ' lines.');
        return null;
    }

    var count = this._snapshot.stats ? this._snapshot.stats.controlCount : 0;
    var suffix = this._snapshot.stats && this._snapshot.stats.truncated ? ' (truncated)' : '';
    this._setStatus('Prompt ready — ' + count + ' controls' + suffix + ', ' + lineCount + ' lines.');
    return null;
};

/**
 * Build a standalone runnable HTML app from the snapshot and show it in the output field. When a
 * verifier is wired AND `options.verify` is set, additionally validate the app renders clean
 * (Playwright MCP) and store it (Snippix MCP), reporting the verdict + Snippix URL in the status
 * line. Passive rebuilds (typing in the issue field) pass no `verify`, so they only refresh the
 * output and never re-run the render check or save a new Snippix snippet. Returns a promise (or null
 * when not verifying) so tests can await the async validation.
 * @private
 * @param {Object} [options]
 * @param {boolean} [options.verify] - Run the render check + Snippix save.
 * @returns {Promise|null}
 */
ReproductionView.prototype._rebuildHtml = function (options) {
    var self = this;
    var active = this._focusedSnapshot || this._snapshot;
    var html = this._htmlBuilder.build(active);
    this._output.value = html;
    this._copyButton.disabled = false;

    var lineCount = html ? html.split('\n').length : 0;
    var ready;
    if (this._focusedSnapshot && this._focusInfo) {
        ready = 'App code ready — ' + this._focusPrefix() + ', ' + lineCount + ' lines.';
    } else {
        var count = this._snapshot.stats ? this._snapshot.stats.controlCount : 0;
        var suffix = this._snapshot.stats && this._snapshot.stats.truncated ? ' (truncated)' : '';
        ready = 'App code ready — ' + count + ' controls' + suffix + ', ' + lineCount + ' lines.';
    }

    if (!this._verifier || !(options && options.verify)) {
        this._setStatus(ready);
        return null;
    }

    this._setStatus(ready + ' Checking the app renders…');
    var rebuild = function (adjustments) {
        return self._htmlBuilder.build(active, adjustments);
    };
    return this._verifier.verifyFixSave(html, rebuild, {
        onAttempt: function (info) {
            self._setStatus(ready + ' Render check failed — applying fixes (attempt ' + info.attempt + '/' + info.maxAttempts + ')…');
        }
    }).then(function (result) {
        self._setStatus(ready + ' ' + self._validationStatus(result));
    }, function () {
        self._setStatus(ready + ' Validation unavailable (is the MCP bridge running?).');
    });
};

/**
 * Compose the validation status from a verifyFixSave result: render verdict + Snippix link. A broken
 * app is never published (Snippix has no delete), so the message makes clear whether a snippet was
 * created.
 * @private
 * @param {{verification: Object, snippet: Object, attempts: number, fixed: boolean}} result
 * @returns {string}
 */
ReproductionView.prototype._validationStatus = function (result) {
    var verification = (result && result.verification) || {};

    // Render check could not run — cannot confirm it works, so nothing was published.
    if (verification.ok === null) {
        return 'Render check skipped (' + (verification.reason || 'unavailable') + ') — Snippix not created.';
    }
    // Render check found errors — not published.
    if (verification.ok === false) {
        var errs = verification.errors || [];
        return errs.length + ' console error(s): ' + errs.join(' | ') + ' — Snippix not created (app has errors).';
    }
    // Render check clean.
    return 'Rendered with no console errors' + this._fixNote(result) + ' — ' + this._snippetStatus((result && result.snippet) || {});
};

/**
 * " (after N fixes)" suffix when the app needed deterministic fixes before it rendered clean.
 * @private
 */
ReproductionView.prototype._fixNote = function (result) {
    if (!result || !result.fixed) {
        return '';
    }
    return ' (after ' + result.attempts + ' fix' + (result.attempts === 1 ? '' : 'es') + ')';
};

/**
 * The Snippix part of the validation status: link on success, else why nothing was published.
 * @private
 */
ReproductionView.prototype._snippetStatus = function (snippet) {
    if (snippet.ok && snippet.url) {
        return 'Snippix: ' + snippet.url;
    }
    if (snippet.ok === false) {
        return 'Snippix save failed (' + (snippet.reason || 'error') + ').';
    }
    return 'Snippix unavailable (' + (snippet.reason || 'skipped') + ').';
};

/**
 * Status-line prefix describing the current focus, distinguishing a true on-device-model focus from
 * the deterministic keyword fallback.
 * @private
 * @returns {string}
 */
ReproductionView.prototype._focusPrefix = function () {
    var n = (this._focusInfo && this._focusInfo.focusedIds.length) || 0;
    if (this._focusInfo && this._focusInfo.method === 'keyword') {
        return 'Focused to ' + n + ' controls (keyword match)';
    }
    return 'AI-focused to ' + n + ' controls';
};

/**
 * Ask the on-device model which controls are relevant to the typed issue and rebuild from the
 * pruned tree. Falls back to the deterministic outline on any failure or when the model declines.
 *
 * While a focus run is in flight the Focus button acts as a Cancel: clicking it abandons the run
 * (the on-device model download can be slow and must be interruptible). A monotonic token guards the
 * async result so a cancelled or superseded run never mutates the view when it eventually settles.
 * @private
 */
ReproductionView.prototype._focusWithAI = function () {
    var self = this;

    // A second click while focusing means Cancel.
    if (this._isFocusing) {
        this._cancelFocus();
        return;
    }

    if (!this._snapshot) {
        this._setStatus('Generate a prompt first.');
        return;
    }
    var issue = this._issueInput.value;
    if (!issue.trim()) {
        this._setStatus('Type an issue to focus on first.');
        return;
    }

    var token = ++this._focusToken;
    this._isFocusing = true;
    // Keep the Focus button enabled so it can cancel; relabel it. Disable the generate buttons.
    this._focusButton.textContent = 'Cancel focus';
    this._generateButton.disabled = true;
    this._generateHtmlButton.disabled = true;
    this._setStatus('Focusing with AI…');

    return this._issueFocuser.focus(this._snapshot, issue, {
        onProgress: function (progress) {
            if (token !== self._focusToken) { return; }
            var percent = Math.round((progress || 0) * 100);
            self._setStatus('Downloading on-device model… ' + percent + '% (click Cancel focus to stop)');
        }
    }).then(function (result) {
        if (token !== self._focusToken) { return; }
        self._endFocus();

        if (result && result.usedAI) {
            // The focused tree is a single merged tree spanning all frames. Drop `frames` so the
            // prompt/HTML builders render the pruned tree instead of re-expanding the raw frames.
            self._focusedSnapshot = Object.assign({}, self._snapshot, { tree: result.tree, frames: undefined });
            self._focusInfo = { focusedIds: result.focusedIds || [], method: result.method || 'ai' };
            self._rebuild({ verify: true });
            return;
        }

        self._focusedSnapshot = null;
        self._focusInfo = null;
        self._rebuild();
        self._setStatus(self._status.textContent + ' (AI focus skipped: ' + self._reasonText(result && result.reason) + ')');
    }, function () {
        if (token !== self._focusToken) { return; }
        self._endFocus();
        self._setStatus('AI focus failed — using the full outline.');
    });
};

/**
 * Abandon the in-flight focus run. Bumps the token so the pending result is ignored when it settles,
 * resets the toolbar, and reports the cancellation. The background model download (if any) may keep
 * running, but the view is unlocked immediately.
 * @private
 */
ReproductionView.prototype._cancelFocus = function () {
    this._focusToken += 1;
    this._endFocus();
    this._setStatus('AI focus cancelled.');
};

/**
 * Reset the focus-run UI state: clear the flag, restore the Focus button label, re-enable buttons.
 * @private
 */
ReproductionView.prototype._endFocus = function () {
    this._isFocusing = false;
    this._focusButton.textContent = 'Focus with AI';
    this._generateButton.disabled = false;
    this._generateHtmlButton.disabled = false;
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
        'empty-selection': 'nothing matched the issue',
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
