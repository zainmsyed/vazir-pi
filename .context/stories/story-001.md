# Story 001: Design system folder, UI story detection, and seeding

**Status:** in-progress  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-05  
**Completed:** —

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
- [ ] Add design-system path helpers: `designDir()`, `designSystemPath()`, `brandPath()`, `componentsPath()` in helpers.ts
- [ ] Update `/vazir-init` to create `.context/design/` with three stub files (empty with frontmatter comments)
- [ ] Update `/plan` handler to run silent design seeding pass after writing `intake-brief.md`
- [ ] Implement `seedDesignFromIntake(cwd)` that scans `.context/intake/references/` for text files matching design-flavoured names/patterns and extracts colours, typography, spacing into stubs
- [ ] Implement `isUiStory(storyFilePath)` helper that reads story scope and returns true if any path ends in `.tsx`, `.jsx`, `.css`, `.scss`, `.html`, or `.svelte`
- [ ] Implement `hasUiTypeOverride(storyFilePath)` helper that returns true if frontmatter contains `**Type:** ui`
- [ ] Update `storyTemplate()` in helpers.ts to include optional `**Type:**` line after Status
- [ ] Write tests or manual verification steps in a local temp repo

---

## Issues

---

## Completion Summary

