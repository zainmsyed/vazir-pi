# Story 087: Run stack-neutral E2E lifecycles in the sandbox

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** 2026-09-03

---

## Goal
Implement the test-sandbox runner that executes configured setup, start, readiness, and test commands as structured subprocess calls inside a disposable workspace. It allocates configured loopback port roles, captures phase-specific logs and exit results, applies bounded timeouts, terminates the complete spawned process tree, and returns an honest report with any preserved sandbox and artifact paths.

## Verification
Run real subprocess tests in isolated temporary projects covering success, setup failure, startup failure, readiness timeout, test failure, cancellation, and overall timeout. Confirm argument boundaries are preserved, commands always use the sandbox as cwd, allocated ports reach child environments, descendants are terminated, logs remain inspectable, and the source project remains byte-for-byte unchanged.

## Scope — files this story may touch
- `.pi/lib/vazir-test-sandbox.ts`
- `.pi/lib/vazir-ports.ts`
- `.pi/lib/vazir-sandbox-workspace.ts`
- `scripts/lib/test-sandbox-fixtures.mts`
- `scripts/validate-vazir-test-sandbox-runner.mts`
- `scripts/run-validations.mts`
- `.context/stories/plan.md`
- `.context/stories/story-087.md`

## Out of scope — do not touch
- Pi command registration or interactive configuration UI
- Playwright-specific orchestration, screenshots, visual analysis, or browser installation
- Network blocking, environment-secret filtering, containers, VMs, or claims of hostile-code containment

## Dependencies
- Story 085
- Story 086
- Existing deterministic port-assignment helper in `.pi/lib/vazir-ports.ts`

---

## Checklist
- [x] Execute every configured phase without a shell and with the sandbox as canonical cwd
- [x] Allocate configured loopback port roles and pass their values to child environments
- [x] Add bounded readiness polling, phase timeouts, cancellation, and process-tree cleanup
- [x] Capture phase logs, durations, exit states, and artifact or preserved-workspace paths
- [x] Keep test failures distinct from runner and cleanup failures in the final result
- [x] Add real-process regressions for every lifecycle outcome and source immutability

---

## Issues

- Scope expansion approved during review remediation: `scripts/run-validations.mts` now registers the runner validation in the aggregate suite.

---

## Completion Summary
Implemented `.pi/lib/vazir-test-sandbox.ts`, a stack-neutral subprocess lifecycle runner that stages a disposable workspace, allocates a deterministic loopback port, passes port metadata through child environments, and executes setup, startup, readiness polling, and test commands with `shell: false`. The runner captures phase logs and results, distinguishes setup/startup/readiness/test/cancellation/overall-timeout outcomes, terminates detached process trees, preserves failed workspaces when configured, and reports cleanup and artifact paths without exporting changes to the source project. Extended shared fixtures and added real-process regressions covering success, setup failure, startup failure, readiness timeout, test failure, cancellation, overall timeout, argument boundaries, descendant cleanup, artifact inspection, and source immutability.
