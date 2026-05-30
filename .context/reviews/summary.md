# Review Summary

**Last updated:** 2026-05-29T22:55:48Z

## Findings
- Add regression coverage for both repo-root and nested-directory execution whenever repository detection drives command routing. | count: 1 | status: tracked | sources: review-20260518-124246.md
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- After extracting or migrating UI behavior to a new helper, remove the now-unused import from the original consumer so the compiler/loader doesn't drag in dead code. | count: 1 | status: tracked | sources: review-20260529-215920.md | stories: story-036
- Always verify runtime capability flags before returning a mode or state label; preference settings are intent, not proof of readiness. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Any `String.repeat(n)` in TUI render paths must guard against `n < 0` because terminal width can be arbitrarily small. | count: 1 | status: tracked | sources: review-20260529-024720.md | stories: story-035
- Avoid committing editor or backup files (e.g. .bak, ~, .tmp). | count: 1 | status: tracked | sources: review-20260422-120959.md
- Best-effort features should still surface failures via non-blocking notifications so users can distinguish "nothing happened" from "something broke." | count: 1 | status: tracked | sources: review-20260527-095822.md | stories: story-030
- Consider adding a rule disallowing editor/backup artifacts (.bak, ~, .orig) in source tree (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Do not commit large binary backups into the main repository; use external storage or LFS. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Every command that shells out to a backend operation needs at least one negative-path test verifying graceful failure when the backend rejects the input. | count: 1 | status: tracked | sources: review-20260526-215055.md | stories: story-029
- Every state-machine or guardrail helper that blocks or auto-approves user-facing actions must have at least one direct unit test exercising both the allow and deny paths. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Footer should always include the active story slug for easy orientation. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Make the team policy explicit about which .context subpaths (if any) are authoritative and tracked. | count: 1 | status: tracked | sources: review-20260422-120959.md
- Never hardcode story labels or temporal identifiers in reusable command handlers; always derive them from runtime state. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Picker labels used as lookup keys must be guaranteed unique; never rely solely on user-provided text and time-of-day for uniqueness. | count: 1 | status: tracked | sources: review-20260527-095822.md | stories: story-030
- Promote a rule requiring shared test harness utilities for repository validation scripts (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Require an automated integration test for any change touching .context persistence or extension APIs (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Require CI to run the repo validation suite and static analysis before merge (yes) | count: 1 | status: tracked | sources: review-20260429-024531.md
- Restart/restore regression coverage for persisted workflow state should verify both same-story phase rewinds and cross-story state replacement, because stale memory can point at a different entity than the restored disk state. | count: 1 | status: tracked | sources: review-20260527-105437.md | stories: story-031
- Substring-based approval detection must guard against negation prefixes; use word-boundary regexes or explicit allow-list tokens rather than naive `includes()`. | count: 1 | status: tracked | sources: review-20260518-145628.md
- Temporary validation extensions or scripts must be deleted before story closeout; if they must persist, move them to a `tests/` or `scripts/` directory and document their purpose. | count: 1 | status: tracked | sources: review-20260529-024720.md | stories: story-035
- UI labels that describe a restore action must accurately describe what will be restored; fallbacks to broader categories need relabeling. | count: 1 | status: tracked | sources: review-20260527-095822.md | stories: story-030
- When a checklist calls for coverage "across" a set of changed-file states, verify more than one representative state — include create, modify, delete, and rename. | count: 1 | status: tracked | sources: review-20260526-215055.md | stories: story-029
- When a story scope names concrete destination files, create those files or revise the story scope before review/closeout. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When a validation stub replaces a real function, the stub must support every parameter that production code calls; otherwise the test suite gives false confidence. | count: 1 | status: tracked | sources: review-20260529-024720.md | stories: story-035
- When adding or tightening VCS detection, validate extension behavior from both the repo root and a nested project directory. | count: 1 | status: tracked | sources: review-20260518-124246.md
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When generating numbered requirement lists in instruction builders, scan for duplicate ordinals before committing. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When parsing VCS status output, include rename/move states explicitly; they are common and silently dropping them creates UI gaps. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When reconciling restored disk state with stale in-memory workflow state, do not stop after clearing the stale entry; continue searching for the restored authoritative state in the same pass. | count: 1 | status: tracked | sources: review-20260527-105437.md | stories: story-031
- When stripping ANSI for width calculations, use a regex that matches the full CSI range (`\x1b[...letter`) rather than only SGR (`\x1b[...m`). | count: 1 | status: tracked | sources: review-20260529-215920.md | stories: story-036
- When the same literal union appears more than once in a module, extract a named type alias to reduce drift during future changes. | count: 1 | status: tracked | sources: review-20260529-024720.md | stories: story-035
- When the same logic block is pasted into two files, add a cross-reference comment linking both copies so the next editor knows to keep them in sync. | count: 1 | status: tracked | sources: review-20260527-095822.md | stories: story-030
- When tracking async tool lifecycle, correlate start and end events with a unique call identifier, not just the tool name. | count: 1 | status: tracked | sources: review-20260518-145628.md
- When validating tool input for security, always check every documented alias of a target field (`path` / `filePath`), not just the primary one. | count: 1 | status: tracked | sources: review-20260518-145628.md
