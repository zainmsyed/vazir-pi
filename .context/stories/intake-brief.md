# Intake Brief

**Last updated:** 2026-05-05

## Planning brief
Implement Vazir POC Addenda C and D: design system context layer (.context/design/) and enhanced two-tier consolidation (story-close mini-consolidate + manual /consolidate improvements).

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md (13039 bytes)
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md (12436 bytes)

## Distilled notes

### Addendum C — Design system context
- New `.context/design/` folder with three files: `design-system.md` (injected for UI stories, 300-token soft cap), `brand.md` (read on demand), `components.md` (living registry, read on demand).
- UI story detection via scope-path extensions: `.tsx`, `.jsx`, `.css`, `.scss`, `.html`, `.svelte`. `.ts` excluded. Optional `Type: ui` frontmatter override.
- `/plan` gains silent design seeding pass from `.context/intake/references/` text files only (no vision analysis). Empty stubs if nothing found.
- First UI story triggers lazy question flow for missing design tokens (primary colour, font, visual style, hard constraints).
- `/design` command presents summary and applies user-described updates; warns and proposes trim if over 300 tokens.
- Design compliance checklist appended to `/review` files for UI stories.

### Addendum D — Enhanced consolidation
- Two-tier model: automatic story-close mini-consolidate at `/complete-story` + unchanged manual `/consolidate` trigger.
- Mini-consolidate reads story issues, review findings, and Fallow output; proposes rule candidates with confidence levels; user approves/skips/selects; promotes to `system.md ## Learned Rules` with provenance tags.
- Fallow recurrence tracking: Fallow findings appended to `complaints-log.md` with `[fallow]` tag. Deduplicated per story. At 3 occurrences across different stories, graduates to promotion candidate.
- Enhanced manual `/consolidate` gains inputs: story completion summaries, `.context/decisions.md`, rule confidence adjustment. Low-confidence rules flagged after N stories with no signal.
- Positive pattern capture: success-derived rules promoted to `### From successes` subsection; failure-derived rules to `### From failures`.

## Safe assumptions
- Fallow (Addendum B) is not in scope for this plan; Addendum D code will look for Fallow findings in review files but gracefully handle their absence.
- Token counting for the 300-token cap will use approximate word-based heuristics; the agent warns and proposes rather than hard-truncating.
- `.context/decisions.md` is read opportunistically if present; no new file creation required.
- Vision analysis for image intake is explicitly out of scope per Addendum C.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
