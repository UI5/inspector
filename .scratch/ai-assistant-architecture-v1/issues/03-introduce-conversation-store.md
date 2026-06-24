# 03 — Introduce Conversation Store boundary

Status: done

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Wrap the existing chat storage logic in a named `ConversationStore` interface. The store owns Conversation Memory: load, append, clear, retention limit (currently 50), and storage key shape per inspected URL. It hides Chrome storage details from the rest of the assistant.

Conversation Memory is strictly chat turns. Inspection Context must never be persisted as Conversation Memory through this store.

The Inspector AI Assistant tab must continue to load, save, and clear chat history per URL exactly as today. This slice creates a small, fakeable persistence boundary that the upcoming Assistant Controller will consume.

## Acceptance criteria

- [ ] A `ConversationStore` interface exists with load, append, clear, retention, and keying behavior for an inspected URL.
- [ ] Implementation wraps the current Chrome storage usage; no other module accesses `chrome.storage` directly for chat history after this slice.
- [ ] The 50-message retention behavior and the `ai_chat_<...>` keying behavior are preserved.
- [ ] Existing chat storage tests are migrated or extended onto `ConversationStore`.
- [ ] `grunt test` is green.
- [ ] No production behavior change is visible in the AI tab (history reloads, persists, and clears identically).

## Blocked by

None - can start immediately
