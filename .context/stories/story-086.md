# Story 086: Create disposable E2E workspaces

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** 2026-09-03

---

## Goal
Create a reusable workspace-staging helper that mirrors a project into a unique temporary directory for E2E execution while excluding Vazir brain data and protected VCS metadata. The helper must prevent path and symlink escapes, expose deterministic cleanup and preservation behavior, and never copy results back into the source project automatically.

## Verification
Run isolated filesystem regressions using temporary fixture projects. Confirm ordinary nested files are copied, `.context/`, `.git/`, `.jj/`, `.fslckout`, and `.fossil-settings/` are absent, symlinks cannot escape the source boundary, concurrent workspaces do not collide, and cleanup or failure preservation never modifies the source tree.

## Scope — files this story may touch
- `.pi/lib/vazir-sandbox-workspace.ts`
- `scripts/lib/test-sandbox-fixtures.mts`
- `scripts/validate-vazir-sandbox-workspace.mts`
- `scripts/run-validations.mts`
- `.context/stories/plan.md`
- `.context/stories/story-086.md`

## Out of scope — do not touch
- Running setup, server, readiness, or E2E commands
- Exporting sandbox changes into the real workspace
- Container, VM, network, syscall, credential, or host-level isolation

## Dependencies
- Story 085

---

## Checklist
- [x] Create unique temporary workspaces with explicit source and destination boundaries
- [x] Exclude `.context/` and all protected VCS metadata from every nested copy path
- [x] Handle files, directories, and symlinks without permitting source-boundary escapes
- [x] Add deterministic cleanup and configurable failure-preservation results
- [x] Build shared temporary-project fixtures for sandbox validations
- [x] Add regressions for exclusions, concurrency, preservation, cleanup, and source immutability

---

## Issues

- Scope expansion approved during review remediation: `scripts/run-validations.mts` now registers the workspace validation in the aggregate suite.

---

## Completion Summary
Implemented `.pi/lib/vazir-sandbox-workspace.ts`, a reusable disposable workspace staging helper with canonical source boundaries, unique temporary destinations, recursive exclusion of `.context/` and protected Git, JJ, and Fossil metadata, safe internal symlink translation, and rejection of symlink or destination boundary escapes. Added deterministic cleanup with configurable failure preservation and no automatic source export. Added shared temporary-project fixtures and filesystem regressions covering nested copies, exclusions, symlinks, concurrency, preservation, cleanup, boundary rejection, and source immutability.
