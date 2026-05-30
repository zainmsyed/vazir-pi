# Story 038: Add compact persistent Vazir HUD in tracker chrome

**Status:** retired  
**Created:** 2026-05-29  
**Last accessed:** 2026-05-30  
**Completed:** —

---

## Goal
Add a compact persistent HUD above the editor, owned by `vazir-tracker/chrome.ts`, that surfaces active story progress, queue summary, VCS identity/status, and a compact Vazir command strip using cheap local state and the existing chrome refresh path.

## Verification
Start pi in representative repo states and confirm the HUD renders above the editor, updates after story/VCS-visible changes, collapses safely on narrow terminals, and shows the same backend identity conventions already used by tracker chrome for Fossil and Git/JJ repos.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/chrome.ts`
- Supporting tracker helpers needed to feed bounded HUD data
- Validation coverage for HUD rendering states

## Out of scope — do not touch
- A two-column dashboard layout
- Clickable command interactions
- New repo-detection logic separate from existing VCS helper/chrome state

## Dependencies
- story-035
- story-036

## Checklist
- [ ] Add a compact `ctx.ui.setWidget("vazir-hud", ...)` HUD owned by tracker chrome and rendered above the editor
- [ ] Render uninitialized, no-active-story, active-story, and narrow-terminal HUD states from cheap local data
- [ ] Reuse existing story and VCS summary helpers or add minimal shared helpers without duplicating backend-detection logic
- [ ] Hook HUD refresh into the existing chrome update path so story and VCS changes trigger rerender without file watching
- [ ] Keep the HUD width-safe and visually aligned with existing chrome/footer styling
- [ ] Add regression coverage for multiple HUD states, including Fossil-aware identity output and narrow-terminal collapse

## Issues
### Retired — not needed
- **Reported:** 2026-05-30  
- **Status:** retired  
- **Agent note:** Story was implemented and then reverted by user decision. Work discarded via `fossil revert`.  
- **Solution:** —

## Completion Summary
Retired by user request after revert. The HUD work was implemented in `.pi/extensions/vazir-tracker/chrome.ts` and validated, but the user chose to discard it with `fossil revert`. The existing `vazir-story-status` widget above the editor remains the primary story surface.
