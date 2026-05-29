# Story 035: Shared pi TUI overlay helpers for Vazir selection lists and markdown viewers

**Status:** complete  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** 2026-05-29

---

## Goal
Add a shared `.pi/lib/vazir-ui.ts` module that wraps pi's built-in `SelectList` and `Markdown` components in reusable Vazir-styled overlay helpers so multiple commands can share one consistent TUI interaction layer.

## Verification
Run a lightweight command path that opens each helper in pi. Confirm selection overlays return the chosen value or `null` on escape, markdown overlays open and close cleanly, and both helpers render within width limits using pi's built-in components rather than custom list rendering.

## Scope — files this story may touch
- `.pi/lib/vazir-ui.ts`
- Shared ambient typings if needed for pi TUI usage
- Validation coverage for helper behavior

## Out of scope — do not touch
- Wiring specific commands to the new helpers
- Persistent HUD rendering
- Changing command semantics or `.context` file formats

## Dependencies
- —

## Checklist
- [x] Create `.pi/lib/vazir-ui.ts` as a neutral shared module with no imports from consuming extensions
- [x] Implement `showSelectionList` on top of pi `SelectList` with Vazir framing, escape-to-cancel behavior, danger styling, and default-safe destructive focus
- [x] Implement `showMarkdownViewer` on top of pi `Markdown` with title framing and close behavior suitable for story and plan viewing
- [x] Ensure the helper rendering is width-safe and follows pi invalidation/theme-refresh expectations
- [x] Add or update ambient typings needed for the chosen pi TUI primitives and helper signatures
- [x] Add regression validation that exercises the primary helper paths directly

## Issues
- None yet.

## Completion Summary
Created `.pi/lib/vazir-ui.ts` with two shared overlay helpers built on a `VazirPanel` component:

- `showSelectionList<T>` — opens a full-bordered overlay (`┌─┐ / │ │ / └─┘`) with solid background fill (`customMessageBg`) around pi's `SelectList`. Supports danger-item styling (red focus when selected), default-safe destructive focus (first non-danger item pre-selected), escape-to-cancel returning `null`, and configurable overlay geometry.

- `showMarkdownViewer` — opens a full-bordered overlay with solid background fill around pi's `Markdown` (using `getMarkdownTheme()`). Displays a title header and closes on Escape or Enter.

Both helpers use `ctx.ui.custom` with `{ overlay: true }`, implement `render`/`invalidate`/`handleInput` correctly, and call `tui.requestRender()` after input changes. The full border + background panel creates strong visual separation from the terminal content underneath. They have no imports from consuming extensions and rely only on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`.

Ambient typings in `types/pi-runtime-ambient.d.ts` were expanded to cover `getMarkdownTheme`, `Spacer`, `Markdown`, `SelectList`, `SelectItem`, and `truncateToWidth`.

A new validation script `scripts/validate-vazir-ui-helpers.mts` exercises exports, selection return values, null-on-cancel, default-safe destructive focus, full-border rendering, markdown open/close, enter-to-close, and empty-list short-circuit. It is wired into `scripts/run-validations.mts` and passes cleanly.
