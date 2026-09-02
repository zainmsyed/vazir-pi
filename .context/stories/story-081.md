# Story 081: Validate installation reliability across supported platforms

**Status:** complete  
**Type:** test  
**Created:** 2026-08-31  
**Last accessed:** 2026-09-01  
**Completed:** 2026-09-01

---

## Goal
Create the end-to-end installation acceptance matrix and CI execution path for the hardened installer. The matrix must cover clean Linux x64, macOS arm64, and WSL2 installs, with best-effort Linux arm64 and macOS x64 coverage, plus reruns, upgrades, rollback, uninstall, missing prerequisites, path conflicts, verification failures, and preservation of `.context/` and Pi state. Tests must use isolated temporary homes and never mutate shared credentials, runtimes, or repositories.

## Verification
Run the aggregate validation suite and platform smoke jobs. Confirm every required scenario produces the expected exit status, diagnostic, activated version, and preserved state. Force at least one failure in each lifecycle path and verify the suite catches it without modifying the real user environment.

## Scope — files this story may touch
- `scripts/validate-install-matrix.mts` — end-to-end scenario runner
- `.github/workflows/` — required and best-effort platform smoke jobs
- `scripts/run-validations.mts` — register deterministic installer validations
- `docs/installation.md` — documented platform contract and recovery steps
- `.context/stories/plan.md`
- `.context/stories/story-081.md`

## Out of scope — do not touch
- Installer implementation except minimal test hooks
- Production runtime dependency versions
- Native Windows installer or desktop application packaging
- Real user credentials or shared installation directories

## Dependencies
- story-076
- story-077
- story-078
- story-079
- story-080

---

## Checklist
- [x] Build isolated scenarios for clean install, rerun, upgrade, rollback, and uninstall
- [x] Cover Linux x64 and macOS arm64 in required smoke jobs, with an explicitly labeled WSL2 contract job
- [x] Add best-effort Linux arm64 and macOS x64 jobs when runners are available
- [x] Cover missing prerequisites, conflicting executables, invalid artifacts, and failed self-tests
- [x] Assert `.context/`, Pi state, and VCS metadata preservation in lifecycle scenarios
- [x] Register the matrix and deterministic validations in the aggregate runner
- [x] Document expected outcomes and recovery commands for each platform

---

## Issues

- WSL2 hosted installation smoke cannot run on the available GitHub-hosted Ubuntu runner. The workflow now labels this job as a contract check; actual WSL2 runtime coverage requires a WSL2 self-hosted runner.

---

## Completion Summary

Added the isolated installation acceptance matrix and CI smoke workflow. The matrix executes each declared installer scenario against the public installer validation harness, validates platform contracts, and snapshots representative `.context/`, Pi, package, and VCS files byte-for-byte during uninstall. Added required Linux x64/macOS arm64 jobs, a clearly labeled WSL2 contract seam, best-effort Linux arm64/macOS x64 jobs, aggregate registration, and installation/recovery documentation. Matrix, lifecycle, activation, preflight, and full aggregate validations pass locally; actual WSL2 runtime smoke remains blocked on runner availability.
