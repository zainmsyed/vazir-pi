# Story 085: Add stack-neutral test-sandbox settings

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** 2026-09-03

---

## Goal
Add a normalized `test_sandbox` section to `.context/settings/project.json` for reproducible, stack-neutral E2E runs. Configuration uses structured executable-and-argument arrays for optional setup, optional start, optional readiness, and required test commands, plus bounded timeout, port-role, and preserve-on-failure settings; malformed input must fail with actionable validation rather than being interpreted as a shell command.

## Verification
Run targeted settings validation against valid, missing, and malformed project settings. Confirm unrelated settings survive writes, command argument boundaries round-trip exactly, no shell strings are accepted, and existing projects without `test_sandbox` continue to load with safe defaults.

## Scope — files this story may touch
- `.pi/lib/vazir-helpers.ts`
- `scripts/validate-vazir-test-sandbox-settings.mts`
- `.context/stories/plan.md`
- `.context/stories/story-085.md`

## Out of scope — do not touch
- Sandbox workspace creation or process execution
- `/test-sandbox` command registration or interactive setup
- Playwright-specific behavior, visual QA, containers, or host security isolation

## Dependencies
- Existing normalized project-settings helpers in `.pi/lib/vazir-helpers.ts`

---

## Checklist
- [x] Define normalized stack-neutral test-sandbox settings and structured command types
- [x] Validate setup, start, readiness, and test executable/argument arrays without shell evaluation
- [x] Normalize bounded timeout, port-role, and preserve-on-failure options with safe defaults
- [x] Preserve unrelated and legacy project settings during reads and merge-safe writes
- [x] Add regression coverage for valid, missing, malformed, and round-trip settings

---

## Issues

---

## Completion Summary
Implemented normalized `test_sandbox` project settings in `.pi/lib/vazir-helpers.ts`. Settings support optional structured `setup`, `start`, and `readiness` commands, a required structured `test` command when configured, bounded timeout values, validated port roles, and preserve-on-failure behavior. Commands remain executable-and-argument arrays and shell strings are rejected; unknown nested settings and unrelated legacy project settings are preserved during normalization and merge-safe writes. Added actionable validation and safe read defaults for malformed or missing settings. Added `scripts/validate-vazir-test-sandbox-settings.mts` covering valid, missing, malformed, round-trip, boundary, and passthrough cases.
