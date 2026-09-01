# Review Summary

**Last updated:** 2026-09-01T17:07:57Z

## Findings
- Shared test fixtures should live in one place and be imported where needed. | count: 2 | status: promoted | sources: review-20260901-134651.md, review-20260901-143438.md | stories: story-083, story-084
- A test matrix must execute and assert each scenario it declares; a label-only scenario list is not coverage. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Activation should be commit-last: never delete the current active pointer or release until the replacement is durably ready. | count: 1 | status: tracked | sources: review-20260831-232433.md | stories: story-078
- After extracting helpers to a new module, delete the original copies to prevent drift and confusion. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Atomic pointer updates must be restart-safe and clean their temporary pointer on every failure path. | count: 1 | status: tracked | sources: review-20260901-005921.md | stories: story-080
- Cleanup must use the same configurable ownership path used by installation and must verify ownership before deletion. | count: 1 | status: tracked | sources: review-20260901-005921.md | stories: story-080
- Detection is not migration; migration APIs must report concrete additive actions and skipped conflicts. | count: 1 | status: tracked | sources: review-20260901-005921.md | stories: story-080
- Do not silently swallow exceptions from structural persistence operations; surface a warning when tracking or recovery state cannot be verified. | count: 1 | status: tracked | sources: review-20260810-222500.md
- Every preflight signal that is surfaced to the user must have a tested display path. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Extracted closeout flows must preserve all terminal branches of the original state machine, including commit-and-close paths. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Fallback diagnostics must not impersonate a specific, user-facing error category. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Idempotent rerun paths must be tested without the prerequisites they are supposed to skip. | count: 1 | status: tracked | sources: review-20260901-143438.md | stories: story-084
- Installer and runtime artifact naming must be derived from the same release manifest schema; never hard-code target strings in more than one place. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Installer platform gates need coverage across every supported and rejected environment branch. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Lifecycle mutations must acquire the same per-install lock for their entire operation, including rollback and uninstall. | count: 1 | status: tracked | sources: review-20260901-005921.md | stories: story-080
- Optional external-tool validations should report explicit skips and be required separately in a tool-enabled validation environment. | count: 1 | status: tracked | sources: review-20260808-004221.md | stories: story-068
- Platform smoke jobs must execute on the platform they claim to validate; synthetic probes should be labeled contract tests. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Preservation tests should snapshot representative nested user-state files byte-for-byte, not only assert that a marker survives. | count: 1 | status: tracked | sources: review-20260901-013022.md | stories: story-081
- Regression tests for retry logic should force the initial attempt to fail and independently verify the recovery attempt, rather than only testing the already-recovered final state. | count: 1 | status: tracked | sources: review-20260808-000002.md | stories: story-066
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- Required-tool lists in shell installers and their TypeScript validators must stay in sync. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Security-critical release verification must fail closed when a required trust root is unavailable. | count: 1 | status: tracked | sources: review-20260831-232433.md | stories: story-078
- Security-critical validation should have direct branch coverage for every rejection category. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Shell entrypoints need isolated integration coverage separate from helper-level tests. | count: 1 | status: tracked | sources: review-20260901-005921.md | stories: story-080
- Shell scripts that claim macOS portability must not use GNU-specific `readlink -f` without a portable fallback. | count: 1 | status: tracked | sources: review-20260901-134651.md | stories: story-083
- Static dead-code findings on dynamically loaded or test-facing APIs must be reconciled against real consumers before removal. | count: 1 | status: tracked | sources: review-20260901-130053.md
- Tool-availability checks must verify the executable bit, not just path presence. | count: 1 | status: tracked | sources: review-20260831-172552.md | stories: story-076
- Validation APIs should return structured failures for malformed input rather than throwing from field-normalization helpers. | count: 1 | status: tracked | sources: review-20260901-150755.md | stories: story-085
- When a story's frontmatter status changes during implementation, update the plan queue entry and completion summary in the same work so persisted workflow state stays consistent. | count: 1 | status: tracked | sources: review-20260901-133430.md | stories: story-082
- When a validation or helper duplicates production policy, make the production path delegate to the canonical implementation or explicitly test parity between both implementations. | count: 1 | status: tracked | sources: review-20260901-003224.md | stories: story-079
- When extracting a command into a new extension, update every validation script that exercises that command to load the new extension module alongside the original entrypoint. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting a large block of helpers from a module, run a reference check for every removed function name against the remaining code in that module before committing the extraction. | count: 1 | status: tracked | sources: review-20260518-220832.md | stories: story-020
- When extracting helpers into a new module, update every validation/import site that exercises those helpers and rerun the moved module's validation scripts before closing the story. | count: 1 | status: tracked | sources: review-20260518-220211.md | stories: story-020
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When generating bounded cyclic candidates, normalize modulo results so negative starting offsets cannot escape the committed range. | count: 1 | status: tracked | sources: review-20260808-000002.md | stories: story-066
- When performing bulk deletions with automated scripts, always run a smoke test or grep for remaining references before committing. | count: 1 | status: tracked | sources: review-20260518-211642.md | stories: story-020
- When two release-validation paths perform the same filesystem operation, consolidate the operation in one shared helper and test the combined contract. | count: 1 | status: tracked | sources: review-20260901-130053.md
- When validating numeric configuration ranges, test both accepted boundaries and representative invalid values just outside each boundary. | count: 1 | status: tracked | sources: review-20260808-002805.md | stories: story-067
