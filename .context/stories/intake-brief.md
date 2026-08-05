# Intake Brief

**Last updated:** 2026-08-05

## Planning brief
Harden the review closeout loop when an existing review document does not match Vazir's canonical template. Validate key structural invariants deterministically, repair the same document in place only when needed, preserve all findings and checklist state without rerunning review analysis, and ensure Escape or leave-review suspends repeated prompting until explicit resume or a meaningful file change.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md (12100 bytes)

## Distilled notes
### Current review-loop hardening decision
- Never create a replacement review document during structural recovery.
- Use Vazir's existing review template and parser expectations for a zero-token validation pass.
- Repair only structural mismatches in the existing file; preserve findings, recommendations, and checked state.
- Do not rerun review analysis as part of repair.
- Make Escape and explicit leave actions persistently suspend the loop rather than merely dismissing the current overlay.
- Bound repair attempts and warn once if deterministic repair cannot safely produce a valid document.

### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md
Large file (12100 bytes). Read enough of it to extract evidence for every planning field before asking questions.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
