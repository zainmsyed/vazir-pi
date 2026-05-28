# Intake Brief

**Last updated:** 2026-05-27

## Planning brief
The `/plan` command handler currently batches all surviving Phase 1 questions into a single turn. The intended behavior is to ask them one at a time, waiting for the user’s full answer before the next question, and only proceeding to Phase 2 after all questions are answered or explicitly skipped.

Addenda C and D define the design-system context layer (`.context/design/`, UI story detection, `/design` command, design compliance in `/review`) and the enhanced consolidation system (story-close mini-consolidate, Fallow recurrence tracking, positive patterns, rule confidence scoring). Both addenda are already implemented in the active story files.

Remaining work consists of:
1. Fixing the `/plan` question flow so it asks one question at a time.
2. Completing the pending manual end-to-end validations for the VCS commit and footer fixes delivered in stories 032 and 033.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md (13039 bytes)
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md (12436 bytes)

## Distilled notes
### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md
Design system context: `.context/design/` folder with `design-system.md`, `brand.md`, `components.md`. UI story detection via scope-path extensions (`.tsx`, `.jsx`, `.css`, `.scss`, `.html`, `.svelte`) or explicit `Type: ui` frontmatter. Silent seeding during `/plan`. Lazy surface-level questions on first UI story when design-system.md is empty. `/design` update command with 300-token soft cap and trim priority. Design compliance checklist in `/review` for UI stories.

### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md
Two-tier consolidation: automatic story-close mini-consolidate at `/complete-story` and manual `/consolidate`. Mini-consolidate reads story issues, review findings, and Fallow output; proposes rule candidates with confidence; user approves/skips/selects. Fallow recurrence tracking in `complaints-log.md` with deduplication and 3-story threshold. Enhanced manual `/consolidate` reads completion summaries and decisions for positive patterns. Rule confidence scoring and `### From failures` / `### From successes` subsections in `system.md`.

## Assumptions
- The `/plan` fix is a targeted behavioral change to the existing handler, not a redesign of Phase 1 analysis logic.
- End-to-end validation stories assume the code fixes from stories 032 and 033 are correct; if live validation reveals regressions, those are fixed within the validation story scope rather than spawning additional stories.
- No new Addenda C/D features are needed beyond what is already implemented.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
