# Story 088: Add agent-directed natural-language sandbox testing

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-04  
**Completed:** 2026-09-04

---

## Goal
Add an explicit `/test-sandbox [request]` workflow and an agent-callable sandbox tool. A user describes the behavior to test in natural language; the agent inspects the project, active story, and relevant changes, decides whether workspace isolation is appropriate, and builds a purpose-specific structured test plan. Before any commands run, Vazir shows the plan and requires explicit user approval. After execution, the agent reports observed results, phase evidence, logs, and any preserved failure workspace. This workflow is recommended before `/complete-story`, but is never automatic or a completion gate.

## Verification
Exercise command handoff with and without an inline request, natural-language tool discovery, plan approval and cancellation, malformed-plan rejection, successful execution, execution failure, logs, and preservation paths. Confirm commands remain executable-and-argument arrays with no shell parsing and that persistent `test_sandbox` configuration is not required. Run an interactive TTY smoke test in a real Pi session where the agent derives a story-specific plan, the user reviews it, and one stack-neutral test executes in a disposable workspace. Confirm `/review`, `/complete-story`, `/implement`, and `/fix` never invoke the sandbox automatically.

## Scope — files this story may touch
- `.pi/extensions/vazir-sandbox/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/lib/vazir-test-sandbox.ts`
- `package.json`
- `README.md`
- `types/node-runtime-ambient.d.ts`
- `scripts/lib/test-sandbox-fixtures.mts`
- `scripts/validate-vazir-test-sandbox-command.mts`
- `scripts/run-validations.mts`
- `.context/stories/plan.md`
- `.context/stories/story-088.md`

## Out of scope — do not touch
- Automatic sandbox execution or completion gating from `/complete-story`, `/review`, `/implement`, or `/fix`
- Running an agent-authored plan without a user-visible preview and explicit approval
- Shell command strings, shell parsing, or automatic export of sandbox changes to the source workspace
- Removing the legacy `test_sandbox` settings schema delivered by Story 085
- Playwright-specific visual QA and browser artifact interpretation
- Container, bubblewrap, VM, network, syscall, credential, or host security isolation

## Dependencies
- Story 085
- Story 086
- Story 087

---

## Checklist
- [x] Register `/test-sandbox [request]` once and hand natural-language requests to the agent
- [x] Expose an agent-callable tool that accepts a purpose-specific structured phase plan and reuses the shared runner
- [x] Preview the complete plan, security boundary, and commands before requiring explicit user approval
- [x] Return structured success, cancellation, validation, execution, log, and preservation evidence for the agent’s report
- [x] Remove the command’s dependency on persisted commands while preserving legacy settings compatibility
- [x] Add package registration, command help, and README guidance recommending the workflow before `/complete-story`
- [x] Cover command and tool branches, register validation, and complete an interactive TTY story-specific smoke test

---

## Issues

- Story 088 was reset before implementation after clarifying the product intent: users should describe what to test, while the agent derives a sandbox plan. Stories 085–087 remain valid infrastructure; only Story 088’s orchestration contract changed.
- Automated command/tool coverage and a real Pi extension-load smoke pass are complete. The interactive TTY smoke also passed: `/test-sandbox story 88` handed the request to the agent, displayed the agent-authored plan for approval, and ran the targeted Story 088 validator successfully in a disposable workspace.
- Fossil initially reported the Story 086/087 `.pi/lib/vazir-sandbox-workspace.ts` and `.pi/lib/vazir-test-sandbox.ts` foundations as unknown despite their prior closeout check-ins, along with the new Story 088 extension and validator. Resolved by adding all four hidden-path files to Fossil tracking before closeout; no commit was created.

---

## Completion Summary

Implemented the agent-directed sandbox workflow in `.pi/extensions/vazir-sandbox/index.ts`. `/test-sandbox [request]` accepts inline natural language or prompts when omitted, identifies the active story, and instructs the agent to inspect project changes and either explain why sandboxing is unsuitable or call the new `vazir_test_sandbox` tool with a purpose-specific plan. The tool is naturally discoverable, sequential, independent of persisted commands, rejects malformed or shell-string plans, previews purpose, expected outcomes, every structured command, timeout, preservation policy, and the workspace-only security boundary, then requires explicit approval. Users can cancel or return the plan to the agent for revision.

The tool reuses the Story 087 runner and returns structured approval, validation, runner status, phase evidence, bounded log excerpts, full preserved log paths, cleanup state, and failure workspace paths for the agent’s final report. Successful runs now retain bounded phase evidence even after their disposable workspace is cleaned. Legacy `test_sandbox` settings remain compatible but are not required by this workflow.

Registered the owning extension, updated command help and the built-in/README workflow to recommend sandbox testing before `/complete-story` without gating it, and added aggregate regression coverage for command handoff, natural-language discovery, cancellation/revision, unavailable UI, malformed plans, real success and failure execution, log evidence, preservation, source immutability, and absence of automatic calls from existing workflows. Targeted validations, package/help checks, a real Pi extension-load contract smoke, and the full `npm test` suite pass. The final interactive TTY approval smoke passed with the purpose-specific `node --experimental-strip-types scripts/validate-vazir-test-sandbox-command.mts` plan: the test phase exited 0, retained its bounded pass-message evidence, and cleaned the successful workspace. Added the previously missed hidden Story 086/087 foundations and Story 088's new extension/validator to Fossil tracking so the complete feature will survive a fresh checkout; no commit was created.
