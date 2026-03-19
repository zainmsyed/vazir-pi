# Phase 2 Plan For A Junior Developer

Source of truth: `docs/Vazir_poc_spec_v2.3.md`

Phase 2 in the spec is:

- `vazir-backup.ts`

Goal for this phase: make file changes recoverable by backing up originals on the first write or edit and exposing a small API that phase 3 can use for approve and reject flows.

## Expected Outcome

By the end of phase 2, a developer should be able to:

1. Start the coding agent inside the repo.
2. Modify real files using normal `write` and `edit` tools.
3. Have Vazir back up the original version of a file the first time that file is touched in a session.
4. Track the original and current content for modified files.
5. Restore backed-up files from `.context/history/pending/`.
6. Archive the pending backup folder for later review.

## Scope Boundaries

Do in this phase:

- Build `.pi/extensions/vazir-backup.ts`.
- Hook into tool calls for `write` and `edit`.
- Back up existing files into `.context/history/pending/` before the first modification.
- Track modified files in memory for later diff, approve, and reject behavior.
- Export a minimal backup API for the workflow extension to consume later.
- Validate first-write backup and restore behavior.

Do not do in this phase:

- Implement `/approve`, `/reject`, or `/diff` command behavior.
- Add scorer or skill-routing logic.
- Build a custom sandbox or alternate file-writing tool.
- Add learning-loop behavior.
- Over-engineer cross-session persistence for modified file tracking.

## Files To Create Or Edit

- `.pi/extensions/vazir-backup.ts`
- `tests/unit/vazir-backup.test.ts`
- Optional small helper exports only if they make the backup logic easier to test

Do not add new abstraction layers unless they clearly improve testability or remove duplication.

## Implementation Plan

### Step 1: Re-read The Simplified Workflow In The Spec

Before writing code, confirm these phase 2 assumptions from the spec:

- the agent writes to real files immediately
- backup happens before the first write to each file
- backups live in `.context/history/pending/`
- workflow commands will consume the backup API later

Expected understanding before coding:

- why backup is needed even though files are live
- which tool calls should trigger backup
- what state must stay in memory for the rest of the session

### Step 2: Create `vazir-backup.ts`

Build the smallest version that satisfies the spec.

Requirements:

1. On `tool_call`, watch for `write` and `edit`.
2. Read the target path from the tool input.
3. If the file path is missing, do nothing and allow the tool call through.
4. On the first write or edit for a given file, back up the current file contents if the file already exists.
5. If the file does not exist yet, track it with an empty original value instead of trying to copy a missing file.
6. Store backup files under `.context/history/pending/<original-relative-path>`.
7. Track both `original` and `current` content in memory for each touched file.
8. Always return `{ block: false }` so the normal tools continue to work.

Implementation notes:

- Use `existsSync`, `mkdirSync`, `copyFileSync`, `readFileSync`, and `path.join`.
- Keep file paths relative to the repo root when storing tracked entries.
- Back up only once per file per active session.
- Keep the code direct. This phase is about correctness, not reuse.

### Step 3: Update Tracking Logic Correctly

After the first backup, keep the in-memory tracking up to date.

For `write`:

- set `current` to the incoming full file content
- preserve the original content from the first encounter

For `edit`:

- apply the string replacement to the current tracked content
- preserve the original content from the first encounter
- do not re-read the backup file just to compute `current`

Important caution:

- the `edit` tracking in phase 2 only needs to mirror the intended tool input shape from the spec
- keep the logic simple and deterministic
- avoid trying to infer every possible edge case beyond the supported `edit` input contract

### Step 4: Export A Minimal Backup API

Return a small object from the extension so phase 3 can use it.

Required exports:

- `getModifiedFiles()`
- `getBackupDir()`
- `clearTracking()`
- `restoreFromBackup()`
- `archiveBackup(timestamp)`

Behavior notes:

- `clearTracking()` should reset both the tracked file set and modified-file map
- `restoreFromBackup()` should copy backed-up files from pending back to the real file paths
- `archiveBackup(timestamp)` should move `.context/history/pending/` into `.context/history/<timestamp>/`

Keep the API narrow. Phase 3 will build the user-facing commands.

### Step 5: Add A Small Directory Walker

Implement a small helper that walks the pending backup directory and returns repo-relative file paths.

Requirements:

1. Return an empty array if the backup directory does not exist.
2. Recurse into nested directories.
3. Return paths relative to the pending root so restore logic can map them back into the repo.

Implementation note:

- a tiny helper is enough here; do not build a generic filesystem utility package

## Suggested Task Breakdown

Day 1:

1. Re-read the backup section of the spec.
2. Scaffold `.pi/extensions/vazir-backup.ts`.
3. Get first-write backup working for an existing file.

Day 2:

1. Add in-memory tracking for `original` and `current` file contents.
2. Handle new files cleanly with empty originals.
3. Add restore and archive helpers.

Day 3:

