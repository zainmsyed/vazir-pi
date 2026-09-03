# Review Summary

**Last updated:** 2026-09-03T21:03:10Z

## Findings
- Shared test fixtures should live in one place and be imported where needed. | count: 2 | status: promoted | sources: review-20260901-134651.md, review-20260901-143438.md | stories: story-083, story-084
- A test matrix must execute and assert each scenario it declares; a label-only scenario list is not coverage. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Activation should be commit-last: never delete the current active pointer or release until the replacement is durably ready. | count: 1 | status: tracked | sources: review-20260831-232433.md | stories: story-078
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- After large extension refactors, confirm the running session has reloaded the code before triggering flows that generate files from templates. | count: 1 | status: tracked | sources: review-20260902-151652.md | stories: story-082
- Do not persist normalized defaults or repair malformed configuration during an unrelated settings write; normalize on read and mutate only the explicitly requested section. | count: 1 | status: tracked | sources: review-20260903-204825.md | stories: story-085
- Do not silently swallow exceptions from structural persistence operations; surface a warning when tracking or recovery state cannot be verified. | count: 1 | status: tracked | sources: review-20260810-222500.md
- Every new targeted validation script must be registered in the aggregate runner so it is exercised alongside existing regressions. | count: 1 | status: tracked | sources: review-20260903-205930.md | stories: story-086
- Every preflight signal that is surfaced to the user must have a tested display path. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Fallback diagnostics must not impersonate a specific, user-facing error category. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Idempotent rerun paths must be tested without the prerequisites they are supposed to skip. | count: 1 | status: tracked | sources: review-20260901-143438.md | stories: story-084
- Installer and runtime artifact naming must be derived from the same release manifest schema; never hard-code target strings in more than one place. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Installer platform gates need coverage across every supported and rejected environment branch. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Platform smoke jobs must execute on the platform they claim to validate; synthetic probes should be labeled contract tests. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Preservation tests should snapshot representative nested user-state files byte-for-byte, not only assert that a marker survives. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Required-tool lists in shell installers and their TypeScript validators must stay in sync. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Security-critical release verification must fail closed when a required trust root is unavailable. | count: 1 | status: tracked | sources: review-20260831-232433.md | stories: story-078
- Security-critical validation should have direct branch coverage for every rejection category. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Shell scripts that claim macOS portability must not use GNU-specific `readlink -f` without a portable fallback. | count: 1 | status: tracked | sources: review-20260901-134651.md | stories: story-083
- Static dead-code findings on dynamically loaded or test-facing APIs must be reconciled against real consumers before removal. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Tool-availability checks must verify the executable bit, not just path presence. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Validation APIs should return structured failures for malformed input rather than throwing from field-normalization helpers. | count: 1 | status: tracked | sources: review-20260901-150755.md | stories: story-085
- When a command aliases an interactive shortcut, automated coverage should exercise the command's UI path rather than relying only on source assertions and a non-UI fallback. | count: 1 | status: tracked | sources: review-20260903-191121.md | stories: story-084
- When a story's frontmatter status changes during implementation, update the plan queue entry and completion summary in the same work so persisted workflow state stays consistent. | count: 1 | status: tracked | sources: review-20260901-133430.md | stories: story-082
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When implementation scope expands, update the story's Scope section at the same time as the approval/Issues note so the story contract remains auditable. | count: 1 | status: tracked | sources: review-20260903-173807.md | stories: story-083
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When removing a feature, remove its dedicated validations in the same change; dropping them only from the aggregate runner leaves broken, runnable-looking tests behind. | count: 1 | status: tracked | sources: review-20260902-151652.md | stories: story-082
- When two release-validation paths perform the same filesystem operation, consolidate the operation in one shared helper and test the combined contract. | count: 1 | status: tracked | sources: review-20260901-130053.md
