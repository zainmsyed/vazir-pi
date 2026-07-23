# Story 044: Rework `/design` outputs for theme-oriented design briefs

**Status:** complete  
**Type:** —  
**Created:** 2026-05-30
**Last accessed:** 2026-05-31  
**Completed:** 2026-05-31

---

## Goal
Improve `/design` so it produces and updates `.context/design/` artifacts that are actually useful for theme work like the planned Fossil refresh: clear visual direction, design tokens, component vocabulary, constraints, and explicit page-treatment boundaries.

## Verification
Run `/design` against a theme-oriented request and confirm it updates `.context/design/brand.md`, `.context/design/design-system.md`, and `.context/design/components.md` with concrete decisions about direction, tokens, components, and non-goals instead of leaving generic placeholders.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.context/design/brand.md`
- `.context/design/design-system.md`
- `.context/design/components.md`
- Validation coverage for `/design` prompt/output behavior

## Out of scope — do not touch
- Fossil skin application or `/vazir-init` behavior
- Full visual implementation of the Fossil theme
- Review workflow changes beyond any needed design-artifact expectations

## Dependencies
- story-001
- story-003
- story-004

## Checklist
- [x] Inspect the current `/design` command flow, prompts, and helper/template behavior
- [x] Define the minimum design-artifact schema needed for theme/layout work (direction, tokens, components, page boundaries, non-goals)
- [x] Update `/design` generation/update behavior so theme-oriented requests populate all three design files with concrete content
- [x] Ensure repeated `/design` runs refine existing design artifacts instead of clobbering useful prior decisions
- [x] Add regression coverage for a theme-oriented `/design` path and its emitted design-file content

## Issues
- None yet.

## Completion Summary
Reworked `/design` from a narrow token-tweak helper into a real design-artifact update flow for theme work.

- Expanded the default design-file schema so `brand.md`, `design-system.md`, and `components.md` now have explicit homes for theme direction, tokens, component vocabulary, page-treatment boundaries, constraints, and non-goals.
- Added a reusable `/design` prompt builder that tells the model to read all three files, refine existing decisions in place, keep `design-system.md` concise, and avoid clobbering useful prior guidance on repeat runs.
- Kept simple direct mutations for quick token tweaks, but routed richer theme-oriented requests through the model with stronger instructions instead of the old hard-coded command parser.
- Updated the current `.context/design/` artifacts to match the new schema and capture the Fossil docs-theme direction discussed in planning.
- Added regression coverage for both the helper/schema layer and the `/design` command path, including prompt assertions and seeded design-file content checks.
