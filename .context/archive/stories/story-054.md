# Story 054: Harden tracker chrome ANSI width measurement and narrow-width regressions

**Status:** complete  
**Type:** —  
**Created:** 2026-06-06  
**Last accessed:** 2026-06-06  
**Completed:** 2026-06-06

---

## Goal
Fix the remaining split-pane crash in Vazir's tracker footer, especially the active working-message line, then harden tracker chrome width measurement and truncation helpers so ANSI escape sequences and very small terminal widths do not cause future render-width crashes.

## Verification
Run focused tracker-chrome validations that render both the footer and story-status chrome at multiple narrow widths, including an active tool-work footer state with a long working message and widths small enough to exercise zero/near-zero spacing paths, and confirm no rendered line exceeds the requested width. In a real narrow split pane, confirm the footer no longer crashes Pi while tool work is active.

## Scope
- `.pi/extensions/vazir-tracker/chrome.ts`
- `scripts/validate-vazir-status-chrome.mts`
- any focused tracker-chrome validation needed for ANSI-width edge cases
- `.context/stories/plan.md`
- `.context/stories/story-054.md`

## Out of scope
- New chrome features unrelated to width safety
- Story workflow or review-flow behavior changes
- Reworking unrelated overlay helpers outside tracker chrome

## Dependencies
- story-053

## Checklist
- [x] Reproduce and trace the active-working-message footer overflow in the tracker chrome render path
- [x] Fix footer truncation so active tool-work messages stay within the available pane width
- [x] Audit tracker chrome ANSI stripping and visible-width helpers against full CSI escape handling
- [x] Replace any remaining width calculations that assume plain string length where render width can differ
- [x] Add regression coverage for footer and story-status lines at more than one representative narrow width, including an active work footer case
- [x] Add a tiny-width regression that proves negative or zero spacing paths do not throw or overrun
- [x] Verify the focused tracker-chrome validation suite and a real narrow split-pane run pass without width crashes

## Issues
- None yet.

## Completion Summary
- Hardened tracker chrome width handling in `.pi/extensions/vazir-tracker/chrome.ts` by switching visible-width measurement to `pi-tui`'s runtime helper when available, expanding local escape stripping/parsing to cover full CSI plus OSC sequences, and routing truncation through `pi-tui.truncateToWidth` with a safer local fallback.
- Guarded footer spacing math against tiny widths and kept active-work footer truncation inside the available pane width even when the running command text is long.
- Expanded `scripts/validate-vazir-status-chrome.mts` to cover a narrow active-work footer at 90 columns, a long-command working footer case, and tiny-width renders for both the footer and story-status widget.
- Updated `scripts/lib/validation-harness.mts` so the `pi-tui` validation stub now mirrors ANSI-aware `visibleWidth` and `truncateToWidth` behavior closely enough for the new tracker-chrome regressions.
- Verified the focused validation script passes and confirmed in a real split pane that Pi no longer crashes while a long-running bash tool command is active.
