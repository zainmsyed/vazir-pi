# Story 082: Remove Fallow from Vazir reviews and closeout

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-02  
**Last accessed:** 2026-09-02  
**Completed:** 2026-09-02

---

## Goal
Remove Vazir’s active Fallow integration so every new `/review` and `/complete-story` review is LLM-only. Eliminate Fallow execution, parsing, prompt/install messaging, review-template fields, and recurrence/promotion processing while preserving all existing Fallow-related reviews, complaints, settings, dependencies, and documentation as historical data.

## Verification
Run the targeted review, complete-story, template, and aggregate validation suites. Confirm new reviews contain no static-analysis or Fallow sections, no Fallow process or install prompt runs, closeout ignores historical Fallow entries, and ordinary LLM-only review behavior remains intact.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/complete-story.ts`
- `scripts/validate-vazir-complete-story.mts`
- `scripts/validate-vazir-review-design-compliance.mts`
- `scripts/validate-vazir-init.mts`
- `scripts/validate-vazir-review-loop.mts`
- `scripts/validate-vazir-status-chrome.mts`
- `scripts/validate-vazir-package-install.mts` (approved closeout expansion — stale glob-entrypoint assertion)
- `scripts/run-validations.mts`
- `.context/stories/plan.md`
- `.context/stories/story-082.md`

## Out of scope — do not touch
- Historical `.context/reviews/` files and `.context/complaints-log.md`
- Existing Fallow configuration or project dependencies
- JJ removal and VCS behavior
- Product-plan and historical specification documents

## Dependencies
- None

---

## Checklist
- [x] Remove Fallow execution, parsing, prompt injection, and installation/setup behavior
- [x] Remove static-analysis and Fallow sections from new review templates and generated review files
- [x] Stop closeout and consolidation paths from consuming new Fallow findings while preserving historical records
- [x] Update active review/closeout tests for LLM-only behavior and historical-data preservation
- [x] Register and run targeted validations through the aggregate runner

---

## Issues

- Aggregate validation is fully green (41/41 validations, exit 0) after a minimal scope expansion approved during closeout: `scripts/validate-vazir-package-install.mts` was updated because commit `b28d506288` changed the manifest to explicit extension entrypoints for hidden-path discovery but left the validation asserting the old glob patterns. The validation now derives expected entrypoints from `.pi/extensions/` and asserts each is listed in the manifest.
- Real Pi smoke test in `/home/zain/Documents/coding/test/vazir-082-smoke` loaded the edited extension and generated `.context/reviews/review-20260902-145603.md`. The generated review is LLM-only and contains no static-analysis or Fallow fields. The review itself remained in-progress because the bounded session completed the review-file generation but did not continue into filling findings.

---

## Completion Summary

Removed Fallow from the active review path, generated review templates, review instructions, complete-story closeout, and consolidation prompts. New reviews are LLM-only and no longer contain static-analysis or Fallow sections. Cleaned legacy Fallow parser scaffolding from the review command path, updated active init/review/status validations, and removed obsolete Fallow validators from the aggregate runner. Targeted review, complete-story, init, review-loop, and status-chrome validations pass. A real Pi smoke session generated a review file that is LLM-only and free of Fallow/static-analysis metadata. The aggregate suite passes end-to-end (41/41 validations) after fixing a stale pre-existing assertion in `validate-vazir-package-install.mts` that still expected glob extension entrypoints after the hidden-path discovery fix moved the manifest to explicit paths.

