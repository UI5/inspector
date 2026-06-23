# 0001. Incrementally Refactor the Inspector AI Assistant

## Status

Accepted

## Context

The Inspector AI Assistant currently mixes UI rendering, assistant workflow, conversation history, prompt building, Prompt API transport, and streaming behavior across a small number of modules. This makes the feature hard for developers and AI coding agents to validate because the core behavior depends on Chrome extension ports, the MV3 background service worker, and Chrome's local `LanguageModel` API.

We want the first architecture improvement to make the assistant understandable, testable, and safer to change. Full extension end-to-end automation with a real local model is valuable, but is outside the version 1 scope.

## Decision

We will refactor the Inspector AI Assistant incrementally instead of replacing the internals in one rewrite.

The target boundaries are:

- `PromptBuilder` for deterministic prompt and context formatting.
- `PromptClient` for local AI operations behind the Chrome extension port.
- `ConversationStore` for persisted conversation memory.
- `AssistantController` for the assistant workflow and state transitions.
- `AIChat` primarily for rendering and user interaction.

Each extraction should add deterministic validation before or alongside the code movement.

## Consequences

This keeps production behavior stable while creating seams that can be tested without a downloaded local model or manual DevTools interaction.

The refactor will take several smaller steps instead of one large simplification. During the transition, some legacy names and mixed responsibilities may remain temporarily.
