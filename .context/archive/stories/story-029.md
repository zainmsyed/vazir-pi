# Story 029: Exact JJ restore semantics

**Status:** complete  
**Created:** 2026-05-26  
**Last accessed:** 2026-05-26  
**Completed:** 2026-05-26

---

## Goal
Make JJ checkpoint restore exact and unsurprising so restoring a recorded checkpoint never produces a mixed workspace assembled from multiple states.

## Verification
Restoring a JJ checkpoint from the new undo flow or a stored milestone reproduces the expected workspace state exactly in validation scenarios that previously risked mixed results.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- targeted JJ restore validation or regression coverage

## Out of scope — do not touch
- Milestone creation policy and menu wording beyond what is needed to exercise exact restore
- Broader tracker chrome redesign unrelated to restore correctness
- Git or Fossil restore behavior unless a shared helper must be adjusted for consistency

## Dependencies
- story-028

## Checklist
- [x] Trace the current JJ restore sequence and isolate the specific state-mixing behavior in the restore path
- [x] Define a single exact restore procedure for JJ checkpoints and centralize it in one helper
- [x] Update restore callers so both default undo and named-checkpoint restores use the same exact JJ restore path
- [x] Add regression coverage that proves restore correctness across representative changed-file states instead of only prompt-level assertions
- [x] Validate that restore updates tracker-visible state cleanly after the workspace rollback completes

## Issues
- None yet.

## Completion Summary
The state-mixing behavior was traced to `jjRestoreCheckpoint` executing `jj op restore <opId>` followed by an erroneous `jj restore --from @-`. The second command overwrote the working copy (which was already correctly restored by the operation restore) with files from its parent commit, producing a Frankenstein state that never existed in history.

The fix removes the spurious `jj restore --from @-` line from `jjRestoreCheckpoint` in both `.pi/extensions/vazir-tracker/vcs.ts` and `.pi/lib/vazir-vcs-helpers.ts`. `jj op restore <opId>` alone is exact because JJ's operation-based model restores the entire repo state — commit graph, working copy, bookmarks, and files — to the precise state at that operation.

All restore callers already funnel through `jjRestoreCheckpoint`, so no caller changes were needed beyond fixing the helper itself. Tracker-visible state is updated cleanly after restore via the existing `syncAndPublishVcs(cwd); refreshWidgets();` calls in `runCheckpointRestore`.

Regression coverage was added in `scripts/validate-vazir-jj-exact-restore.mts`, which creates real colocated Git/JJ repos and verifies exact restore semantics for file modification, file creation, and file deletion. The script passes standalone and in the aggregate suite.
