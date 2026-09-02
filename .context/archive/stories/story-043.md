# Story 043: Replace help-overlay README lookup with static Vazir quickstart and `.context` guide

**Status:** complete  
**Created:** 2026-05-30
**Last accessed:** 2026-05-30  

---

## Goal
Replace the Ctrl+? help overlay's file-backed `README.md` entry with a built-in Vazir quickstart document that always works on fresh installs and explains the core workflow plus what each `.context/` folder is for, especially `.context/intake/`.

## Verification
Open Ctrl+? in a fresh project with no root `README.md`, select the Vazir quickstart entry, and confirm it opens a markdown detail view that explains `/vazir-init`, `/plan` → `/implement` → `/complete-story`, the `.context/` folders, and why strong `.context/intake/` inputs improve planning.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/lib/vazir-ui.ts`
- `scripts/validate-vazir-command-docs.mts`
- `scripts/validate-vazir-help-shortcut.mts`
- `README.md`

## Out of scope — do not touch
- Packaging/install flow beyond help text updates
- Story or review workflow logic unrelated to the help overlay
- `.context` schema changes

## Dependencies
- story-040
- story-041
- story-042

## Checklist
- [x] Replace the special README picker entry with a static Vazir quickstart/help entry in the command-help source
- [x] Write concise in-app quickstart markdown covering `/vazir-init`, `/plan`, `/implement`, and `/complete-story`
- [x] Add a short `.context/` folder guide with clear descriptions for `stories`, `reviews`, `memory`, `settings`, `intake`, and `archive`
- [x] Explicitly explain why `.context/intake/` matters and what kinds of planning inputs belong there
- [x] Remove file-path-dependent README lookup behavior from the Ctrl+? flow
- [x] Update regression/static validation so the quickstart entry is covered on fresh installs

## Issues
- None yet.

## Completion Summary
Replaced the Ctrl+? README picker entry with a built-in "Vazir quickstart" markdown view that always works without a project `README.md`. The new in-app guide covers `/vazir-init`, `/plan`, `/implement`, and `/complete-story`, explains each core `.context/` folder, and calls out why strong `.context/intake/` inputs improve planning. Removed the file-backed README lookup branch from the help flow, updated README help text to match, and refreshed static validation so fresh-install quickstart coverage is checked.
