# Story 036: Wire `/story`, `/plan`, and `/implement` to shared TUI overlays

**Status:** complete  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** 2026-05-29

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
- [x] Wire `/story` to use `showSelectionList` for picking and `showMarkdownViewer` for viewing
- [x] Wire `/plan` to open `.context/stories/plan.md` in `showMarkdownViewer`
- [x] Refactor `/implement` fallback prompts to use `showSelectionList` while preserving current start-story and pick-story behavior
- [x] Keep command ownership in the existing extensions that already register these commands
- [x] Add regression coverage for representative active-story and no-active-story paths across the three commands

## Issues
- None yet.

## Completion Summary
`/story`, `/plan`, and `/implement` now use the shared TUI overlay helpers.

- `/story` (vazir-tracker) presents a `showSelectionList` picker with all plan and story files, then opens the chosen file in `showMarkdownViewer`.
- `/plan` (vazir-context) "View current plan" branch now opens `plan.md` in `showMarkdownViewer` instead of dumping content via `ui.notify`.
- `showMarkdownViewer` now supports ↑↓ and PgUp/PgDn scrolling.
- `/implement` (vazir-tracker) fallback prompts were refactored: `resolveStoryForImplementation` now uses `showSelectionList` for both the start-vs-pick chooser and the story picker, preserving start-next and pick-story semantics.
- Command ownership remains in the extensions that originally registered them.
- Regression coverage added in `scripts/validate-vazir-story-plan-overlays.mts` (active/picker/empty story paths and plan-view path) and `scripts/validate-vazir-implement-command.mts` was updated to assert overlay usage via `ui.custom`.
