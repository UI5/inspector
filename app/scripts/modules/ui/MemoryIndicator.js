'use strict';

const CIRCLE_RADIUS = 9;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

/**
 * Circular conversation-memory indicator with a popover.
 *
 * Replaces the text-based token counter. Renders a circle whose filled arc reflects
 * context-window usage, with a popover that explains the concept in plain language
 * and offers a "Start Fresh" action.
 *
 * @param {string} hostId - ID of the container element.
 * @param {Object} options
 * @param {Function} options.onClear - Called when the user confirms "Start Fresh".
 * @constructor
 */
function MemoryIndicator(hostId, { onClear = function () {} } = {}) {
    this._host = document.getElementById(hostId);
    this._onClear = onClear;
    this._isOpen = false;
    this._onEscape = null;
    this._render();
    this._attachListeners();
}

MemoryIndicator.prototype._render = function () {
    this._host.innerHTML = `
        <button class="memory-indicator-btn" aria-label="Conversation memory: 0% used" aria-expanded="false" hidden>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <circle class="memory-track" cx="11" cy="11" r="${CIRCLE_RADIUS}" />
                <circle class="memory-fill" cx="11" cy="11" r="${CIRCLE_RADIUS}"
                    stroke-dasharray="${CIRCLE_CIRCUMFERENCE}"
                    stroke-dashoffset="${CIRCLE_CIRCUMFERENCE}"
                    transform="rotate(-90 11 11)" />
            </svg>
            <span class="memory-pct-label">0%</span>
        </button>
        <div class="memory-popover" hidden role="region" aria-label="Conversation memory">
            <div class="memory-popover-header">Conversation Memory</div>
            <div class="memory-popover-bar-wrap">
                <div class="memory-popover-bar">
                    <div class="memory-popover-bar-fill"></div>
                </div>
                <span class="memory-popover-pct">0%</span>
            </div>
            <div class="memory-popover-detail"></div>
            <p class="memory-popover-explainer">
                The AI keeps your conversation in working memory.
                When it's full, start a new chat to continue.
                This has nothing to do with payments or subscriptions.
            </p>
            <button class="memory-clear-btn">Start Fresh</button>
        </div>
    `;
    this._btn = this._host.querySelector('.memory-indicator-btn');
    this._fill = this._host.querySelector('.memory-fill');
    this._pctLabel = this._host.querySelector('.memory-pct-label');
    this._popover = this._host.querySelector('.memory-popover');
    this._popoverBar = this._host.querySelector('.memory-popover-bar-fill');
    this._popoverPct = this._host.querySelector('.memory-popover-pct');
    this._popoverDetail = this._host.querySelector('.memory-popover-detail');
    this._clearBtn = this._host.querySelector('.memory-clear-btn');
};

MemoryIndicator.prototype._attachListeners = function () {
    this._btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggle();
    });
    this._popover.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    this._clearBtn.addEventListener('click', () => {
        this._close();
        this._onClear();
    });
    this._onEscape = (e) => {
        if (e.key === 'Escape' && this._isOpen) {
            this._close();
        }
    };
    this._onDocClick = () => {
        if (this._isOpen) {
            this._close();
        }
    };
    document.addEventListener('keydown', this._onEscape);
    document.addEventListener('click', this._onDocClick);
};

/**
 * @param {{hasMessages: boolean, inputUsage: number, inputQuota: number, percentUsed: number}} info
 */
MemoryIndicator.prototype.update = function (info) {
    if (!info || !info.hasMessages) {
        this._btn.hidden = true;
        this._close();
        return;
    }

    const pct = Math.min(100, Math.max(0, info.percentUsed || 0));
    const offset = CIRCLE_CIRCUMFERENCE * (1 - pct / 100);

    this._fill.style.strokeDashoffset = offset;
    this._pctLabel.textContent = pct + '%';
    this._btn.setAttribute('aria-label', 'Conversation memory: ' + pct + '% used');

    this._btn.classList.remove('memory-warning', 'memory-critical', 'memory-exhausted');
    if (pct >= 100) {
        this._btn.classList.add('memory-exhausted');
    } else if (pct >= 90) {
        this._btn.classList.add('memory-critical');
    } else if (pct >= 70) {
        this._btn.classList.add('memory-warning');
    }

    const usageK = ((info.inputUsage || 0) / 1024).toFixed(1);
    const quotaK = ((info.inputQuota || 0) / 1024).toFixed(1);
    this._popoverPct.textContent = pct + '%';
    this._popoverBar.style.width = pct + '%';
    this._popoverBar.className = 'memory-popover-bar-fill' +
        (pct >= 100 ? ' exhausted' : pct >= 90 ? ' critical' : pct >= 70 ? ' warning' : '');
    this._popoverDetail.textContent = usageK + 'K / ' + quotaK + 'K used';

    this._btn.hidden = false;
};

MemoryIndicator.prototype._toggle = function () {
    if (this._isOpen) {
        this._close();
    } else {
        this._open();
    }
};

MemoryIndicator.prototype._open = function () {
    this._isOpen = true;
    this._popover.hidden = false;
    this._btn.setAttribute('aria-expanded', 'true');
};

MemoryIndicator.prototype._close = function () {
    this._isOpen = false;
    this._popover.hidden = true;
    this._btn.setAttribute('aria-expanded', 'false');
};

MemoryIndicator.prototype.destroy = function () {
    if (this._onEscape) {
        document.removeEventListener('keydown', this._onEscape);
        this._onEscape = null;
    }
    if (this._onDocClick) {
        document.removeEventListener('click', this._onDocClick);
        this._onDocClick = null;
    }
};

module.exports = MemoryIndicator;
