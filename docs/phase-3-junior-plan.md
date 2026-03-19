# Phase 3 Plan For A Junior Developer

Source of truth: `docs/Vazir_poc_spec_v2.3.md`

Phase 3 in the spec is:

- `vazir-workflow.ts`
- `/approve`
- `/reject`
- `/diff`
- `/plan`
- `/verify`
- learning-loop plumbing needed for reject handling

Goal for this phase: connect the backup layer to user-facing workflow commands so a developer can inspect pending changes, accept them, reject them, and capture enough context to improve future turns.

## Expected Outcome

By the end of phase 3, a developer should be able to:

1. Start the coding agent inside the repo.
2. Have the workflow extension discover the backup API from `vazir-backup`.
3. Run `/diff` to see pending file changes.
4. Run `/approve` to archive the active backup and write a manifest.
5. Run `/reject` to restore files from backup and clear pending state.
6. Run `/plan` to inspect the current active plan file.
7. Run `/verify` to execute the configured test command.
8. Capture rejection reasons into learnings and optionally promote repeated patterns into `system.md`.

## Scope Boundaries

Do in this phase:

- Expand `.pi/extensions/vazir-workflow.ts`.
- Add command registration for `/approve`, `/reject`, `/diff`, `/plan`, and `/verify`.
- Read the backup API from the extension context on session start.
- Archive pending backups and write a manifest on approve.
- Restore backups and clear pending state on reject.
- Capture rejection feedback into learnings.
- Add only the minimum learning-loop behavior described in the spec.

Do not do in this phase:

- Tune routing thresholds beyond what is needed to avoid breaking later work.
- Build advanced diff rendering or custom panels.
- Add product-grade deduplication or analytics for learnings.
- Rewrite the backup layer unless phase 2 reveals a concrete bug.
- Expand command behavior beyond the spec’s simplified workflow.

## Files To Create Or Edit

- `.pi/extensions/vazir-workflow.ts`
- `tests/unit/vazir-workflow.test.ts`
- Optional small helper exports for scoring, manifest creation, learning updates, or diff summaries if they improve testability

Do not split the workflow into many files unless the current file becomes hard to reason about.

## Implementation Plan

### Step 1: Wire The Backup Extension Into Workflow State

Before adding commands, confirm how the workflow extension will discover the backup extension.

Requirements:

1. On `session_start`, read the `vazir-backup` API from the extension context.
2. Store the backup API in local workflow state for later command handlers.
3. Handle the missing-backup case safely.

Expected understanding before coding:

- which backup functions are needed by each command
- how pending backup state is represented on disk and in memory
- what should happen if there are no pending changes

### Step 2: Implement `/approve`

Build the smallest command that satisfies the spec.

Requirements:

1. If `.context/history/pending/` does not exist, notify the user that there are no pending changes.
2. Generate a timestamp-safe archive folder name.
3. Call `archiveBackup(timestamp)` on the backup API.
4. Read the modified file list from the backup API.
5. Write `manifest.json` inside the archived history folder.
6. Include `timestamp`, `task`, and `files` in the manifest.
7. Clear backup tracking after a successful archive.
8. Show a short success notification.

Implementation notes:

- use `getActiveTask()` to pull a task summary from `.context/memory/active-plan.md`
- keep the manifest minimal and valid JSON
- return early if nothing is pending

### Step 3: Implement `/reject`

Build the simplest safe restore path.

Requirements:

1. If there is no pending backup, notify the user and stop.
2. Ask the user for an optional rejection reason.
3. Restore the working files from pending backup.
4. Create a branch summary that records the rejection reason and modified files.
5. If a rejection reason exists, append it to learnings.
6. If a similar rejection has been seen enough times, offer to promote it into `system.md`.
7. Remove `.context/history/pending/` after restore.
8. Clear backup tracking.
9. Notify the user that changes were restored.

Implementation notes:

- keep the similarity matching simple and explicit
- do not add a separate database or structured learning store
- make restore deterministic and easy to inspect

### Step 4: Implement `/diff`, `/plan`, And `/verify`

These commands should stay small and operational.

`/diff` requirements:

1. Read tracked files from the backup API.
2. If there are no tracked files, notify the user.
3. Show a short summary with file paths and line-count deltas.
4. Remind the user to use `/approve` or `/reject`.

`/plan` requirements:

1. If `.context/memory/active-plan.md` is missing, notify the user.
2. Otherwise, show its contents.

`/verify` requirements:

1. Load `test_command` from `.context/settings/project.json`.
2. If it is missing, notify the user.
3. Run the command and report success or failure.
4. On failure, capture a short learning note from the test output if available.

### Step 5: Keep Helper Logic Small And Testable

Useful helpers in this phase:

- `score(text, cwd)`
- `loadSettings()`
- `getSeenThreshold()`
- `getActiveTask()`
- `appendLearning(reason)`
- `findSimilarLearning(text)`
- `appendToSystemMd(rule, source)`
- `jaroWinkler(a, b)`

Only export helpers that make the unit tests materially easier to write.

## Suggested Task Breakdown

Day 1:

1. Wire the backup API into workflow state.
2. Implement `/approve`.
3. Implement `/diff`.

Day 2:

1. Implement `/reject` restore behavior.
2. Add learning capture and simple rule-promotion flow.
3. Implement `/plan` and `/verify`.

