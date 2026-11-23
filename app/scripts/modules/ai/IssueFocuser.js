'use strict';

var PromptClient = require('./PromptClient.js');

// Per-request candidate window. The on-device model's small context makes id-selection unreliable
// beyond this many controls, so larger apps are split into sequential batches of this size and the
// ids selected across batches are unioned — the focuser never declines purely on size.
var DEFAULT_BATCH_SIZE = 300;
var LABEL_MAX_LENGTH = 40;
var LABEL_PROPERTY_PATTERN = /^(text|title|label|placeholder|value|tooltip|name)$/i;
// Cap how many controls the keyword fallback selects, so a broad issue ("button") cannot select the
// whole app. Highest-scoring candidates win.
var KEYWORD_MAX_SELECTION = 60;
// Words carried by almost every issue report; ignored when matching so they don't inflate scores.
var STOP_WORDS = {
    'the': true, 'and': true, 'for': true, 'that': true, 'this': true, 'with': true, 'not': true,
    'does': true, 'when': true, 'then': true, 'but': true, 'you': true, 'are': true, 'was': true,
    'click': true, 'clicking': true, 'press': true, 'pressing': true, 'tap': true, 'issue': true,
    'error': true, 'errors': true, 'bug': true, 'problem': true, 'throws': true, 'fails': true,
    'after': true, 'from': true, 'into': true, 'over': true, 'should': true, 'would': true
};

/**
 * Uses the on-device language model (via {@link PromptClient}) to pick which controls are relevant
 * to a reported issue, then prunes the crawler snapshot's control tree to that focused slice before
 * the prompt is built. Every failure mode falls back to the original tree — the model can only
 * shrink the tree, never break it.
 *
 * NOTE: the background keeps a single global model session, so a focus run temporarily replaces the
 * AI Assistant's session; the Assistant reseeds lazily on its next send. The session is created and
 * destroyed per focus to keep that footprint minimal.
 *
 * @param {Object} [options]
 * @param {PromptClient} [options.promptClient] - Test seam.
 * @constructor
 */
function IssueFocuser(options) {
    options = options || {};
    this._promptClient = options.promptClient || new PromptClient();
}

/**
 * Resolve whether the on-device model is ready. Never rejects.
 * @returns {Promise<boolean>}
 */
IssueFocuser.prototype.isAvailable = function () {
    return this._promptClient.checkAvailability().then(function (capability) {
        return capability.status === 'ready';
    }, function () {
        return false;
    });
};

/**
 * Ensure the on-device model is ready to prompt, downloading it first when Chrome reports it as
 * downloadable/downloading. Never rejects — resolves `false` on any failure so the caller falls back
 * to the full tree. The download is the same one the AI Assistant uses; it runs once per device and
 * is cached by Chrome, so subsequent focus runs skip straight to `ready`.
 * @param {Function} [onProgress] - Receives download progress in [0, 1].
 * @returns {Promise<boolean>}
 */
IssueFocuser.prototype._ensureReady = function (onProgress) {
    var self = this;
    return this._promptClient.checkAvailability().then(function (capability) {
        if (capability.status === 'ready') {
            return true;
        }
        if (capability.status === 'downloadable' || capability.status === 'downloading') {
            return self._promptClient.downloadModel(onProgress).then(function () {
                return true;
            }, function () {
                return false;
            });
        }
        return false;
    }, function () {
        return false;
    });
};

/**
 * Derive a short human label for a control from its non-default text-like properties.
 * @private
 * @param {Object} node
 * @returns {string}
 */
IssueFocuser.prototype._labelFor = function (node) {
    var properties = node.properties || [];
    for (var i = 0; i < properties.length; i++) {
        var property = properties[i];
        if (LABEL_PROPERTY_PATTERN.test(property.name) && typeof property.value === 'string' && property.value) {
            var label = property.value;
            return label.length > LABEL_MAX_LENGTH ? label.substring(0, LABEL_MAX_LENGTH) + '…' : label;
        }
    }
    return '';
};

/**
 * Flatten the tree into a candidate list of selectable controls (grouping nodes are not candidates
 * but survive pruning as ancestors).
 * @private
 * @param {Array} tree
 * @returns {Array<{id: string, type: string, label: string}>}
 */
IssueFocuser.prototype._flatten = function (tree) {
    var candidates = [];
    var self = this;

    function visit(nodes) {
        if (!Array.isArray(nodes)) {
            return;
        }
        nodes.forEach(function (node) {
            if (node.isControl && node.id) {
                candidates.push({ id: node.id, type: node.type || '', label: self._labelFor(node) });
            }
            visit(node.children);
        });
    }

    visit(tree);
    return candidates;
};

/**
 * Split the issue text into lowercased search tokens: words of 3+ chars that are not stop-words.
 * @private
 * @param {string} issue
 * @returns {Array<string>}
 */
