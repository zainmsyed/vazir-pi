# Intake Brief

**Last updated:** 2026-06-02

## Planning brief
Plan a new Vazir feature for Fossil + Git mirror awareness. Goal: Add an optional VCS settings feature for repositories where Fossil is the active/canonical VCS and Git exists as a public mirror (for example, GitHub). Vazir should understand this workflow without assuming it automatically from dual detection alone. Requirements: - Keep one explicit active VCS mode for real workflow operations (`fossil`, `git`, or `jj`) - Add a separate optional mirror-related setting under VCS settings - The setting should be explicit/user-declared, not inferred solely from detecting both Fossil and Git metadata - Primary target workflow is: Fossil is canonical, Git is a mirror - Vazir should use Fossil for story/checkpoint/diff/reset/restore/workflow behavior when Fossil is active - Git mirror mode should be informational/guidance-focused, not automatic sync - Do not auto-push, auto-export, auto-switch VCS mode, or assume the mirror is current - Vazir may show status hints/warnings when mirror mode is enabled and Git metadata is present/missing - Consider whether a future assisted command like `/vcs-mirror-sync` should be planned now or deferred - Mixed VCS detection should improve UX and clarity, but should not change behavior unless settings explicitly opt in - Preserve existing VCS safety/guardrail behavior Please produce: 1. A short problem statement 2. A recommended settings/schema design 3. Expected UX behavior in footer/status/settings/prompts 4. Command behavior changes, if any 5. Edge cases and safety constraints 6. A small implementation plan with concrete tasks 7. Whether mirror sync should be in scope now or deferred to a follow-up story Keep the checklist to 7 tasks or fewer.

## Final distilled answers
- **Users:** Vazir users working in mixed-VCS repos where Fossil is the canonical workflow repo and Git exists as a public or compatibility mirror.
- **Most important thing to get right in v1:** Clear, explicit configuration and UX that keeps Fossil authoritative for workflow actions while explaining the presence of a Git mirror without changing behavior implicitly.
- **Explicitly not building in v1:** No automatic sync, export, push, mode switching, or mirror freshness guarantees; no `/vcs-mirror-sync` command yet.
- **Default scope assumption:** v1 targets the common `fossil -> git mirror` workflow first, while keeping the settings model clean enough to extend later.
- **Safety constraints:** Preserve existing VCS safety/guardrail behavior and do not let dual detection alone alter command routing or destructive behavior.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md (12100 bytes)

## Distilled notes
### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md
Large file (12100 bytes). Read enough of it to extract evidence for every planning field before asking questions.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
