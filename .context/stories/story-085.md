# Story 085: Add stack-neutral test-sandbox settings

**Status:** not-started  
**Type:** feature  
**Created:** 2026-09-03  
**Last accessed:** 2026-09-03  
**Completed:** —

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
- [ ] Define normalized stack-neutral test-sandbox settings and structured command types
- [ ] Validate setup, start, readiness, and test executable/argument arrays without shell evaluation
- [ ] Normalize bounded timeout, port-role, and preserve-on-failure options with safe defaults
- [ ] Preserve unrelated and legacy project settings during reads and merge-safe writes
- [ ] Add regression coverage for valid, missing, malformed, and round-trip settings

---

## Issues

---

## Completion Summary
