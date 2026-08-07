# Review Summary

**Last updated:** 2026-08-07T14:34:14Z

## Findings
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Conversational shorthand for a file-backed workflow must have an explicit handoff or instruction carrying the referenced file identity; do not rely on implicit UI state or model inference alone. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- Every entry point that can trigger recovery should have a representative regression test. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Every new targeted validation script must be registered in the aggregate runner so it is exercised alongside existing regressions. | count: 1 | status: tracked | sources: review-20260806-160724.md | stories: story-061
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Keep command descriptions synchronized with handler behavior; mismatched descriptions become misleading UI copy and fail code review. | count: 1 | status: tracked | sources: review-20260806-160724.md | stories: story-061
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Structural repair should restore the canonical document order, not only satisfy the validator. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Suspension resume should require an existing file with a verifiable content change, not mere absence. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- Validate command references before performing workflow side effects so rejected requests leave the workspace unchanged. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- When a shared helper has both a rich overlay path and a plain `select` fallback, regression tests should cover both paths because the fallback contains its own label-to-value mapping logic. | count: 1 | status: tracked | sources: review-20260806-163046.md | stories: story-062
- When a workflow has an automatic repair turn, preserve all completion metadata across the repair transition until the repaired output is verified. | count: 1 | status: tracked | sources: review-20260806-185203.md | stories: story-063
- When a workflow transition depends on both in-memory flags and persisted file frontmatter, centralize the transition in one shared helper so both state sources change together. | count: 1 | status: tracked | sources: review-20260606-141016.md | stories: story-056
- When adding lifecycle state machines that span multiple turns, add regression coverage for every intermediate state transition, not just the final outcome. | count: 1 | status: tracked | sources: review-20260606-141016.md | stories: story-056
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When repairing structured frontmatter, keep the repaired block contiguous and in the canonical template order. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
- When the same capture/write sequence appears in two command branches, extract a single helper so fixes (e.g., notification wording, no-overwrite behavior) apply everywhere. | count: 1 | status: tracked | sources: review-20260806-163046.md | stories: story-062
- When two lifecycle helpers differ only by target state container, extract a single parameterized implementation. | count: 1 | status: tracked | sources: review-20260805-190404.md | stories: story-060
