'use strict';

const consoleErrorBuffer = require('./consoleErrorBuffer.js');

/**
 * Wraps `console.error`/`console.warn` and hooks `window.onerror` and `unhandledrejection`,
 * feeding every event into a {@link consoleErrorBuffer}. Idempotent — repeated calls return
 * the same handle.
 *
 * @param {Window} win - The inspected page's window.
 * @param {Object} [options]
 * @param {Function} [options.onRecord] - Called after every recorded event.
 * @returns {{buffer: Object}}
 */
function install(win, options) {
    options = options || {};
    const onRecord = typeof options.onRecord === 'function' ? options.onRecord : null;
    const buffer = consoleErrorBuffer.create();

    function _record(event) {
        buffer.record(event);
        if (onRecord) {
            try {
                onRecord();
            } catch (e) {
                // Don't let a subscriber break capture.
            }
        }
    }

    // Install once — the injected script can re-run after `do-script-injection`.
    if (win.__ui5InspectorConsoleErrorCaptureInstalled) {
        return win.__ui5InspectorConsoleErrorCaptureInstalled;
    }

    const originalError = win.console && win.console.error;
    const originalWarn = win.console && win.console.warn;
    const originalOnError = win.onerror;
    const originalOnUnhandled = win.onunhandledrejection;

    function _joinArgs(args) {
        return Array.prototype.map.call(args, function (arg) {
            if (arg === null) { return 'null'; }
            if (typeof arg === 'undefined') { return 'undefined'; }
            if (typeof arg === 'string') { return arg; }
            if (arg instanceof Error) {
                return arg.stack || (arg.name + ': ' + arg.message);
            }
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return String(arg);
            }
        }).join(' ');
    }

    function _extractStack(args) {
        for (let i = 0; i < args.length; i++) {
            if (args[i] instanceof Error && args[i].stack) {
                return args[i].stack;
            }
        }
        return undefined;
    }

    win.console.error = function () {
        try {
            _record({
                type: 'error',
                message: _joinArgs(arguments),
                stack: _extractStack(arguments)
            });
        } catch (e) {
            // Don't break the page's own console.error.
        }
        if (typeof originalError === 'function') {
            return originalError.apply(win.console, arguments);
        }
    };

    win.console.warn = function () {
        try {
            _record({
                type: 'warn',
                message: _joinArgs(arguments),
                stack: _extractStack(arguments)
            });
        } catch (e) {
            // See above.
        }
        if (typeof originalWarn === 'function') {
            return originalWarn.apply(win.console, arguments);
        }
    };

    win.onerror = function () {
        // Signature (message, source, lineno, colno, error) — 5 params > JSHint maxparams,
        // so read from `arguments`.
        const message = arguments[0];
        const source = arguments[1];
        const lineno = arguments[2];
        const colno = arguments[3];
        const error = arguments[4];
        try {
            _record({
                type: 'uncaught',
                message: typeof message === 'string' ? message : String(message),
                stack: error && error.stack ? error.stack :
                    (source ? '    at ' + source + ':' + (lineno || 0) + ':' + (colno || 0) : undefined)
            });
        } catch (e) {
            // See above.
        }
        if (typeof originalOnError === 'function') {
            return originalOnError.apply(win, arguments);
        }
        return false;
    };

    win.onunhandledrejection = function (event) {
        try {
            const reason = event && event.reason;
            let message;
            let stack;
            if (reason instanceof Error) {
                message = reason.message || String(reason);
                stack = reason.stack;
            } else if (typeof reason === 'string') {
                message = reason;
            } else {
                try {
                    message = JSON.stringify(reason);
                } catch (e) {
                    message = String(reason);
                }
            }
            _record({
                type: 'uncaught',
                message: 'Unhandled promise rejection: ' + message,
                stack: stack
            });
        } catch (e) {
            // See above.
        }
        if (typeof originalOnUnhandled === 'function') {
            return originalOnUnhandled.apply(win, arguments);
        }
    };

    const handle = {
        buffer: buffer
    };
    win.__ui5InspectorConsoleErrorCaptureInstalled = handle;
    return handle;
}

module.exports = {
    install: install
};
