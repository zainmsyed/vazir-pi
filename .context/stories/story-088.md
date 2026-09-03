# Story 088: Add the explicit `/test-sandbox` workflow

**Status:** not-started  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** —

---

## Goal
Add a user-directed `/test-sandbox` command owned by a dedicated sandbox extension. The command guides users through writing persisted structured configuration when it is missing, shows the planned phases before execution, runs the shared sandbox lifecycle, reports success or actionable failure with log and preservation paths, and clearly states that workspace isolation is not host security isolation.

## Verification
Exercise the command through automated success, cancellation, missing-configuration, validation-failure, execution-failure, and preservation-path scenarios, then run an interactive TTY smoke test of guided setup and one real stack-neutral E2E command. Confirm no ordinary `/review`, `/complete-story`, `/implement`, or `/fix` flow invokes the sandbox automatically.

## Scope — files this story may touch
- `.pi/extensions/vazir-sandbox/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/lib/vazir-test-sandbox.ts`
- `.pi/lib/vazir-helpers.ts`
- `package.json`
- `README.md`
- `types/node-runtime-ambient.d.ts`
- `scripts/lib/test-sandbox-fixtures.mts`
- `scripts/validate-vazir-test-sandbox-command.mts`
- `scripts/run-validations.mts`
- `.context/stories/plan.md`
- `.context/stories/story-088.md`

## Out of scope — do not touch
- Automatic execution from `/complete-story`, `/review`, `/implement`, or `/fix`
- One-off arbitrary command overrides or automatic agent-selected commands
- Playwright-specific visual QA and browser artifact interpretation
- Container, bubblewrap, VM, network, syscall, or credential isolation

## Dependencies
- Story 085
- Story 086
- Story 087

---

## Checklist
- [ ] Create the owning sandbox extension and register `/test-sandbox` exactly once
- [ ] Add one-session guided setup that persists structured commands without shell parsing
- [ ] Preview configured phases and require explicit user initiation before execution
- [ ] Report success, cancellation, validation failure, execution failure, logs, and preservation paths accurately
- [ ] Add command help, installation registration, README guidance, and an explicit security-boundary warning
- [ ] Cover every command path plus configured and missing-configuration UI branches
- [ ] Register targeted validation in the aggregate runner and complete an interactive TTY smoke test

---

## Issues

---

## Completion Summary
