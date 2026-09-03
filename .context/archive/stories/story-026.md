# Story 026: Harden complete-story regression coverage and stress-test closeout flows

**Status:** complete  
**Created:** 2026-05-24  
**Last accessed:** 2026-05-26  
**Completed:** 2026-05-26

## Goal
Expand regression coverage and run interactive stress tests so the hardened `/complete-story` flow proves stable before any merge toward `main`.

## Verification
Automated closeout validation covers repeated `turn_end`, restart/re-entry, review-remediation, learned-rule, and close/commit paths, and an interactive stress-test pass is recorded in the story completion summary.

## Scope
- `scripts/validate-vazir-complete-story.mts`
- `scripts/validate-vazir-review-loop.mts`
- any supporting validation harness utilities needed by those scenarios
- `.context/stories/story-026.md` completion summary for the recorded interactive stress matrix

## Out of scope
- New complete-story architecture changes unless required to fix issues uncovered by testing
- Unrelated workflow extensions
- Merging branches

## Dependencies
- story-025

## Checklist
- [x] Add regression scenarios for repeated `turn_end` idempotency across complete-story closeout phases
- [x] Add persisted-file-driven restart and re-entry scenarios that restore the correct closeout phase after interruption
- [x] Verify review-remediation, learned-rule closeout, mini-consolidate, and close-and-commit paths across supported validation scenarios
- [x] Document the interactive stress matrix for `/complete-story` and capture known blockers in the story file
- [x] Fix or document any hardening gaps found during automated stress testing before the story is considered done

## Issues
- No open hardening gaps remain in the automated `/complete-story` restart coverage.

## Completion Summary
Automated regression coverage expanded and the restart-sensitive closeout paths now resume correctly.

- Added persisted complete-story closeout state in `.pi/extensions/vazir-context/complete-story.ts` so rerunning `/complete-story` after a restart can recover the active review or learned-rule closeout phase instead of dropping back to a generic ready prompt.
- Hardened learned-rule restart recovery so a previously chosen `Close story and commit all` intent survives restart and still commits on successful closeout.
- Added `runTurnEndIdempotencyScenario` to `scripts/validate-vazir-complete-story.mts` — proves that repeated `turn_end` emissions during `learned-rule-closeout` (now handled in `agent_end`) do not queue duplicate internal messages, corrupt pending state, or prematurely finalize the story.
- Updated `runLearnedRuleDraftRestartScenario` to verify restart recovery preserves commit intent and completes the deferred Git commit after learned-rule promotion.
- Replaced the old review-restart gap coverage with `runReviewCloseoutRestartResumeScenario`, which now proves a restarted `/complete-story` session re-enters the completed review closeout flow instead of spawning a replacement review.
- Verified all pre-existing scenarios still pass: review-gated, review-in-progress, restarted review closeout, ready close, ready close-and-commit, dirty-context commit/decline, colocated Git/JJ, Fossil, candidates promote/skip, and keep-working.
- Fixed `COMPLETE_STORY_PHASE_HANDOFFS` comment in `complete-story.ts` to reflect that `learned-rule-closeout` is now owned by `agent_end` (matching the restored pre-story-025 behavior per user feedback).

**Interactive stress matrix** (requires manual execution in an interactive Pi session):
1. Start `/complete-story` on a ready story, choose "Start code review before closing", mark the review complete, and verify the review-closeout picker appears with "Close story now / Close story and commit all" options.
2. Select "Keep story open and fix high-priority recommended items", verify remediation is dispatched, fix the items, mark review complete again, and verify the closeout resumes.
3. Choose "Close story and commit all", verify the story closes and VCS commits the changes.
4. Interrupt the session after the learned-rule draft is written but before `agent_end` runs; restart the session and rerun `/complete-story`; verify the promotion picker resumes.
5. Run `/complete-story` on a story with blockers, resolve the blockers during the readiness turn, and verify `turn_end` transitions from `readiness-review` to `ready-for-closeout` and prompts automatically.

All automated tests pass, including the restart-resume and close-intent preservation scenarios.

