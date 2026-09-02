# Story 083: Remove JJ from Vazir VCS integration

**Status:** not-started  
**Type:** feature  
**Created:** 2026-09-02  
**Last accessed:** 2026-09-02  
**Completed:** —

---

## Goal
Remove JJ as an active Vazir-supported VCS while retaining Git and Fossil support. Remove JJ detection, commands, settings choices, checkpoint/undo paths, diffs, setup messaging, and active documentation. Legacy `vcs_preference: "jj"` values resolve to `auto`; existing JJ metadata, checkpoint files, and historical records remain untouched. Git file-snapshot checkpoints remain available only for Git repositories.

## Verification
Run targeted VCS, tracker, setup, chrome, checkpoint, and aggregate validations. Confirm new setup and settings expose no JJ option, legacy JJ preferences resolve to automatic detection, Git checkpoints still work, Fossil has no checkpoint path, and no user-owned `.jj/` metadata is modified.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-helpers.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- `README.md`
- `scripts/run-validations.mts`
- `scripts/validate-vazir-vcs-settings.mts`
- `scripts/validate-vazir-fossil-footer.mts`
- `.context/stories/plan.md`
- `.context/stories/story-083.md`

## Out of scope — do not touch
- User-owned `.jj/` directories or JJ installations
- Historical `.context/` settings, checkpoint files, reviews, complaints, and documentation
- Fossil checkpoint implementation
- Git checkpoint snapshot behavior
- Product-plan and historical specification documents

## Dependencies
- None

---

## Checklist
- [ ] Remove JJ detection, command execution, checkpoint/undo, diff, and active state handling
- [ ] Restrict VCS settings and setup flows to supported modes and map legacy JJ preference to `auto`
- [ ] Preserve Git-only file-snapshot checkpoints and existing Fossil behavior
- [ ] Remove JJ from active footer/chrome, command help, README, and generated guidance
- [ ] Add regression coverage for supported modes, legacy settings, checkpoint behavior, and metadata preservation
- [ ] Register and run targeted validations through the aggregate runner

---

## Issues

---

## Completion Summary

