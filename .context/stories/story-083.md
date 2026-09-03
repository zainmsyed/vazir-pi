# Story 083: Remove JJ from Vazir VCS integration

**Status:** complete  
**Type:** feature  
**Created:** 2026-09-02  
**Last accessed:** 2026-09-03  
**Completed:** 2026-09-03

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
- `.pi/lib/vazir-vcs-helpers.ts` (deleted dead mirror)
- `README.md`
- `AGENTS.md` (VCS ownership description)
- `scripts/run-validations.mts`
- `scripts/validate-vazir-vcs-mirror-settings.mts`
- `scripts/validate-vazir-fossil-footer.mts`
- `scripts/validate-vazir-complete-story.mts`
- `scripts/validate-vazir-init.mts`
- `scripts/validate-vazir-status-chrome.mts`
- `scripts/validate-vazir-tracker-resolution.mts`
- `scripts/validate-vazir-git-checkpoints.mts` (added Git checkpoint regression coverage)
- `scripts/validate-vazir-checkpoint-labels.mts` (deleted JJ-only validation)
- `scripts/validate-vazir-jj-agent-run-checkpoints.mts` (deleted JJ-only validation)
- `scripts/validate-vazir-jj-exact-restore.mts` (deleted JJ-only validation)
- `scripts/validate-vazir-jj-milestones.mts` (deleted JJ-only validation)
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
- [x] Remove JJ detection, command execution, checkpoint/undo, diff, and active state handling
- [x] Restrict VCS settings and setup flows to supported modes and map legacy JJ preference to `auto`
- [x] Preserve Git-only file-snapshot checkpoints and existing Fossil behavior
- [x] Remove JJ from active footer/chrome, command help, README, and generated guidance
- [x] Add regression coverage for supported modes, legacy settings, checkpoint behavior, and metadata preservation
- [x] Register and run targeted validations through the aggregate runner

---

## Issues

- Scope expansions beyond the listed files, all required by the removal and recorded here: `scripts/validate-vazir-complete-story.mts` (jj colocated/restore scenarios rewritten as legacy-preference and direct file-state restore scenarios), `scripts/validate-vazir-init.mts`, `scripts/validate-vazir-status-chrome.mts`, `scripts/validate-vazir-tracker-resolution.mts`, and `scripts/validate-vazir-vcs-mirror-settings.mts` (assertions/types updated for the jj-free flows), `scripts/validate-vazir-checkpoint-labels.mts` deleted (jj-only), new `scripts/validate-vazir-git-checkpoints.mts` added (Git snapshot checkpoint regression coverage), and a one-line `AGENTS.md` accuracy fix (vcs.ts description no longer says Git/JJ).
- `.pi/lib/vazir-vcs-helpers.ts` was deleted: it was an unreferenced dead mirror of the jj checkpoint helpers (verified — no imports or loadFileModule references anywhere in `.pi/`, `scripts/`, or tests).
- Intentionally preserved: `.jj/` remains in PROTECTED_VCS_TARGETS, the VCS tool-guard patterns for `jj undo/abandon/init` (they protect user-owned jj metadata from destructive agent commands), and `.jj/` in the gitignore/fossil ignore-glob boilerplate (metadata protection, not jj support).
- Real-world smoke test in `/home/zain/Documents/coding/test` (fresh git repo with the installed vazir layout, byte-identical to local `.pi/`): real headless Pi sessions confirmed `/vazir-init` writes git/git settings with zero jujutsu references, pre-seeded legacy `vcs_preference: "jj"` + `/vcs-settings jj` persisted `auto`/`git`, and edit-tool writes produced real snapshot checkpoints with pre-edit content under `.context/checkpoints/<session>/1/files/`. The interactive `/reset` picker could not be exercised headless (requires a TTY; multi-prompt and pinned-session-id runs still isolate sessions) — restore mechanics are covered by `validate-vazir-git-checkpoints.mts` instead. Residual gap: one manual interactive `/reset` check in the test folder is recommended before relying on the restore UI.

---

## Completion Summary
Removed JJ as an active Vazir-supported VCS while retaining Git and Fossil. Deleted `detectJJ` and all jj command execution: the vazir-init JJ setup flow and prompts, the `/vcs-settings` jj paths (`activateGitOrJjMode`, jj picker entry, jj argument), the tracker jj checkpoint/undo system (agent-run checkpoints, milestones, op-log labels, describe), jj diff and jj restore paths, and the chrome/footer jj flag, glyph, and help text. `VcsKind` is now `"none" | "git" | "fossil"` everywhere. Legacy `vcs_preference: "jj"` resolves to `auto` in `readActiveVcsMode` (detection-based) and the `/vcs-settings jj` argument maps to auto with an announcement. Git file-snapshot checkpoints are untouched and gained direct regression coverage in the new `validate-vazir-git-checkpoints.mts`; Fossil behavior unchanged. New setup/settings expose no JJ option (asserted in init and mirror-settings validations); README, settings README, and command help are jj-free. User-owned `.jj/` metadata was not touched — protection guardrails remain. The three jj validators plus `validate-vazir-checkpoint-labels.mts` were removed from the runner and deleted. Targeted validations (init, status-chrome, tracker-resolution, mirror-settings, tool-guard, safety-policy, critical-helpers, fossil-footer, complete-story, git-checkpoints) pass, and the aggregate suite is green (exit 0) in the Herdr test tab.

