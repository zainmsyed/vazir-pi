# Story 014: `/vazir-init` version control system (VCS) repo-scan setup and active-mode settings

**Status:** complete  
**Created:** 2026-05-14
**Last accessed:** 2026-05-15  
**Completed:** 2026-05-15

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
- [x] Scan the repo during `/vazir-init` to detect whether Git and/or Fossil are already present
- [x] If neither is present, prompt the user to choose Git/JJ or Fossil and state the choice can be changed later in settings
- [x] If only Git is present, write Git/JJ as the active mode in settings and ask whether the user wants to enable JJ for checkpoints
- [x] If only Fossil is present, write Fossil as the active mode in settings and do not prompt for JJ
- [x] If both Git and Fossil are present, ask which one should be the active mode in settings
- [x] If Git/JJ is chosen, preserve Vazir's current Git/JJ setup behavior
- [x] If Fossil is chosen, run/use the Fossil setup path
- [x] Write the selected active mode into project settings
- [x] Ensure `.fossil-settings/ignore-glob` is created with sensible defaults when Fossil is configured (`.context/`, `node_modules/`, `.git/`, `.jj/`, `.fallow/`, common local junk, and common secret/certificate files such as `.env`, `.env.*`, `*.local`, `.local/`, `*.log`, `*.tmp`, `*.temp`, `*.swp`, `.DS_Store`, `Thumbs.db`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`)
- [x] Update init summary text to reflect the selected mode and the fact it can change later in settings
- [x] Make context/system guidance tell the agent to check settings for the active mode each time instead of assuming init made a permanent choice
- [x] Add validation coverage for no-version-control-system (VCS) choice flow, Git-only flow, Fossil-only flow, and both-present active-mode selection flow

---

## Issues
- None currently.

---

## Completion Summary
Implemented repo-scan-based version control system (VCS) setup in `/vazir-init`. Vazir now detects Git and Fossil repo state, chooses or adopts the active mode in project settings, asks Git-only repos whether to enable JJ checkpoints, keeps the existing Git/JJ setup flow when Git/JJ is selected, runs the Fossil setup path when Fossil is selected, ensures Fossil ignore defaults are present, injects prompt guidance that tells the agent to re-check settings for the active mode instead of assuming the original init choice is permanent, and adds validator coverage for the no-VCS choice flow plus Git-only, Fossil-only, and both-present selection flows.
