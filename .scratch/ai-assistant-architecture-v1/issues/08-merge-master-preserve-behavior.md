# 08 — Merge master into V1 refactor branch and preserve behavior

Status: ready-for-agent

## Parent

`.scratch/ai-assistant-architecture-v1/PRD.md`

## What to build

`master` has advanced while the V1 refactor was in flight. One PR (#350, squashed onto master as `ec1befd fix(ai): seed system+history via initialPrompts; let session manage state`) is the same fix that lived on this branch as two earlier commits (`1c63b69`, `8c03d84`), but with a different final shape. Git cannot detect the duplication, so a plain merge produces conflicts in three files.

Merge `origin/master` into the current V1 refactor branch (`refactor/ai-assistant-architecture-v1`), resolve the conflicts, and verify that **all behavior improvements from master are preserved** in the post-refactor module layout.

This is a structural merge, not a refactor. Do not introduce new behavior, do not change boundary names, do not modify the PRD/ADR/glossary or the runner prompt.

## Conflict surface

Three files conflict, with eight hunks total:

- `app/scripts/modules/ai/AISessionManager.js` — 3 hunks
- `app/scripts/modules/ui/AIChat.js` — 4 hunks
- `tests/modules/ai/AISessionManager.spec.js` — 1 hunk

The reason: master's hunks live in code we have since refactored or split into the new boundaries (`PromptBuilder`, `PromptClient`, `AssistantController`, view-only `AIChat`). The default resolution is "take ours" for the conflict marks, but **two behavior improvements** from master must be confirmed to still exist in the refactored architecture.

## Behavior improvements that MUST be preserved

These came from master's `ec1befd` and are the actual reason this merge needs care:

1. **Background `handleCreateSession`** creates the new `LanguageModel` session first and only destroys the old one on success. A failure during init must leave the previous session usable.
2. **History replay** must skip empty assistant placeholders. The reseed path must not replay a blank assistant turn produced when streaming was interrupted.

Find where each of these behaviors lives in the current refactored modules. If either is missing or weakened, restore it in the correct module (`PromptClient`, `AssistantController`, or `background/main.js` as appropriate) — using the project's domain vocabulary from `CONTEXT.md`.

## Acceptance criteria

- [ ] `git log` shows a merge commit bringing `origin/master` into `refactor/ai-assistant-architecture-v1`, not a rebase.
- [ ] No conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) remain in any file.
- [ ] `app/scripts/modules/ai/AISessionManager.js` stays a thin facade over `PromptClient` + `PromptBuilder` after the merge. Master's hunks targeting code that no longer exists here are dropped.
- [ ] `app/scripts/modules/ui/AIChat.js` stays a thin view over `AssistantController` after the merge. Streaming/history/session orchestration is not re-added here.
- [ ] `tests/modules/ai/AISessionManager.spec.js` keeps the transport-boundary shape from this branch.
- [ ] The "new session created before destroying the old one on success" behavior from master exists in the post-refactor code (most likely in `background/main.js` or `PromptClient`). A test exercises this behavior at the right boundary.
- [ ] The "history replay skips empty assistant placeholders" behavior from master exists in the post-refactor code (most likely in `AssistantController`). A test exercises this behavior at the controller seam.
- [ ] `grunt lint` passes.
- [ ] `grunt test` passes (currently 396+ passing tests; expect that number to stay the same or grow).
- [ ] The merge commit message references this issue path and notes that master's `ec1befd` (PR #350) is incorporated.

## Out of scope

- Picking up later V1 slices (05, 06, 07). This issue is the merge only.
- Restructuring any module. If a behavior is missing, restore it in the smallest place that fits the existing boundary; do not introduce a new module.
- Updating the PR description on GitHub. The human handles that after the merge lands.

## Blocked by

None - can start immediately
