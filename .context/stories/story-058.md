# Story 058: Fix `/plan` story-format guard so malformed stories are auto-detected and repaired

**Status:** complete  
**Type:** —  
**Created:** 2026-06-15  
**Last accessed:** 2026-07-23  
**Completed:** 2026-07-23

---

## Goal
Make the `/plan` command automatically detect and request fixes for malformed story files after the agent writes new stories, preventing broken formatting from silently propagating into downstream workflows like `/implement` and `/complete-story`.

## Verification
Run `/plan` in a repo with a deliberately malformed story (e.g., `**Status:** planned` or `- [oops] broken`). After the agent writes at least one new story, the guard automatically sends a follow-up message listing the exact files and issues, and the agent fixes them in the next turn. The `scripts/validate-vazir-plan-repair.mts` suite passes all five scenarios (clarifying turn survival, malformed story detection, non-plan prompt ignore, multi-turn replan, and mixed existing/new stories).

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts` — `/plan` handler, `turn_end` guard, `checkStoryPitfalls()`
- `scripts/validate-vazir-plan-repair.mts` — regression test suite
- `scripts/run-validations.mts` — remove stale `validate-vazir-overlay-reader.mts` reference
- `.context/stories/plan.md` — append new story row
- `.context/stories/story-058.md` — this file

## Out of scope — do not touch
- `/implement` guard (already handled by story-055)
- `/complete-story` closeout orchestration (story-023)
- The `buildStoryPromptTemplate()` helper itself (story-056)
- VCS or checkpoint logic

## Dependencies
- story-055 (shared story validation helpers)
- story-056 (plan repair loop and template injection)

---

## Checklist
- [x] Move `pendingPlanRepairRequests` seeding from `before_agent_start` (which never matched for registered commands) into the `/plan` command handler before `sendUserMessage(instruction)`
- [x] Remove dead `isPlanPrompt()` function
- [x] Move `checkStoryPitfalls` guard from `agent_end` to `turn_end` (the active hook where follow-up messages can be sent)
- [x] Add `{ deliverAs: "steer", triggerTurn: true }` to the fix message so Pi actually starts a new agent turn to process it
- [x] Update `validate-vazir-plan-repair.mts` to call `pi.getCommand("plan")?.handler(...)` instead of `emit("before_agent_start", ...)` and emit `turn_end` instead of `agent_end`
- [x] Remove stale `validate-vazir-overlay-reader.mts` reference from `run-validations.mts` (file was deleted in story-041)
- [x] Run the full validation suite and confirm all tests pass
- [x] Run an interactive end-to-end test in a live Pi tab to verify the guard catches and auto-fixes malformed stories

---

## Issues
- Live smoke testing exposed a separate upstream `/plan` stall where the agent says it has enough information but does not proceed to writing story files; this is tracked in story-059.

---

## Completion Summary
Story-058 is complete: the `/plan` malformed-story guard now seeds state in the `/plan` handler, validates generated story files on `turn_end`, and dispatches a targeted repair follow-up with `triggerTurn: true` when malformed stories are written. Targeted validation suites pass for the repair loop, shared story validation, `/implement` guard behavior, and init flows. A separate live smoke issue remains in the broader `/plan` conversation path and is split into story-059.
