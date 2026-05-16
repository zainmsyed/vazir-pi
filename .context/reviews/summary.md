# Review Summary

**Last updated:** 2026-05-16T12:26:05Z

## Findings
- Add extension-level validation whenever new safety logic is wired into a live event interception path, not just helper-level unit checks. | count: 1 | status: tracked | sources: review-20260515-160336.md | stories: story-017
- Add one validation per supported VCS mode and per protected decision branch whenever closeout behavior depends on persisted VCS mode or commit-policy prompts. | count: 1 | status: tracked | sources: review-20260515-191433.md | stories: story-018
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Extract repeated closeout sequences into a single helper to prevent drift | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Heuristic extractors and scope-detection logic should have automated regression tests because they are easy to break with small regex changes. | count: 1 | status: tracked | sources: review-20260505-211824.md | stories: story-001
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Multi-turn deferred closeouts need a timeout or retry fallback so the story does not hang indefinitely | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- New closeout flows need coverage for both happy paths and edge paths (skip, empty, non-interactive) | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- New regression tests must be wired into the project's normal validation command before being considered complete. | count: 1 | status: tracked | sources: review-20260505-221730.md | stories: story-001
- Picker prompt text should match the actual option count so the user is not confused | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- Prefer shared prompt-policy builders, but avoid injecting the same policy both from persisted memory and from an additional runtime block. | count: 1 | status: tracked | sources: review-20260515-125626.md | stories: story-016
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- When a safety approval flow instructs the user to approve in one turn and retry in another, store the approval state independently from the latest natural-language prompt. | count: 1 | status: tracked | sources: review-20260515-160336.md | stories: story-017
- When a workflow persists an active backend/mode choice, write follow-up actions against that persisted mode instead of re-probing a different backend first. | count: 1 | status: tracked | sources: review-20260515-191433.md | stories: story-018
- When adding conditional template/instruction injection, add automated positive and negative harness tests for each branch. | count: 1 | status: tracked | sources: review-20260505-235339.md | stories: story-004
- When adding shared policy helpers that parse commands or paths, add a checked-in validation covering representative positive and negative cases. | count: 1 | status: tracked | sources: review-20260515-125626.md | stories: story-016
- When adding story-dependent prompt/context injection, add automated positive and negative harness tests for each story type branch. | count: 1 | status: tracked | sources: review-20260505-224448.md | stories: story-002
- When deferring closeout across multiple `agent_end` turns, guard the intermediate closeout prompt so it does not re-fire after the user has already made a choice | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- When fixing ambiguous regex extraction, prefer section-scoped parsing over deleting useful fallback labels. | count: 1 | status: tracked | sources: review-20260505-221730.md | stories: story-001
- When writing heuristic text extractors with regex, anchor capture groups to the current line to avoid swallowing downstream content. | count: 1 | status: tracked | sources: review-20260505-211824.md | stories: story-001
