# Story 027: Descriptive `/complete-story` commit messages

**Status:** complete  
**Created:** 2026-05-26  
**Last accessed:** 2026-05-26  
**Completed:** 2026-05-26

---

## Goal
Make `/complete-story` generate a short descriptive commit message that includes the story label, story title, and a concise summary of what was done instead of only `complete story-NNN`.

## Verification
Closing a story through `/complete-story` with a commit path produces a short commit message derived from the story metadata/content, and automated validation covers the new message format plus fallback behavior.

## Scope
- `.pi/extensions/vazir-context/complete-story.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/lib/vazir-helpers.ts`
- `scripts/validate-vazir-complete-story.mts`
- any targeted validation helper updates needed for commit-message assertions

## Out of scope
- General-purpose commit message generation outside the `/complete-story` flow
- Rewriting historical commits or story files
- Changing manual VCS commit commands outside story closeout

## Dependencies
- story-026

## Checklist
- [x] Trace the `/complete-story` commit path and identify the single owner for closeout commit message construction
- [x] Define a short commit message format using story label, story title, and a concise completion summary/fallback source
- [x] Implement the formatter and wire it into Git, JJ, and Fossil closeout commit paths without changing non-closeout commit behavior
- [x] Add validation coverage for the descriptive message format and for fallback behavior when the completion summary is sparse or missing
- [x] Verify existing `/complete-story` close-and-commit scenarios still pass with the new message format

## Issues
- None yet.

## Completion Summary
`/complete-story` now owns descriptive closeout commit-message construction and passes the formatted message into the shared VCS commit helper instead of hardcoding `complete story-NNN` inside the helper layer.

- Added story-title parsing to `.pi/lib/vazir-helpers.ts` so closeout formatting can read the story heading without duplicating parsing logic.
- Added `buildCompleteStoryCommitMessage()` in `.pi/extensions/vazir-context/complete-story.ts` to build short messages from the story label, title, and first useful completion-summary line, with fallback to checked checklist work when the summary is too weak.
- Changed `commitStoryCloseChanges()` in `.pi/extensions/vazir-context/helpers.ts` to accept the already-formatted message so Git, JJ, and Fossil all reuse the same closeout message.
- Expanded `scripts/validate-vazir-complete-story.mts` to assert the new message format directly, cover fallback behavior, and verify actual Git/JJ/Fossil commit messages in close-and-commit scenarios.
- Re-ran `node scripts/validate-vazir-complete-story.mts` and `node scripts/validate-vazir-review-loop.mts`; both pass.

