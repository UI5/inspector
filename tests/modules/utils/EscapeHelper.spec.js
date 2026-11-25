'use strict';

var EscapeHelper = require('../../../app/scripts/modules/utils/EscapeHelper.js');
var escapeHTML = EscapeHelper.escapeHTML;
var sanitizeSectionTitle = EscapeHelper.sanitizeSectionTitle;

describe('EscapeHelper', function () {

    describe('#escapeHTML', function () {
        it('should escape all five HTML-significant characters', function () {
            escapeHTML('&<>"\'').should.equal('&amp;&lt;&gt;&quot;&#39;');
        });

        it('should return empty string for null/undefined', function () {
            escapeHTML(null).should.equal('');
            escapeHTML(undefined).should.equal('');
        });

        it('should coerce non-strings', function () {
            escapeHTML(0).should.equal('0');
            escapeHTML(false).should.equal('false');
        });
    });

    describe('#sanitizeSectionTitle', function () {
        it('should preserve a legitimate controlId title (webc shape, no title attr)', function () {
            var title = '#<span class="controlId" data-control-id="button_0">button_0</span><span gray>(sap.m.Button)</span>';
            sanitizeSectionTitle(title).should.equal(title);
        });

        it('should preserve the classic controlId title carrying the copy-to-console title attribute', function () {
            var title = '#<span class="controlId" data-control-id="__xmlview0--btn" title="Click to copy control to console">__xmlview0--btn</span><span gray>(sap.m.Button)</span>';
            sanitizeSectionTitle(title).should.equal(title);
        });

        it('should preserve the "Inherits from" title', function () {
            var title = '<span gray>Inherits from</span> (sap.ui.core.Control)';
            sanitizeSectionTitle(title).should.equal(title);
        });

        it('should preserve the <opaque> scaffold in binding/aggregation titles', function () {
            var title = 'counter <opaque>(property)</opaque>';
            sanitizeSectionTitle(title).should.equal('counter <opaque>(property)</opaque>');
        });

        it('should escape a forged title with an injected element', function () {
            var forged = '<img src=x onerror="alert(1)">';
            sanitizeSectionTitle(forged).should.not.contain('<img');
            sanitizeSectionTitle(forged).should.contain('&lt;img');
        });

        it('should escape a forged title that closes a span and injects', function () {
            var forged = '<span gray>x</span><script>alert(1)</script>';
            sanitizeSectionTitle(forged).should.not.contain('<script');
            sanitizeSectionTitle(forged).should.contain('&lt;script');
        });

        it('should not allow attribute breakout via the controlId value', function () {
            var forged = '<span class="controlId" data-control-id="x" onmouseover="alert(1)">x</span>';
            sanitizeSectionTitle(forged).should.not.contain('onmouseover="alert');
            sanitizeSectionTitle(forged).should.contain('&lt;span');
        });

        it('should single-escape the data-control-id attribute and display the id decoded (id with ampersand)', function () {
            var title = '#<span class="controlId" data-control-id="my&Control" title="Click to copy control to console">my&Control</span><span gray>(sap.m.Button)</span>';
            var out = sanitizeSectionTitle(title);
            out.should.contain('data-control-id="my&amp;Control"');
            out.should.not.contain('&amp;amp;');
            out.should.contain('>my&Control</span>');
        });

        it('should not break out of the attribute when a forged id contains a quote and markup', function () {
            var title = '#<span class="controlId" data-control-id="a">< img src=x>" title="Click to copy control to console">x</span>';
            var out = sanitizeSectionTitle(title);
            out.should.not.contain('<img');
        });

        it('should not reconstruct a tag from the display-text slot of a legit-looking controlId span', function () {
            var title = '#<span class="controlId" data-control-id="ok" title="Click to copy control to console"><img src=x onerror=alert(1)></span>';
            var out = sanitizeSectionTitle(title);
            out.should.not.contain('<img');
            out.should.contain('&lt;img');
        });
    });
});