IssueFocuser.prototype._tokenizeIssue = function (issue) {
    return (issue || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (word) {
        return word.length >= 3 && !STOP_WORDS[word];
    });
};

/**
 * Deterministic fallback used when the on-device model is unavailable (or selects nothing): score
 * each candidate by how many issue tokens appear in its id, short type name, or label, and return the
 * highest-scoring ids. Reuses the same candidate list the model is given, so the pruned result is
 * identical in shape to the AI path — only the selection differs. Returns `[]` when nothing matches.
 * @private
 * @param {string} issue
 * @param {Array<{id: string, type: string, label: string}>} candidates
 * @returns {Array<string>}
 */
IssueFocuser.prototype._keywordFocus = function (issue, candidates) {
    var tokens = this._tokenizeIssue(issue);
    if (tokens.length === 0) {
        return [];
    }
    var scored = [];
    candidates.forEach(function (candidate, index) {
        var type = candidate.type || '';
        var shortType = type.substring(type.lastIndexOf('.') + 1);
        var haystack = (candidate.id + ' ' + shortType + ' ' + (candidate.label || '')).toLowerCase();
        var score = 0;
        tokens.forEach(function (token) {
            if (haystack.indexOf(token) !== -1) {
                score += 1;
            }
        });
        if (score > 0) {
            scored.push({ id: candidate.id, score: score, index: index });
        }
    });
    scored.sort(function (a, b) {
        return (b.score - a.score) || (a.index - b.index);
    });
    return scored.slice(0, KEYWORD_MAX_SELECTION).map(function (entry) {
        return entry.id;
    });
};

/**
 * Build the model messages that ask for the relevant control ids.
 * @private
 * @param {string} issue
 * @param {Array} candidates
 * @returns {{system: string, user: string}}
 */
IssueFocuser.prototype._buildFocusPrompt = function (issue, candidates) {
    var system = 'You are a filter for a UI5 debugging tool. Given a reported issue and a list of ' +
        'controls (id | type | label), choose only the controls needed to reproduce the issue. ' +
        'Reply with ONLY a JSON array of the selected ids, e.g. ["id1","id2"]. No explanation.';

    var lines = candidates.map(function (candidate) {
        return candidate.id + ' | ' + candidate.type + (candidate.label ? ' | ' + candidate.label : '');
    });

    var user = 'Issue:\n' + issue + '\n\nControls:\n' + lines.join('\n') + '\n\nJSON array of relevant ids:';

    return { system: system, user: user };
};

/**
 * Parse a JSON id array out of the model's raw reply, keeping only ids present in `validIds`.
 * @private
 * @param {string} reply
 * @param {Object} validIds - Map-like set of allowed ids.
 * @returns {Array<string>}
 */
