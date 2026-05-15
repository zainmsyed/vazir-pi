# Story 014: `/vazir-init` version control system (VCS) repo-scan setup and active-mode settings

**Status:** in-progress  
**Created:** 2026-05-14
**Last accessed:** 2026-05-14  
**Completed:** —

---

## Goal
Update `/vazir-init` so Vazir scans the repo for Git and Fossil state, treats Git/JJ and Fossil as the only user-facing version control system (VCS) modes, and writes the active choice into settings. If one mode is already present in the repo, Vazir should adopt it in settings. If only Git is present, Vazir should also ask whether the user wants to enable JJ for checkpoints. If both Git and Fossil are present, Vazir should ask which one should be active. If neither is present, `/vazir-init` should offer Git/JJ or Fossil and make clear the choice is not permanent because the user can change the active mode later in settings. Prompt/context behavior should not hardcode one VCS choice; it should always tell the agent to check settings again because the active mode can change over time.

## Verification
- In a fresh project with neither `.git` nor `.fslckout`, `/vazir-init` offers Git/JJ or Fossil and explains the choice can be changed later in settings.
- If the user chooses Git/JJ, Vazir initializes Git and follows the current JJ setup flow.
- If the user chooses Fossil, Vazir runs the Fossil bootstrap flow, including ignore-glob setup.
- In a repo with Git already present and no Fossil checkout, `/vazir-init` writes Git/JJ as the active mode in settings and asks whether the user wants to enable JJ for checkpoints.
- In a repo with Fossil already present and no Git repo, `/vazir-init` writes Fossil as the active mode in settings and does not prompt for JJ.
- In a repo with both Git and Fossil present, `/vazir-init` asks which one should be the active mode in settings.
- The active mode written to settings is the source of truth for later Vazir behavior.
- Context/system guidance tells the agent to check settings for the current active mode rather than assuming the init choice is still current.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/lib/vazir-helpers.ts`

## Out of scope — do not touch
- Footer rendering logic itself
- `/review` Fallow Fossil bridge (already works)
- Full settings-command UX and switching flow (story-015)

## Dependencies
- —

---

## Checklist
- [ ] Scan the repo during `/vazir-init` to detect whether Git and/or Fossil are already present
- [ ] If neither is present, prompt the user to choose Git/JJ or Fossil and state the choice can be changed later in settings
- [ ] If only Git is present, write Git/JJ as the active mode in settings and ask whether the user wants to enable JJ for checkpoints
- [ ] If only Fossil is present, write Fossil as the active mode in settings and do not prompt for JJ
- [ ] If both Git and Fossil are present, ask which one should be the active mode in settings
- [ ] If Git/JJ is chosen, preserve Vazir's current Git/JJ setup behavior
- [ ] If Fossil is chosen, run/use the Fossil setup path
- [ ] Write the selected active mode into project settings
- [ ] Ensure `.fossil-settings/ignore-glob` is created with sensible defaults when Fossil is configured (`.context/`, `node_modules/`, `.git/`, `.jj/`)
- [ ] Update init summary text to reflect the selected mode and the fact it can change later in settings
- [ ] Make context/system guidance tell the agent to check settings for the active mode each time instead of assuming init made a permanent choice
- [ ] Add validation coverage for no-version-control-system (VCS) choice flow, Git-only flow, Fossil-only flow, and both-present active-mode selection flow

---

## Issues

---

## Completion Summary
