# Story 004: Design compliance in `/review`

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-06  
**Completed:** 2026-05-06

---

## Goal
When `/review` runs against a UI story, append a design compliance section to the review file and update review instructions to cover design system verification.

## Verification
Run `/review` on a UI story (`Type: ui` or `.tsx` scope) — the generated review file contains `## Design Compliance (UI stories only)` with four checklist items. Run `/review` on a whole-codebase or non-UI story — no design compliance section is added. If `design-system.md` is empty, the review notes that design compliance checks were skipped.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/index.ts`

## Out of scope — do not touch
- Design folder creation (story-001)
- Design injection (story-002)
- `/design` command (story-003)
- Consolidation changes (stories 005–007)

## Dependencies
- story-001
- story-002 (for UI story detection reuse)

---

## Checklist
- [x] Update `reviewFileTemplate()` in helpers.ts to include an optional `## Design Compliance (UI stories only)` section with the four checklist items
- [x] Update `createReviewDraft()` in helpers.ts to detect UI story status and conditionally include the design compliance section in the generated review file
- [x] Update `buildReviewInstruction()` in helpers.ts to add: "For UI stories, verify colors reference design-system.md tokens, spacing follows the declared scale, typography uses declared families, and components.md was checked before creating new components"
- [x] Update review closeout logic so design findings feed the standard findings format and are eligible for rule promotion
- [x] Ensure that if `design-system.md` is empty or incomplete, the agent skips design compliance checks and notes this in the review file rather than flagging false violations
- [x] Manual verification: create a UI story review and confirm the section exists; create non-UI review and confirm it does not

---

## Issues

---

## Completion Summary
Implemented design compliance in `/review` for UI stories.

- `reviewFileTemplate()` now conditionally appends `## Design Compliance (UI stories only)` with four checklist items (colors, spacing, typography, components) when the review targets a UI story.
- `createReviewDraft()` detects UI story status via `hasUiTypeOverride()` / `isUiStory()` and passes flags to the template; if `design-system.md` is empty or incomplete, the template adds a skip note instead of false violations.
- `buildReviewInstruction()` adds UI-specific design verification guidance and the skip instruction for empty design systems.
- Design findings written in the standard `## Findings` format are automatically eligible for rule promotion via the existing review closeout logic.
- Smoke tests confirmed: UI review includes the section, non-UI review omits it, and empty design-system adds the skip note.

