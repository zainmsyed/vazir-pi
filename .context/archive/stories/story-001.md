# Story 001: Design system folder, UI story detection, and seeding

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-05  
**Completed:** 2026-05-05

---

## Goal
Create the `.context/design/` folder infrastructure and wire it into `/vazir-init` and `/plan`. Add UI story detection logic and update the story template to support an optional `Type: ui` frontmatter override.

## Verification
Run `/vazir-init` in a fresh project — `.context/design/` exists with `design-system.md`, `brand.md`, and `components.md` stubs. Run `/plan` with a text design file in `.context/intake/references/` — design files are seeded. Create a story with `.tsx` in scope and confirm it is treated as a UI story; create one with only `.ts` and confirm it is not.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/index.ts`

## Out of scope — do not touch
- Design context injection into agent prompts (covered in story-002)
- `/design` command UI (covered in story-003)
- Review template changes (covered in story-004)
- Consolidation changes (covered in stories 005–007)

## Dependencies
- —

---

## Checklist
- [x] Add design-system path helpers: `designDir()`, `designSystemPath()`, `brandPath()`, `componentsPath()` in helpers.ts
- [x] Update `/vazir-init` to create `.context/design/` with three stub files (empty with frontmatter comments)
- [x] Update `/plan` handler to run silent design seeding pass after writing `intake-brief.md`
- [x] Implement `seedDesignFromIntake(cwd)` that scans `.context/intake/references/` for text files matching design-flavoured names/patterns and extracts colours, typography, spacing into stubs
- [x] Implement `isUiStory(storyFilePath)` helper that reads story scope and returns true if any path ends in `.tsx`, `.jsx`, `.css`, `.scss`, `.html`, or `.svelte`
- [x] Implement `hasUiTypeOverride(storyFilePath)` helper that returns true if frontmatter contains `**Type:** ui`
- [x] Update `storyTemplate()` in helpers.ts to include optional `**Type:**` line after Status
- [x] Write tests or manual verification steps in a local temp repo

---

## Issues

---

## Completion Summary

**What changed:**
- **helpers.ts**: Added design-system path helpers (`designDir`, `designSystemPath`, `brandPath`, `componentsPath`), three stub templates (`DESIGN_SYSTEM_TEMPLATE`, `BRAND_TEMPLATE`, `COMPONENTS_TEMPLATE`), `seedDesignFromIntake()` with heuristic extraction of hex colours, typography, and spacing from `.context/intake/references/`, `isUiStory()` that detects UI stories by scope-path extensions (`.tsx`, `.jsx`, `.css`, `.scss`, `.html`, `.svelte`), `hasUiTypeOverride()` that checks for `**Type:** ui` frontmatter, and updated `storyTemplate()` to include an optional `**Type:** —` line after Status.
- **index.ts**: Updated `/vazir-init` to create `.context/design/` with stub files on bootstrap. Updated `/plan` to run a silent design seeding pass after writing `intake-brief.md`; if no design-flavoured intake files are found, it creates empty stubs instead. Imports and wiring for all new helpers added.

**Manual verification performed:**
- `isUiStory` returns `true` for a story with `.tsx` in scope and `false` for a story with only `.ts` files.
- `hasUiTypeOverride` returns `true` for a story with `**Type:** ui` and `false` otherwise.
- `seedDesignFromIntake` successfully extracted colours (#2d6be4, #1a1a2e, etc.), font family (Inter, system-ui), base unit (4px), and scale from a mock brand style guide in `.context/intake/references/`.

**Ready for `/complete-story`.**
