# Review Summary

**Last updated:** 2026-08-27T17:18:21Z

## Findings
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Do not silently swallow exceptions from structural persistence operations; surface a warning when tracking or recovery state cannot be verified. | count: 1 | status: tracked | sources: review-20260810-222500.md
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Optional external-tool validations should report explicit skips and be required separately in a tool-enabled validation environment. | count: 1 | status: tracked | sources: review-20260808-004221.md | stories: story-068
- Regression tests for retry logic should force the initial attempt to fail and independently verify the recovery attempt, rather than only testing the already-recovered final state. | count: 1 | status: tracked | sources: review-20260808-000002.md | stories: story-066
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When generating bounded cyclic candidates, normalize modulo results so negative starting offsets cannot escape the committed range. | count: 1 | status: tracked | sources: review-20260808-000002.md | stories: story-066
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When validating numeric configuration ranges, test both accepted boundaries and representative invalid values just outside each boundary. | count: 1 | status: tracked | sources: review-20260808-002805.md | stories: story-067
