# Story 065: Extend project.json settings schema for role-keyed port maps

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-07  
**Completed:** —

---

## Goal
Add typed helpers and merge-safe read/write support for the `ports`, `previous_ports`, and `ports_override` maps that the deterministic port assignment feature needs in `.context/settings/project.json`. The new fields must be backwards compatible: existing settings files without these maps should behave as if the maps are empty, and unrelated settings like `vcs_mirror` must never be clobbered by a port-related update.

## Verification
Run a targeted validation script that: starts with a project.json lacking port maps, calls `readProjectSettings` and confirms `ports`, `previous_ports`, and `ports_override` normalize to empty objects; calls `writeProjectSettings` with a partial port update and confirms unrelated fields survive; and verifies the JSON round-trip format.

## Scope — files this story may touch
- `.pi/lib/vazir-helpers.ts` — `ProjectSettings` interface, `readProjectSettings`, `writeProjectSettings`, and typed accessors for the three port maps
- `scripts/validate-vazir-ports.mts` — schema/backwards-compatibility assertions
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-065.md`

## Out of scope — do not touch
- Bind/retry socket logic
- PID file reading or writing
- Override precedence or validation logic
- Any command, UI surface, or service consumer

## Dependencies
- None

---

## Checklist
- [ ] Add TypeScript types for `ports`, `previous_ports`, and `ports_override` keyed maps in project settings
- [ ] Make `readProjectSettings` normalize missing or malformed port maps to empty objects
- [ ] Make `writeProjectSettings` merge port-map updates without overwriting unrelated settings
- [ ] Add `portSettings(cwd)` accessor helpers if they simplify the port module
- [ ] Add regression coverage for schema round-trip and backwards compatibility

---

## Issues

---

## Completion Summary
