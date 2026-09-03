# Intake Brief

**Last updated:** 2026-09-02

## Planning brief
Plan idea-007 as two removal stories: remove Vazir’s Fallow review integration and remove Vazir’s JJ VCS integration while preserving all historical data.

## Source files
- .context/intake/prd/vazir-product-plan.md (10905 bytes)
- .context/intake/references/amanah-authorized-process-threat-model.md (6433 bytes)

## Distilled notes
### User decisions
- Remove Fallow from active Vazir reviews, `/complete-story`, review templates, and installation prompts.
- New reviews are always LLM-only; remove the static-analysis field entirely.
- Remove JJ completely from active Vazir support: detection, settings, setup, checkpoints, undo, diffs, chrome, help, and documentation.
- Legacy `vcs_preference: "jj"` resolves to `auto`.
- Keep Git’s existing `.context/checkpoints/` file-snapshot integration unchanged.
- Checkpoints remain Git-only; do not add checkpoint support for Fossil.
- Preserve all historical data and records, including Fallow findings, JJ settings/checkpoints, reviews, complaints, and documentation.
- Leave user-owned `.jj/` metadata, JJ installations, Fallow configuration, and project dependencies untouched.
- Split the work into story-082 (Fallow) and story-083 (JJ).

### .context/intake/prd/vazir-product-plan.md
The product plan requires broad current command and workflow parity, including VCS and review behavior. The user’s explicit decision for this replan supersedes that broad parity direction for Fallow and JJ: active Vazir support is intentionally reduced to LLM-only reviews and Git/Fossil VCS support.

### .context/intake/references/amanah-authorized-process-threat-model.md
No direct feature requirements apply. Preserve Vazir’s existing approval, protected-target, and secret-safe behavior while removing the integrations.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Preserve historical `.context/` data; do not rewrite or delete old records as part of this feature.
