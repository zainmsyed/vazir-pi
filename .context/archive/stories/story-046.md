# Story 046: Auto-apply and refresh the Vazir-managed Fossil theme during `/vazir-init`

**Status:** complete  
**Type:** —  
**Created:** 2026-05-30
**Last accessed:** 2026-05-31  
**Completed:** 2026-05-31

---

## Goal
Make `/vazir-init` authoritative for Fossil theming: whenever the active VCS mode is Fossil, init should install or update the Vazir-managed theme automatically, including for repos that were initialized before managed theme support existed.

## Verification
Run `/vazir-init` in three Fossil scenarios: a fresh repo with no managed theme, an older Vazir-initialized repo without a managed-theme marker, and a repo already using the Vazir-managed theme. Confirm init applies or refreshes the theme in each case and reports whether it installed, replaced, or updated the Fossil theme.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- Fossil-theme management helpers under `.pi/lib` or an owning extension module
- Project settings/state helpers if a managed-theme marker or version needs persistence outside the skin content
- Validation coverage for `/vazir-init` Fossil-theme behavior

## Out of scope — do not touch
- Non-Fossil init flows beyond safe no-op behavior
- Per-repo theme customization UI
- Theme design decisions beyond consuming the managed assets from story-045

## Dependencies
- story-045
- story-014

## Checklist
- [x] Inspect the current `/vazir-init` flow and identify the right Fossil-mode hook point for theme application
- [x] Implement managed-theme detection plus install/update/replace behavior for Fossil repos
- [x] Ensure older repos that already ran init but lack a managed-theme marker are upgraded on the next `/vazir-init`
- [x] Emit clear user-facing status messages for installed, replaced, updated, and skipped cases
- [x] Add regression or integration coverage for fresh-install, legacy-upgrade, and managed-refresh paths

## Issues
- None yet.

## Completion Summary
Made `/vazir-init` authoritative for Fossil theming by wiring managed theme application directly into the Fossil-active branch of the init flow.

- Added Fossil theme application helpers in `.pi/lib/vazir-fossil-theme.ts` that read the current skin, detect whether it is already Vazir-managed, and write managed `css`, `header`, and `footer` assets through Fossil's own config storage.
- Classified theme outcomes into installed, replaced, updated, and skipped states so both notifications and the init summary can explain exactly what happened.
- Upgraded older Fossil repos automatically: if a repo already had a non-managed skin, the next `/vazir-init` now replaces it with the Vazir-managed theme and records that result clearly.
- Added integration-style validation in `scripts/validate-vazir-init.mts` for fresh Fossil install, legacy skin replacement, and managed theme refresh, while keeping non-Fossil flows as explicit no-op skips.
