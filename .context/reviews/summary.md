# Review Summary

**Last updated:** 2026-05-13T02:23:55Z

## Findings
- Add regression coverage for developer-tooling workflows that depend on filesystem events. | count: 1 | status: tracked | sources: review-20260511-130421.md
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Do not label local dirty state as remote sync state unless the code actually measures remote divergence. | count: 1 | status: tracked | sources: review-20260512-201502.md
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Optional tool integrations need portable test behavior; validate features when the tool exists, but skip cleanly when it does not. | count: 1 | status: tracked | sources: review-20260512-201502.md
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- When adding a new VCS mode, update every command path that shells out to a VCS-specific tool, not just the status/footer layer. | count: 1 | status: tracked | sources: review-20260512-201502.md
- When adding conditional template/instruction injection, add automated positive and negative harness tests for each branch. | count: 1 | status: tracked | sources: review-20260505-235339.md | stories: story-004
- When adding story-dependent prompt/context injection, add automated positive and negative harness tests for each story type branch. | count: 1 | status: tracked | sources: review-20260505-224448.md | stories: story-002
- When prompt text is part of a validated workflow contract, update the prompt, tests, and spec in the same change. | count: 1 | status: tracked | sources: review-20260511-130421.md
- When watching a source tree, cover the actual nested directories the feature uses, not just the top-level folder. | count: 1 | status: tracked | sources: review-20260511-130421.md