IssueFocuser.prototype._parseIds = function (reply, validIds) {
    if (typeof reply !== 'string') {
        return [];
    }
    var match = reply.match(/\[[\s\S]*\]/);
    if (!match) {
        return [];
    }

    var parsed;
    try {
        parsed = JSON.parse(match[0]);
    } catch (e) {
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.filter(function (id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(validIds, id);
    });
};

/**
 * Prune a tree to the connected slice spanning the selected ids: keep each selected control, every
 * ancestor on its path to the root, and every descendant beneath it.
 * @private
 * @param {Array} tree
 * @param {Object} selected - Map-like set of selected ids.
 * @returns {Array}
 */
IssueFocuser.prototype._prune = function (tree, selected) {
    function keep(node, ancestorSelected) {
        var isSelected = !!node.id && Object.prototype.hasOwnProperty.call(selected, node.id);
        var effectiveAncestor = ancestorSelected || isSelected;
        var prunedChildren = (node.children || []).map(function (child) {
            return keep(child, effectiveAncestor);
        }).filter(Boolean);

        if (isSelected || ancestorSelected || prunedChildren.length > 0) {
            var copy = {};
            Object.keys(node).forEach(function (key) {
                copy[key] = node[key];
            });
            copy.children = prunedChildren;
            return copy;
        }
        return null;
    }

    return tree.map(function (node) {
        return keep(node, false);
    }).filter(Boolean);
};

/**
 * Collect every chunk of a prompt stream into one string.
 * @private
 * @param {AsyncIterable<string>} stream
 * @returns {Promise<string>}
 */
IssueFocuser.prototype._collect = function (stream) {
    async function drain() {
        var text = '';
        for await (var chunk of stream) {
            text += chunk;
        }
        return text;
    }
    return drain();
};

/**
 * Run the model across the candidate batches sequentially and return the de-duplicated union of
 * selected ids, preserving first-seen order. Any batch failure rejects the whole run so the caller
 * falls back to the full tree.
 * @private
 * @param {string} issue
 * @param {Array<Array>} batches
 * @param {Object} validIds
 * @returns {Promise<Array<string>>}
 */
IssueFocuser.prototype._selectAcrossBatches = function (issue, batches, validIds) {
    var self = this;
    var collected = Object.create(null);
    var order = [];
    var chain = Promise.resolve();

    batches.forEach(function (batch) {
        chain = chain.then(function () {
            var prompt = self._buildFocusPrompt(issue, batch);
            return self._selectIds(prompt, validIds).then(function (ids) {
                ids.forEach(function (id) {
                    if (!Object.prototype.hasOwnProperty.call(collected, id)) {
                        collected[id] = true;
                        order.push(id);
                    }
                });
            });
        });
    });

    return chain.then(function () {
        return order;
    });
};

/**
 * Run the model and return the validated, selected ids. Session is created and destroyed here.
 * @private
 * @param {{system: string, user: string}} prompt
 * @param {Object} validIds
 * @returns {Promise<Array<string>>}
 */
IssueFocuser.prototype._selectIds = function (prompt, validIds) {
    var self = this;
    return this._promptClient.createSession([{ role: 'system', content: prompt.system }]).then(function () {
        return self._promptClient.promptStreaming(prompt.user);
    }).then(function (stream) {
        return self._collect(stream);
    }).then(function (reply) {
        self._promptClient.destroy();
        return self._parseIds(reply, validIds);
    }, function (error) {
        self._promptClient.destroy();
        throw error;
    });
};

/**
 * Focus a snapshot's control tree on the reported issue using the on-device model.
 *
 * @param {Object} snapshot - Crawler snapshot.
 * @param {string} issue - Reported-issue description.
 * @param {Object} [options]
 * @param {number} [options.maxCandidates] - Per-batch candidate window; larger apps are split into
 *     sequential batches of this size rather than declined.
 * @param {Function} [options.onProgress] - Receives on-device model download progress in [0, 1] when
 *     the model must be downloaded before focusing.
 * @returns {Promise<{tree: Array, focusedIds: Array<string>, usedAI: boolean, method: string, reason: string}>}
 *     Always resolves; `usedAI` is false only when the full tree is returned unchanged. `method` is
 *     `'ai'` (on-device model), `'keyword'` (deterministic fallback), or `'none'` (unfocused).
 */
IssueFocuser.prototype.focus = function (snapshot, issue, options) {
    options = options || {};
    var tree = snapshot && Array.isArray(snapshot.tree) ? snapshot.tree : [];

    // For multi-frame snapshots merge all frames so controls from every frame are candidates.
    // The focused result is a single pruned tree spanning the relevant controls across frames.
    if (snapshot && Array.isArray(snapshot.frames) && snapshot.frames.length > 1) {
        tree = [];
        snapshot.frames.forEach(function (frame) {
            tree = tree.concat(frame.tree || []);
        });
    }

    var original = { tree: tree, focusedIds: [], usedAI: false, method: 'none', reason: '' };

    if (!issue || !issue.trim()) {
        original.reason = 'no-issue';
        return Promise.resolve(original);
    }

    var candidates = this._flatten(tree);
    if (candidates.length === 0) {
        original.reason = 'no-candidates';
        return Promise.resolve(original);
    }

    var batchSize = typeof options.maxCandidates === 'number' ? options.maxCandidates : DEFAULT_BATCH_SIZE;
    if (batchSize < 1) {
        batchSize = DEFAULT_BATCH_SIZE;
    }

    var validIds = Object.create(null);
    candidates.forEach(function (candidate) {
        validIds[candidate.id] = true;
    });

    var batches = [];
    for (var i = 0; i < candidates.length; i += batchSize) {
        batches.push(candidates.slice(i, i + batchSize));
    }

    var self = this;

    // Build a focused result (pruned tree) from a selected id list.
    function focusedResult(ids, method) {
        var selected = Object.create(null);
        ids.forEach(function (id) {
            selected[id] = true;
        });
        return {
            tree: self._prune(tree, selected),
            focusedIds: ids,
            usedAI: true,
            method: method,
            reason: 'ok'
        };
    }

    // Deterministic fallback when the model is unavailable or selects nothing. Only when keyword
    // matching ALSO finds nothing do we return the full outline unchanged.
    function keywordFallback() {
        var ids = self._keywordFocus(issue, candidates);
        if (ids.length === 0) {
            original.reason = 'empty-selection';
            return original;
        }
        return focusedResult(ids, 'keyword');
    }

    return this._ensureReady(options.onProgress).then(function (ready) {
        if (!ready) {
            // On-device model unavailable — keyword match instead of giving up.
            return keywordFallback();
        }
        return self._selectAcrossBatches(issue, batches, validIds).then(function (ids) {
            if (ids.length === 0) {
                return keywordFallback();
            }
            return focusedResult(ids, 'ai');
        }, function () {
            // Model errored mid-run — keyword fallback rather than the full outline.
            return keywordFallback();
        });
    });
};

module.exports = IssueFocuser;
