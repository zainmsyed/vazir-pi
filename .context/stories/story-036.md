# Story 036: Wire `/story`, `/plan`, and `/implement` to shared TUI overlays

**Status:** not-started  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** —

---

## Goal
Adopt the shared TUI helpers for the highest-visibility Vazir flows so `/story` and `/plan` open readable markdown viewers and `/implement` uses a shared overlay for its no-active-story start-versus-pick and story-picker flows.

## Verification
In pi, run `/story`, `/plan`, and `/implement` in representative states. Confirm `/story` opens the active story directly or shows a picker first, `/plan` opens `plan.md` in the markdown viewer, and `/implement` uses the shared selection overlay for fallback choices while preserving current story-state behavior.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-context/index.ts`
- `.pi/lib/vazir-ui.ts`
- Validation coverage for these command paths

## Out of scope — do not touch
- Remaining command overlay adoption beyond `/story`, `/plan`, and `/implement`
- Persistent HUD rendering
- Rewriting story-selection semantics

## Dependencies
- story-035

## Checklist
- [ ] Wire `/story` to open the active story in `showMarkdownViewer` and use `showSelectionList` when the user must choose a file
- [ ] Wire `/plan` to open `.context/stories/plan.md` in `showMarkdownViewer`
- [ ] Refactor `/implement` fallback prompts to use `showSelectionList` while preserving current start-story and pick-story behavior
- [ ] Keep command ownership in the existing extensions that already register these commands
- [ ] Add regression coverage for representative active-story and no-active-story paths across the three commands

## Issues
- None yet.

## Completion Summary
Not completed yet.