1. Add unit tests for backup, tracking, restore, and archive behavior.
2. Run manual validation against a small sample file tree.
3. Confirm the exported API matches what phase 3 expects.

## Implementation Checklist

- Create `.pi/extensions/vazir-backup.ts`
- Add `BACKUP_DIR()` pointing to `.context/history/pending`
- Add a tracked file set to prevent duplicate backups
- Add a modified-files map with `{ original, current }`
- Handle `write` tool calls
- Handle `edit` tool calls
- Copy existing files into the pending backup tree
- Track new files without trying to back them up from disk
- Export the backup API used by workflow commands later
- Add unit tests under `tests/unit/`
- Run manual validation on existing-file and new-file cases

## Tests To Implement

If the test harness is still minimal, keep the tests small and focused on pure or lightly mocked behavior.

### Unit Tests For `vazir-backup.ts`

1. Backs up an existing file on the first `write` tool call.
2. Does not create a second backup for the same file on repeated writes in the same session.
3. Tracks a new file with an empty original value.
4. Updates `current` content correctly for a `write` tool call.
5. Updates `current` content correctly for an `edit` tool call.
6. Returns `{ block: false }` for supported tool calls.
7. Ignores tool calls with missing file paths.
8. `restoreFromBackup()` copies pending files back into the working tree.
9. `archiveBackup(timestamp)` moves the pending folder into the timestamped history folder.
10. `clearTracking()` empties both in-memory trackers.

Suggested assertions:

- backup files exist at the expected pending path
- backup file contents match the original on-disk file
- repeated writes do not duplicate or replace the original backup
- modified-files entries preserve the first original content
- modified-files entries update `current` after each tool call
- restore recreates the original file content on disk
- archive returns the expected destination path
- tracking collections are empty after `clearTracking()`

### Useful Test Structure

Prefer helpers that let tests create a temporary repo-like directory structure and then:

1. write a fixture file into that temp directory
2. run the backup handler with a mocked tool-call event
3. inspect the pending backup directory and tracking state
4. clean up the temp directory afterward

If the extension API is awkward to mock directly, extract a tiny pure helper layer for:

- resolving backup paths
- applying tracked `edit` replacements
- walking the pending directory

Only extract helpers that genuinely reduce setup friction in tests.

### Integration Tests To Add Later Or If Easy Now

1. A first `write` call creates a backup and still allows the actual write tool flow.
2. Multiple files modified in one session each get backed up once.
3. Restore works for nested file paths like `src/auth/user.ts`.
4. Workflow code can read the exported backup API from the extension context.

## Manual Validation Checklist

Run these by hand even if unit tests exist.

### Validation 1: Existing File Backup

1. Create or choose an existing file with obvious sample content.
2. Trigger a `write` or `edit` flow against that file.
3. Confirm `.context/history/pending/<file>` now exists.
4. Confirm the pending file content matches the original content before the modification.

Pass condition:

- original file content is preserved in pending before further workflow actions

### Validation 2: Repeated Write Does Not Re-Backup

1. Modify the same file a second time in the same session.
2. Confirm the pending backup still reflects the first original version.
3. Confirm tracking updates the current content without replacing the backup.

Pass condition:

- backup stays stable and original content is not lost

### Validation 3: New File Tracking

1. Trigger a `write` against a file that does not exist yet.
2. Confirm no invalid copy attempt occurs.
3. Confirm the modified-file entry uses an empty original value.

Pass condition:

- new-file handling works without errors and tracking remains correct

### Validation 4: Restore From Pending

1. Back up an existing file.
2. Change the working file content.
3. Call `restoreFromBackup()`.
4. Confirm the working file content returns to the original backed-up version.

Pass condition:

- restore is deterministic and uses the pending backup files

### Validation 5: Archive Pending Backup

1. Create at least one pending backup.
2. Call `archiveBackup()` with a timestamp string.
3. Confirm the pending directory moves to `.context/history/<timestamp>/`.

Pass condition:

- archive succeeds and the backup is preserved under history

## Definition Of Done

Phase 2 is done when:

- `vazir-backup.ts` backs up existing files on the first write or edit
- repeated modifications do not overwrite the original backup in the same session
- new files are tracked safely without invalid backup copies
- restore and archive helpers behave predictably
- the backup API is available for phase 3 to consume
- unit tests cover the critical backup paths
- manual validations pass

## Common Mistakes To Avoid

- Backing up the already-modified file instead of the original file
- Replacing the original backup on the second write to the same path
- Storing absolute paths in tracking when the workflow expects repo-relative paths
- Blocking normal `write` or `edit` tool calls in this phase
- Adding `/approve` or `/reject` logic before the backup layer is reliable
- Building a generic filesystem abstraction instead of a small direct helper

## Hand-Off Notes For The Junior Dev

If you get stuck, reduce scope and make the simple path work first:

1. Back up one existing file correctly on first write.
2. Keep tracking stable across repeated writes.
3. Add restore and archive helpers.
4. Then add tests around those paths.

The priority is proving that direct file writes can still be safely rolled back later.