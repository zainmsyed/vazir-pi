# Story 065: Extend project.json settings schema for role-keyed port maps

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-07  
**Completed:** 2026-08-07

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
- [x] Add TypeScript types for `ports`, `previous_ports`, and `ports_override` keyed maps in project settings
- [x] Make `readProjectSettings` normalize missing or malformed port maps to empty objects
- [x] Make `writeProjectSettings` merge port-map updates without overwriting unrelated settings
- [x] Add `portSettings(cwd)` accessor helpers if they simplify the port module
- [x] Add regression coverage for schema round-trip and backwards compatibility

---

## Issues

---

## Completion Summary

Added typed `ProjectSettings`, `PortSettings`, and role-keyed numeric map types in `.pi/lib/vazir-helpers.ts`. Project settings reads now always expose normalized empty maps for missing or malformed port fields, while writes merge partial updates per map and preserve unrelated settings such as `vcs_mirror`. Added the `portSettings(cwd)` accessor and targeted validation covering backwards compatibility, malformed input, merge behavior, unrelated-field preservation, and JSON round-trip.

Verification: `node --experimental-strip-types scripts/validate-vazir-ports.mts` passes. The aggregate validation runner registration is intentionally deferred to story-068.
