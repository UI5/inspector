# 05 — First-class Assistant Capability State surface

Status: ready-for-agent

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

Make Assistant Capability State a first-class, finite set exposed by the `AssistantController`. Replace ad-hoc availability strings and try/catch error rendering with explicit states:

- `unsupported` — Chrome local AI is not available in this environment.
- `unavailable` — local AI is present but cannot run on this device.
- `downloadable` — model can be downloaded.
- `downloading` — model is currently downloading, with progress.
- `ready` — assistant is ready to accept a prompt.
- `session-failed` — last session creation failed; user-facing recovery is offered.
- `streaming-failed` — last streamed response failed; the tab does not get stuck.

The AI tab's status banner and download button reflect these states. The controller exposes both the current state and any progress/message payload needed for the view.

Controller tests cover transitions for each state, including streaming-failure recovery returning to `ready`.

## Acceptance criteria

- [ ] `AssistantController` exposes a finite set of Assistant Capability States with the names above.
- [ ] The AI tab's status banner and download button reflect those states; no ad-hoc string mapping remains in the view.
- [ ] Streaming failure transitions the controller back to a usable `ready` state and does not leave the view in a permanent "thinking" indicator.
- [ ] Controller tests cover each state transition, including download progress, session failure, streaming failure, and recovery.
- [ ] `grunt test` is green.
- [ ] No regression to existing AI tab behavior in supported, downloadable, or unavailable scenarios.

## Blocked by

`.scratch/ai-assistant-architecture-v1/issues/04-assistant-controller-validation-loop.md`
