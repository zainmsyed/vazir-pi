# Story 030: Milestone checkpoint curation and restore UX

**Status:** complete  
**Created:** 2026-05-26  
**Last accessed:** 2026-05-27  
**Completed:** 2026-05-27

---

## Goal
Replace noisy user-facing JJ snapshot history with curated milestones so checkpoint browsing shows only meaningful restore points plus a clear default undo action.

## Verification
The checkpoint UI offers “Undo last agent run” plus a milestone list made from explicit user saves and approved workflow boundaries, while raw JJ snapshot spam is no longer presented as the main restore history.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- any targeted shared checkpoint metadata files needed under `.context`
- targeted UI/behavior regression coverage for milestone selection

## Out of scope — do not touch
- Advanced raw JJ history browsing as a primary UX
- Story-close workflow changes beyond using milestone hooks where appropriate
- New non-JJ checkpoint products

## Dependencies
- story-028
- story-029

## Checklist
- [x] Define which events create user-visible milestones, including explicit user-requested checkpoints and selected workflow boundaries
- [x] Persist milestone metadata separately from low-level JJ op noise with labels that describe the meaningful restore point
- [x] Redesign checkpoint selection UX around “Undo last agent run” and curated milestone restore choices
- [x] Remove raw snapshot-based labels and choices from the primary checkpoint picker while preserving any internal data still needed for restore
- [x] Add regression coverage for explicit milestone creation, workflow-boundary milestone visibility, and stable restore labels

## Issues
- None yet.

## Completion Summary
Milestone checkpoint curation is now implemented as a layer over the agent-run checkpoint system from story-028.

**Milestone events defined:**
- `agent-run` — automatically created at `agent_end` when the run wrote files (via the existing `saveAgentRunCheckpoint` hook, now also calling `saveMilestone`)
- `explicit-save` — created when the user selects "Save milestone — mark current state" from the `/checkpoint` menu
- `workflow-boundary` — reserved kind for future closeout/review hooks; pre-populated in validation to prove visibility

**Milestone persistence:**
- New `Milestone` type and store at `.context/settings/jj-milestones.json`
- Functions `saveMilestone`, `loadMilestones`, `getMilestoneChoices`, `milestoneLabel` in both `.pi/extensions/vazir-tracker/vcs.ts` and `.pi/lib/vazir-vcs-helpers.ts`
- 30-entry cap with FIFO pruning

**Checkpoint UX redesign:**
- Primary `/checkpoint` picker now shows: "Undo last agent run", "Browse milestones", "Save milestone", "Cancel"
- Raw JJ snapshot spam is removed from the primary picker
- Raw JJ history is still accessible via "Advanced — browse raw JJ history" inside the milestone browser
- All restore paths (default undo, milestone restore, raw fallback) funnel through the exact `jjRestoreCheckpoint` from story-029

**Regression coverage:**
- `scripts/validate-vazir-jj-milestones.mts` exercises agent-run milestone creation, picker UX, explicit save, and workflow-boundary visibility
- Existing `validate-vazir-checkpoint-labels.mts` was updated to navigate the new two-level menu (milestones → advanced → raw history)
- All milestone and checkpoint validations pass in the aggregate suite
