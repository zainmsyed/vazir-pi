# Review Summary

**Last updated:** 2026-08-06T19:41:06Z

## Findings
- `/plan` instructions must enumerate every formatting invariant that downstream story-file validators enforce. | count: 1 | status: tracked | sources: review-20260724-001406.md | stories: story-059
- Add regression coverage for both repo-root and nested-directory execution whenever repository detection drives command routing. | count: 1 | status: tracked | sources: review-20260518-124246.md
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Always verify runtime capability flags before returning a mode or state label; preference settings are intent, not proof of readiness. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Conversational shorthand for a file-backed workflow must have an explicit handoff or instruction carrying the referenced file identity; do not rely on implicit UI state or model inference alone. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Every entry point that can trigger recovery should have a representative regression test. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Every new targeted validation script must be registered in the aggregate runner so it is exercised alongside existing regressions. | count: 1 | status: tracked | sources: review-20260806-160724.md | stories: story-061
- Every state-machine or guardrail helper that blocks or auto-approves user-facing actions must have at least one direct unit test exercising both the allow and deny paths. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Keep command descriptions synchronized with handler behavior; mismatched descriptions become misleading UI copy and fail code review. | count: 1 | status: tracked | sources: review-20260806-160724.md | stories: story-061
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Never hardcode story labels or temporal identifiers in reusable command handlers; always derive them from runtime state. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Structural repair should restore the canonical document order, not only satisfy the validator. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Substring-based approval detection must guard against negation prefixes; use word-boundary regexes or explicit allow-list tokens rather than naive `includes()`. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Suspension resume should require an existing file with a verifiable content change, not mere absence. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Validate command references before performing workflow side effects so rejected requests leave the workspace unchanged. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- When a shared helper has both a rich overlay path and a plain `select` fallback, regression tests should cover both paths because the fallback contains its own label-to-value mapping logic. | count: 1 | status: tracked | sources: review-20260806-163046.md | stories: story-062
- When a story scope names concrete destination files, create those files or revise the story scope before review/closeout. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When a workflow has an automatic repair turn, preserve all completion metadata across the repair transition until the repaired output is verified. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- When a workflow transition depends on both in-memory flags and persisted file frontmatter, centralize the transition in one shared helper so both state sources change together. | count: 1 | status: tracked | sources: review-20260606-141016.md | stories: story-056
- When adding lifecycle state machines that span multiple turns, add regression coverage for every intermediate state transition, not just the final outcome. | count: 1 | status: tracked | sources: review-20260606-141016.md | stories: story-056
- When adding or tightening VCS detection, validate extension behavior from both the repo root and a nested project directory. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When generating numbered requirement lists in instruction builders, scan for duplicate ordinals before committing. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When parsing VCS status output, include rename/move states explicitly; they are common and silently dropping them creates UI gaps. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When repairing structured frontmatter, keep the repaired block contiguous and in the canonical template order. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- When the same capture/write sequence appears in two command branches, extract a single helper so fixes (e.g., notification wording, no-overwrite behavior) apply everywhere. | count: 1 | status: tracked | sources: review-20260806-163046.md | stories: story-062
- When tracking async tool lifecycle, correlate start and end events with a unique call identifier, not just the tool name. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When two lifecycle helpers differ only by target state container, extract a single parameterized implementation. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- When validating tool input for security, always check every documented alias of a target field (`path` / `filePath`), not just the primary one. | count: 1 | status: tracked | sources: review-20260518-145628.md
