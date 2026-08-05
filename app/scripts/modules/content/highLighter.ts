'use strict';

/**
 * Factory for highlighter overlays. Each call returns an independent
 * instance with its own wrapper element, so multiple instances (e.g. one
 * for classic UI5, one for UI5 Web Components) can coexist on a page.
 *
 * @param {Object} [options]
 * @param {string} [options.wrapperId='ui5-highlighter'] - DOM id of the
 *     wrapper div. Use distinct ids when more than one highlighter shares
 *     a page so they don't collide.
 */
function createHighlighter(options) {
    var wrapperId = (options && options.wrapperId) || 'ui5-highlighter';
    var wrapper = null;

    function _create() {
        var inner = document.createElement('div');
        inner.style.cssText = 'box-sizing: border-box;border:1px solid blue;background: rgba(20, 20, 200, 0.4);position: absolute';

        var w = document.createElement('div');
        w.id = wrapperId;
        w.style.cssText = 'position: fixed;top:0;right:0;bottom:0;left:0;z-index: 1000;overflow: hidden;pointer-events: none;';
        w.appendChild(inner);

        document.body.appendChild(w);

        // Hide on mouseover so the user can interact with the page underneath
        w.onmouseover = hide;
        wrapper = w;
    }

    function _ensure() {
        // Pick up an existing wrapper from a previous DevTools session
        // (e.g. user closed and reopened DevTools)
        if (!wrapper || !wrapper.isConnected) {
            wrapper = document.getElementById(wrapperId);
        }
        if (!wrapper) {
            _create();
        }
    }

    /**
     * Position the overlay over the given element. The element is resolved
     * by the caller — this module does not look ids up, since classic UI5
     * uses DOM ids and web components use a framework-assigned _id.
     * @param {Element} element
     */
    function setDimensions(element) {
        _ensure();

        var inner = wrapper.firstElementChild;

        if (!element) {
            // No target — leave the wrapper visible but clear the inner box,
            // matching the legacy behavior.
            return;
        }

        wrapper.style.display = 'block';

        var rect = element.getBoundingClientRect();
        inner.style.top = rect.top + 'px';
        inner.style.left = rect.left + 'px';
        inner.style.height = rect.height + 'px';
        inner.style.width = rect.width + 'px';
    }

    function hide() {
        if (wrapper) {
            wrapper.style.display = 'none';
        }
    }

    return {
        setDimensions: setDimensions,
        hide: hide
    };
}

module.exports = {
    create: createHighlighter
};
