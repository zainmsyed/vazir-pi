# Intake Brief

**Last updated:** 2026-09-03

## Planning brief
idea 8 — add a terminal-safe `/help` command alias for Pi's existing `Ctrl+?` help experience

## Source files
- .context/intake/prd/vazir-product-plan.md (10905 bytes)
- .context/intake/references/amanah-authorized-process-threat-model.md (6433 bytes)

## Distilled notes
### .context/intake/prd/vazir-product-plan.md
Large file (10905 bytes). Read enough of it to extract evidence for every planning field before asking questions.

### .context/intake/references/amanah-authorized-process-threat-model.md
Large file (6433 bytes). Read enough of it to extract evidence for every planning field before asking questions.

## Final distilled answers
- Users: Vazir/Pi terminal users, especially users whose terminal swallows or cannot deliver `Ctrl+?`.
- V1: Add `/help` as a direct command alias for the exact existing `Ctrl+?` help behavior.
- Do not build: new help content, a second renderer, search, categories, documentation links, alternate interaction behavior, GUI help, or unrelated shortcut changes.
- Existing stack: Vazir extensions on Pi; reuse Pi's current help implementation and command-registration API.
- Acceptance: `/help` opens the same help UI and preserves the same dismissal/selection behavior; targeted, aggregate, and interactive validation cover the alias.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
