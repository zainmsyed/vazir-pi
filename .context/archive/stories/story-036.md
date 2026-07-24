# Story 036: Wire `/story`, `/plan`, and `/implement` to shared TUI selection handling and document overlays

**Status:** complete  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** 2026-05-29

---

## Goal
Adopt the shared TUI helpers for the highest-visibility Vazir flows so `/story` and `/plan` use the shared selection path for choosing what to open, `/implement` uses the shared selection path for its no-active-story start-versus-pick and story-picker flows, and the selected markdown documents open in readable overlays.

## Verification
In pi, run `/story`, `/plan`, and `/implement` in representative states. Confirm their selection steps still behave normally, and confirm any opened markdown documents still appear in the overlay viewer while preserving current story-state behavior.

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
`/story`, `/plan`, and `/implement` now use the shared TUI helpers while keeping the intended split: standard selection flow for choosing, overlay viewer for opened markdown documents.

- `/story` (vazir-tracker) uses the shared selection path for plan/story picking, then opens the chosen file in `showMarkdownViewer`.
- `/plan` (vazir-context) keeps its normal choice flow and opens `plan.md` in `showMarkdownViewer` instead of dumping content via `ui.notify`.
- `showMarkdownViewer` now supports ↑↓ and PgUp/PgDn scrolling.
- `/implement` (vazir-tracker) fallback prompts were refactored through the shared selection handling while preserving start-next and pick-story semantics.
- Command ownership remains in the extensions that originally registered them.
- Regression coverage added in `scripts/validate-vazir-story-plan-overlays.mts` (active/picker/empty story paths and plan-view path) and `scripts/validate-vazir-implement-command.mts` was updated to assert picker/viewer usage.
