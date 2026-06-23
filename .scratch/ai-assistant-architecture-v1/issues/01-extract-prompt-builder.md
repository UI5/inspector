# 01 — Extract Prompt Builder behind delegation

Status: done

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Extract a named `PromptBuilder` from the current AI session manager. The Prompt Builder owns the system prompt, application metadata formatting, selected-control formatting, truncation rules, and session seed message construction. It is deterministic and uses no Chrome APIs.

Keep the public behavior of `AISessionManager` unchanged by delegating its existing prompt-related methods to the new `PromptBuilder`. The Inspector AI Assistant tab must continue to work end-to-end exactly as today.

This is the first vertical slice of the Assistant Architecture V1 refactor. It introduces no new transport, no new UI behavior, and no new state machine.

## Acceptance criteria

- [ ] A new `PromptBuilder` module exists in the `modules/ai` area and owns system prompt content, application metadata formatting, selected-control context formatting, truncation rules, and session seed message construction.
- [ ] `AISessionManager` no longer contains the prompt-construction logic itself; it delegates to `PromptBuilder`.
- [ ] All currently passing prompt and context formatting tests continue to pass, and the equivalent tests now live in a `PromptBuilder` spec.
- [ ] Existing `AISessionManager` spec retains only transport/session-related assertions.
- [ ] `grunt test` is green.
- [ ] No production behavior change is visible in the AI tab (status, sending, streaming, history all behave identically).

## Blocked by

None - can start immediately
