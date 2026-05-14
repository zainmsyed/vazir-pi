# Story 014: `/vazir-init` Fossil bootstrap parity

**Status:** in-progress  
**Created:** 2026-05-14
**Last accessed:** 2026-05-14  
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
- [x] Detect `fossil` binary presence at `/vazir-init` time (probe `fossil version`)
- [x] Redesign VCS prompt as a multi-option select: Git + JJ / Fossil / Skip VCS
- [x] If Fossil chosen: run `fossil init` for new repo, or prompt for remote URL then `fossil clone` + `fossil open -f`
- [x] Write `"vcs_preference": "fossil"` into `.context/settings/project.json` during init
- [x] Ensure `.fossil-settings/ignore-glob` is created with sensible defaults (`.context/`, `node_modules/`, `.git/`, `.jj/`)
- [x] Update init summary checklist to mention Fossil when selected
- [x] Add validation scenario in `scripts/validate-vazir-init.mts` for Fossil bootstrap path

---

## Issues

---

## Completion Summary

Implemented Fossil bootstrap parity in `/vazir-init`.

**index.ts changes:**
- Replaced the binary Git-only VCS prompt with a multi-option select that detects all available VCS binaries (git, jj, fossil) and offers relevant choices.
- If no VCS exists and fossil is available, the prompt includes "Fossil — initialise a fossil repo" alongside "Git + JJ" and "Skip VCS".
- Fossil path: prompts for local vs remote, runs `fossil init` or `fossil clone`, then `fossil open -f` to handle non-empty project directories. Writes `vcs_preference: "fossil"` to `project.json`.
- Git path: runs `git init` as before, then JJ setup. Does not write a hard `vcs_preference` so auto-detection can still prefer JJ when colocated.
- Skip path: writes `vcs_preference: "none"` to record the explicit choice.
- When an existing VCS is detected at init time (git or fossil already present), the preference is written to match the detected system without prompting.
- Added `.fossil-settings/ignore-glob` creation with sensible defaults covering node_modules, .git, .jj, .context, .fslckout, _FOSSIL_, and *.fossil.
- Added `.fslckout`, `_FOSSIL_`, and `*.fossil` to `.gitignore` when fossil is selected.
- Updated `buildInitSummary` call to use generic `vcsLine`/`vcsDetailLine` variables so the summary correctly shows Fossil, Git, JJ, or skipped status.

**helpers.ts changes:**
- Renamed `buildInitSummary` parameters from `jjLine`/`jjDetailLine` to `vcsLine`/`vcsDetailLine` for semantic accuracy; no functional change.

**Validation updates:**
- Updated `scripts/validate-vazir-init.mts` test choices to match the new prompt strings.
- Added `runFossilBootstrapScenario` that asserts `.fslckout` creation, `.fossil-settings/ignore-glob` content, `vcs_preference: "fossil"` in `project.json`, fossil artifacts in `.gitignore`, and Fossil mention in the init summary.
- Updated `scripts/validate-vazir-status-chrome.mts` init-refresh scenario choices to match the new VCS prompt.

All automated validations pass.

