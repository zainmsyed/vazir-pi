# Story 045: Build a managed Fossil docs-first skin from the design spec

**Status:** complete  
**Type:** —  
**Created:** 2026-05-30
**Last accessed:** 2026-05-31  
**Completed:** 2026-05-31

---

## Goal
Create the first Vazir-managed Fossil theme assets for a dark, docs-first, DeepWiki-inspired experience, using the `.context/design/` spec as the source of truth and keeping native Fossil timeline/diff/admin pages within cosmetic-only limits.

## Verification
Preview the generated Fossil skin assets against representative wiki/docs pages and confirm the result includes the planned dark shell, top nav, docs-sidebar treatment, typography, tag/code styling, and conservative restyling for native Fossil pages without relying on unsupported HTML restructuring.

## Scope — files this story may touch
- Fossil theme asset source files added under Vazir-managed project paths
- `.pi/lib` or Fossil-oriented helper modules that render or package the managed skin assets
- `.context/design/brand.md`
- `.context/design/design-system.md`
- `.context/design/components.md`
- Validation or smoke coverage for managed skin generation

## Out of scope — do not touch
- `/vazir-init` wiring that applies the skin to a repo
- React/shadcn runtime integration
- Structural rewrites of native Fossil timeline, diff, ticket, or admin HTML

## Dependencies
- story-044

## Checklist
- [x] Decide where Vazir-owned Fossil skin assets and any generation helpers should live
- [x] Implement managed CSS/header/footer assets for the global shell and docs-first wiki treatment
- [x] Encode conservative styling rules for native Fossil timeline/diff/admin views without structural assumptions
- [x] Add a clear managed marker/version strategy inside the generated skin assets
- [x] Add validation or smoke coverage that the managed theme assets render from the intended spec inputs

## Issues
- None yet.

## Completion Summary
Built the first managed Fossil theme source in `.pi/lib/vazir-fossil-theme.ts`, making that helper module the canonical owner of Vazir's generated Fossil skin assets.

- Added a design-spec reader that pulls the current `.context/design/` decisions into a structured theme spec so the managed skin is generated from the design artifacts rather than a disconnected hard-coded brief.
- Implemented managed CSS, header, and footer asset generation for a dark docs-first shell, including top navigation, docs-layout/sidebar classes, changelog entry styling, pills, hash/code badges, and readable content defaults.
- Added conservative native-page styling for timeline, diff, report, browser, and admin-adjacent selectors without depending on unsupported Fossil HTML restructuring.
- Added explicit managed markers and a stable theme version comment to every generated asset so future install/update flows can detect and refresh Vazir-owned themes safely.
- Added `buildManagedFossilThemePreviewHtml()` plus `scripts/validate-vazir-fossil-theme.mts` smoke coverage to verify the generated assets include the expected docs shell, native timeline polish, and managed metadata.
