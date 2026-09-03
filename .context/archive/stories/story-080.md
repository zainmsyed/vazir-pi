# Story 080: Make upgrade, rollback, and uninstall state-safe

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-31  
**Last accessed:** 2026-09-01  
**Completed:** 2026-09-01

---

## Goal
Implement lifecycle operations that preserve a working installation and user data. Upgrades must use the staged activation path, retain a previous complete release for rollback, and clean old releases only after successful activation. Uninstall must remove Vazir runtime/cache state by default while preserving project `.context/`, Pi credentials, settings, models, sessions, packages, and VCS metadata; removing `~/.vazir/` settings/logs requires explicit user choice. Existing Pi/Vazir installations must be detected and migrated non-destructively.

## Verification
In isolated temporary homes, install two versions, force a failed upgrade, roll back, and uninstall. Confirm the prior release remains runnable after failure, rollback restores the complete prior runtime, repeated operations are idempotent, `.context/` and Pi state remain byte-for-byte available, and explicit cleanup is required for product settings/logs.

## Scope — files this story may touch
- `install.sh` — repair and migration entrypoints
- `src/install/lifecycle.ts` — upgrade, rollback, retention, uninstall, and migration policy
- `src/install/staging.ts` — lifecycle use of atomic activation
- `scripts/validate-install-lifecycle.mts` — isolated lifecycle regression coverage
- `scripts/run-validations.mts` — register the validation
- `.context/stories/plan.md`
- `.context/stories/story-080.md`

## Out of scope — do not touch
- Runtime artifact creation (story-077)
- Initial signature implementation (story-078)
- Shell PATH management (story-079)
- Telemetry collection or desktop application behavior

## Dependencies
- story-078
- story-079

---

## Checklist
- [x] Implement staged upgrades that retain the current release until activation succeeds
- [x] Implement rollback to the previous complete release and bounded old-release retention
- [x] Detect existing Pi/Vazir installations and migrate without deleting or replacing user state
- [x] Implement idempotent uninstall that preserves `.context/`, Pi state, and VCS metadata
- [x] Require explicit consent for removing `~/.vazir/` settings and logs
- [x] Add isolated regression coverage for success, failure, rollback, migration, and uninstall preservation
- [x] Register the validation in the aggregate runner

---

## Issues

---

## Completion Summary

Implemented state-safe installation lifecycle support. Verified staged activation and post-success retention, complete-release rollback, additive detection of legacy Vazir/Pi state, and idempotent uninstall behavior. Uninstall removes the managed runtime and cache while preserving project `.context/`, Pi state, packages, and VCS metadata; `~/.vazir/` settings/logs are removed only with `--remove-settings`. Added isolated lifecycle regression coverage and registered it in the aggregate validation runner.

Targeted lifecycle, activation, and shell syntax validations pass. The full aggregate runner reaches the new lifecycle validation successfully; remaining validation status should be confirmed by `/complete-story`.