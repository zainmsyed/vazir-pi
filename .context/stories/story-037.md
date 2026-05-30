# Story 037: Adopt approved inline selector chrome for remaining Vazir pickers

**Status:** not-started  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-29  
**Completed:** —

---

## Goal
Standardize Vazir on one UI rule: all selections use the approved style-C inline selector treatment in the normal text-entry area, while opened markdown documents remain in overlays. This includes `/story`, `/plan`, `/implement`, `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, `/checkpoint`, and `/reset`.

## Verification
Exercise representative command paths in pi for `/story`, `/plan`, `/implement`, `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, and `/checkpoint`/`/reset`. Confirm every selection step uses the style-C inline selector treatment, confirm opened story/plan/review markdown still appears in overlays, confirm destructive confirms default to the safe option, and confirm command behavior and persisted state transitions remain unchanged apart from presentation.

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
- [ ] Refine the shared selection helper so style C becomes the default inline treatment for all Vazir selections
- [ ] Apply the shared style-C inline selector treatment to `/story`, `/plan`, and `/implement` so those flows match the approved picker UX
- [ ] Keep markdown viewers on overlays and preserve existing story/plan/review document-view semantics
- [ ] Wire `/complete-story`, `/unlearn`, `/fix`, and `/memory-review` picker/confirmation prompts to the shared inline helper
- [ ] Wire `/checkpoint` and `/reset` restore pickers to the shared inline helper while preserving current guardrails and labels
- [ ] Ensure destructive confirmations default to cancel and keep safety wording accurate to the actual restore/delete target
- [ ] Remove or rename temporary selector preview commands once the approved style ships in real flows

## Issues
- None yet.

## Completion Summary
Not completed yet.
