'use strict';

var McpBridgeClient = require('./McpBridgeClient.js');
var ReproductionHtmlFixer = require('./ReproductionHtmlFixer.js');

// Verifies a generated reproduction HTML actually renders without console errors, by driving the
// Playwright MCP server hosted in the local bridge: navigate a headless browser to the HTML (as a
// data: URL — the extension cannot write temp files), let UI5 boot, then read the console. It is a
// best-effort gate: when the bridge or the Playwright MCP server is not running it resolves with
// `ok: null` (skipped) rather than failing, so reproduction still works without it.
//
// Tool names/args follow the official @playwright/mcp server (browser_navigate, browser_wait_for,
// browser_console_messages).
var PLAYWRIGHT_SERVER = 'playwright';
var WEBCOMPONENTS_SERVER = 'ui5-webcomponents';
var SNIPPIX_SERVER = 'snippix';
var DEFAULT_PAUSE_SECONDS = 3;
// Cap how many error lines we echo back so a flood of messages cannot blow the model's context.
var MAX_REPORTED_ERRORS = 5;
// Cap web-component API lookups per generation so a large app cannot fan out into dozens of calls.
var MAX_REFERENCE_LOOKUPS = 8;
// How many deterministic fix-and-retry rounds verifyFixSave attempts before giving up.
var MAX_FIX_ATTEMPTS = 3;
// Fallback origin to host the render check when the HTML's bootstrap src can't be parsed. UI5 cannot
// boot from a `data:` URL (its bootstrap calls `new URL()` against the null origin and throws), so
// the render check navigates to a real CDN origin first and then writes the reproduction into it.
var DEFAULT_ORIGIN = 'https://ui5.sap.com/resources/sap-ui-version.json';

/**
 * @param {Object} [options]
 * @param {McpBridgeClient} [options.bridgeClient] - Shares the Assistant's bridge client in practice.
 * @param {number} [options.pauseSeconds] - How long to let UI5 boot before reading the console.
 * @constructor
 */
function ReproductionVerifier(options) {
    options = options || {};
    this._bridgeClient = options.bridgeClient || new McpBridgeClient();
    this._pauseSeconds = typeof options.pauseSeconds === 'number' ? options.pauseSeconds : DEFAULT_PAUSE_SECONDS;
}

/**
 * Whether the bridge currently exposes the Playwright MCP server.
 * @private
 */
ReproductionVerifier.prototype._hasPlaywright = function (tools) {
    return (tools || []).some(function (tool) {
        return tool.server === PLAYWRIGHT_SERVER;
    });
};

/**
 * The distinct MCP server names currently exposed by the bridge.
 * @private
 */
ReproductionVerifier.prototype._serverNames = function (tools) {
    var seen = Object.create(null);
    (tools || []).forEach(function (tool) {
        if (tool.server) {
            seen[tool.server] = true;
        }
    });
    return Object.keys(seen);
};

/**
 * Pull the error lines out of a browser_console_messages result. Playwright tags each entry with its
 * type, e.g. `[ERROR] …`; UI5 logs rendering/aggregation failures via console.error, so they surface
 * here.
 * @private
 * @returns {Array<string>}
 */
ReproductionVerifier.prototype._extractErrors = function (result) {
    var text = '';
    if (result && Array.isArray(result.content)) {
        text = result.content.map(function (part) {
            return part && part.text ? part.text : '';
        }).join('\n');
    } else if (typeof result === 'string') {
        text = result;
    }
    return text.split('\n').map(function (line) {
        return line.trim();
    }).filter(function (line) {
        return (/\[error\]/i).test(line) || (/^error\b/i).test(line);
    });
};

/**
 * Flatten an MCP tool result into its text.
 * @private
 */
ReproductionVerifier.prototype._resultText = function (result) {
    if (result && Array.isArray(result.content)) {
        return result.content.map(function (part) {
            return part && part.text ? part.text : '';
        }).join('\n');
    }
    return typeof result === 'string' ? result : '';
};

/**
 * One-line overview lifted from a get_component_api markdown doc.
 * @private
 */
