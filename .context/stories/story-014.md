# Story 014: `/vazir-init` Fossil bootstrap parity

**Status:** not-started  
**Created:** 2026-05-14
**Last accessed:** —  
**Completed:** —

---

## Goal
Add Fossil as a first-class VCS option during `/vazir-init`. Currently the init flow only prompts for Git (+ JJ colocation) and silently ignores Fossil even when the binary is installed. Users who prefer Fossil must initialise it manually outside Pi, then restart the session before Vazir detects it.

## Verification
Run `/vazir-init` in a fresh project with `fossil` installed and no existing VCS. The user sees a prompt that includes Fossil alongside Git. Selecting Fossil runs `fossil init` (or `fossil open` if a remote repo URL is provided), creates `.context/settings/project.json` with `"vcs_preference": "fossil"`, and the footer immediately renders the Fossil branch/sync status without requiring a session restart.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/lib/vazir-helpers.ts`

## Out of scope — do not touch
- Footer rendering logic itself (story-008 covered this)
- `/review` Fallow Fossil bridge (already works)
- VCS preference UX after init (story-015)

## Dependencies
- —

---

## Checklist
- [ ] Detect `fossil` binary presence at `/vazir-init` time (probe `fossil --version`)
- [ ] Redesign VCS prompt as a multi-option select: Git + JJ / Fossil / Skip VCS
- [ ] If Fossil chosen: run `fossil init` for new repo, or prompt for remote URL then `fossil clone` + `fossil open`
- [ ] Write `"vcs_preference": "fossil"` into `.context/settings/project.json` during init
- [ ] Ensure `.fossil-settings/ignore-glob` is created with sensible defaults (`.context/`, `node_modules/`, `.git/`, `.jj/`)
- [ ] Update init summary checklist to mention Fossil when selected
- [ ] Add validation scenario in `scripts/validate-vazir-init.mts` for Fossil bootstrap path

---

## Issues

---

## Completion Summary

