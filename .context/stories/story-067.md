# Story 067: Port override handling for file and environment overrides

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-07  
**Completed:** —

---

## Goal
Wire per-key port overrides into the port assignment helper. A user may specify an override in `ports_override` inside `.context/settings/project.json` or via an uppercased `VAZIR_PORT_{KEY}` environment variable, with the environment variable taking precedence. Invalid override values must trigger a single warning and fall back to the standard auto-assignment behavior without blocking the service.

## Verification
Run a targeted validation script that exercises: a valid file override causes the helper to attempt that port first; a valid env override overrides the file override; an invalid file override warns once and falls back; an invalid env override warns once and falls back; and when an override port is occupied by another process, standard fallback through the range applies.

## Scope — files this story may touch
- `.pi/lib/vazir-ports.ts` — override resolution, validation, and precedence logic
- `.pi/lib/vazir-helpers.ts` — `ports_override` read accessor if needed
- `scripts/validate-vazir-ports.mts` — override branch coverage
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-067.md`

## Out of scope — do not touch
- New commands or UI prompts for setting overrides
- Range scan or PID logic already covered by story-066
- Project settings schema itself (story-065)

## Dependencies
- story-065
- story-066

---

## Checklist
- [ ] Read `ports_override` from project.json per key
- [ ] Read `VAZIR_PORT_{KEY}` from `process.env` per key, with env taking precedence over file
- [ ] Validate that an override is a numeric port in the 1–65535 range
- [ ] Emit a single warning and fall back to auto-assignment on invalid override
- [ ] Attempt the override port first; if occupied, fall back to the standard bind/retry flow
- [ ] Add regression coverage for override precedence and invalid-override fallback

---

## Issues

---

## Completion Summary