ReproductionVerifier.prototype._overview = function (text) {
    var match = text.match(/Overview\s*([\s\S]{0,400})/i);
    var body = (match ? match[1] : text).replace(/^[\s#>*`-]+/, '');
    return body.split('. ')[0].replace(/\s+/g, ' ').trim().slice(0, 160);
};

/**
 * Query the ui5-webcomponents MCP server for the real API of each web component used in the app, so
 * the generated reproduction can cite authoritative docs and the chosen public-control mapping can be
 * checked. Best-effort: resolves with `[]` when the bridge / server is absent, never rejects.
 *
 * @param {Array<string>} componentNames - Web-component names (e.g. ['Avatar', 'Button']).
 * @returns {Promise<Array<{name: string, found: boolean, overview: string}>>}
 */
ReproductionVerifier.prototype.references = function (componentNames) {
    var self = this;
    var unique = [];
    (componentNames || []).forEach(function (name) {
        if (name && unique.indexOf(name) === -1) {
            unique.push(name);
        }
    });
    unique = unique.slice(0, MAX_REFERENCE_LOOKUPS);
    if (!unique.length) {
        return Promise.resolve([]);
    }
    return this._bridgeClient.listTools().then(function (tools) {
        var hasWebComponents = (tools || []).some(function (tool) {
            return tool.server === WEBCOMPONENTS_SERVER;
        });
        if (!hasWebComponents) {
            return [];
        }
        return Promise.all(unique.map(function (name) {
            return self._bridgeClient.callTool(WEBCOMPONENTS_SERVER, 'get_component_api', { componentName: name }).then(function (result) {
                var text = self._resultText(result);
                var found = !(/not found/i).test(text);
                return { name: name, found: found, overview: found ? self._overview(text) : '' };
            }, function () {
                return { name: name, found: false, overview: '' };
            });
        }));
    }).then(null, function () {
        return [];
    });
};

/**
 * The origin to host the render check in: the origin of the HTML's own UI5 bootstrap. UI5 must boot
 * from a real http(s) origin — it cannot initialize from a `data:` URL — so the check navigates here
 * first and then writes the reproduction document into the live page (see {@link #_runRenderCheck}).
 * @private
 * @param {string} html
 * @returns {string}
 */
ReproductionVerifier.prototype._bootstrapOrigin = function (html) {
    var match = (html || '').match(/src\s*=\s*["']([^"']*sap-ui-core\.js)["']/i);
    if (match) {
        try {
            return new URL(match[1]).origin + '/resources/sap-ui-version.json';
        } catch (e) {
            return match[1];
        }
    }
    return DEFAULT_ORIGIN;
};

/**
 * Render-check a standalone reproduction document and report whether it rendered clean.
 *
 * @param {string} html - A full standalone reproduction document.
 * @returns {Promise<{ok: (boolean|null), errors: Array<string>, reason: string}>} `ok` is `true`
 *     (clean), `false` (console errors), or `null` (not checked — see `reason`).
 */
ReproductionVerifier.prototype.verify = function (html) {
    var self = this;
    if (!html) {
        return Promise.resolve({ ok: null, errors: [], reason: 'no-html' });
    }
    return this._bridgeClient.listTools().then(function (tools) {
        var servers = self._serverNames(tools);
        if (!self._hasPlaywright(tools)) {
            return { ok: null, errors: [], reason: 'unavailable', servers: servers };
        }
        return self._runRenderCheck(html, servers);
    }).then(null, function (error) {
        return { ok: null, errors: [], reason: 'error: ' + (error && error.message ? error.message : 'failed') };
    });
};

/**
 * Render a candidate reproduction and return the console-error result. Navigates to the bootstrap
 * origin (a real http(s) context where UI5 can initialize), then replaces the document with the
 * reproduction via `document.write` so the page keeps that origin — unlike a `data:` URL, whose null
 * origin makes UI5's bootstrap throw `Failed to construct 'URL'` before it ever boots.
 * @private
 * @param {string} html
 * @param {Array<string>} servers
 * @returns {Promise<{ok: boolean, errors: Array<string>, reason: string, servers: Array<string>}>}
 */
ReproductionVerifier.prototype._runRenderCheck = function (html, servers) {
    var self = this;
    var origin = self._bootstrapOrigin(html);
    var writeFn = '() => { document.open(); document.write(' + JSON.stringify(html) + '); document.close(); }';
    return self._bridgeClient.callTool(PLAYWRIGHT_SERVER, 'browser_navigate', { url: origin }).then(function () {
        return self._bridgeClient.callTool(PLAYWRIGHT_SERVER, 'browser_evaluate', { function: writeFn });
    }).then(function () {
        return self._bridgeClient.callTool(PLAYWRIGHT_SERVER, 'browser_wait_for', { time: self._pauseSeconds });
    }).then(function () {
        return self._bridgeClient.callTool(PLAYWRIGHT_SERVER, 'browser_console_messages', {});
    }).then(function (result) {
        var errors = self._extractErrors(result).slice(0, MAX_REPORTED_ERRORS);
        return { ok: errors.length === 0, errors: errors, reason: errors.length === 0 ? 'ok' : 'errors', servers: servers };
    });
};

/**
 * Pull the snippet id and run URL out of a snippix `save_snippet` result (which returns lines like
 * `id: <id>` and `direct run: <url>.html`).
 * @private
 */
ReproductionVerifier.prototype._parseSnippixResult = function (text) {
    var idMatch = text.match(/\bid:\s*(\S+)/i);
    var runMatch = text.match(/direct run:\s*(\S+)/i);
    var linkMatch = text.match(/snippix link:\s*(\S+)/i);
    return {
        id: idMatch ? idMatch[1] : '',
        url: runMatch ? runMatch[1] : (linkMatch ? linkMatch[1] : '')
    };
};

/**
 * Store the reproduction in Snippix via the snippix MCP server and return its id and run URL.
 * Best-effort: resolves with `ok: null` (skipped) when the bridge / snippix server is absent, and
 * never rejects.
 *
 * @param {string} html - The full reproduction document to store.
 * @returns {Promise<{ok: (boolean|null), id: string, url: string, reason: string}>}
 */
ReproductionVerifier.prototype.save = function (html) {
    var self = this;
    if (!html) {
        return Promise.resolve({ ok: null, id: '', url: '', reason: 'no-html' });
    }
    return this._bridgeClient.listTools().then(function (tools) {
        var hasSnippix = (tools || []).some(function (tool) {
            return tool.server === SNIPPIX_SERVER;
        });
        if (!hasSnippix) {
            return { ok: null, id: '', url: '', reason: 'unavailable' };
        }
        return self._bridgeClient.callTool(SNIPPIX_SERVER, 'save_snippet', { html: html }).then(function (result) {
            var text = self._resultText(result);
            if (result && result.isError) {
                return { ok: false, id: '', url: '', reason: 'error: ' + text.slice(0, 160) };
            }
            var parsed = self._parseSnippixResult(text);
            return { ok: true, id: parsed.id, url: parsed.url, reason: 'saved' };
        });
    }).then(null, function (error) {
        return { ok: null, id: '', url: '', reason: 'error: ' + (error && error.message ? error.message : 'failed') };
    });
};

/**
 * Render-check → deterministic-fix → save loop. Verifies the HTML renders clean (Playwright MCP) and
 * only then stores it in Snippix (snippix MCP), so a broken reproduction is NEVER published — the
 * Snippix MCP has no delete/update, so a bad save cannot be retracted. When the render check reports
 * console errors, {@link ReproductionHtmlFixer} derives control types / libraries to exclude and the
 * caller's `rebuild` regenerates the HTML without them; this repeats up to `MAX_FIX_ATTEMPTS` times.
 *
 * The render check ({@link ReproductionVerifier#verify}) boots UI5 for real on its bootstrap origin
 * (UI5 cannot initialize from a `data:` URL), so a genuine verdict is reached before anything is
 * published.
 *
 * @param {string} initialHtml - The first candidate reproduction document.
 * @param {Function} rebuild - `(adjustments) => string`: regenerate the HTML for the accumulated
 *     `{excludeTypes, excludeLibraries}`. In the view this is `adj => htmlBuilder.build(active, adj)`.
 * @param {Object} [options]
 * @param {Function} [options.onAttempt] - Called before each fix rebuild with
 *     `{attempt, maxAttempts, errors, adjustments}` so the UI can report progress.
 * @param {ReproductionHtmlFixer} [options.fixer] - Test seam.
 * @param {number} [options.maxAttempts] - Override the fix-round cap (default MAX_FIX_ATTEMPTS).
 * @returns {Promise<{verification: Object, snippet: Object, attempts: number, fixed: boolean}>}
 *     `snippet.ok` is `true` only when a clean render was published; `false` with
 *     `reason: 'not-saved-has-errors'` when it stayed broken; `null` with `reason: 'skipped-unverified'`
 *     when the render check could not run (bridge/Playwright absent) so publishing would be a guess.
 */
ReproductionVerifier.prototype.verifyFixSave = function (initialHtml, rebuild, options) {
    var self = this;
    options = options || {};
    var fixer = options.fixer || new ReproductionHtmlFixer();
    var onAttempt = typeof options.onAttempt === 'function' ? options.onAttempt : function () {};
    var maxAttempts = typeof options.maxAttempts === 'number' ? options.maxAttempts : MAX_FIX_ATTEMPTS;

    function notSaved(verification, count) {
        return {
            verification: verification,
            snippet: { ok: false, id: '', url: '', reason: 'not-saved-has-errors' },
            attempts: count,
            fixed: false
        };
    }

    function attempt(html, adjustments, count) {
        return self.verify(html).then(function (verification) {
            if (verification.ok === true) {
                return self.save(html).then(function (snippet) {
                    return { verification: verification, snippet: snippet, attempts: count, fixed: count > 0 };
                });
            }
            if (verification.ok === null) {
                // Render check unavailable — we cannot confirm it works, so never publish.
                return {
                    verification: verification,
                    snippet: { ok: null, id: '', url: '', reason: 'skipped-unverified' },
                    attempts: count,
                    fixed: false
                };
            }
            // ok === false: console errors. Try to fix unless we are out of rounds.
            if (count >= maxAttempts) {
                return notSaved(verification, count);
            }
            var next = fixer.deriveAdjustments(verification.errors, adjustments);
            if (next === adjustments) {
                return notSaved(verification, count); // nothing new to try
            }
            onAttempt({ attempt: count + 1, maxAttempts: maxAttempts, errors: verification.errors, adjustments: next });
            return attempt(rebuild(next), next, count + 1);
        });
    }

    return attempt(initialHtml, { excludeTypes: [], excludeLibraries: [] }, 0);
};

module.exports = ReproductionVerifier;
