# Story 024: Map complete-story phases and centralize closeout state helpers

**Status:** complete  
**Created:** 2026-05-24  
**Last accessed:** 2026-05-25  
**Completed:** 2026-05-25

---

## Goal
Document the current `/complete-story` lifecycle, define one explicit closeout phase model, and centralize the core closeout state transitions so pending in-memory state and required file rewrites move together.

## Verification
A developer can point to one shared phase/transition layer for complete-story closeout, and the updated validation coverage still passes after the helper consolidation.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/complete-story.ts` or a closeout-helper module under the same folder if needed
- `scripts/validate-vazir-complete-story.mts`
- `scripts/validate-vazir-review-loop.mts`

## Out of scope
- Full module extraction of all complete-story orchestration
- New TUI copy or prompt redesign beyond what helper extraction requires
- New VCS behavior

## Dependencies
- story-023

## Checklist
- [x] Map the current `/complete-story` phases and handoffs in code, including review, remediation, learned-rule closeout, and final closeout entry points
- [x] Define a shared complete-story phase model that can be derived from pending in-memory state plus persisted story/review files
- [x] Extract shared transition helpers for closeout state changes so pending-state updates and required frontmatter rewrites happen together
- [x] Replace scattered complete-story closeout state mutations with the new shared helpers without changing intended behavior
- [x] Update or add regression assertions that cover the new phase/transition helpers where practical

## Issues
- None currently.

## Completion Summary
Added `.pi/extensions/vazir-context/complete-story.ts` as the shared closeout-state owner for `/complete-story`.

- Mapped the lifecycle in code with `COMPLETE_STORY_PHASE_HANDOFFS`, covering readiness review, ready-for-closeout, review-in-progress, review closeout, and learned-rule closeout handoffs.
- Added `deriveCompleteStoryPhase(...)` so `turn_end` and `agent_end` can reason about the same explicit phase model from pending in-memory state plus persisted review status.
- Centralized core closeout transitions with helpers that enter readiness review, start review, mark review closeout ready, reset review + pending state for remediation, enter learned-rule closeout, and apply final story completion while clearing pending state.
- Replaced the scattered complete-story `pendingCompleteStoryRequests.set/delete(...)` mutations in `index.ts` with the shared helpers.
- Expanded validation coverage in `scripts/validate-vazir-complete-story.mts` and `scripts/validate-vazir-review-loop.mts` with direct assertions for the phase model and remediation transition helpers, then re-ran both validation scripts successfully.
