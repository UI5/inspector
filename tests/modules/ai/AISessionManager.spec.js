'use strict';

var AISessionManager = require('../../../app/scripts/modules/ai/AISessionManager.js');

describe('AISessionManager', function () {
    var sessionManager;

    beforeEach(function () {
        sessionManager = new AISessionManager();
    });

    afterEach(function () {
        sessionManager = null;
    });

    describe('Constructor', function () {
        it('should initialize with null port', function () {
            (sessionManager._port === null).should.be.true;
        });

        it('should initialize with empty message handlers', function () {
            Object.keys(sessionManager._messageHandlers).should.have.lengthOf(0);
        });

        it('should initialize with disconnected state', function () {
            sessionManager._isConnected.should.be.false;
        });

        it('should initialize with no active session', function () {
            sessionManager._hasActiveSession.should.be.false;
        });
    });

    describe('#_on() and #_off()', function () {
        it('should register message handler', function () {
            var handler = function () {};
            sessionManager._on('test-type', handler);

            sessionManager._messageHandlers['test-type'].should.equal(handler);
        });

        it('should remove message handler', function () {
            var handler = function () {};
            sessionManager._on('test-type', handler);
            sessionManager._off('test-type');

            (sessionManager._messageHandlers['test-type'] === undefined).should.be.true;
        });
    });

    describe('#hasActiveSession()', function () {
        it('should return false initially', function () {
            sessionManager.hasActiveSession().should.be.false;
        });

        it('should return true after session set', function () {
            sessionManager._hasActiveSession = true;
            sessionManager.hasActiveSession().should.be.true;
        });
    });
});
