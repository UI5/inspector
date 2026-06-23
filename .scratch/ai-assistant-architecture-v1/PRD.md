# PRD: Inspector AI Assistant — Architecture V1

Status: ready-for-agent

## Problem Statement

Developers using the Inspector AI Assistant tab today experience instability, hard-to-explain failures, and inconsistent behavior when the local AI is not ready. From their perspective, the assistant sometimes appears to do nothing, sometimes produces confusing errors, and sometimes mixes prior selected-control data into unrelated questions.

For maintainers and AI coding agents working on the feature, the bigger underlying problem is that the assistant's core behavior cannot be validated without a real Chrome environment with the local model downloaded. As a result, changes to the assistant are difficult to verify automatically, and regressions are likely.

## Solution

Refactor the Inspector AI Assistant into clearly named boundaries — Prompt Builder, Prompt Client, Conversation Store, Assistant Controller, and the AIChat view — keeping production behavior stable while introducing a single high-level test seam at the Assistant Controller. This gives developers a more predictable assistant and gives AI coding agents a deterministic Agent Validation Loop that does not require Chrome's downloaded local model.

This is Assistant Architecture V1: it improves understandability, testability, and safety to change. It explicitly does not evaluate model answer quality, replace the local AI provider, redesign the UI, or introduce End-to-End Assistant Scenarios.

## User Stories

1. As a UI5 developer, I want the Inspector AI Assistant to clearly explain its current Assistant Capability State, so that I understand whether I can ask a question or need to download the local model first.
2. As a UI5 developer, I want to ask a question about my inspected app, so that I can understand its framework, theme, and loaded libraries without leaving DevTools.
3. As a UI5 developer, I want to ask a question about the currently selected control, so that I can quickly understand its type, properties, bindings, and aggregations.
4. As a UI5 developer, I want the assistant's response to stream incrementally, so that I see progress and can stop reading early if the direction is wrong.
5. As a UI5 developer, I want my conversation memory to be preserved per inspected URL, so that I can return to previous discussions without losing context.
6. As a UI5 developer, I want to clear my conversation memory at any time, so that I can start a clean discussion.
7. As a UI5 developer, I want selecting a new control to update Inspection Context for my next question only, so that old controls do not leak into unrelated answers.
8. As a UI5 developer, I want the assistant to recover gracefully when a streaming response fails, so that the tab does not get stuck in a "thinking" state.
9. As a UI5 developer, I want to see token usage when relevant, so that I know when I should clear history to keep responses fast.
10. As a UI5 developer, I want to copy assistant responses, so that I can paste them into my code or notes.
11. As a UI5 developer using an unsupported Chrome build, I want the assistant to tell me clearly that local AI is unavailable, so that I do not waste time trying to use it.
12. As a UI5 developer, I want the assistant's persistent history to never include selected-control snapshots, so that switching between unrelated controls does not bias future answers.
13. As a maintainer, I want assistant workflow logic to live in one named place, so that I can read and reason about it without tracing across UI, transport, and storage modules.
14. As a maintainer, I want prompt construction to be deterministic and unit-testable, so that changes to system prompts and control formatting cannot silently regress.
15. As a maintainer, I want the local AI transport to be hidden behind one named boundary, so that swapping or mocking the implementation does not require changes across the codebase.
16. As a maintainer, I want conversation persistence behind a small named interface, so that storage details and retention rules cannot leak into assistant workflow code.
17. As a maintainer, I want incremental refactoring steps, so that the extension stays usable throughout the work and each step can be released safely.
18. As an AI coding agent, I want a single high-level test seam at the Assistant Controller, so that I can validate the full assistant workflow without needing a real Chrome local model.
19. As an AI coding agent, I want deterministic fakes for the Prompt Client, so that I can simulate capability states, streaming chunks, errors, and usage info in unit tests.
20. As an AI coding agent, I want existing prompt-formatting tests preserved against the new Prompt Builder, so that prior behavioral expectations are not lost during the refactor.
21. As an AI coding agent, I want clear scope boundaries in this PRD, so that I do not accidentally extend the work into end-to-end automation, UI redesign, or model-quality testing.

## Implementation Decisions

This work follows ADR-0001 (`docs/adr/0001-incremental-ai-assistant-refactor.md`) and uses the vocabulary defined in `CONTEXT.md`.

The Inspector AI Assistant will be reshaped into the following named boundaries:

- **Prompt Builder** — owns the system prompt, application metadata formatting, selected-control formatting, truncation rules, and session seed messages. Deterministic and free of Chrome APIs.
- **Prompt Client** — owns all local AI operations: capability checks, model download, session creation, prompt streaming, usage reporting, and session destruction. It hides whether the implementation is the real Chrome extension port, a deterministic fake, or a future End-to-End Assistant Scenario adapter.
- **Conversation Store** — owns Conversation Memory: loading, appending, clearing, retention limit, and storage keys for an inspected URL. Hides Chrome storage details from the rest of the assistant.
- **Assistant Controller** — owns the assistant workflow: resolve Assistant Capability State, load conversation memory, create or reseed the session, send user messages, stream assistant responses, save completed turns, and expose state updates to the UI.
- **AIChat (view)** — focuses on rendering, user input, and surfacing controller state. It should no longer own session lifecycle, streaming orchestration, or persistence logic.

