# Story 064: Suppress premature in-progress review prompt during active complete-story reviews

**Status:** complete  
**Type:** bug  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-07  
**Completed:** 2026-08-07

---

## Goal
Fix the `/complete-story` review flow so the user is not shown the "story is waiting on review" prompt while the agent is actively writing the review. The prompt should appear only after the review is marked `complete`. Right now it fires at every `turn_end` and `agent_end` boundary because `deriveCompleteStoryPhase` treats any `reviewFile` whose status is not `complete` as prompt-worthy.

## Verification
Run `/complete-story` on a ready story, choose "Start code review before closing", and confirm the agent writes the review across multiple turns without showing the "Open review document / Keep story open" prompt. Then wait for the review file status to flip to `complete` and confirm the real fix/close choices appear.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/complete-story.ts` — `handleTurnEnd` and `handleAgentEnd` in-progress review branches
- `.pi/extensions/vazir-context/helpers.ts` — review-file hash/suspension helpers if needed to detect no-progress vs. in-flight
- Targeted validation script for active-review suppression and stalled-review fallback
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-064.md`

## Out of scope — do not touch
- The review-closeout prompt that appears after a completed review (`review-closeout` phase)
- Manual `/review` closeout flow
- Learned-rule closeout after review
- Story-status guards or commit behavior
- `/complete-story` readiness prompt before a review is started

## Dependencies
- story-052
- story-060

---

## Checklist
- [x] Remove the in-progress review prompt from `handleTurnEnd`, `handleAgentEnd`, and the explicit `/complete-story` command resume path
- [x] Make the explicit `/complete-story` command resume a completed-but-suspended review by clearing stale `reviewSuspended` state
- [x] Emit an informational notification when `/complete-story` is invoked while the review is still in progress
- [x] Add regression coverage for active-review suppression, command-resume notification, and completed-suspended review resume
- [x] Run targeted validation plus an interactive smoke check of `/complete-story` → review → close

---

## Issues

---

## Completion Summary
- Removed the in-progress review prompt entirely. The user is no longer interrupted while the review is still being written, regardless of whether the file changed between turns.
- `turn_end` still observes review state but no longer shows the "Open review document / Keep story open" prompt.
- `agent_end` now only handles learned-rule closeout and cannot show a review prompt.
- The explicit `/complete-story` command resume path now emits an informational notification when the review is still in progress, and clears stale `reviewSuspended` state so a completed review can still be closed out.
- The malformed-review warning path in `prepareReviewForCloseout` is unchanged; invalid review files still surface a warning.
- Expanded `scripts/validate-vazir-active-review-suppression.mts` to cover distinct `turn_end`/`agent_end` context objects, active progress, unchanged review, prompt-free command resume, and completed-suspended review resume.
- Updated `scripts/validate-vazir-complete-story.mts` so the review-in-progress scenario verifies no prompt appears and no review viewer opens while the review is still in progress.
- Targeted validations (`validate-vazir-active-review-suppression.mts`, `validate-vazir-complete-story.mts`, `validate-vazir-review-loop.mts`) pass. The live interactive smoke check of `/complete-story` → "Start code review before closing" → close remains the final verification step.
