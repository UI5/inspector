# 06 — Trim AIChat to a thin view over the controller

Status: ready-for-agent

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Reduce `AIChat` to a view module over `AssistantController`. The view renders state from the controller and forwards user input (send, clear history, clear context, download model). It does not own session lifecycle, persistence, streaming orchestration, capability transitions, or context injection.

Rendering, markdown parsing, JSON/code viewers, scroll behavior, copy-to-clipboard, and dialogs may remain in the view because they are presentation concerns.

Existing DOM-based `AIChat` tests are reviewed and reduced to rendering and user-input assertions. They must not depend on real session, storage, or capability behavior.

The Inspector AI Assistant tab continues to look and behave the same for the developer.

## Acceptance criteria

- [ ] `AIChat` contains only view concerns: rendering, user-input forwarding, markdown/JSON/code rendering, scroll, clipboard, and dialogs.
- [ ] No direct dependency in `AIChat` on `PromptClient`, `PromptBuilder`, or `ConversationStore`. All assistant behavior goes through `AssistantController`.
- [ ] Existing DOM-based `AIChat` tests pass and are limited to view behavior.
- [ ] `grunt test` is green.
- [ ] No production behavior change is visible in the AI tab.

## Blocked by

- `.scratch/ai-assistant-architecture-v1/issues/04-assistant-controller-validation-loop.md`
- `.scratch/ai-assistant-architecture-v1/issues/05-capability-state-surface.md`
