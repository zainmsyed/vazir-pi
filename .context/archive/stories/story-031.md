# Story 031: Restore-safe `.context` workflow state and end-to-end hardening

**Status:** complete  
**Created:** 2026-05-26  
**Last accessed:** 2026-05-27  
**Completed:** 2026-05-27

---

## Goal
Ensure JJ undo and milestone restore keep `.context` story/review/workflow state aligned with restored code and survive realistic restart and closeout paths.

## Verification
End-to-end validation shows that restoring the last agent run or a milestone brings code and relevant `.context` state back into sync across representative story and closeout flows, including restart-resume scenarios.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/extensions/vazir-context/complete-story.ts`
- `.pi/lib/vazir-helpers.ts`
- targeted `.context` checkpoint metadata or validation helpers
- end-to-end regression coverage for restore-sensitive workflows

## Out of scope — do not touch
- New review or story features unrelated to restore correctness
- Manual `/consolidate` or design-system planning work outside the restore path
- VCS commit-message changes already covered by earlier stories

## Dependencies
- story-028
- story-029
- story-030

## Checklist
- [x] Identify which `.context` files and workflow flags must participate in JJ undo and milestone restore to avoid split-brain state
- [x] Layer restore-safe state synchronization onto the existing story and closeout architecture instead of replacing those flows inline
- [x] Update restore follow-through so tracker chrome, story status guards, and persisted workflow markers refresh from the restored state
- [x] Add restart-resume regression coverage for restored sessions that re-enter tracker and closeout flows after undo or milestone restore
- [x] Run end-to-end validation for representative story progress and closeout scenarios to confirm code and `.context` state stay aligned

## Issues
- None yet.

## Completion Summary
Restore-safe closeout state reconciliation is now layered onto the existing complete-story architecture so JJ restore can safely rewind `.context` workflow state without leaving stale in-memory closeout phases behind.

**Restore-sensitive `.context` state identified:**
- `.context/reviews/*-complete-story-closeout.json` — persisted complete-story phase marker and review/close intent handoff
- `.context/reviews/*-learned-rule-closeout.json` — learned-rule closeout draft state referenced by pending closeout requests
- `.context/reviews/review-*.md` — review status and recommended-fix progress used to derive review-closeout vs remediation
- `.context/stories/story-*.md` — story readiness and status frontmatter used by the closeout state machine
- existing JJ restore metadata in `.context/settings/jj-agent-run-checkpoints.json` and `.context/settings/jj-milestones.json`

**Implementation:**
- In `.pi/extensions/vazir-context/complete-story.ts`, replaced the old `restorePersistedCompleteStoryRequest(...)` behavior with restore-safe reconciliation helpers:
  - `samePendingCompleteStoryRequest(...)`
  - `listPersistedCompleteStoryCloseoutStates(...)`
  - `resolvePendingCompleteStoryRequest(...)`
- `handleCommand`, `handleTurnEnd`, and `handleAgentEnd` now reconcile the in-memory pending closeout Map against the restored `.context` files before choosing a phase.
- If JJ restore rewinds the persisted closeout marker to an earlier phase, the in-memory request is replaced with the restored file-backed state.
- If JJ restore removes the pending closeout marker entirely, stale in-memory closeout state is cleared so `/complete-story` falls back to the real restored story state instead of a phantom review-in-progress phase.

**Validation:**
- Expanded `scripts/validate-vazir-complete-story.mts` with direct assertions for the remediation-instruction fix from story-030.
- Added two real-JJ restore regression scenarios:
  1. restoring from a stale learned-rule-closeout state back to a review-closeout state resumes the restored review-closeout prompt instead of the stale in-memory learned-rule phase
  2. restoring to a state with no pending closeout marker clears stale in-memory pending state and reopens the normal ready-closeout prompt
- `node --experimental-strip-types ./scripts/validate-vazir-complete-story.mts` passes, including the new real-JJ restore scenarios.

The pre-existing `validate-vazir-status-chrome.mts` failure remains unrelated to this story.
