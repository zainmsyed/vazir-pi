# Story 055: Add shared story-file structure validation for Vazir workflows

**Status:** complete  
**Type:** —  
**Created:** 2026-06-06  
**Last accessed:** 2026-06-06  
**Completed:** 2026-06-06

---

## Goal
Centralize validation of Vazir story-file structure so workflow commands can reliably detect invalid story status values, malformed checklist items, and other required story sections before downstream logic runs.

## Verification
Create representative malformed story files and verify the shared validation reports actionable errors for invalid status values and malformed checklist formatting without mutating valid stories. Confirm the validator can be reused by both `/plan` repair flow and `/implement` guard paths.

## Scope
- shared story parsing/validation helpers in the Vazir codebase
- `.pi/extensions/vazir-context/index.ts` or related planning helpers as needed for integration
- `.pi/extensions/vazir-tracker/index.ts` or related implement-flow helpers as needed for integration hooks
- focused validation coverage for valid vs malformed story files
- `.context/stories/plan.md`
- `.context/stories/story-055.md`

## Out of scope
- Repair-loop orchestration after `/plan`
- User-facing redesign of story markdown templates
- Closing or reopening existing stories automatically

## Dependencies
- story-053
- story-054

## Checklist
- [x] Identify the exact story fields and sections Vazir workflow commands depend on today
- [x] Implement one shared validator for story status, checklist formatting, and required parsed sections
- [x] Return actionable validation errors that name the file and structural problem without rewriting the file
- [x] Integrate the shared validator at the current story-read entry points needed by later repair/guard work
- [x] Add regression coverage for valid stories plus malformed status and malformed checklist cases

## Issues
- None yet.

## Completion Summary
- Added shared story-file validation to `.pi/lib/vazir-helpers.ts`, including a canonical allowed-status set, required-section checks, checklist-format validation, and actionable per-file error objects for malformed stories.
- Routed `parseStoryFrontmatter()` and `listStories()` through the shared validator so invalid stories no longer masquerade as valid workflow inputs, and exposed `listStoryValidationIssues()` for downstream guard/repair flows.
- Integrated the validator into `/implement` in `.pi/extensions/vazir-tracker/index.ts` so malformed story files now stop the command early with an actionable warning instead of breaking deeper orchestration.
- Added focused regression coverage in `scripts/validate-vazir-story-file-validation.mts` for valid stories plus malformed status and malformed checklist cases, and extended `scripts/validate-vazir-implement-command.mts` to assert the `/implement` guard path blocks malformed stories with a useful warning.
- Verified the focused validation scripts pass with `node --experimental-strip-types scripts/validate-vazir-story-file-validation.mts` and `node --experimental-strip-types scripts/validate-vazir-implement-command.mts`.
