'use strict';

var highLighterModule = require('../../../app/scripts/modules/content/highLighter.ts');

describe('highLighter', function () {
    it('should expose a create() factory', function () {
        highLighterModule.should.be.a('object');
        highLighterModule.create.should.be.a('function');
    });

    describe('#setDimensions()', function () {
        var fixtures = document.getElementById('fixtures');
        var highLighter;
        var target;

        before(function () {
            fixtures.innerHTML = '<div id="shell" style="width: 50px; height: 50px;"></div>';
            target = document.getElementById('shell');
            highLighter = highLighterModule.create();
        });

        after(function () {
            fixtures.innerHTML = '';
            var wrapper = document.getElementById('ui5-highlighter');
            if (wrapper) {
                wrapper.parentNode.removeChild(wrapper);
            }
        });

        it('should create the wrapper DOM elements on first call', function () {
            highLighter.setDimensions(target);

            document.body.querySelector('#ui5-highlighter').should.exist;
            document.body.querySelector('#ui5-highlighter > div').should.exist;
        });

        it('should set sizes on the inner element matching the target rect', function () {
            highLighter.setDimensions(target);

            document.body.querySelector('#ui5-highlighter > div').style.width.should.equal('50px');
            document.body.querySelector('#ui5-highlighter > div').style.height.should.equal('50px');
        });

        it('should position the inner div according to target', function () {
            var rect = target.getBoundingClientRect();
            highLighter.setDimensions(target);

            document.body.querySelector('#ui5-highlighter > div').style.top.should.equal(rect.top + 'px');
            document.body.querySelector('#ui5-highlighter > div').style.left.should.equal(rect.left + 'px');
        });

        it('should not change CSS styles when called with no element', function () {
            highLighter.setDimensions(target);
            var inner = document.body.querySelector('#ui5-highlighter > div');
            var widthBefore = inner.style.width;
            var heightBefore = inner.style.height;
            var topBefore = inner.style.top;
            var leftBefore = inner.style.left;

            highLighter.setDimensions(null);

            inner.style.width.should.equal(widthBefore);
            inner.style.height.should.equal(heightBefore);
            inner.style.top.should.equal(topBefore);
            inner.style.left.should.equal(leftBefore);
        });

        it('should hide the highlighter on hover', function () {
            highLighter.setDimensions(target);
            document.body.querySelector('#ui5-highlighter').onmouseover();

            document.body.querySelector('#ui5-highlighter').style.display.should.equal('none');
        });

        it('should reuse a single wrapper across calls', function () {
            highLighter.setDimensions(target);
            highLighter.setDimensions(target);

            document.body.querySelectorAll('#ui5-highlighter').length.should.equal(1);
        });

        it('should accept a custom wrapperId for distinct instances', function () {
            var other = highLighterModule.create({ wrapperId: 'ui5-highlighter-other' });
            other.setDimensions(target);

            document.body.querySelector('#ui5-highlighter-other').should.exist;

            // cleanup
            var w = document.getElementById('ui5-highlighter-other');
            if (w) {
                w.parentNode.removeChild(w);
            }
        });
    });
});
