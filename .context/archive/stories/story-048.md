# Story 048: Assisted mirror sync command for Fossil→Git export

**Status:** complete  
**Type:** —  
**Created:** 2026-06-02
**Last accessed:** 2026-06-02  
**Completed:** 2026-06-02

---

## Goal
Add an explicitly user-invoked assisted mirror sync command for the Fossil→Git mirror workflow, only after mirror-aware settings and safety messaging are already in place.

## Verification
With Fossil active and mirror mode configured, run the assisted sync flow and confirm Vazir validates the configured mirror context, presents the intended export action clearly, requires explicit user confirmation, and reports success or actionable failure without changing canonical VCS behavior outside the requested sync.

## Scope
- VCS command registration and mirror-sync orchestration modules
- Fossil/Git mirror validation helpers under `.pi/lib` or the owning VCS extension
- User-facing status and confirmation messaging for assisted sync
- Regression or integration coverage for successful and rejected sync flows

## Out of scope
- Automatic sync on commit or story closeout
- Mirror health polling or background scheduling
- Bidirectional sync support
- Replacing external cron/systemd workflows

## Dependencies
- story-047

## Checklist
- [x] Define the assisted sync command contract and confirmation UX around the configured mirror settings
- [x] Validate required Fossil/Git prerequisites and configured mirror paths before any export attempt
- [x] Implement the user-confirmed assisted Fossil→Git export flow with clear success and failure reporting
- [x] Ensure the command respects existing VCS guardrails and never auto-runs from unrelated workflow commands
- [x] Add regression or integration coverage for confirmed sync, cancelled sync, and invalid mirror configuration paths

## Issues
- `npm test` still stops at the pre-existing missing script reference `scripts/validate-vazir-overlay-reader.mts` from `scripts/run-validations.mts`; the targeted mirror-sync validations added for this story pass, but the aggregate suite is not fully green for that unrelated reason.

## Completion Summary
Implemented an explicit `/vcs-mirror-sync` command for the Fossil→Git mirror workflow without changing any default VCS behavior outside the user-invoked sync action.

- Added shared Fossil-export planning helpers in `.pi/lib/vazir-helpers.ts` to resolve the configured mirror path, detect the Fossil repository file, and render the exact `fossil git export ... --autopush` command text shown to the user.
- Extended `.pi/extensions/vazir-context/index.ts` with mirror-sync validation and execution flow: the command now requires Fossil to be the active VCS, requires mirror mode plus a configured Git mirror path, confirms the exact export command interactively, and reports success, cancellation, or actionable failure.
- Updated settings guidance and command help/docs so the mirror path expectation and the new `/vcs-mirror-sync` command are discoverable.
- Added `scripts/validate-vazir-vcs-mirror-sync.mts` and aggregate registration to cover confirmed sync, cancelled sync, and invalid mirror configuration paths using an isolated fake Fossil binary plus real temporary Git repositories.
