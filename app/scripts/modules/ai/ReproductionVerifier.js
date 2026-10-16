'use strict';

var McpBridgeClient = require('./McpBridgeClient.js');

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

/**
 * @param {Object} [options]
 * @param {McpBridgeClient} [options.bridgeClient] - Shares the Assistant's bridge client in practice.
 * @param {number} [options.pauseSeconds] - How long to let UI5 boot before reading the console.
 * @param {string} [options.localDistBase] - Absolute base URL of a local UI5 `/sapui5` distribution.
 *     When set, the reproduction bootstrap is rewritten to it before verification. Left empty by
 *     default: the render check loads the HTML as a `data:` URL (origin `null`, an insecure context),
 *     and Chrome's Private Network Access policy BLOCKS requests from there to a loopback address such
 *     as `http://localhost`. So by default we verify the HTML as-authored against its public CDN
 *     bootstrap (which is HTTPS/public and loads fine). Only pass this when the HTML will be served
 *     from a same-origin/secure context where loopback is reachable.
 * @constructor
 */
function ReproductionVerifier(options) {
    options = options || {};
    this._bridgeClient = options.bridgeClient || new McpBridgeClient();
    this._pauseSeconds = typeof options.pauseSeconds === 'number' ? options.pauseSeconds : DEFAULT_PAUSE_SECONDS;
    this._localDistBase = typeof options.localDistBase === 'string' ? options.localDistBase : '';
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
 * Rewrite the reproduction's UI5 bootstrap `src` to an explicitly-configured local distribution.
 * No-op when `localDistBase` is empty (the default) or no `sap-ui-core.js` bootstrap is present — so
 * the render check loads the HTML's own public-CDN bootstrap and is not blocked by Chrome's Private
 * Network Access policy (which forbids a `data:` URL, an insecure `null` origin, from reaching a
 * loopback address like `http://localhost`).
 * @private
 * @param {string} html
 * @returns {string}
 */
ReproductionVerifier.prototype._rewriteBootstrapForLocalDist = function (html) {
    if (!html || !this._localDistBase) {
        return html;
    }
    return html.replace(/(src\s*=\s*["'])[^"']*sap-ui-core\.js(["'])/i, '$1' + this._localDistBase + '/sap-ui-core.js$2');
};

/**
 * Load the HTML in the Playwright-controlled browser and report whether it rendered clean.
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
        var rendered = self._rewriteBootstrapForLocalDist(html);
        var url = 'data:text/html;charset=utf-8,' + encodeURIComponent(rendered);
        return self._runPlaywrightCheck(url, servers);
    }).then(null, function (error) {
        return { ok: null, errors: [], reason: 'error: ' + (error && error.message ? error.message : 'failed') };
    });
};

/**
 * Navigate Playwright to `url`, wait for UI5 to boot, and return the console-error result.
 * Extracted so both the data: URL path and the Snippix URL path can share this logic.
 * @private
 * @param {string} url
 * @param {Array<string>} servers
 * @returns {Promise<{ok: boolean, errors: Array<string>, reason: string, servers: Array<string>}>}
 */
ReproductionVerifier.prototype._runPlaywrightCheck = function (url, servers) {
    var self = this;
    return self._bridgeClient.callTool(PLAYWRIGHT_SERVER, 'browser_navigate', { url: url }).then(function () {
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
 * Validate the reproduction renders clean (Playwright MCP) and store it in Snippix (snippix MCP) so
 * the result is a verified, shareable working app. Each step is best-effort and independent.
 *
 * Saves to Snippix first, then verifies Playwright against the real Snippix run URL. This is
 * intentional: the reproduction bootstraps UI5 from `/sapui5/resources/sap-ui-core.js` (a
 * Snippix-relative path). Loading that same HTML as a `data:` URL (the `verify` fallback) silently
 * fails to resolve the relative path, so UI5 never boots and Playwright reports zero errors — a
 * false positive. Verifying against the actual Snippix URL lets UI5 start for real, so genuine
 * rendering failures surface.
 *
 * @param {string} html
 * @returns {Promise<{verification: Object, snippet: Object}>}
 */
ReproductionVerifier.prototype.verifyAndSave = function (html) {
    var self = this;
    return this.save(html).then(function (snippet) {
        var verifyPromise;
        if (snippet.ok && snippet.url) {
            // Verify against the real Snippix URL so the bootstrap resolves correctly.
            verifyPromise = self._bridgeClient.listTools().then(function (tools) {
                var servers = self._serverNames(tools);
                if (!self._hasPlaywright(tools)) {
                    return { ok: null, errors: [], reason: 'unavailable', servers: servers };
                }
                return self._runPlaywrightCheck(snippet.url, servers);
            }).then(null, function (error) {
                return { ok: null, errors: [], reason: 'error: ' + (error && error.message ? error.message : 'failed') };
            });
        } else {
            // Snippix unavailable or save failed — fall back to data: URL verification.
            verifyPromise = self.verify(html);
        }
        return verifyPromise.then(function (verification) {
            return { verification: verification, snippet: snippet };
        });
    });
};

module.exports = ReproductionVerifier;
