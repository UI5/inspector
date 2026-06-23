# UI5 Inspector

UI5 Inspector is a browser DevTools extension for inspecting and understanding UI5 applications during development.

## Language

**Inspector AI Assistant**:
The AI assistant tab in UI5 Inspector. It helps the developer understand the currently inspected UI5 application by combining user questions with optional UI5 inspection context, using Chrome's local Prompt API when available.
_Avoid_: General-purpose chatbot, cloud AI assistant, autonomous coding agent

**Useful Assistant Answer**:
A streamed answer that helps the developer understand the inspected UI5 application or selected control, while keeping the extension stable and clearly explaining unavailable local AI states.
_Avoid_: Best-effort model output, guaranteed correct answer, generic chat response

**Assistant Capability State**:
The current local AI capability available to the Inspector AI Assistant, such as unsupported, unavailable, downloadable, downloading, ready, session failed, or streaming failed. These states are normal product states, not only exceptional failures.
_Avoid_: Prompt API error, model error, availability flag

**Inspection Context**:
A snapshot of relevant UI5 Inspector data available when the developer asks the Inspector AI Assistant a question, especially selected control identity, properties, bindings, aggregations, and application metadata. The assistant consumes this context but does not own how UI5 Inspector collects it.
_Avoid_: Live inspector state, control tree ownership, AI context

**Conversation Memory**:
Prior user and assistant messages used to preserve continuity in the Inspector AI Assistant. Conversation memory is distinct from inspection context and should not persist selected-control snapshots as chat history.
_Avoid_: Chat context, prompt context, stored inspection state

**Agent Validation Loop**:
The repeatable local checks an AI coding agent can run to validate Inspector AI Assistant behavior without requiring a downloaded Chrome local model or manual DevTools interaction. Version 1 validates integration behavior with deterministic fakes, not the quality of actual model answers.
_Avoid_: Manual AI testing, Gemini answer validation, end-to-end model test

**End-to-End Assistant Scenario**:
A future validation scenario that exercises the Inspector AI Assistant through the real extension, DevTools panel, inspected page, and local model. This is separate from the version 1 agent validation loop.
_Avoid_: Unit test, fake streaming test, primary validation loop

**Prompt Client**:
The assistant-facing interface for local AI operations, including capability checks, model download, session creation, prompt streaming, usage reporting, and session destruction. It hides whether those operations use the real Chrome extension port, deterministic fakes, or a future test harness adapter.
_Avoid_: AISessionManager, Prompt API wrapper, Chrome port client

**Prompt Builder**:
The component responsible for producing system prompts, formatted user prompts, application metadata context, selected-control context, truncation rules, and session seed messages. It is deterministic and separate from the prompt client.
_Avoid_: Prompt client, transport formatter, model session manager

**Assistant Controller**:
The thin workflow coordinator for the Inspector AI Assistant. It initializes capability state, loads conversation memory, manages session creation or reseeding, sends user messages, streams assistant responses, saves completed turns, and exposes state updates to the UI.
_Avoid_: AIChat, prompt client, assistant UI

**Conversation Store**:
The persistence boundary for Inspector AI Assistant conversation memory. It loads, appends, clears, limits, and keys stored chat turns for an inspected URL while hiding Chrome storage details from assistant workflow code.
_Avoid_: Chrome storage manager, chat storage helper, persisted inspection context

**Assistant Architecture V1**:
The first simplification effort for the Inspector AI Assistant, focused on understandable boundaries and deterministic agent validation. It excludes actual model answer quality evaluation, full DevTools extension end-to-end automation, UI redesign, provider replacement, autonomous actions, broader UI5 data collection, and changes to the rest of the inspector message architecture.
_Avoid_: AI rewrite, e2e assistant validation, model quality evaluation
