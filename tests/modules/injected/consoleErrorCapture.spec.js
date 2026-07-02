'use strict';

const consoleErrorCapture = require('../../../app/scripts/modules/injected/consoleErrorCapture.js');

/**
 * Build a minimal window-like host suitable for exercising the capture adapter without touching
 * the real console or window. The host records original values so the test can assert
 * pass-through behavior.
 */
function createFakeWindow() {
    const originalError = sinon.spy();
    const originalWarn = sinon.spy();
    return {
        console: {
            error: originalError,
            warn: originalWarn
        },
        onerror: null,
        onunhandledrejection: null,
        // handles for the assertion side
        _originalError: originalError,
        _originalWarn: originalWarn
    };
}

describe('consoleErrorCapture', function () {
    describe('#install()', function () {
        it('should return a handle with a buffer and an uninstall function', function () {
            const win = createFakeWindow();

            const handle = consoleErrorCapture.install(win);

            handle.should.have.property('buffer');
            handle.uninstall.should.be.a('function');
        });

        it('should funnel console.error calls into the buffer', function () {
            const win = createFakeWindow();

            const handle = consoleErrorCapture.install(win);
            win.console.error('boom');

            const snap = handle.buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].message.should.equal('boom');
            snap[0].type.should.equal('error');
        });

        it('should funnel console.warn calls into the buffer', function () {
            const win = createFakeWindow();

            const handle = consoleErrorCapture.install(win);
            win.console.warn('careful');

            const snap = handle.buffer.snapshot();
            snap[0].type.should.equal('warn');
            snap[0].message.should.equal('careful');
        });

        it('should keep the original console.error running so the developer sees their own output', function () {
            const win = createFakeWindow();

            consoleErrorCapture.install(win);
            win.console.error('boom');

            win._originalError.calledOnce.should.be.true;
            win._originalError.firstCall.args[0].should.equal('boom');
        });

        it('should funnel window.onerror invocations into the buffer', function () {
            const win = createFakeWindow();

            const handle = consoleErrorCapture.install(win);
            win.onerror('boom', 'app.js', 42, 5, new Error('boom'));

            const snap = handle.buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].type.should.equal('uncaught');
            snap[0].message.should.equal('boom');
        });

        it('should funnel unhandledrejection into the buffer with a rejection prefix', function () {
            const win = createFakeWindow();

            const handle = consoleErrorCapture.install(win);
            win.onunhandledrejection({ reason: new Error('async boom') });

            const snap = handle.buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].message.should.contain('async boom');
        });

        it('should call onRecord after each recorded event', function () {
            const win = createFakeWindow();
            const onRecord = sinon.spy();

            consoleErrorCapture.install(win, { onRecord: onRecord });
            win.console.error('a');
            win.console.warn('b');

            onRecord.calledTwice.should.be.true;
        });

        it('should be idempotent across repeated install() calls on the same window', function () {
            const win = createFakeWindow();

            const first = consoleErrorCapture.install(win);
            const second = consoleErrorCapture.install(win);

            first.should.equal(second);
        });

        it('should stringify Error instances passed to console.error and pull the stack when available', function () {
            const win = createFakeWindow();
            const handle = consoleErrorCapture.install(win);

            const err = new Error('typed boom');
            win.console.error(err);

            const snap = handle.buffer.snapshot();
            snap[0].message.should.contain('typed boom');
        });
    });
});
