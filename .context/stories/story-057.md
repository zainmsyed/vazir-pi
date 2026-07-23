# Story 057: Block `/implement` on malformed stories and add drift regressions

**Status:** retired  
**Type:** —  
**Created:** 2026-06-06  
**Last accessed:** 2026-06-06  
**Completed:** 2026-06-06

---

## Goal
Protect Vazir's implementation workflow from later story-file drift by validating candidate stories before `/implement` proceeds and stopping with an actionable internal guard when malformed status or checklist structure would break orchestration.

## Verification
Manually corrupt an otherwise valid story after planning and verify `/implement` refuses to proceed, identifies the malformed story clearly, and does not pick or start broken work. Confirm valid stories still proceed normally and that repaired `/plan` output plus later manual drift are both covered by regression tests.

## Scope
- `.pi/extensions/vazir-tracker/index.ts`
- any shared implement/story-selection helpers that resolve active or next stories
- focused `/implement` validation coverage for valid stories and malformed-story fallback behavior
- `.context/stories/plan.md`
- `.context/stories/story-057.md`

## Out of scope
- Replanning or regenerating stories from inside `/implement`
- Broad story-editor UX for fixing malformed files manually
- Additional workflow guards unrelated to story-file structure

## Dependencies
- story-055
- story-056

## Checklist
- [x] Trace the active-story and next-story paths that `/implement` can take today — completed by story-055
- [x] Add shared story validation to `/implement` candidate resolution before work begins — completed by story-055
- [x] Stop `/implement` cleanly when a malformed story would break orchestration and surface an actionable guard message — completed by story-055
- [x] Preserve the normal `/implement` flow for valid active and picked stories — completed by story-055
- [x] Add regression coverage for post-plan manual drift plus a normal valid-story `/implement` path — completed by story-055

## Issues
- None yet.

## Completion Summary

Retired — no new work required. Story-055 already shipped `formatStoryValidationGuardMessage` and wired it into `/implement`, which blocks on any malformed story file and surfaces an actionable warning. Story-056 added the `/plan` repair loop that self-heals malformed output at generation time. Together these two stories cover both the generation-time and consumption-time paths that story-057 scoped. The existing validation script `scripts/validate-vazir-implement-command.mts` already covers the post-plan manual drift scenario (write valid story → corrupt it → verify `/implement` refuses). Retiring rather than completing to avoid double-counting work that was already done.

Note: If future work wants to optimize the guard to validate only the candidate story instead of all stories, or add a dedicated `/fix-story-structure` command, that should be a new story rather than reopening this one.
