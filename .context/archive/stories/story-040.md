# Story 040: Rich command docs registry and detail overlay renderer

**Status:** complete  
**Created:** 2026-05-30
**Last accessed:** 2026-05-30  

---

## Goal
Create a structured command documentation registry with usage syntax, examples, arguments, and longer descriptions for every Vazir command. Build a production `showCommandDetailOverlay` helper that renders rich command docs in a styled `VazirPanel` overlay.

## Verification
Open detail overlays for representative real commands in pi. Confirm they show usage, examples, and longer descriptions, render within width limits, and close cleanly on Escape.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/chrome.ts` (registry data)
- `.pi/lib/vazir-ui.ts` (detail overlay helper)
- Validation coverage for overlay rendering and registry completeness

## Out of scope — do not touch
- Wiring the registry into Ctrl+? (story-041)
- README changes (story-042)
- Changing command behavior or registration

## Dependencies
- story-035

## Checklist
- [x] Design command doc schema (command, shortDesc, usage, examples, args, longDesc)
- [x] Populate registry with all Vazir commands from `VAZIR_COMMAND_HELP` plus richer docs
- [x] Implement `showCommandDetailOverlay` using `VazirPanel` + themed `Text`/`Container`
- [x] Add width-safe rendering with pi TUI primitives and truncation
- [x] Add validation for overlay rendering and data completeness
- [x] Keep the existing `VAZIR_COMMAND_HELP` array in sync with the new registry

## Issues
- None yet.

## Completion Summary
Built the full command documentation registry and kept it in sync with the existing quick-reference array.

- Added `CommandDoc` interface to `.pi/lib/vazir-ui.ts` with fields: `command`, `shortDesc`, `usage`, `args`, `examples`, `longDesc`.
- Created `showCommandDetailOverlay` in `.pi/lib/vazir-ui.ts` which renders a `VazirPanel`-framed markdown overlay via `showMarkdownViewer`, with themed borders, solid background, and width-safe rendering.
- Populated `VAZIR_COMMAND_DOCS` in `.pi/extensions/vazir-tracker/chrome.ts` with 17 rich entries covering every user-facing Vazir command.
- Added missing `/implement` entry to `VAZIR_COMMAND_HELP` and updated `/checkpoint` description to be VCS-agnostic.
- Added `getCommandDoc(command)` lookup helper and `validateCommandDocsComplete()` guard.
- Added `scripts/validate-vazir-command-docs.mts` which statically verifies that every `VAZIR_COMMAND_HELP` entry has a matching `CommandDoc` and vice versa.
- Existing `scripts/validate-vazir-ui-helpers.mts` already validates the detail overlay rendering path end-to-end.
