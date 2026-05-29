# Story 037: Wire remaining Vazir picker and confirmation flows to shared TUI overlays

**Status:** not-started  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  

---

## Goal
Extend the shared selection overlay across the remaining structured Vazir workflows so picker and confirmation behavior becomes consistent for `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, `/checkpoint`, and `/reset`.

## Verification
Exercise representative command paths in pi for `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, and `/checkpoint`/`/reset`. Confirm each uses the shared overlay, destructive confirms default to the safe option, and the command behavior and persisted state transitions remain unchanged apart from presentation.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/complete-story.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-ui.ts`
- Validation coverage for the migrated command flows

## Out of scope
- Adding new commands
- Reworking closeout, review, or checkpoint semantics beyond UI presentation
- Persistent HUD rendering

## Dependencies
- story-035
- story-036

## Checklist
- [ ] Wire `/complete-story` choice prompts to `showSelectionList` without changing the existing closeout state machine
- [ ] Wire `/unlearn`, `/fix`, and `/memory-review` selection and confirmation prompts to the shared helper
- [ ] Wire `/checkpoint` and `/reset` restore pickers to the shared helper while preserving current VCS guardrails and labels
- [ ] Ensure destructive confirmations default to cancel and keep existing safety wording accurate to the actual restore/delete target
- [ ] Add regression coverage for representative migrated flows, including at least one destructive-confirm path and one checkpoint path

## Issues
- None yet.

## Completion Summary
Not completed yet.
