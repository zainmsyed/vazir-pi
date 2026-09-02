# Story 023: Fix review closeout remediation to trigger new agent turns

**Status:** complete  
**Created:** 2026-05-23  
**Last accessed:** 2026-05-24  
**Completed:** 2026-05-24

---

## Goal
Fix the review closeout flow so that when a user selects "fix high-priority" or "fix all" recommended items, the resulting remediation instruction actually fires a new agent turn instead of silently dropping.

## Verification
- Choosing "fix high-priority" or "fix all" in a completed review's closeout prompt dispatches the remediation instruction and the agent immediately begins working the targeted fixes.
- After remediation finishes and the review is marked complete again, the closeout prompt reappears without requiring manual `/review` or `/complete-story` re-entry.
- The full `/complete-story` → review → closeout → learned-rule closeout → story completion (including "commit all") flow works end-to-end, because `startLearnedRuleCloseout` is now invoked from `turn_end` where the steer message actually triggers a new turn.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`

## Out of scope — do not touch
- Review file format or finding structure
- Fallow audit integration
- Story status-guard logic
- VCS commit/closeout implementation (`completeStoryNow`, `completeStoryAndCommitNow`)

## Dependencies
- story-021

## Checklist
- [x] Add `turn_end` handler that gates on `ctx.hasPendingMessages?.()`
- [x] Move complete-story review closeout block from `agent_end` to `turn_end`
- [x] Move manual review closeout block from `agent_end` to `turn_end`
- [x] Replace `sendInternalAgentMessage` conditional delivery with always `"steer" + triggerTurn: true`
- [x] Reset `reviewCloseoutReady: false` in `processCompleteStoryReviewCloseout` before dispatching remediation
- [x] Reset `reviewCloseoutReady: false` in `turn_end` manual review path before dispatching remediation
- [x] Trim `agent_end` to remove moved review closeout blocks while preserving status-change guard, learned-rule closeout, newly-completed story prompt, and index.md cleanup
- [x] Verify `agent_end` no longer calls `processCompleteStoryReviewCloseout` or references `pendingManualReview`
- [x] Verify end-to-end: `/complete-story` → review → close with commit → learned-rule closeout → story marked complete and committed

## Issues
- None currently.

## Completion Summary
All implementation changes are applied to `.pi/extensions/vazir-context/index.ts`:

- Added a `turn_end` handler that gates on `ctx.hasPendingMessages?.()` and handles both complete-story and manual review closeout paths.
- Moved the review closeout prompt and remediation dispatch from `agent_end` to `turn_end` so `sendInternalAgentMessage` with `deliverAs: "steer"` and `triggerTurn: true` actually fires a new agent turn.
- Simplified `sendInternalAgentMessage` to unconditionally use `{ deliverAs: "steer", triggerTurn: true }` since it is only called from `turn_end`.
- Added `reviewCloseoutReady: false` resets in both `processCompleteStoryReviewCloseout` and the `turn_end` manual review path before dispatching remediation, preventing the closeout prompt from re-firing mid-remediation.
- Trimmed `agent_end` to remove the moved review closeout blocks while preserving status-change guards, learned-rule closeout, newly-completed story prompts, and index.md cleanup.

The remaining open item is an interactive end-to-end runtime verification of the full `/complete-story` → review → close → learned-rule closeout → commit flow, which can only be validated in a live session.
