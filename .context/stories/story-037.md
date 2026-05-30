# Story 037: Keep standard Pi selection lists for Vazir while reserving overlays for documents

**Status:** complete  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-30  
**Completed:** 2026-05-30

---

## Goal
Standardize Vazir on a simpler UI rule for now: keep Pi's standard selection lists for Vazir pickers and confirmations, while opened markdown documents remain in overlays. This includes `/story`, `/plan`, `/implement`, `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, `/checkpoint`, and `/reset`.

## Verification
Exercise representative command paths in pi for `/story`, `/plan`, `/implement`, `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, and `/checkpoint`/`/reset`. Confirm selection steps use Pi's standard picker behavior, confirm opened story/plan/review markdown still appears in overlays, and confirm command behavior and persisted state transitions remain unchanged apart from presentation.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/complete-story.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-ui.ts`
- Validation coverage for the migrated command flows

## Out of scope — do not touch
- Changing story/plan/review markdown viewers away from overlays
- Reworking closeout, review, or checkpoint semantics beyond UI presentation
- Persistent HUD rendering

## Dependencies
- story-035
- story-036

## Checklist
- [x] Revert Vazir pickers and confirmations back to Pi's standard selection-list behavior
- [x] Keep markdown viewers on overlays and preserve existing story/plan/review document-view semantics
- [x] Restore `/story`, `/plan`, and `/implement` to the standard picker path while keeping document overlays intact
- [x] Restore `/complete-story`, `/unlearn`, `/fix`, and `/memory-review` to the standard picker path
- [x] Restore `/checkpoint` and `/reset` restore pickers to the standard picker path while preserving current guardrails and labels
- [x] Remove temporary selector preview commands after deciding not to ship the custom picker chrome in this pass
- [x] Update validation coverage and story text to reflect the revert-to-standard-picker decision

## Issues
- None yet.

## Completion Summary
Vazir is reverting to Pi's standard selection lists for now, while keeping markdown documents in overlays.

- `/story`, `/plan`, and `/implement` use the normal Pi picker path for choices, while selected story and plan markdown still open in overlay viewers.
- `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, `/checkpoint`, and `/reset` also use the normal Pi picker path again, preserving existing closeout, memory, and restore semantics.
- Temporary selector preview commands were removed after deciding not to ship the custom picker chrome in this pass.
- The current UX rule is now: standard picker for choices, overlay for opened documents.
- Theme exploration for a broader Pi-wide visual refresh is deferred to follow-up planning instead of being bundled into this story.
