# Story 056: Repair malformed `/plan` story output before the user sees it

**Status:** complete  
**Type:** —  
**Created:** 2026-06-06  
**Last accessed:** 2026-06-06  
**Completed:** 2026-06-06

---

## Goal
Make `/plan` self-heal malformed generated story files by running a bounded internal repair loop that fixes only the invalid stories in place before presenting planning results to the user.

## Verification
Simulate `/plan` output that contains malformed story status values and checklist formatting, then verify Vazir detects the invalid files, sends a targeted repair pass, rewrites the same story files in place, revalidates them, and only returns success once all generated stories pass validation. Verify bounded retries fail cleanly if repair cannot converge.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- planning helpers that write and re-read generated story files
- targeted repair-loop prompt/instruction wiring
- focused `/plan` validation coverage for silent success, successful repair, and retry exhaustion
- `.context/stories/plan.md`
- `.context/stories/story-056.md`

## Out of scope — do not touch
- Defensive validation for later manual story drift outside `/plan`
- Broader `/plan` regeneration redesign beyond malformed-story repair
- Auto-fixing unrelated markdown files outside the generated story set

## Dependencies
- story-055

---

## Checklist
- [x] Trace where `/plan` currently writes generated stories and hands control back to the user
- [x] Add post-write validation over the generated story set using the shared story validator
- [x] Implement a bounded internal repair loop that targets only malformed generated stories and rewrites them in place
- [x] Keep the happy path silent while surfacing a clear failure only when retries exhaust without valid stories
- [x] Add regression coverage for already-valid output, successful repair after malformed output, and bounded failure when repair cannot converge

---

## Issues
- None yet.

---

## Completion Summary

`/plan` now validates every generated story file after the agent finishes writing them, and automatically dispatches a targeted repair instruction when malformed files are detected. The repair loop is bounded to 2 retries; if stories remain invalid after that, a clear error notification names the failing files so the user knows what happened. The happy path is completely silent — valid plans produce no extra UI noise.

Changes:
- `.pi/extensions/vazir-context/index.ts`
  - Imported `listStoryValidationIssues` and `StoryValidationIssue` from shared helpers.
  - Added `MAX_PLAN_REPAIR_RETRIES = 2` and `pendingPlanRepairRequests` module-level state map.
  - Added `isPlanPrompt()` to detect `/plan` invocations.
  - Added `buildPlanRepairInstruction()` to construct a targeted fix instruction that names only the broken files and their exact issues.
  - Wired `before_agent_start` to seed the repair state when a `/plan` prompt is detected.
  - Wired `agent_end` to run the validation + repair loop: validate all story files; if valid, silently clear state; if invalid and retries remain, send a repair instruction; if retries exhaust, emit an error notification.
  - Wired `session_shutdown` to clean up `pendingPlanRepairRequests` so stale state never leaks across sessions.
- `scripts/validate-vazir-plan-repair.mts`
  - New regression suite covering: silent acceptance of already-valid stories, successful repair after one malformed story, bounded failure after retry exhaustion, and no-op behavior for non-plan prompts.
- `scripts/run-validations.mts`
  - Added `validate-vazir-plan-repair.mts` to the aggregate suite.