Day 3:

1. Add unit tests for command behavior and helpers.
2. Run manual approval and rejection flows.
3. Confirm manifests, restores, and learnings all match the spec.

## Implementation Checklist

- Read `vazir-backup` from the extension context on session start
- Add `/approve`
- Add `/reject`
- Add `/diff`
- Add `/plan`
- Add `/verify`
- Write `manifest.json` on approve
- Restore from pending backup on reject
- Remove pending backup after reject
- Append rejection reasons to learnings
- Support repeated-pattern promotion into `system.md`
- Add unit tests under `tests/unit/`
- Run manual accept and reject flows with a real changed file

## Tests To Implement

If the extension API is awkward to mock directly, extract a few small helpers rather than mocking the entire runtime deeply.

### Unit Tests For `vazir-workflow.ts`

1. `/approve` exits early when there is no pending backup.
2. `/approve` archives pending backup and writes a manifest when changes exist.
3. `/approve` clears backup tracking after success.
4. `/reject` exits early when there is no pending backup.
5. `/reject` restores files from backup and removes pending state.
6. `/reject` appends the rejection reason to learnings when one is provided.
7. `/diff` shows a no-pending message when nothing is tracked.
8. `/diff` summarizes tracked files and line deltas when changes exist.
9. `/plan` reads and displays `active-plan.md` when present.
10. `/verify` exits cleanly when `test_command` is not configured.
11. `/verify` reports success when the test command passes.
12. `/verify` captures a short failure summary when the test command fails.
13. `appendLearning()` writes append-only entries.
14. `findSimilarLearning()` matches similar past feedback above the chosen threshold.
15. `appendToSystemMd()` adds a learned rule under the correct section.

Suggested assertions:

- user notifications match the command outcome
- the archived manifest contains the expected keys
- restored files match the backed-up originals
- `pending/` is deleted after reject
- learnings file contains the provided rejection reason
- `system.md` is updated only when promotion is confirmed
- diff output references the tracked file paths

### Integration Tests To Add If Feasible

1. Modify a real file, run `/diff`, then `/approve`, and confirm the archive exists.
2. Modify a real file, run `/reject`, and confirm the working file is restored.
3. Set `test_command` to a passing command and confirm `/verify` reports success.
4. Set `test_command` to a failing command and confirm `/verify` captures the failure.

## Manual Validation Checklist

Run these by hand even if unit tests exist.

### Validation 1: Approve Flow

1. Create a pending backup by modifying a file through the workflow.
2. Run `/diff` and confirm the file appears in the summary.
3. Run `/approve`.
4. Confirm `.context/history/<timestamp>/` exists.
5. Confirm `manifest.json` exists and lists the modified file.

Pass condition:

- the pending backup is archived and workflow tracking is cleared

### Validation 2: Reject Flow

1. Create a pending backup by modifying a file.
2. Change the file content visibly.
3. Run `/reject` and provide a reason.
4. Confirm the file content is restored.
5. Confirm `.context/history/pending/` is removed.

Pass condition:

- the file is restored from backup and the reject reason is captured

### Validation 3: Diff Output

1. Modify one or more files.
2. Run `/diff`.
3. Confirm the output lists the correct file names and approximate line deltas.

Pass condition:

- the user can see what is pending before choosing approve or reject

### Validation 4: Verify Command

1. Set `test_command` in `.context/settings/project.json`.
2. Run `/verify` with a passing command.
3. Change the command to a failing command and run it again.
4. Confirm both success and failure messages behave as expected.

Pass condition:

- verify reflects the configured command and captures failures safely

## How To Direct The User During Manual Testing

When handing this phase to a user, explicitly tell them how to test the workflow in order:

1. Ask them to make one small change that creates a pending backup.
2. Tell them to run `/diff` first so they can inspect what is pending.
3. Ask them to test both branches: `/approve` once and `/reject` once on a separate small change.
4. Tell them exactly what files to inspect afterward: `.context/history/`, `.context/history/pending/`, `.context/learnings/code-review.md`, and the modified working file.
5. If `/verify` is part of the test, tell them to configure `test_command` first and then run both a passing and a failing case.

Keep the manual test instructions operational. Do not tell the user only that a feature “should work”; tell them what command to run, what file to inspect, and what success looks like.

## Definition Of Done

Phase 3 is done when:

- `vazir-workflow.ts` registers the required commands
- `/approve` archives backups and writes a manifest
- `/reject` restores files and clears pending state
- `/diff`, `/plan`, and `/verify` behave predictably
- rejection reasons are captured into learnings
- repeated rejection patterns can be promoted into `system.md`
- unit tests cover the critical command paths
- manual workflow tests pass

## Common Mistakes To Avoid

- Clearing tracking before the archive or restore step is complete
- Forgetting to remove pending backup after reject
- Writing an invalid or incomplete manifest
- Making `/diff` so verbose that it stops being operationally useful
- Coupling command behavior too tightly to future scorer work
- Hiding manual test instructions from the user instead of telling them what to check

## Hand-Off Notes For The Junior Dev

If you get stuck, reduce scope and make the simple path work first:

1. Get `/approve` archiving correctly.
2. Get `/reject` restoring correctly.
3. Add `/diff` and `/verify` after the core accept/reject loop is stable.
4. Then add learning capture and promotion logic.

The priority is proving that the review loop works end to end with real files.