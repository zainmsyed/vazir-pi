# Story 018: `.context` persistence enforcement in closeout flows

**Status:** complete  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-15  
**Completed:** 2026-05-15

---

## Goal
Make `.context` persistence an enforced workflow rule so Vazir checks for `.context` changes in key closeout flows and does not silently leave project-brain updates uncommitted unless the user explicitly opts out.

## Verification
After a workflow that changes `.context`, Vazir detects the pending `.context` diff and prompts/acts according to the commit policy instead of closing out silently.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-helpers.ts`

## Out of scope — do not touch
- Auto-pushing changes
- Non-`.context` commit policy changes
- Major extension extraction work

## Dependencies
- story-016
- story-017

## Checklist
- [x] Add shared detection for pending `.context` changes in the active VCS mode
- [x] Identify the closeout flows that should enforce the `.context` commit rule
- [x] Add user-visible handling for the cases: commit now, user explicitly declines, or no `.context` changes exist
- [x] Ensure Fossil and Git/JJ modes both respect the same `.context` persistence policy
- [x] Update closeout summaries/messages so `.context` persistence status is explicit

## Issues
- None currently.

## Completion Summary
Added shared `.context` pending-change detection in `.pi/lib/vazir-helpers.ts` and surfaced it through `vazir-context` closeout helpers so story closeout flows now enforce the project-brain commit rule. `/complete-story` and story-targeted review closeouts now distinguish between no pending `.context` changes, commit-now closeout, and an explicit user choice to close without committing `.context`, with the active Git/JJ or Fossil mode reflected in the closeout messaging.
