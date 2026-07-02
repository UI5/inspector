'use strict';

/**
 * Pure state machine over an error-event stream. No browser or Chrome dependencies — the
 * browser-side glue (attaching listeners, monkey-patching console methods) is a thin adapter
 * around this module, so the buffer semantics can be unit-tested without a running page.
 *
 * The buffer is a bounded FIFO of the three most-recent, deduplicated console errors and
 * warnings from the inspected page. Recency is defined by *first arrival*: when a new event
 * hashes to the same key as an existing entry the entry's count increments but the entry does
 * not move to the front.
 */

const CAPACITY = 3;
const MAX_FRAME_SKIPS = 3;
const FRAMEWORK_FRAME_PATTERNS = [
    /sap-ui-core\.js/,
    /resources\/sap\//
];

/**
 * Normalize a message for dedup-key computation. Collapses runs of whitespace so a message
 * that differs only in incidental spacing hashes to the same key.
 * @private
 * @param {string} message
 * @returns {string}
 */
function _normalizeMessage(message) {
    if (typeof message !== 'string') {
        return String(message === null || message === undefined ? '' : message);
    }
    return message.replace(/\s+/g, ' ').trim();
}

/**
 * Test whether a single stack-frame line looks like framework code that the model should not be
 * pointed at. The heuristics match the paths a UI5 app produces both when loaded from a bootstrap
 * CDN (`sap-ui-core.js`) and when it references a library file (`resources/sap/...`).
 * @private
 * @param {string} frame
 * @returns {boolean}
 */
function _isFrameworkFrame(frame) {
    for (let i = 0; i < FRAMEWORK_FRAME_PATTERNS.length; i++) {
        if (FRAMEWORK_FRAME_PATTERNS[i].test(frame)) {
            return true;
        }
    }
    return false;
}

/**
 * Select the top non-framework frame from a stack string. Skips up to `MAX_FRAME_SKIPS`
 * framework frames total, then falls back to whatever frame we landed on — the model gets
 * *something* rather than an empty pointer even if the whole stack is framework code.
 *
 * A "frame" here is a single non-empty, non-"Error"-header line from the stack string.
 *
 * @private
 * @param {string} stack
 * @returns {string} the selected frame trimmed, or empty string when the stack has no frames.
 */
function _selectTopFrame(stack) {
    if (typeof stack !== 'string' || stack.length === 0) {
        return '';
    }

    // The first line is usually the message header (`Error: something`) — drop it. Any subsequent
    // blank line or the header line itself is filtered out below.
    const lines = stack.split('\n');
    const frames = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
            continue;
        }
        // Header line without an `at ` prefix and no obvious location — treat as non-frame.
        if (i === 0 && trimmed.indexOf('at ') !== 0) {
            continue;
        }
        frames.push(trimmed);
    }

    if (frames.length === 0) {
        return '';
    }

    let skips = 0;
    for (let i = 0; i < frames.length; i++) {
        if (skips >= MAX_FRAME_SKIPS || !_isFrameworkFrame(frames[i])) {
            return frames[i];
        }
        skips += 1;
    }

    // All frames were framework and we exhausted the skip budget — return the last one we saw.
    return frames[frames.length - 1];
}

/**
 * Build the dedup key for an event. `(normalized message, top-shown stack frame)` per the PRD.
 * @private
 * @param {string} normalizedMessage
 * @param {string} frame
 * @returns {string}
 */
function _dedupKey(normalizedMessage, frame) {
    return normalizedMessage + '\u0000' + frame;
}

/**
 * Create a new console-error buffer instance. Each call returns a fresh, independent buffer;
 * the module exports no shared state.
 *
 * @returns {{record: Function, snapshot: Function, clear: Function}}
 */
function create() {
    let entries = [];
    // Index by dedup key so record() is O(1) on the hot path when errors flood in.
    let indexByKey = Object.create(null);

    return {
        /**
         * Record an event. Shape: `{ type: 'error' | 'warn' | 'uncaught', message, stack? }`.
         * A duplicate (same dedup key as an existing entry) increments the count on the
         * existing entry and is *not* promoted to the front. A new distinct entry appends;
         * once the buffer is at capacity the oldest entry is evicted.
         *
         * @param {{type: string, message: string, stack?: string}} event
         */
        record: function (event) {
            if (!event) {
                return;
            }

            const normalized = _normalizeMessage(event.message);
            const frame = _selectTopFrame(event.stack);
            const key = _dedupKey(normalized, frame);

            if (Object.prototype.hasOwnProperty.call(indexByKey, key)) {
                indexByKey[key].count += 1;
                return;
            }

            const entry = {
                type: event.type,
                message: normalized,
                frame: frame,
                count: 1
            };

            entries.push(entry);
            indexByKey[key] = entry;

            if (entries.length > CAPACITY) {
                const evicted = entries.shift();
                // Rebuild the key -> entry index for the surviving entries. Cheap at N = 3.
                const evictedKey = _dedupKey(evicted.message, evicted.frame);
                delete indexByKey[evictedKey];
            }
        },

        /**
         * @returns {Array<{type: string, message: string, frame: string, count: number}>}
         *   A shallow-copied snapshot; mutating it does not affect the internal buffer.
         */
        snapshot: function () {
            return entries.map(function (e) {
                return {
                    type: e.type,
                    message: e.message,
                    frame: e.frame,
                    count: e.count
                };
            });
        },

        /**
         * Empty the buffer. Called by the panel on URL change and Clear Conversation.
         */
        clear: function () {
            entries = [];
            indexByKey = Object.create(null);
        }
    };
}

module.exports = {
    create: create
};
