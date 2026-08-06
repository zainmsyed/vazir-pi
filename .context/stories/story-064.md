# Story 064: Suppress premature in-progress review prompt during active complete-story reviews

**Status:** in-progress  
**Type:** bug  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** —

---

## Goal
Fix the `/complete-story` review flow so the user is not shown the "story is waiting on review" prompt while the agent is actively writing the review. The prompt should appear only when the review has genuinely stalled (no file change between turns) or after the review is marked `complete`. Right now it fires at every `turn_end` and `agent_end` boundary because `deriveCompleteStoryPhase` treats any `reviewFile` whose status is not `complete` as prompt-worthy.

## Verification
Run `/complete-story` on a ready story, choose "Start code review before closing", and confirm the agent writes the review across multiple turns without showing the "Open review document / Keep story open" prompt until either:
- the review file status flips to `complete` (the real fix/close choices appear), or
- at least one full turn passes without the review file changing (review stalled fallback).

Then simulate a stalled review by leaving the file unchanged across a turn boundary and confirm the fallback prompt still appears, with "Keep story open and stay in review" correctly suspending re-prompting until the file changes again.

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
- [ ] Add an observable guard that distinguishes an active review turn from a stalled review (e.g., no file hash change for at least one turn boundary)
- [ ] Update `handleTurnEnd` to skip the in-progress prompt while the review file is actively changing
- [ ] Update `handleAgentEnd` to the same suppression behavior, avoiding duplicate prompts
- [ ] Keep the stalled-review fallback prompt intact with working Escape/suspend semantics
- [ ] Add regression coverage for active-review suppression, stalled-review fallback, and resume-after-change
- [ ] Run targeted validation plus an interactive smoke check of `/complete-story` → review → close

---

## Issues

---

## Completion Summary
