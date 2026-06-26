# 07 — Pre-wire PromptClient streaming buffer before iteration

Status: done

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

The async iterator returned by `PromptClient.promptStreaming` currently only wires its internal chunk buffer once `for await` (or `iterator.next()`) starts. Real port messages arriving between `_send('prompt-streaming')` and the first iteration call are dropped. Pre-wire the buffer at `promptStreaming` time so streaming is order-independent and a class of timing bugs disappears.

Today's production behavior happens to be safe because the UI's `for await` loop begins on the same microtask that resolves the `promptStreaming` promise, before any real port message can arrive. This is fragile: any UI change that defers iteration (a microtask gap, a wrapping helper, a debounce, etc.) silently loses the first chunks.

The fix should be invisible to consumers: `AIChat` still does `const stream = await promptClient.promptStreaming(...); for await (const chunk of stream) { ... }` and observes the same chunks in the same order. Only the internal buffering wiring moves earlier.

## Acceptance criteria

- [ ] A new deterministic test on the `PromptClient` boundary asserts that chunks emitted between `_send('prompt-streaming')` and the first `iterator.next()` are buffered and delivered in order, instead of dropped.
- [ ] The chunk / complete / error message handlers are attached and the in-memory buffer is created synchronously inside `promptStreaming`, before the returned promise resolves.
- [ ] The existing "yield streamed chunks until complete" test continues to pass without timing tricks in the test setup (chunks may be emitted before the first `iterator.next()` call and still arrive).
- [ ] The disconnect and mid-stream error tests continue to pass.
- [ ] `AISessionManager` and `AIChat` are not modified.
- [ ] `grunt test` is green.
- [ ] No observable behavior change in the Inspector AI Assistant tab.

## Blocked by

None.
