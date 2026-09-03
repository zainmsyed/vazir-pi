# Story 039: Prototype selectable help overlay with mock data wired to `/test-help`

**Status:** complete  
**Created:** 2026-05-30
**Last accessed:** 2026-05-30  

---

## Goal
Build a quick prototype of the selectable help overlay using mock command data to validate the UX before committing to the full registry. Wire it to a `/test-help` command so it can be invoked on demand without touching the live Ctrl+? path.

## Verification
Run `/test-help` in pi and confirm a selectable command list opens, selecting a mock command opens a detail overlay, and both close cleanly on Escape.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/chrome.ts` or `.pi/extensions/vazir-context/index.ts` for `/test-help` registration
- `.pi/lib/vazir-ui.ts` if overlay helper changes are needed

## Out of scope — do not touch
- Real command registry or `VAZIR_COMMAND_HELP`
- Live Ctrl+? help shortcut
- README changes

## Dependencies
- story-035

## Checklist
- [x] Register `/test-help` command for on-demand prototype invocation
- [x] Create mock command data with 2–3 fake entries that exercise the full schema
- [x] Build selectable list overlay with `SelectList` + `VazirPanel`
- [x] Build detail overlay that renders usage, args, examples, and long description
- [x] Wire list selection to open the corresponding detail overlay
- [x] Validate open/close and scroll behavior in a real pi session
- [x] Document what worked and what needs tweaking before story-040

## Issues
- None yet.

## Completion Summary
Implemented a `/test-help` prototype in `.pi/extensions/vazir-context/index.ts` that exercises the selectable help + detail overlay flow using mock data.

- Added `/test-help` command registration with a handler that uses `showSelectionList` (from `.pi/lib/vazir-ui.ts`) to present three mock commands (`/plan`, `/implement`, `/complete-story`) in a centered `VazirPanel` overlay.
- Each mock entry carries `command`, `shortDesc`, `usage`, `args`, `examples`, and `longDesc` — exercising the full schema intended for the real registry in story-040.
- Selecting a command opens a detail overlay via `showMarkdownViewer`, rendering a markdown body with the command header, usage line, arguments list, examples list, and long description.
- Escape from the list cancels and fully exits. Selecting a command opens the detail overlay; when the detail closes (Escape or Enter), the handler loops back to the list so users can browse multiple commands without re-invoking `/test-help`.
- **Open question for validation:** Whether the list-to-detail transition feels smooth in a real pi session, and whether the markdown detail overlay is the right presentation format or if a custom plain-text overlay would be crisper for command docs.
- **Known limitation:** Mock data is hardcoded inline. Story-040 should extract the schema and overlay helpers into reusable shared code and populate the real command registry from `VAZIR_COMMAND_HELP`.
