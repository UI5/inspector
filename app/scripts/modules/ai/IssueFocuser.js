'use strict';

var PromptClient = require('./PromptClient.js');

// Candidate ceiling. Beyond this the on-device model's small context makes id-selection unreliable,
// so the focuser declines and the deterministic compaction path is used instead.
var DEFAULT_MAX_CANDIDATES = 300;
var LABEL_MAX_LENGTH = 40;
var LABEL_PROPERTY_PATTERN = /^(text|title|label|placeholder|value|tooltip|name)$/i;

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
 * @param {number} [options.maxCandidates] - Candidate ceiling above which the focuser declines.
 * @returns {Promise<{tree: Array, focusedIds: Array<string>, usedAI: boolean, reason: string}>}
 *     Always resolves; `usedAI` is false when the original tree is returned unchanged.
 */
IssueFocuser.prototype.focus = function (snapshot, issue, options) {
    options = options || {};
    var tree = snapshot && Array.isArray(snapshot.tree) ? snapshot.tree : [];
    var original = { tree: tree, focusedIds: [], usedAI: false, reason: '' };

    if (!issue || !issue.trim()) {
        original.reason = 'no-issue';
        return Promise.resolve(original);
    }

    var candidates = this._flatten(tree);
    if (candidates.length === 0) {
        original.reason = 'no-candidates';
        return Promise.resolve(original);
    }

    var maxCandidates = typeof options.maxCandidates === 'number' ? options.maxCandidates : DEFAULT_MAX_CANDIDATES;
    if (candidates.length > maxCandidates) {
        original.reason = 'too-large';
        return Promise.resolve(original);
    }

    var validIds = Object.create(null);
    candidates.forEach(function (candidate) {
        validIds[candidate.id] = true;
    });

    var prompt = this._buildFocusPrompt(issue, candidates);
    var self = this;

    return this._selectIds(prompt, validIds).then(function (ids) {
        if (ids.length === 0) {
            original.reason = 'empty-selection';
            return original;
        }
        var selected = Object.create(null);
        ids.forEach(function (id) {
            selected[id] = true;
        });
        return {
            tree: self._prune(tree, selected),
            focusedIds: ids,
            usedAI: true,
            reason: 'ok'
        };
    }, function () {
        original.reason = 'model-error';
        return original;
    });
};

module.exports = IssueFocuser;
