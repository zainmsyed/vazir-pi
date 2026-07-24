# Story 051: Auto-export Fossil→Git mirror at story closeout with opt-in autosync

**Status:** complete  
**Type:** —  
**Created:** 2026-06-02
**Last accessed:** 2026-06-02  
**Completed:** 2026-06-02

---

## Goal
Add an opt-in autosync preference so that when a user closes a story with committed changes, Vazir can automatically run the Fossil→Git mirror export, keeping the public mirror in sync with deliberate milestones rather than requiring manual `/vcs-mirror-sync` every time.

## Verification
Enable `autosync_closeout` in a Fossil-active project with a configured Git mirror, run `/complete-story` with commit, and confirm the mirror export executes and reports success. Disable the setting and confirm closeout commits to Fossil without touching the mirror. Verify failure cases report clearly without blocking the canonical Fossil closeout.

## Scope
- `.pi/lib/vazir-helpers.ts` — add `autosync_closeout` to `VcsMirrorSettings` and normalization
- `.pi/extensions/vazir-context/index.ts` — extend `promptMirrorPathSetup` to ask for sync preference during mirror setup; add `/vcs-settings mirror autosync <on|off>` command path
- `.pi/extensions/vazir-context/complete-story.ts` — wire mirror auto-export into the closeout commit flow when `autosync_closeout` is true
- `.pi/extensions/vazir-tracker/chrome.ts` — update command/help docs if needed
- Regression coverage for enabled, disabled, and export-failure-at-closeout paths

## Out of scope
- Auto-export on every Fossil commit outside of story closeout
- Background polling or cron-like scheduling
- Bidirectional sync
- Auto-export without explicit user commit during closeout

## Dependencies
- story-047
- story-049
- story-050

## Checklist
- [x] Define `autosync_closeout` field in `VcsMirrorSettings` with default `false` and normalization
- [x] Prompt for sync preference (auto at closeout vs. manual) during mirror-path setup
- [x] Add command path to toggle autosync independently of re-running full setup
- [x] Wire mirror export into `/complete-story` closeout after Fossil commit when autosync is enabled
- [x] Report export success or actionable failure without blocking the Fossil closeout
- [x] Add regression coverage for enabled closeout sync, disabled closeout skip, and export-failure handling

## Issues

### /fix — "Warning: Mirror auto-sync failed: unrecognized command-line option or missing argument: --autopush"
- **Reported:** 2026-06-02  
- **Status:** resolved  
- **Agent note:** Fixed during implementation. The `buildFossilGitExportPlan` helper was generating `fossil git export <repo> <mirror> --autopush`, but real Fossil expects `fossil git export <mirror>` and `--autopush` requires a URL argument. Removed `--autopush` from the export command and added a separate `pushGitMirror` helper that runs `git -C <mirror> push` after successful export. Both `/vcs-mirror-sync` and closeout auto-export were updated. Test fake binaries were corrected to match real Fossil argument parsing.
- **Solution:** Corrected `buildFossilGitExportPlan` to use `argv: ["git", "export", mirrorPath]`, added `pushGitMirror` for post-export push, and updated all consumers and test fakes accordingly.

- None yet.

## Completion Summary
Implemented opt-in auto-export of the Fossil→Git mirror at story closeout.

- Added `autosync_closeout` to `VcsMirrorSettings` in `.pi/lib/vazir-helpers.ts` with normalization defaulting to `false`.
- Extended `promptMirrorPathSetup` in `.pi/extensions/vazir-context/index.ts` to ask for sync preference after path capture, and added a standalone `promptMirrorAutosyncSetup` helper.
- Added `/vcs-settings mirror autosync <on|off>` command path to toggle the setting without re-running full setup.
- Created `runAutoMirrorExportAtCloseout` in `.pi/lib/vazir-helpers.ts` to validate the mirror context and execute `fossil git export <mirrorPath>` followed by `git push` non-interactively.
- Wired the auto-export into `completeStoryAndCommitNow` in `.pi/extensions/vazir-context/complete-story.ts` so it runs after a successful Fossil commit; export failures are reported as warnings without blocking the canonical closeout.
- Updated command docs in `.pi/extensions/vazir-tracker/chrome.ts` to mention the autosync option.
- Added `scripts/validate-vazir-vcs-mirror-autosync.mts` covering disabled skip, enabled success, export failure, and normalization paths.
