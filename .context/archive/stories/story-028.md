# Story 028: Agent-run undo checkpoints for JJ

**Status:** complete  
**Created:** 2026-05-26
**Last accessed:** 2026-05-26  
**Completed:** 2026-05-26

---

## Goal
Define and persist a trustworthy JJ undo unit for one completed agent run so `/checkpoint` can reliably undo the last agent-written run instead of exposing raw JJ operation noise.

## Verification
A JJ-backed session that performs a multi-turn agent run with file writes records exactly one undoable agent-run checkpoint, skips runs with no file changes, and restores the workspace to the exact pre-run state when the user chooses "Undo last agent run".

## Scope
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- targeted JJ validation or regression coverage for agent-run checkpoint persistence

## Out of scope
- Milestone checkpoint UX beyond storing the data needed for later stories
- Non-JJ checkpoint systems except for any small shared helper adjustments required to keep behavior aligned
- New manual design for raw JJ history browsing

## Dependencies
- None

## Checklist
- [x] Specify the user-facing undo unit as one completed agent run that made file changes and map it onto Pi lifecycle events
- [x] Persist per-run JJ checkpoint metadata that captures the pre-run restore target, completion state, and whether the run wrote files
- [x] Stop treating raw snapshot noise as the primary undo source for the "last run" path
- [x] Wire `/checkpoint` and related restore entry points to use the persisted last-run checkpoint record for the default undo action
- [x] Add regression coverage for multi-turn agent runs, no-op runs, and restart-safe recovery of the latest undoable run

## Issues
- None yet.

## Completion Summary
The agent-run undo unit is now defined as one completed `before_agent_start` → `agent_end` cycle that produced at least one file write or edit. JJ lifecycle hooks capture the pre-run JJ operation ID at `before_agent_start`, track file changes during `tool_call`, and persist a structured `AgentRunCheckpoint` record at `agent_end` only when `hasChanges` is true. The `/checkpoint` "Undo last agent run" default action restores the workspace to the exact pre-run operation instead of exposing raw JJ snapshot noise. No-op runs (no file changes) are silently skipped. Checkpoint metadata is stored at `.context/settings/jj-agent-run-checkpoints.json` and survives session restarts. Regression coverage exercises multi-turn runs, no-op runs, and restart-safe recovery.
