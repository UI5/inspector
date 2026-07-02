'use strict';

const consoleErrorBuffer = require('../../../app/scripts/modules/injected/consoleErrorBuffer.js');

describe('consoleErrorBuffer', function () {

    describe('#create()', function () {
        it('should return an object with record, snapshot, and clear methods', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.should.have.property('record').that.is.a('function');
            buffer.should.have.property('snapshot').that.is.a('function');
            buffer.should.have.property('clear').that.is.a('function');
        });

        it('should start with an empty snapshot', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.snapshot().should.deep.equal([]);
        });
    });

    describe('#record() — basic buffering', function () {
        it('should record a single event and expose it via snapshot', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'boom' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].message.should.equal('boom');
            snap[0].count.should.equal(1);
        });

        it('should accept error, warn, and uncaught event types', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            buffer.record({ type: 'warn', message: 'b' });
            buffer.record({ type: 'uncaught', message: 'c' });

            buffer.snapshot().should.have.lengthOf(3);
        });
    });

    describe('#record() — FIFO ring behavior', function () {
        it('should hold at most three distinct entries', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            buffer.record({ type: 'error', message: 'b' });
            buffer.record({ type: 'error', message: 'c' });
            buffer.record({ type: 'error', message: 'd' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(3);
            snap.map(function (e) { return e.message; }).should.deep.equal(['b', 'c', 'd']);
        });

        it('should preserve arrival order in the snapshot (oldest first)', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'first' });
            buffer.record({ type: 'error', message: 'second' });
            buffer.record({ type: 'error', message: 'third' });

            const snap = buffer.snapshot();
            snap.map(function (e) { return e.message; }).should.deep.equal(['first', 'second', 'third']);
        });
    });

    describe('#record() — deduplication', function () {
        it('should increment the count on an existing entry when the same message + top-shown stack frame arrives again', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'boom', stack: 'Error\n    at foo (app.js:1:1)' });
            buffer.record({ type: 'error', message: 'boom', stack: 'Error\n    at foo (app.js:1:1)' });
            buffer.record({ type: 'error', message: 'boom', stack: 'Error\n    at foo (app.js:1:1)' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].message.should.equal('boom');
            snap[0].count.should.equal(3);
        });

        it('should not re-promote a deduplicated entry to the front of the buffer', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            buffer.record({ type: 'error', message: 'b' });
            buffer.record({ type: 'error', message: 'a' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(2);
            snap[0].message.should.equal('a');
            snap[0].count.should.equal(2);
            snap[1].message.should.equal('b');
        });

        it('should treat events with the same message but different top-shown frames as distinct', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'boom', stack: 'Error\n    at foo (app.js:1:1)' });
            buffer.record({ type: 'error', message: 'boom', stack: 'Error\n    at bar (other.js:5:5)' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(2);
        });

        it('should normalize whitespace in the message for the dedup key', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'foo   bar' });
            buffer.record({ type: 'error', message: 'foo bar' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].count.should.equal(2);
        });
    });

    describe('#record() — stack-frame selection', function () {
        it('should pick the top frame when it is not a framework frame', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({
                type: 'uncaught',
                message: 'boom',
                stack: 'Error\n    at foo (app.js:42:5)\n    at bar (other.js:5:5)'
            });

            const snap = buffer.snapshot();
            snap[0].frame.should.contain('app.js:42');
        });

        it('should skip a top frame from sap-ui-core.js and use the next one', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({
                type: 'uncaught',
                message: 'boom',
                stack: 'Error\n    at Something (https://ui5.sap.com/1.120.0/resources/sap-ui-core.js:1:1)\n    at onPress (app/controller/Main.controller.js:42:5)'
            });

            const snap = buffer.snapshot();
            snap[0].frame.should.contain('Main.controller.js:42');
        });

        it('should skip a top frame that matches resources/sap/', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({
                type: 'uncaught',
                message: 'boom',
                stack: 'Error\n    at Something (resources/sap/m/Button.js:100:10)\n    at onPress (app/controller/Main.controller.js:42:5)'
            });

            const snap = buffer.snapshot();
            snap[0].frame.should.contain('Main.controller.js:42');
        });

        it('should skip at most three frames total, then fall back to whatever frame we landed on', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({
                type: 'uncaught',
                message: 'boom',
                stack: 'Error\n' +
                    '    at f1 (resources/sap/a.js:1:1)\n' +
                    '    at f2 (resources/sap/b.js:1:1)\n' +
                    '    at f3 (resources/sap/c.js:1:1)\n' +
                    '    at f4 (resources/sap/d.js:1:1)\n' +
                    '    at f5 (app.js:1:1)'
            });

            // 3 skips total means: skip frame 1, skip frame 2, skip frame 3, then use frame 4.
            const snap = buffer.snapshot();
            snap[0].frame.should.contain('resources/sap/d.js');
        });

        it('should omit the frame when the event has no stack', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'no stack here' });

            const snap = buffer.snapshot();
            snap[0].message.should.equal('no stack here');
            (snap[0].frame === undefined || snap[0].frame === null || snap[0].frame === '').should.be.true;
        });
    });

    describe('#clear()', function () {
        it('should empty the buffer', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            buffer.record({ type: 'error', message: 'b' });
            buffer.clear();

            buffer.snapshot().should.deep.equal([]);
        });

        it('should allow recording after clear', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            buffer.clear();
            buffer.record({ type: 'error', message: 'b' });

            const snap = buffer.snapshot();
            snap.should.have.lengthOf(1);
            snap[0].message.should.equal('b');
        });
    });

    describe('#snapshot()', function () {
        it('should return a fresh copy so mutating it does not affect the internal buffer', function () {
            const buffer = consoleErrorBuffer.create();

            buffer.record({ type: 'error', message: 'a' });
            const snap = buffer.snapshot();
            snap.push({ message: 'injected' });

            buffer.snapshot().should.have.lengthOf(1);
        });
    });
});
