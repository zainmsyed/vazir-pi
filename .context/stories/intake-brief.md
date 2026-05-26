# Intake Brief

**Last updated:** 2026-05-26

## Planning brief
Please create a focused implementation plan to fix Vazir’s JJ checkpoint/restore UX and reliability.

## Problem summary
JJ checkpoints are currently confusing and unreliable:
- too many visible checkpoints
- checkpoint history is noisy and low-value
- restoring a checkpoint can produce a mixed or surprising workspace state
- users need a trustworthy “undo last thing the agent just did” behavior

## Proposed behavior/spec
Target A + B, not raw JJ history as the main UX.

### A. Undo last agent run
Define the primary undo unit as:
- one completed agent run for one user prompt
- not raw JJ ops
- not necessarily raw Pi `turn_end`
- only if that run actually changed files

This restore path should return the workspace to the exact pre-run state in a predictable way.

### B. Milestone checkpoints
Expose only meaningful restore points such as:
- explicit user-requested checkpoints
- important workflow boundaries
- possibly command boundaries like `/implement`, `/fix`, `/complete-story`

Do not surface every low-level JJ snapshot as a user-facing checkpoint.

## Technical context
From Pi docs:
- `agent_start` / `agent_end` happen once per user prompt
- `turn_start` / `turn_end` can happen multiple times inside one agent run

User-facing undo should therefore be modeled around agent runs, not raw Pi turns and not raw JJ op log entries.

## Desired outcome
Break the work into concrete stories to:
1. define and persist a trustworthy undo unit for the last completed agent run
2. redesign visible checkpoint selection around milestones instead of noisy JJ snapshots
3. make restore semantics exact and unsurprising
4. ensure `.context` / story workflow state behaves correctly across restore paths
5. add regression coverage for multi-turn agent runs, explicit milestones, and restore correctness

## Safe assumptions used for planning
- JJ remains an optional layer on top of Git-mode repos; this replan hardens JJ behavior rather than redesigning active VCS mode selection.
- The default user-facing undo entry should target the last completed agent run that actually changed files.
- Advanced raw JJ history browsing is not required for this scope as long as undo-last-run and curated milestones are trustworthy.
- Relevant `.context` workflow state should be restored alongside code when needed to avoid split-brain story/review state.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md (read for project workflow context)
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md (read for project workflow context)

## Intake field extraction
- **Objectives:** trustworthy undo-last-run behavior, meaningful milestone restore points, exact restore semantics, restore-safe `.context` workflow state, and regression coverage.
- **Success metrics:** undo restores exact pre-run state, noisy raw snapshots are removed from primary UX, milestones are curated and meaningful, and restore-sensitive workflows remain in sync after restart.
- **Users:** Vazir users working in JJ-enabled repos who need safe recovery from bad agent edits.
- **User journeys:** undo the last bad agent run, restore to an explicit checkpoint, restore to a workflow milestone, resume after restart and continue safely.
- **Inputs/outputs:** Pi lifecycle events, JJ op state, checkpoint metadata, `.context` workflow files; outputs are curated restore choices, exact workspace rollbacks, and regression coverage.
- **Integrations:** Pi extension lifecycle/events, JJ CLI, tracker chrome, story/closeout flows, persisted `.context` state.
- **Auth/security:** follow existing VCS safety guardrails; no new destructive metadata handling is planned.
- **Acceptance criteria:** stories must produce exact restore behavior, curated checkpoint UX, synchronized `.context` state, and end-to-end validation of the primary paths.
- **Constraints/non-goals:** keep checklist lengths small, preserve conventions, layer changes onto the proven architecture, avoid productizing raw JJ history, and avoid unrelated VCS redesign.
- **Edge cases:** multi-turn agent runs, runs with no writes, restart-resume after restore, repeated raw JJ snapshots, and closeout flows that persist state.
- **Monitoring:** regression and validation coverage are the primary confidence mechanism for this scope.
- **Deployment:** no special deployment requirements identified; changes land through the normal extension workflow.
- **Timeline/stakeholders:** immediate replan for current JJ pain; primary stakeholder is the user driving Vazir workflow reliability.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in `.context/stories/` are replan context, not primary intake.
- Ask only implementation-blocking questions after reviewing the intake. No blocking questions remained after review.
- Preserve existing story history; append only new story files and plan rows for this replan.
