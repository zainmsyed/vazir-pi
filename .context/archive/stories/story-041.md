# Story 041: Wire Ctrl+? to selectable list with quickstart banner

**Status:** complete  
**Created:** 2026-05-30
**Last accessed:** 2026-05-30  

---

## Goal
Convert the Ctrl+? help shortcut into a selectable command list overlay using the real registry from story-040. Retain the quick-reference layout. Add a quickstart workflow banner highlighting `/plan` → `/implement` → `/complete-story`. Clean up the `/test-help` prototype from story-039.

## Verification
Press Ctrl+? in pi, confirm the command list is selectable, quick-reference text remains visible, selecting a command opens its detail overlay, and the quickstart banner appears at the top.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/chrome.ts` (help shortcut handler and overlay wiring)
- `.pi/lib/vazir-ui.ts` if helper changes are needed

## Out of scope — do not touch
- Changing the footer help hint text
- Changing command semantics or closeout flows
- README updates (story-042)

## Dependencies
- story-039
- story-040

## Checklist
- [x] Replace static `showScrollableOverlay` help path with selectable list using real registry
- [x] Wire selection to open `showCommandDetailOverlay` from story-040
- [x] Preserve quick-reference layout (command + short description) in list rows
- [x] Add quickstart workflow banner/header to the help overlay
- [x] Keep Esc to close and scroll behavior intact
- [x] Remove or repurpose `/test-help` and the old static help paths
- [x] Add validation for selection and overlay open/close flow

## Issues
- None.

## Completion Summary
Wired Ctrl+? to a selectable command list overlay using the real registry from story-040. Review closeout completed with five findings remediated.

- Replaced `showScrollableOverlay` and `commandHelpBody` in `.pi/extensions/vazir-tracker/chrome.ts` with a new `showCommandHelp` that builds a `VazirPanel` + `SelectList` overlay.
- The overlay shows a quickstart banner (`Quickstart: /plan → /implement → /complete-story`) at the top, followed by a selectable list of all 17 Vazir commands with their descriptions.
- Selecting a command opens `showCommandDetailOverlay` with the full `CommandDoc` (usage, args, examples, long description).
- When the detail closes (Escape or Enter), the handler loops back to the list so users can browse multiple commands.
- Escape from the list fully exits. The `commandHelpOpen` guard prevents nested overlay opens.
- Removed the `/test-help` prototype command and its mock data from `.pi/extensions/vazir-context/index.ts`.
- Removed unused `showScrollableOverlay` export and the `showCommandDetailOverlay`/`showSelectionList` imports from `vazir-context/index.ts`.
- Extended `scripts/validate-vazir-command-docs.mts` with static checks that verify `showCommandHelp` structure.
- **Review remediation:** Deleted stale `validate-vazir-overlay-reader.mts`; hardened `ctx.ui?.notify` guard; reset `commandHelpOpen` in `tearDownChromeSession`; added `validate-vazir-help-shortcut.mts` runtime tests; added keyboard navigation hints to the overlay.
