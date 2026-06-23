# Runner Prompt

# ISSUES

Issues live as markdown files under `.scratch/<feature-slug>/issues/`. Each issue has a `Status:` line near the top using the vocabulary in `docs/agents/triage-labels.md`. The parent PRD for the current feature is at `.scratch/<feature-slug>/PRD.md`.

To find work: list `.scratch/*/issues/*.md` and read any whose `Status: ready-for-agent`. Read the parent PRD, the project glossary at `CONTEXT.md`, and any ADRs under `docs/adr/` that touch the area.

# TASK SELECTION

Pick exactly one task. Prioritize in this order:

1. Critical bugfixes (anything described as breaking the AI tab, the inspector tab, or the build).
2. Tracer bullets for new features. A tracer bullet is a thin vertical slice that cuts through every layer end-to-end, gives early feedback, and is independently demoable. Pick the lowest-numbered unblocked `ready-for-agent` issue whose "Blocked by" list is fully satisfied (blockers have `Status: done` or are no longer present).
3. Polish and quick wins (small UX or stability improvements that are isolated).
4. Refactors that are not on the critical path.

If nothing is `ready-for-agent` and unblocked, output `<promise>COMPLETE</promise>` and stop.

# EXPLORATION

Before writing code, load the relevant context into your working memory:

- The chosen issue file in full, including acceptance criteria and "Blocked by".
- The parent PRD at `.scratch/<feature-slug>/PRD.md`.
- `CONTEXT.md` — use this vocabulary in code, comments, and tests. Do not invent new terms.
- Any ADR under `docs/adr/` that mentions the area you are touching.
- `CLAUDE.md` for project conventions (Grunt build, ESLint + JSHint, JSDoc, CommonJS `require`/`module.exports`, no ES modules, no `console.log` in production code, single quotes, ES5-flavored where the surrounding code is ES5-flavored).
- The exact source files the issue scopes you to. Do not edit files outside that scope.
- The closest existing tests as prior art (Karma + Mocha + Chai + Sinon). Do not introduce new test infrastructure.

# EXECUTION

Complete the single chosen task and only that task, using **test-driven development**.

Rules per cycle:

- Write or migrate **one** test that describes one behavior in domain vocabulary from `CONTEXT.md`.
- Run tests and confirm the new test is RED.
- Write the **minimum** code to make it GREEN.
- Refactor only while GREEN.
- Repeat.

Use the right flavor of TDD for the chosen issue:

- **New behavior or new seam** (for example: introducing the Assistant Controller, the Assistant Capability State surface): classic RED → GREEN → REFACTOR. Tests describe external behavior at the highest seam the issue specifies. Use deterministic fakes only at the named boundaries from `CONTEXT.md` (`PromptBuilder`, `PromptClient`, `ConversationStore`, `AssistantController`). Do not mock internal collaborators.
- **Structural migration** (for example: extracting Prompt Builder, wrapping Conversation Store, trimming AIChat to a view): seed RED from existing tests. Move or rewrite one existing test against the new module name. That test starts RED because the new module does not exist yet. Make it GREEN by introducing the new module and delegating from the old one. Then migrate the next test. Do not migrate tests in bulk.

Constraints during execution:

- One test at a time. Do not write all tests first.
- Only enough production code to pass the current test. Do not add speculative features.
- Tests verify external behavior, not private methods. A test that breaks on a rename without any behavior change is wrong.
- Do not rely on Chrome runtime APIs or a real local model in tests.
- Keep the AI tab's observable behavior unchanged unless the issue explicitly changes it.
- Do not change port message names, the background service worker contract, or unrelated modules.
- `grunt lint` must pass.
- `grunt test` must be green at the end of every RED → GREEN cycle and at the end of the task.

When done, verify every acceptance-criteria checkbox in the issue is satisfied.

# REPORT

Do not commit, push, or modify git state. Leave the working tree dirty for the human to review.

Output a short final report:

1. Issue path that was worked on.
2. Acceptance criteria status (checked / unchecked) with one-line evidence for each.
3. Files added.
4. Files modified.
5. Tests added or migrated, in the order they were written, with the behavior each one describes.
6. Result of `grunt lint` and `grunt test`.
7. Anything that should become a follow-up issue (do not create the issue file).

# FINAL RULES

- ONLY WORK ON A SINGLE TASK.
- Do not start a follow-up task in the same run, even if it looks easy.
- Do not modify `CONTEXT.md` or files under `docs/adr/` unless the chosen issue explicitly says so.
- Do not create new files outside what the chosen issue implies.
- Do not modify the chosen issue file's `Status:` line, and do not close it.
- Do not commit, amend, push, or change any git state.
