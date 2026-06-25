# 06 — Trim AIChat to a thin view over the controller

Status: done

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Reduce `AIChat` to a view module over `AssistantController`. The view renders state from the controller and forwards user input (send, clear history, clear context, download model). It does not own session lifecycle, persistence, streaming orchestration, capability transitions, or context injection.

Rendering, markdown parsing, JSON/code viewers, scroll behavior, copy-to-clipboard, and dialogs may remain in the view because they are presentation concerns.

Existing DOM-based `AIChat` tests are reviewed and reduced to rendering and user-input assertions. They must not depend on real session, storage, or capability behavior.

The Inspector AI Assistant tab continues to look and behave the same for the developer.

## Acceptance criteria

- [x] `AIChat` contains only view concerns: rendering, user-input forwarding, markdown/JSON/code rendering, scroll, clipboard, and dialogs.
- [x] No direct dependency in `AIChat` on `PromptClient`, `PromptBuilder`, or `ConversationStore`. All assistant behavior goes through `AssistantController`.
- [x] Existing DOM-based `AIChat` tests pass and are limited to view behavior.
- [x] `grunt test` is green.
- [x] No production behavior change is visible in the AI tab.

## Blocked by

- `.scratch/ai-assistant-architecture-v1/issues/04-assistant-controller-validation-loop.md`
- `.scratch/ai-assistant-architecture-v1/issues/05-capability-state-surface.md`

## Comments

### 2026-06-25 — closing the slice

Most of the trimming had already landed across slices 04, 05 and 08
(AIChat.js was already a thin view over `AssistantController`, only
importing the controller). This slice tightened the two remaining
boundary gaps:

1. **AIChat tests no longer depend on real session/storage/capability
   behavior.** The top-level `beforeEach` previously instantiated a
   real `AssistantController` which in turn constructed a real
   `ConversationStore` requiring `chrome.storage.local`. The suite
   only happened to pass in the full test run because other specs
   (`pageAction.spec.js`, `ContextMenu.spec.js`) leak
   `window.chrome = require('chrome-stub')` onto the shared Karma
   window. Running `tests/modules/ui/AIChat.spec.js` in isolation
   crashed in the `beforeEach` with `ConversationStore requires a
   chrome.storage.local-compatible storage surface`.

   Fix: hoist `createFakeController()` to the top of the spec and have
   every `beforeEach` (not just the capability-state describe block)
   build the view with `{ controller: fakeController }`. The view is
   now tested at its true seam — the controller surface — and the
   spec passes in isolation (57 tests).

2. **Removed three dead view-side fields that suggested workflow
   ownership.** `_currentContext` was written by `updateContext` and
   `_clearContext` but never read. `_messages` was pushed into by
   `_addMessage` and reset in two places but never read. `_currentUrl`
   was only used to dedupe `setUrl` calls, which `AssistantController.setUrl`
   already does. Their presence was misleading — they read like the
   view holds Inspection Context, Conversation Memory, and URL state
   when it does not. Removed all three and dropped the corresponding
   internal-state assertions from `Constructor & Initialization`.

Production behavior unchanged: the only public surface used by
`panel/ui5/main.js` is `setUrl()`, `updateContext()`, `onTabActivated()`,
and `destroy()`. All four still exist and still delegate to the
controller. Full `grunt test` green (435 tests).