Architectural decisions:

- The Assistant Controller is the single integration point for assistant behavior. The AIChat view talks only to the controller.
- The Prompt Client is the only place that knows about `chrome.runtime.connect({ name: 'prompt-api' })` and the background service worker's port message protocol.
- The Prompt Builder is the only place that knows the textual shape of system prompts and Inspection Context formatting.
- The Conversation Store is the only place that knows the `ai_chat_<...>` key format and the 50-message retention limit.
- Assistant Capability States ("unsupported", "unavailable", "downloadable", "downloading", "ready", "session-failed", "streaming-failed") are first-class states exposed by the controller, not ad-hoc error strings.
- Inspection Context is injected per user prompt and is never stored as Conversation Memory.
- The background service worker's Prompt API handlers continue to own the actual `LanguageModel` session lifecycle. Their external port contract should not change in V1.

Refactor sequencing (incremental):

1. Extract Prompt Builder out of the current session manager. Keep production behavior unchanged.
2. Reshape the current session manager toward a Prompt Client interface (capability, download, session, stream, usage, destroy) without changing the port protocol.
3. Introduce a Conversation Store interface wrapping the current chat storage manager.
4. Introduce the Assistant Controller and move send / session / history / context workflow out of the AIChat view.
5. Leave AIChat rendering largely intact at first; only remove logic that has clearly migrated.

Each step must keep the existing test suite green and must add or migrate tests that exercise the new boundary before the next step starts.

## Testing Decisions

A good test for this work asserts external behavior of a boundary, not internal calls. Specifically:

- Tests should describe what the assistant does from the developer's perspective (state surfaced, messages stored, prompts produced, streamed text rendered), not which private method was called.
- Tests should not import Chrome extension APIs. The Prompt Client interface is the only place those touch real code, and that implementation is exercised only via the controller's fake-driven tests in V1.
- Tests should be deterministic. Streaming behavior is tested by feeding chunks through a fake Prompt Client, not by waiting for real timing.

Modules under test:

- **Prompt Builder** — unit tests for system prompt content under different application metadata, selected-control formatting, truncation behavior, and session seed message construction. Existing prompt-related tests from the current session manager spec migrate here.
- **Conversation Store** — unit tests for keying by URL, retention limit, load/save/clear behavior. Existing chat storage tests migrate or extend here.
- **Assistant Controller** — the primary new seam. Tests instantiate the controller with deterministic fakes for Prompt Builder, Prompt Client, and Conversation Store, then exercise the full Agent Validation Loop: capability resolution, session creation, send + stream, save, clear, context updates, reseed on URL change, and recovery from streaming failure.
- **AIChat (view)** — existing DOM-based tests stay, scoped to rendering and user-input behavior. They should not depend on real session or storage logic.

Prior art in the codebase:

- `tests/modules/ai/AISessionManager.spec.js` already validates prompt formatting and system prompt content; its style transfers directly to the Prompt Builder tests.
- `tests/modules/ai/ChatStorageManager.spec.js` already validates storage key shape; its style transfers to the Conversation Store tests.
- `tests/modules/ui/AIChat.spec.js` already drives DOM behavior with a `fixtures` container; the Assistant Controller seam will be tested in a similar style but without DOM coupling.

V1 explicitly produces no End-to-End Assistant Scenario tests. Those are out of scope.

## Out of Scope

- Evaluating Gemini Nano answer quality, accuracy, or hallucination behavior.
- Building End-to-End Assistant Scenarios that exercise the real Chrome extension, DevTools panel, inspected page, and local model.
- Replacing the Chrome local Prompt API with another provider, cloud or local.
- Redesigning the AI tab's visual layout, theming, or interaction patterns.
- Adding autonomous or multi-step "agent" behavior inside the assistant.
- Expanding the UI5 inspection data the assistant has access to beyond what UI5 Inspector already exposes.
- Changes to the rest of the inspector's message architecture, background service worker responsibilities, or content/injected scripts beyond what is required to keep the existing Prompt API port contract working.
- Persisting Inspection Context inside Conversation Memory.

## Further Notes

- Domain vocabulary is canonical in `CONTEXT.md`. Implementation should use those terms in code, comments, and tests.
- Architectural rationale is recorded in `docs/adr/0001-incremental-ai-assistant-refactor.md`.
- The first issue derived from this PRD should be the Prompt Builder extraction, because it is the lowest-risk, highest-leverage step toward the Agent Validation Loop.
