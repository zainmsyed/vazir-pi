# Story 042: Rewrite README.md as a quickstart guide

**Status:** complete  
**Created:** 2026-05-30
**Last accessed:** 2026-05-30  

---

## Goal
Rewrite the root README.md as a concise user-facing quickstart guide centered on the `/plan` → `/implement` → `/complete-story` workflow, with setup, first run, and common next steps.

## Verification
Read the rewritten README.md and confirm it presents a clear quickstart workflow, includes all core commands, and renders correctly as markdown.

## Scope — files this story may touch
- `README.md`

## Out of scope — do not touch
- Any code or extension files
- `.context` file schemas
- Adding new commands

## Dependencies
- —

## Checklist
- [x] Draft quickstart structure: install, init, plan, implement, complete
- [x] Write concise workflow walkthrough with example commands
- [x] Add command reference section with short descriptions
- [x] Keep prerequisites and project layout sections trimmed and relevant
- [x] Remove outdated or redundant content (old jj examples, stale file paths)
- [x] Validate markdown renders correctly

## Issues
- None.

## Completion Summary
Rewrote `README.md` as a concise quickstart guide centered on the `/plan` → `/implement` → `/complete-story` workflow. Review closeout completed with three findings remediated.

- Replaced the old multi-section README with a streamlined guide: prerequisites, 4-step quickstart workflow, common next steps, full command reference table, trimmed project layout, and brief working rules.
- Removed outdated jj-specific checkpoint examples (Vazir now handles VCS via `/vcs-settings` and `/checkpoint`).
- Removed stale paths like `.pi/extensions/vazir-context.ts` and `.pi/extensions/vazir-tracker.ts`; updated to current directory structure.
- Added a 17-command reference table matching the current `VAZIR_COMMAND_DOCS` registry.
- Added a note about **Ctrl+?** for the interactive command list.
- Validated markdown structure: proper headings, fenced code blocks, table syntax, and list formatting.
- **Review remediation:** Added `README.md` as a selectable item in the Ctrl+? help overlay; hardened the file-read path with try/catch; added static validation checks for the README sentinel and guard.
