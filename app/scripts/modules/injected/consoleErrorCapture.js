'use strict';

const consoleErrorBuffer = require('./consoleErrorBuffer.js');

/**
 * Browser-side glue around {@link consoleErrorBuffer}. Monkey-patches `console.error` and
 * `console.warn` and subscribes to `window.onerror` and `unhandledrejection`, funneling every
 * error-like event into the buffer's state machine.
 *
 * The original `console.error` / `console.warn` continue to run, so the developer's own console
 * output is not silenced by the capture. Wrap once — repeated calls to {@link install} are a
 * no-op.
 *
 * @param {Window} win - Injection target (the inspected page's window). Injected in tests.
 * @param {Object} [options]
 * @param {Function} [options.onRecord] - Called after every recorded event. Used by the injected
 *     glue to push a fresh snapshot to the panel.
 * @returns {{buffer: Object, uninstall: Function}}
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
                // Never let a subscriber failure disrupt the capture.
            }
        }
    }

    // Install-once guard. Stashed on the inspected page's `window` — a foreign object we do not
    // own — because the injected script may be re-injected after `do-script-injection` and we
    // must not stack patches on top of patches. Namespaced with `__ui5Inspector` to signal that
    // this key belongs to this extension and is not intended for the page's own code.
    if (win.__ui5InspectorConsoleErrorCaptureInstalled) {
        return win.__ui5InspectorConsoleErrorCaptureInstalled;
    }

    const originalError = win.console && win.console.error;
    const originalWarn = win.console && win.console.warn;
    const originalOnError = win.onerror;
    const originalOnUnhandled = win.onunhandledrejection;

    // Stringify console.error / console.warn arguments the way Node/Chrome would when you
    // paste them into console: values separated by spaces, objects JSON-stringified. Kept
    // deliberately simple — the model just needs the message text, not perfect fidelity.
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
            // Never let capture failure disrupt the developer's own console.error output.
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
        // Signature: (message, source, lineno, colno, error) — five params exceed the repo's
        // JSHint `maxparams` cap, so we read them off `arguments` instead.
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
        buffer: buffer,
        uninstall: function () {
            win.console.error = originalError;
            win.console.warn = originalWarn;
            win.onerror = originalOnError;
            win.onunhandledrejection = originalOnUnhandled;
            delete win.__ui5InspectorConsoleErrorCaptureInstalled;
        }
    };
    win.__ui5InspectorConsoleErrorCaptureInstalled = handle;
    return handle;
}

module.exports = {
    install: install
};
