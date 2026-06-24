# 02 — Reshape session manager into Prompt Client interface

Status: done

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Reshape the current `AISessionManager` into a `PromptClient` interface, the single named boundary for local AI transport. The interface exposes: capability check, model download (with progress), session creation (with seed messages built by `PromptBuilder`), prompt streaming, usage info, and session destruction.

The Chrome extension port protocol with the background service worker (`prompt-api` port, message types like `check-availability`, `download-model`, `create-session`, `prompt-streaming`, `get-usage-info`, `destroy-session`) does not change in this slice. The background service worker handlers stay as-is.

The Inspector AI Assistant tab must continue to work end-to-end exactly as today. After this slice, the assistant has a clearly named transport boundary that the upcoming Assistant Controller will depend on.

## Acceptance criteria

- [ ] A `PromptClient` interface exists with the capability, download, session, stream, usage, and destroy operations.
- [ ] The implementation is the only place that knows about `chrome.runtime.connect({ name: 'prompt-api' })` and the port message types.
- [ ] Prompt construction is not done inside `PromptClient`; it consumes already-built prompts and seed messages from `PromptBuilder`.
- [ ] Existing `AISessionManager` consumers (currently `AIChat`) continue to function with no observable behavior change.
- [ ] Transport-level tests (capability state, streaming chunks, usage info, error/disconnect handling) exist against the `PromptClient` boundary using deterministic fakes for the port.
- [ ] `grunt test` is green.
- [ ] No production behavior change is visible in the AI tab.

## Blocked by

`.scratch/ai-assistant-architecture-v1/issues/01-extract-prompt-builder.md`
