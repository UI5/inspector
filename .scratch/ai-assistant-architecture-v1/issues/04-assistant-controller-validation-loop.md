# 04 — Introduce Assistant Controller and the V1 Agent Validation Loop

Status: ready-for-agent

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Introduce a thin `AssistantController` that owns the Inspector AI Assistant workflow and depends on `PromptBuilder`, `PromptClient`, and `ConversationStore`.

The controller owns:

- resolving and exposing Assistant Capability State (definitive states finalized in slice 05; transitional strings acceptable here)
- loading Conversation Memory for the current inspected URL
- creating and reseeding the local AI session with system prompt + prior turns
- accepting Inspection Context updates and injecting them into the next user prompt only
- sending user messages and streaming assistant responses
- saving completed user/assistant turns through `ConversationStore`
- clearing Conversation Memory and reseeding the session
- exposing state updates and streamed content to the view

Move the send / session / streaming / history / context workflow out of `AIChat`. `AIChat` calls only the controller from this slice onward. Rendering, markdown, JSON/code viewers, dialogs, scroll behavior, and clipboard helpers stay in the view for now.

Add the primary new test seam: the `AssistantController` is tested with deterministic fakes for `PromptBuilder`, `PromptClient`, and `ConversationStore`. The full Agent Validation Loop is exercised here without Chrome APIs: capability resolution, session creation, send + stream, save, clear, context update, reseed on URL change, and recovery from streaming failure.

The Inspector AI Assistant tab must continue to behave the same for the developer.

## Acceptance criteria

- [ ] An `AssistantController` module exists and depends only on `PromptBuilder`, `PromptClient`, and `ConversationStore`.
- [ ] `AIChat` no longer owns session lifecycle, streaming orchestration, history persistence, or context injection logic; it interacts only with the controller.
- [ ] Controller tests use deterministic fakes for the three collaborators and cover: capability resolution, session creation with seed messages, send + streaming, save of both turns, clear and reseed, context update affecting only the next prompt, reseed on URL change, and streaming-failure recovery (no permanent "thinking" state).
- [ ] Existing DOM-based `AIChat` tests still pass and do not depend on real session or storage behavior.
- [ ] `grunt test` is green.
- [ ] No production behavior change is visible in the AI tab.

## Blocked by

- `.scratch/ai-assistant-architecture-v1/issues/01-extract-prompt-builder.md`
- `.scratch/ai-assistant-architecture-v1/issues/02-reshape-prompt-client.md`
- `.scratch/ai-assistant-architecture-v1/issues/03-introduce-conversation-store.md`
