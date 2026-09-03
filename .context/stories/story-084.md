# Story 084: Add a `/help` command as a terminal-safe alias for `Ctrl+?`

**Status:** not-started  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** —

---

## Goal
Add a `/help` command that opens exactly the same help experience as Pi's `Ctrl+?` shortcut, providing a reliable alternative when a terminal swallows the keyboard shortcut. The command must reuse the existing help behavior rather than introducing a second help renderer, altered content, or a separate interaction model.

## Verification
Run the targeted and aggregate validations, then confirm in an interactive Pi session that entering `/help` opens the same help UI and supports the same dismissal/selection behavior as `Ctrl+?` when the shortcut is available.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `README.md`
- `scripts/run-validations.mts`
- `scripts/validate-vazir-help-command.mts`
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
- [ ] Identify the supported Pi API or command path that invokes the existing `Ctrl+?` help behavior
- [ ] Register `/help` as a Vazir command that delegates to that exact existing behavior
- [ ] Add regression coverage proving `/help` is registered and reaches the same help path without duplicating help content
- [ ] Update active command documentation and register the targeted validation in the aggregate runner
- [ ] Run targeted, aggregate, and interactive smoke validation for the command and its dismissal/selection flow

---

## Issues

---

## Completion Summary
