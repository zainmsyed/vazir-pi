# Story 035: Shared pi TUI overlay helpers for Vazir selection lists and markdown viewers

**Status:** not-started  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** —

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
- [ ] Create `.pi/lib/vazir-ui.ts` as a neutral shared module with no imports from consuming extensions
- [ ] Implement `showSelectionList` on top of pi `SelectList` with Vazir framing, escape-to-cancel behavior, danger styling, and default-safe destructive focus
- [ ] Implement `showMarkdownViewer` on top of pi `Markdown` with title framing and close behavior suitable for story and plan viewing
- [ ] Ensure the helper rendering is width-safe and follows pi invalidation/theme-refresh expectations
- [ ] Add or update ambient typings needed for the chosen pi TUI primitives and helper signatures
- [ ] Add regression validation that exercises the primary helper paths directly

## Issues
- None yet.

## Completion Summary
Not completed yet.
