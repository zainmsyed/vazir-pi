# Story 060: Repair malformed review documents and make review closeout cancellable

**Status:** in-progress  
**Type:** bug  
**Created:** 2026-08-05  
**Last accessed:** 2026-08-05  
**Completed:** —

---

## Goal
Prevent malformed review documents from trapping users in a repeated closeout prompt by validating and structurally repairing the existing review file before prompting, while making Escape or an explicit leave action suspend the flow until the user deliberately resumes it or the file meaningfully changes.

## Verification
Exercise manual `/review` and `/complete-story` review paths with a malformed existing review document. Vazir must detect structural mismatches without rerunning the review, repair the same file while preserving findings and checklist state, and proceed normally after successful validation. Escape, leave-review, repair exhaustion, and session restart must not reopen the prompt on every turn; explicit resume or a meaningful file change may make the flow eligible again.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/helpers.ts` — canonical review-format validation and safe in-place structural repair helpers
- `.pi/extensions/vazir-context/complete-story.ts` — complete-story review validation, bounded repair, suspension, and restart-safe closeout transitions
- `.pi/extensions/vazir-context/index.ts` — manual review lifecycle integration and shared cancellation/resume behavior
- `scripts/validate-vazir-review-loop.mts` and targeted review/complete-story validation scripts — regression coverage for malformed, repaired, cancelled, exhausted, and resumed flows
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-060.md`

## Out of scope — do not touch
- Creating a replacement review document during repair
- Rerunning review analysis or regenerating findings
- Changing review severity, recommendation, or checklist semantics
- General redesign of review or complete-story UI
- Story-file validation and `/plan` repair behavior

## Dependencies
- story-025
- story-026
- story-052

---

## Checklist
- [x] Define a lenient canonical validator for the review structure consumed by `parseReviewFrontmatter` and closeout parsers
- [x] Add deterministic in-place repair for safe template mismatches while preserving findings, recommendations, and checklist state
- [x] Gate manual and complete-story closeout prompts on validation, with bounded repair and one-time failure notification
- [x] Persist cancellation/suspension and repair-attempt state alongside pending review state so restarts cannot recreate the loop
- [x] Resume only after explicit workflow invocation or an observable review-file delta
- [x] Add regressions for repair success, preservation, Escape/leave, retry exhaustion, subsequent turns, and restart-resume behavior
- [x] Run targeted review-loop and complete-story validations plus a live interactive smoke check

---

## Issues
- None yet.

---

## Completion Summary
- Added `validateReviewDocument`, `repairReviewDocument`, and `reviewFileHash` helpers in `.pi/extensions/vazir-context/helpers.ts` to perform deterministic, zero-token structural checks against the canonical review template and repair the same file in place while preserving findings and checklist state.
- Extended `PendingCompleteStoryRequest` and its persisted closeout state in `.pi/extensions/vazir-context/complete-story.ts` with `reviewRepairAttempts`, `reviewSuspended`, and `reviewFileHash`, then gated `handleTurnEnd`, `handleAgentEnd`, and `handleCommand` review paths through `prepareReviewForCloseout`.
- Escape, explicit leave, and repair exhaustion now set `reviewSuspended` and persist it, so subsequent turns and session restarts skip re-prompting until the review file changes or the user re-invokes `/complete-story`.
- Added equivalent persistence and suspension for manual `/review` closeout in `.pi/extensions/vazir-context/index.ts` via `manual-review-closeout.json`, with `prepareManualReviewForCloseout` running before the manual review closeout prompt.
- Extended `scripts/validate-vazir-review-loop.mts` with regression scenarios covering validation failure, deterministic repair with content preservation, Escape suspension, no re-prompt on subsequent turns, resume after file change, repair-exhaustion warning, and restart-resume for manual review state.
- Ran `validate-vazir-review-loop.mts` and `validate-vazir-complete-story.mts` successfully; full aggregate suite stops only at the pre-existing `jj` binary missing error.
