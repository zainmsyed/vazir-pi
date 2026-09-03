# Story 025: Extract complete-story orchestration into a dedicated module

**Status:** complete  
**Created:** 2026-05-24  
**Last accessed:** 2026-05-26  
**Completed:** 2026-05-26

---

## Goal
Move `/complete-story` orchestration into a dedicated owner module while preserving behavior and making `turn_end` versus `agent_end` ownership explicit.

## Verification
The complete-story command and follow-up lifecycle hooks delegate through the extracted module, no duplicate handlers remain, and the existing closeout validation scripts still pass.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/complete-story.ts`
- any shared helper file under `.pi/extensions/vazir-context/` required for the extraction
- `scripts/validate-vazir-complete-story.mts`
- `scripts/validate-vazir-review-loop.mts`

## Out of scope
- New workflow features beyond the extraction and ownership cleanup
- Manual stress testing
- Refactors outside the complete-story lifecycle path

## Dependencies
- story-024

## Checklist
- [x] Create a dedicated complete-story module that owns phase detection, closeout prompting, remediation dispatch, learned-rule closeout handling, and final closeout handoff
- [x] Keep command registration in the owning extension while delegating complete-story orchestration into the extracted module
- [x] Narrow lifecycle ownership so `turn_end` owns prompt-triggered follow-up orchestration and `agent_end` keeps only non-interactive cleanup for this flow
- [x] Remove duplicate or legacy lifecycle wiring left behind by the extraction
- [x] Re-run closeout validation coverage to confirm the extracted module preserves behavior

## Issues
- None currently.

## Completion Summary
Moved `/complete-story` orchestration into `.pi/extensions/vazir-context/complete-story.ts` and left `index.ts` as a thin owner/registrar for the command and shared lifecycle hooks.

- Expanded `complete-story.ts` from state helpers into the primary orchestration module, including phase detection, readiness prompting, review closeout prompting, remediation dispatch, learned-rule closeout, and final story close/commit handoff.
- Added `createCompleteStoryController(...)` so `index.ts` now delegates `/complete-story` command handling and `turn_end` follow-up orchestration into the extracted module.
- Reused shared closeout helpers from the extracted module in the manual review path where appropriate (`promptReviewFindingsCloseout`, remediation prompt building, severity helpers, review-file reopening, and story close helpers) instead of keeping duplicate local copies.
- Removed the old complete-story-specific prompt/orchestration block from `agent_end`; `turn_end` now owns the interactive `/complete-story` state machine, while `agent_end` keeps only the remaining non-complete-story cleanup and status/index work.
- Updated `scripts/validate-vazir-complete-story.mts` so learned-rule closeout completion now follows the extracted `turn_end` ownership, and re-ran both closeout validation scripts successfully.
