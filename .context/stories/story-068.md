# Story 068: Aggregate validation registration for port assignment

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-07  
**Completed:** —

---

## Goal
Register the port-assignment validation script in the aggregate runner at `scripts/run-validations.mts` and confirm the full suite passes. This ensures the deterministic port helper is covered by the same continuous regression gate as the rest of Vazir.

## Verification
Run `npm test` and confirm the aggregate suite includes the new port validation and exits cleanly. Re-run after deliberately introducing a mismatch in a test-only assertion to confirm the runner still catches failures.

## Scope — files this story may touch
- `scripts/run-validations.mts` — append `validate-vazir-ports.mts`
- `scripts/validate-vazir-ports.mts` — final coverage assembly if needed
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-068.md`

## Out of scope — do not touch
- The implementation of the port helper itself
- Manual-only or timing-dependent checks that belong outside the deterministic suite

## Dependencies
- story-065
- story-066
- story-067

---

## Checklist
- [ ] Confirm `validate-vazir-ports.mts` covers schema, bind/retry, duplicate detection, range exhaustion, and override branches
- [ ] Add `validate-vazir-ports.mts` to the `validations` array in `scripts/run-validations.mts`
- [ ] Run `npm test` and verify the aggregate suite passes
- [ ] Document any test-only stubs or helper assumptions in the validation script header

---

## Issues

---

## Completion Summary
