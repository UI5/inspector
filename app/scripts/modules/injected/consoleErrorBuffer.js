'use strict';

/**
 * Bounded FIFO of the N most-recent deduplicated console errors and warnings. Duplicates
 * increment `count` on the existing entry and do not re-promote. No browser deps.
 */

const CAPACITY = 3;
const MAX_FRAME_SKIPS = 3;
const FRAMEWORK_FRAME_PATTERNS = [
    /sap-ui-core\.js/,
    /resources\/sap\//
];

/**
 * @private
 */
function _normalizeMessage(message) {
    if (typeof message !== 'string') {
        return String(message === null || message === undefined ? '' : message);
    }
    return message.replace(/\s+/g, ' ').trim();
}

/**
 * @private
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
 * Pick the top non-framework frame. Skips up to `MAX_FRAME_SKIPS` framework frames, then
 * falls back to whichever frame we're on.
 * @private
 */
function _selectTopFrame(stack) {
    if (typeof stack !== 'string' || stack.length === 0) {
        return '';
    }

    const lines = stack.split('\n');
    const frames = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
            continue;
        }
        // Drop the "Error: ..." header line (no `at ` prefix on line 0).
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

    return frames[frames.length - 1];
}

/**
 * @private
 */
function _dedupKey(normalizedMessage, frame) {
    return normalizedMessage + '\u0000' + frame;
}

/**
 * @returns {{record: Function, snapshot: Function, clear: Function}}
 */
function create() {
    let entries = [];
    let indexByKey = Object.create(null);

    return {
        /**
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
                const evictedKey = _dedupKey(evicted.message, evicted.frame);
                delete indexByKey[evictedKey];
            }
        },

        /**
         * @returns {Array<{type: string, message: string, frame: string, count: number}>}
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

        clear: function () {
            entries = [];
            indexByKey = Object.create(null);
        }
    };
}

module.exports = {
    create: create
};
