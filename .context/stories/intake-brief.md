# Intake Brief

**Last updated:** 2026-05-27

## Planning brief
Fix git commit bypass when `vcs_preference` is set to `jj` in colocated repos. In `.pi/extensions/vazir-context/helpers.ts`, the `commitStoryCloseChanges` function has a bug inside the `activeMode === "git"` branch: it checks `vcsPreference === "jj"` and `detectJJ(cwd)`, and if both are true, it runs `jj describe -m message` instead of `git commit`. `jj describe` changes the description of the working commit but does not create a git commit. In a colocated git+jj repo, this means the user chooses "commit all" and nothing appears to happen — files remain uncommitted from git's perspective.

Root cause: `vcs_preference` is overriding the commit operation. `vcs_preference` should control display/checkpoints only; `active_vcs_mode` should own the commit path.

Required changes:
1. In `.pi/extensions/vazir-context/helpers.ts`, remove the `vcsPreference === "jj"` bypass block from inside `activeMode === "git"` in `commitStoryCloseChanges`. When `activeMode === "git"`, always run `git add -A && git commit`.
2. Remove the `detectJJ(cwd)` fallback commit path that runs `jj describe` after the `activeMode === "fossil"` block, since commits should only be git or fossil.
3. In `.pi/extensions/vazir-tracker/index.ts`, remove the dead duplicate `if (vcsPreference === "jj" && useJJ) return "jj"` line in `resolvePreferredVcsKind`.

Constraints:
- Do not touch the Fossil commit path.
- Do not touch the JJ install/setup flow in `/vazir-init` or `/vcs-settings`.
- Do not change footer display logic or JJ checkpoint/undo behavior.
- Keep story checklist to at most 7 items.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md (13039 bytes)
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md (12436 bytes)

## Distilled notes
### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md
Design system context addendum — `.context/design/` folder, UI story detection, lazy seeding, `/design` command, design compliance in `/review`. Not directly relevant to this VCS commit fix.

### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md
Enhanced consolidation addendum — story-close mini-consolidate, Fallow recurrence tracking, positive pattern capture. Not directly relevant to this VCS commit fix.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
