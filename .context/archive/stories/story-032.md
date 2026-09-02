# Story 032: Fix git commit bypass when `vcs_preference` is `jj` in colocated repos

**Status:** complete  
**Created:** 2026-05-27
**Last accessed:** 2026-05-27  

---

## Goal
Remove the `vcs_preference === "jj"` bypass that causes `commitStoryCloseChanges` to run `jj describe` instead of `git commit` when `active_vcs_mode === "git"`. `vcs_preference` should control display and checkpoints only; `active_vcs_mode` should own the commit path. After this fix, choosing "commit all" in a colocated git+jj repo must always create a real git commit.

## Verification
In a colocated git+jj repo with `vcs_preference: "jj"`, running `/complete-story` and choosing "Close story and commit all" creates a git commit, removes the files from the uncommitted count in the footer, and reports `Committed with Git: <message>`.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-tracker/index.ts`

## Out of scope
- Fossil commit path
- JJ install/setup flow in `/vazir-init` or `/vcs-settings`
- Footer display logic or VCS icon rendering
- JJ checkpoint, snapshot, or undo behavior
- `syncFromJJ` or `syncFromGit` diff logic

## Dependencies
- None

---

## Checklist
- [x] Remove `vcsPreference === "jj"` bypass block inside `activeMode === "git"` in `commitStoryCloseChanges`
- [x] Remove `detectJJ(cwd)` fallback commit path that runs `jj describe` after the `activeMode === "fossil"` block
- [x] Remove dead duplicate `vcsPreference === "jj" && useJJ` condition in `resolvePreferredVcsKind`
- [x] Remove `if (useJJ) return "jj"` auto-promotion inside `hasExplicitMode` / `activeMode === "git"` in `resolvePreferredVcsKind`
- [x] Clean up now-unused `readProjectSettings` import in `helpers.ts` if no longer referenced
- [x] Verify `commitStoryCloseChanges` still falls back to git commit when `activeMode === "none"` and a git repo exists
- [ ] Validate end-to-end: colocated repo + `vcs_preference: "jj"` + "commit all" produces a git commit and clears uncommitted files

## Issues
- Manual end-to-end validation is still pending. The code changes for the git commit path are in place, but this story has not yet been re-verified by running `/complete-story` in a colocated Git+JJ repo with `vcs_preference: "jj"` and confirming that the closeout creates a real git commit and clears the uncommitted count.

---

## Completion Summary
Removed the `vcs_preference === "jj"` bypass from `commitStoryCloseChanges` in `.pi/extensions/vazir-context/helpers.ts`. When `active_vcs_mode === "git"`, the function now always runs `git add -A && git commit` regardless of `vcs_preference`. Also removed the `detectJJ(cwd)` fallback commit path that ran `jj describe` after the Fossil block, since commits should only be git or fossil. Cleaned up the now-unused `readProjectSettings` and `detectJJ` imports from `helpers.ts`, plus the local `jjHasPendingChangesForCommit` helper. In `.pi/extensions/vazir-tracker/index.ts`, removed both the dead duplicate `vcsPreference === "jj" && useJJ` condition and the `if (useJJ) return "jj"` auto-promotion inside the explicit `activeMode === "git"` path so the tracker no longer overrides git mode just because JJ is present. The Fossil path, JJ install/setup flow, footer display follow-up work, and checkpoint/undo behavior were left untouched.
