# Review Summary

**Last updated:** 2026-05-26T14:01:51Z

## Findings
- Add regression coverage for both repo-root and nested-directory execution whenever repository detection drives command routing. | count: 1 | status: tracked | sources: review-20260518-124246.md
- After extracting a module, remove imports that are now only consumed by the extracted file. | count: 1 | status: tracked | sources: review-20260526-104812.md | stories: story-025
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Always verify runtime capability flags before returning a mode or state label; preference settings are intent, not proof of readiness. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Every persisted workflow phase needs a restart test that proves rerunning the command resumes that exact phase instead of restarting from an earlier prompt. | count: 1 | status: tracked | sources: review-20260526-004914.md | stories: story-026
- Every state-machine or guardrail helper that blocks or auto-approves user-facing actions must have at least one direct unit test exercising both the allow and deny paths. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Never hardcode story labels or temporal identifiers in reusable command handlers; always derive them from runtime state. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Regression tests should exercise the primary code path, not just the legacy fallback. | count: 1 | status: tracked | sources: review-20260526-121611.md | stories: story-026
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Substring-based approval detection must guard against negation prefixes; use word-boundary regexes or explicit allow-list tokens rather than naive `includes()`. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When a checklist calls for coverage "across" a set of states, verify more than one representative state. | count: 1 | status: tracked | sources: review-20260526-121611.md | stories: story-026
- When a story scope names concrete destination files, create those files or revise the story scope before review/closeout. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When a workflow persists an intermediate closeout artifact, `/complete-story` must check for it and resume that phase before offering a fresh closeout prompt. | count: 1 | status: tracked | sources: review-20260526-004914.md | stories: story-026
- When adding or tightening VCS detection, validate extension behavior from both the repo root and a nested project directory. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When an extracted workflow changes when story frontmatter is written, re-run the full lifecycle including any status-guard snapshots so user-approved transitions are not mistaken for unsolicited agent changes. | count: 1 | status: tracked | sources: review-20260526-000311.md | stories: story-025
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When generating numbered requirement lists in instruction builders, scan for duplicate ordinals before committing. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When parsing VCS status output, include rename/move states explicitly; they are common and silently dropping them creates UI gaps. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When tracking async tool lifecycle, correlate start and end events with a unique call identifier, not just the tool name. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When validating tool input for security, always check every documented alias of a target field (`path` / `filePath`), not just the primary one. | count: 1 | status: tracked | sources: review-20260518-145628.md
