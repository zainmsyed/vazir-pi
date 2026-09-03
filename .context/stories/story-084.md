# Story 084: Add a `/help` command as a terminal-safe alias for `Ctrl+?`

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** 2026-09-03

---

## Goal
Add a `/help` command that opens exactly the same help experience as Pi's `Ctrl+?` shortcut, providing a reliable alternative when a terminal swallows the keyboard shortcut. The command must reuse the existing help behavior rather than introducing a second help renderer, altered content, or a separate interaction model.

## Verification
Run the targeted and aggregate validations, then confirm in an interactive Pi session that entering `/help` opens the same help UI and supports the same dismissal/selection behavior as `Ctrl+?` when the shortcut is available.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `README.md`
- `scripts/run-validations.mts`
- `scripts/validate-vazir-help-command.mts`
- `scripts/validate-vazir-status-chrome.mts`
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-084.md`

## Out of scope — do not touch
- Pi's existing `Ctrl+?` help implementation
- New help content, categories, search, documentation links, or alternate rendering
- Changes to unrelated keyboard shortcuts or command workflows
- Desktop GUI or standalone CLI help behavior

## Dependencies
- Existing Pi `Ctrl+?` help behavior and supported extension command registration API

---

## Checklist
- [x] Identify the supported Pi API or command path that invokes the existing `Ctrl+?` help behavior
- [x] Register `/help` as a Vazir command that delegates to that exact existing behavior
- [x] Add regression coverage proving `/help` is registered and reaches the same help path without duplicating help content
- [x] Update active command documentation and register the targeted validation in the aggregate runner
- [x] Run targeted, aggregate, and interactive smoke validation for the command and its dismissal/selection flow

---

## Issues

---

## Completion Summary

Implemented `/help` in `.pi/extensions/vazir-tracker/index.ts` as a command-owned alias that calls the shared `openCommandHelp()` path used by `Ctrl+?`; no renderer or help content was duplicated. Added the command to the existing help registry/details, documented it in `README.md`, added `scripts/validate-vazir-help-command.mts` to the aggregate runner, and updated the footer hint to `Ctrl+? · /help` so both entry points remain visible without dropping footer status fields.

Validation passed:
- `node --experimental-strip-types scripts/validate-vazir-help-command.mts`
- `node --experimental-strip-types scripts/validate-vazir-command-docs.mts`
- `npm test`
- `node --experimental-strip-types scripts/validate-vazir-status-chrome.mts`

Interactive Pi TUI smoke validation confirmed that `/help` opens the expected help UI and supports the intended dismissal and selection flow. Story status remains `in-progress`; `/complete-story` retains responsibility for final closure.
