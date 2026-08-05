# Story 052: Harden `/complete-story` review deferral and review-finalization flow

**Status:** complete  
**Type:** —  
**Created:** 2026-06-03  
**Last accessed:** 2026-06-03  
**Completed:** 2026-06-03

---

## Goal
Fix two regressions in the `/complete-story` review path: choosing "Not yet, keep working" during review closeout should stop the prompt from reappearing every turn, and complete-story reviews should not remain stuck in `in-progress` when the closeout flow expects them to be finished.

## Verification
Run the complete-story validation flow and verify: (1) after a completed review shows closeout choices, choosing "Not yet, keep working" leaves the story open without re-prompting on every later `turn_end`, and the closeout only resumes when the user explicitly runs `/complete-story` again; (2) when a complete-story review turn finishes with no remaining remediation work, the review file is finalized to `**Status:** complete` and the closeout flow reaches the fix/close choices instead of the "still marked in progress" gate.

## Scope
- `.pi/extensions/vazir-context/complete-story.ts`
- `scripts/validate-vazir-complete-story.mts`
- `.context/stories/plan.md`
- `.context/stories/story-052.md`

## Out of scope
- Manual `/review` closeout behavior outside the `/complete-story` path
- Broader redesign of review prompts or learned-rule closeout UX
- New review checklist semantics unrelated to these regressions

## Dependencies
- story-025
- story-026

## Checklist
- [x] Reproduce and trace the repeated review-closeout prompt after choosing "Not yet, keep working"
- [x] Define a restart-safe way to defer complete-story review closeout until `/complete-story` is invoked again
- [x] Trace why some complete-story reviews remain `in-progress` even when the flow expects them to be complete
- [x] Fix the review-finalization path so the closeout gate only appears for genuinely unfinished reviews
- [x] Add regression coverage for deferred closeout resume and for review auto-finalization into closeout choices
- [x] Verify the focused complete-story validation flow passes end to end

## Issues
- None yet.

## Completion Summary
Fixed the sticky `/complete-story` review-closeout prompt and hardened review auto-finalization so structurally finished complete-story reviews advance to closeout even when recommended fixes remain unchecked.
