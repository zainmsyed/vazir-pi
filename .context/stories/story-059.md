# Story 059: Fix `/plan` stall at the write-stories boundary

**Status:** not-started  
**Type:** —  
**Created:** 2026-07-23  
**Last accessed:** 2026-07-23  
**Completed:** —

---

## Goal
Make `/plan` reliably proceed from the "I have what I need — writing the plan and stories now." transition to actually creating story files, instead of stalling before any new story is written.

## Verification
Reproduce the live smoke case in a disposable repo where the agent reaches the write-stories boundary. After the fix, `/plan` must create at least one new story file and update `plan.md` without hanging at that boundary. Regression coverage should prove that the planner no longer stalls before story creation.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts` — `/plan` instruction and orchestration around story creation
- `.pi/extensions/vazir-context/helpers.ts` — shared prompt/template helpers if the stall traces back to instruction text
- `scripts/validate-vazir-plan-repair.mts` or a new validation script covering the write-stories boundary
- `.context/stories/plan.md`
- `.context/stories/story-059.md`

## Out of scope — do not touch
- `/implement` guard behavior
- `/complete-story` closeout orchestration
- VCS or checkpoint logic
- story-058 repair-loop scope already completed

## Dependencies
- story-055
- story-056
- story-058

---

## Checklist
- [ ] Reproduce the `/plan` stall where the agent stops at "I have what I need — writing the plan and stories now."
- [ ] Identify whether the stall comes from prompt construction, agent behavior, or missing downstream turn handling
- [ ] Implement the smallest fix that forces the planner to proceed into actual story creation
- [ ] Add regression coverage for the write-stories boundary
- [ ] Run targeted validations and a live smoke test

---

## Issues
- None yet.

---

## Completion Summary
- Pending
