# Story 068: Aggregate validation registration for port assignment

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-07  
**Last accessed:** 2026-08-08  
**Completed:** 2026-08-08

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
- [x] Confirm `validate-vazir-ports.mts` covers schema, bind/retry, duplicate detection, range exhaustion, and override branches
- [x] Add `validate-vazir-ports.mts` to the `validations` array in `scripts/run-validations.mts`
- [x] Run `npm test` and verify the aggregate suite passes
- [x] Document any test-only stubs or helper assumptions in the validation script header

---

## Issues

- The JJ exact-restore validation is skipped by default when `jj` is unavailable. JJ-enabled validation jobs must run `VAZIR_REQUIRE_JJ=1 npm test`; the runner then fails instead of silently skipping the validation.

---

## Completion Summary

Registered `validate-vazir-ports.mts` in `scripts/run-validations.mts`, documented its throwaway listener, fake-PID, and bind-injection assumptions, and confirmed the script covers schema, bind/retry, duplicate detection, range exhaustion, and override branches. The aggregate runner now skips the JJ exact-restore validation with an explicit conditional message when `jj` is unavailable, while running it normally when the tool is installed. Setting `VAZIR_REQUIRE_JJ=1` makes the runner fail if the required tool is missing, providing an enforceable command for JJ-enabled CI or release validation jobs.

`npm test` passes. The port validation is included and passes in the aggregate run. A deliberate test-only assertion mismatch was also introduced and confirmed to make the aggregate runner fail on `validate-vazir-ports.mts`. JJ-specific coverage remains conditional on a JJ-enabled environment, with strict enforcement available through `VAZIR_REQUIRE_JJ=1 npm test`.
