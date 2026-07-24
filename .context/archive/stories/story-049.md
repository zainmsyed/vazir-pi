# Story 049: Prompt for Git mirror path when enabling Fossil→Git mirror mode

**Status:** complete  
**Type:** —  
**Created:** 2026-06-02
**Last accessed:** 2026-06-02  
**Completed:** 2026-06-02

---

## Goal
Improve mirror-mode UX so enabling `git-mirror-of-fossil` immediately guides the user through the required mirror-path setup instead of silently leaving `vcs_mirror.path` empty.

## Verification
Enable mirror mode through `/vcs-settings` in three cases: use the current colocated Git repo, enter a custom mirror path, and skip configuration for now. Confirm Vazir stores the detected Git repo root for the current-repo option, persists the custom path when entered, warns clearly when setup is skipped, and leaves the active VCS mode unchanged in all cases.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/lib/vazir-helpers.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.context/settings/project.json` handling if mirror-path defaults or persistence need updates
- Regression coverage for mirror-mode path capture and skip/warn behavior

## Out of scope
- Running mirror sync automatically after configuration
- Reworking footer chrome beyond mirror-path setup messaging
- General multi-mirror management or arbitrary mirror profiles

## Dependencies
- story-047
- story-048

## Checklist
- [x] Define the mirror-path setup UX for `/vcs-settings mirror git`, including current-repo, custom-path, and skip-for-now choices
- [x] Resolve “use current repo” to the detected Git top-level rather than the current subdirectory
- [x] Persist custom or detected mirror paths without changing the authoritative active VCS mode
- [x] Emit immediate warning/confirmation messaging when mirror mode is enabled with a saved path vs. skipped without one
- [x] Add regression coverage for current-repo, custom-path, and skipped-path flows

## Issues
- None yet.

## Completion Summary
Implemented an interactive mirror-path setup flow that triggers immediately when the user enables Fossil→Git mirror mode.

- Added `resolveGitTopLevel` to `.pi/lib/vazir-helpers.ts` so the current-repo option resolves to the actual Git top-level instead of the current working subdirectory.
- Extended `.pi/extensions/vazir-context/index.ts` so enabling `mirror git` now runs `promptMirrorPathSetup`, which presents three choices:
  - **Use current Git repo** — auto-detects the Git root and persists it.
  - **Enter custom path** — accepts a typed path via `ctx.ui.input` and persists it.
  - **Skip for now** — leaves `vcs_mirror.path` empty and emits a warning that the path must be configured before `/vcs-mirror-sync` can run.
- All three paths leave `active_vcs_mode` unchanged; only `vcs_mirror.path` and `vcs_mirror.mode` are updated.
- Added regression scenarios to `scripts/validate-vazir-vcs-mirror-settings.mts` covering current-repo detection, custom path entry, and skip-with-warning behavior.
