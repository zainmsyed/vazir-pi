# Review Summary

**Last updated:** 2026-05-15T00:55:56Z

## Findings
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Heuristic extractors and scope-detection logic should have automated regression tests because they are easy to break with small regex changes. | count: 1 | status: tracked | sources: review-20260505-211824.md | stories: story-001
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- New regression tests must be wired into the project's normal validation command before being considered complete. | count: 1 | status: tracked | sources: review-20260505-221730.md | stories: story-001
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- When adding conditional template/instruction injection, add automated positive and negative harness tests for each branch. | count: 1 | status: tracked | sources: review-20260505-235339.md | stories: story-004
- When adding story-dependent prompt/context injection, add automated positive and negative harness tests for each story type branch. | count: 1 | status: tracked | sources: review-20260505-224448.md | stories: story-002
- When fixing ambiguous regex extraction, prefer section-scoped parsing over deleting useful fallback labels. | count: 1 | status: tracked | sources: review-20260505-221730.md | stories: story-001
- When writing heuristic text extractors with regex, anchor capture groups to the current line to avoid swallowing downstream content. | count: 1 | status: tracked | sources: review-20260505-211824.md | stories: story-001
