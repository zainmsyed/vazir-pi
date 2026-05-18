# Review Summary

**Last updated:** 2026-05-18T13:42:45Z

## Findings
- Add extension-level validation whenever new safety logic is wired into a live event interception path, not just helper-level unit checks. | count: 1 | status: tracked | sources: review-20260515-160336.md | stories: story-017
- Add one validation per supported VCS mode and per protected decision branch whenever closeout behavior depends on persisted VCS mode or commit-policy prompts. | count: 1 | status: tracked | sources: review-20260515-191433.md | stories: story-018
- Add regression coverage for both repo-root and nested-directory execution whenever repository detection drives command routing. | count: 1 | status: tracked | sources: review-20260518-124246.md
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Avoid re-reading a file you already have parsed in memory; derive secondary computations from the in-memory representation. | count: 1 | status: tracked | sources: review-20260516-142440.md | stories: story-006
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
- When a backend produces structured findings that must be parsed later, the review template and instructions must explicitly direct the agent to preserve them in the expected section. | count: 1 | status: tracked | sources: review-20260516-142440.md | stories: story-006
- When a feature relies on auxiliary binaries beyond its primary tool, validate each dependency explicitly and emit a diagnostic that names the missing tool so users do not confuse it with a failure of the primary feature. | count: 1 | status: tracked | sources: review-20260516-131516.md | stories: story-006
- When a safety approval flow instructs the user to approve in one turn and retry in another, store the approval state independently from the latest natural-language prompt. | count: 1 | status: tracked | sources: review-20260515-160336.md | stories: story-017
- When a story scope names concrete destination files, create those files or revise the story scope before review/closeout. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When a workflow persists an active backend/mode choice, write follow-up actions against that persisted mode instead of re-probing a different backend first. | count: 1 | status: tracked | sources: review-20260515-191433.md | stories: story-018
- When adding a new backend-specific code path, cover at least the happy path and one error-path branch in the same validation script. | count: 1 | status: tracked | sources: review-20260516-131516.md | stories: story-006
- When adding a new section to a structured output template, add a positive assertion that the template contains the section and a negative assertion that the instruction builder does not omit guidance for it. | count: 1 | status: tracked | sources: review-20260516-142440.md | stories: story-006
- When adding a new signal source to an instruction-driven workflow, validate at least one real consumer path end-to-end instead of only checking that the prompt mentions the source. | count: 1 | status: tracked | sources: review-20260516-125356.md | stories: story-006
- When adding conditional template/instruction injection, add automated positive and negative harness tests for each branch. | count: 1 | status: tracked | sources: review-20260505-235339.md | stories: story-004
- When adding or tightening VCS detection, validate extension behavior from both the repo root and a nested project directory. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When adding shared policy helpers that parse commands or paths, add a checked-in validation covering representative positive and negative cases. | count: 1 | status: tracked | sources: review-20260515-125626.md | stories: story-016
- When adding story-dependent prompt/context injection, add automated positive and negative harness tests for each story type branch. | count: 1 | status: tracked | sources: review-20260505-224448.md | stories: story-002
- When an instruction conditionally references a backend service, the fallback message must accurately reflect whether the service executed or was bypassed. | count: 1 | status: tracked | sources: review-20260516-192313.md | stories: story-006
- When an instruction references content that is conditionally prepended, the guidance about that content must also be conditional. | count: 1 | status: tracked | sources: review-20260516-144220.md | stories: story-006
- When creating a temp mirror of a repo for external tooling, exclude the project's own brain/metadata directories to prevent the tool from analyzing generated or internal files. | count: 1 | status: tracked | sources: review-20260516-142440.md | stories: story-006
- When deferring closeout across multiple `agent_end` turns, guard the intermediate closeout prompt so it does not re-fire after the user has already made a choice | count: 1 | status: tracked | sources: review-20260515-214549.md | stories: story-005
- When fixing ambiguous regex extraction, prefer section-scoped parsing over deleting useful fallback labels. | count: 1 | status: tracked | sources: review-20260505-221730.md | stories: story-001
- When parsing pipe-delimited log lines, do not anchor the regex to end-of-line unless the format is guaranteed frozen; allow benign trailing fields. | count: 1 | status: tracked | sources: review-20260516-142440.md | stories: story-006
- When prompt builders interpolate file paths, add one regression assertion that the final prompt contains the concrete rendered path rather than a raw `${...}` placeholder. | count: 1 | status: tracked | sources: review-20260516-125356.md | stories: story-006
- When the same string-replacement sequence appears in two or more distinct code paths, extract it into a named helper so future changes to the output format happen in one place. | count: 1 | status: tracked | sources: review-20260516-131516.md | stories: story-006
- When writing heuristic text extractors with regex, anchor capture groups to the current line to avoid swallowing downstream content. | count: 1 | status: tracked | sources: review-20260505-211824.md | stories: story-001
