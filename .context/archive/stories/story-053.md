# Story 053: Make Vazir story-status chrome width-safe in split panes

**Status:** complete  
**Type:** —  
**Created:** 2026-06-06  
**Last accessed:** 2026-06-06  
**Completed:** 2026-06-06

---

## Goal
Stop Pi from crashing in split-screen or otherwise narrow terminals by making the Vazir story-status widget width-aware and truncating its rendered output safely.

## Verification
Open Pi in a narrow split pane and confirm the story-status chrome renders without triggering a `Rendered line exceeds terminal width` crash. Validate the focused status-chrome test renders the active-story row at split-pane widths without any line exceeding the requested width.

## Scope
- `.pi/extensions/vazir-tracker/chrome.ts`
- `scripts/validate-vazir-status-chrome.mts`
- `.context/stories/plan.md`
- `.context/stories/story-053.md`

## Out of scope
- Broad redesign of Vazir footer content or wording
- Non-chrome overlay layout changes
- Full ANSI width-helper refactor beyond what is strictly needed for the story-status row

## Dependencies
- story-035

## Checklist
- [x] Trace the story-status widget render path and confirm where terminal width is currently ignored
- [x] Pass the available render width into the story-status widget component
- [x] Truncate the final story-status row safely for narrow panes while preserving the most important signals
- [x] Add regression coverage for at least one split-pane-width render of the active-story status widget
- [x] Verify the focused status-chrome validation and a real narrow-pane Pi run no longer crash

## Issues
- None yet.

## Completion Summary
- Made the story-status widget width-aware by threading the render width into `storyStatusWidgetLines` and truncating every returned status row with the ANSI-safe truncation helper used by tracker chrome.
- Added a focused narrow-width regression to `scripts/validate-vazir-status-chrome.mts` that renders the active-story widget at 90 columns, asserts no line exceeds that width, and confirms key story signals remain visible.
- Verified the focused status-chrome validation script passes mechanically.
- Confirmed in a real narrow split pane that the active story-status chrome now renders safely; the separate footer overflow discovered during testing was fixed in follow-up story-054, satisfying the end-to-end narrow-pane verification for this story as well.
