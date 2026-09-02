'use strict';

const MemoryIndicator = require('../../../app/scripts/modules/ui/MemoryIndicator.js');

describe('MemoryIndicator', function () {
    const fixtures = document.getElementById('fixtures');
    let indicator;

    beforeEach(function () {
        fixtures.innerHTML = '<div id="memory-host"></div>';
        indicator = new MemoryIndicator('memory-host', { onClear: function () {} });
    });

    afterEach(function () {
        indicator.destroy();
        fixtures.innerHTML = '';
        indicator = null;
    });

    describe('Constructor & render', function () {
        it('should render a circle button inside the host', function () {
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.should.exist;
        });

        it('should render the popover element inside the host, hidden by default', function () {
            const popover = fixtures.querySelector('.memory-popover');
            popover.should.exist;
            popover.hidden.should.be.true;
        });

        it('should render the circle as an SVG', function () {
            const svg = fixtures.querySelector('.memory-indicator-btn svg');
            svg.should.exist;
        });
    });

    describe('#update()', function () {
        it('should hide the indicator when hasMessages is false', function () {
            indicator.update({ hasMessages: false, inputUsage: 0, inputQuota: 6144, percentUsed: 0 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.hidden.should.be.true;
        });

        it('should show the indicator when hasMessages is true', function () {
            indicator.update({ hasMessages: true, inputUsage: 100, inputQuota: 6144, percentUsed: 2 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.hidden.should.be.false;
        });

        it('should update the aria-label with the percentage', function () {
            indicator.update({ hasMessages: true, inputUsage: 3000, inputQuota: 6144, percentUsed: 49 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.getAttribute('aria-label').should.contain('49%');
        });

        it('should add warning class at 70%', function () {
            indicator.update({ hasMessages: true, inputUsage: 4500, inputQuota: 6144, percentUsed: 73 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.classList.contains('memory-warning').should.be.true;
        });

        it('should add critical class at 90%', function () {
            indicator.update({ hasMessages: true, inputUsage: 5700, inputQuota: 6144, percentUsed: 93 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.classList.contains('memory-critical').should.be.true;
        });

        it('should add exhausted class at 100%', function () {
            indicator.update({ hasMessages: true, inputUsage: 6144, inputQuota: 6144, percentUsed: 100 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.classList.contains('memory-exhausted').should.be.true;
        });

        it('should remove stale state classes when usage drops below threshold', function () {
            indicator.update({ hasMessages: true, inputUsage: 6144, inputQuota: 6144, percentUsed: 100 });
            indicator.update({ hasMessages: true, inputUsage: 100, inputQuota: 6144, percentUsed: 2 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.classList.contains('memory-exhausted').should.be.false;
            btn.classList.contains('memory-critical').should.be.false;
            btn.classList.contains('memory-warning').should.be.false;
        });
    });

    describe('Popover open / close', function () {
        beforeEach(function () {
            indicator.update({ hasMessages: true, inputUsage: 1000, inputQuota: 6144, percentUsed: 16 });
        });

        it('should open the popover when the circle button is clicked', function () {
            fixtures.querySelector('.memory-indicator-btn').click();
            fixtures.querySelector('.memory-popover').hidden.should.be.false;
        });

        it('should close the popover when the circle button is clicked again', function () {
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.click();
            btn.click();
            fixtures.querySelector('.memory-popover').hidden.should.be.true;
        });

        it('should close the popover on Escape keydown', function () {
            fixtures.querySelector('.memory-indicator-btn').click();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            fixtures.querySelector('.memory-popover').hidden.should.be.true;
        });

        it('should show usage text in the popover', function () {
            fixtures.querySelector('.memory-indicator-btn').click();
            const popover = fixtures.querySelector('.memory-popover');
            popover.textContent.should.contain('16%');
        });

        it('should show plain-language explanation in the popover', function () {
            fixtures.querySelector('.memory-indicator-btn').click();
            const popover = fixtures.querySelector('.memory-popover');
            popover.textContent.should.contain('memory');
        });

        it('should render a Start Fresh button in the popover', function () {
            fixtures.querySelector('.memory-indicator-btn').click();
            const btn = fixtures.querySelector('.memory-popover .memory-clear-btn');
            btn.should.exist;
        });
    });

    describe('onClear callback', function () {
        it('should call onClear when Start Fresh is clicked', function () {
            let called = false;
            indicator.destroy();
            fixtures.innerHTML = '<div id="memory-host2"></div>';
            indicator = new MemoryIndicator('memory-host2', { onClear: function () { called = true; } });
            indicator.update({ hasMessages: true, inputUsage: 1000, inputQuota: 6144, percentUsed: 16 });
            fixtures.querySelector('.memory-indicator-btn').click();
            fixtures.querySelector('.memory-clear-btn').click();
            called.should.be.true;
        });
    });

    describe('aria-expanded', function () {
        it('should have aria-expanded="false" on the button initially', function () {
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.getAttribute('aria-expanded').should.equal('false');
        });

        it('should set aria-expanded="true" when the popover is opened', function () {
            indicator.update({ hasMessages: true, inputUsage: 1000, inputQuota: 6144, percentUsed: 16 });
            fixtures.querySelector('.memory-indicator-btn').click();
            fixtures.querySelector('.memory-indicator-btn').getAttribute('aria-expanded').should.equal('true');
        });

        it('should set aria-expanded="false" when the popover is closed', function () {
            indicator.update({ hasMessages: true, inputUsage: 1000, inputQuota: 6144, percentUsed: 16 });
            const btn = fixtures.querySelector('.memory-indicator-btn');
            btn.click();
            btn.click();
            btn.getAttribute('aria-expanded').should.equal('false');
        });
    });

    describe('popover role', function () {
        it('should use role="region" on the popover, not role="dialog"', function () {
            const popover = fixtures.querySelector('.memory-popover');
            popover.getAttribute('role').should.equal('region');
            popover.getAttribute('role').should.not.equal('dialog');
        });
    });

    describe('#destroy()', function () {
        it('should remove the Escape keydown listener so it does not fire after destroy', function () {
            indicator.update({ hasMessages: true, inputUsage: 100, inputQuota: 6144, percentUsed: 2 });
            fixtures.querySelector('.memory-indicator-btn').click(); // open it
            indicator.destroy();
            // Manually spy on _close — if the listener were still active it would call _close
            let closeCalled = false;
            const orig = indicator._close.bind(indicator);
            indicator._close = function () { closeCalled = true; orig(); };
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            closeCalled.should.be.false;
        });
    });
});
