# Story 016: VCS safety policy and protected-target detection

**Status:** in-progress  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-15  
**Completed:** —

---

## Goal
Add first-class VCS safety policy support so Vazir has a single protected-target detector for Git, JJ, and Fossil metadata, plus shared guidance text that marks destructive VCS operations as approval-gated.

## Verification
In a repo with Git, JJ, or Fossil state present, the shared guard helper identifies protected VCS paths/targets correctly and the assembled guidance text includes the non-destructive VCS rule set.

## Scope
- `.pi/lib/vazir-helpers.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/index.ts`
- `types/pi-runtime-ambient.d.ts`

## Out of scope
- Blocking command execution at runtime
- Extension decomposition
- Footer or chrome rendering changes

## Dependencies
- —

## Checklist
- [x] Add shared protected-VCS target detection helpers for `.git/`, `.jj/`, `.fslckout`, and `.fossil-settings/`
- [x] Add helper coverage for destructive command patterns that should be treated as approval-gated when they touch protected VCS state
- [x] Update Vazir system-guidance assembly to state that `.context` changes must be committed unless the user says otherwise
- [x] Update Vazir system-guidance assembly to forbid deleting, resetting, cleaning, reinitializing, or overwriting VCS metadata without explicit approval for that exact action
- [x] Ensure the new policy text is reused from shared helpers rather than duplicated across extensions

## Issues
- None currently.

## Completion Summary
Added shared VCS safety helpers in `.pi/lib/vazir-helpers.ts` for protected-target detection, approval-gated destructive command detection, and reusable guidance text. `vazir-context` now builds new `system.md` files from the shared rule set and injects the same VCS safety guidance into the assembled system prompt so existing projects also get the policy without duplicating text.
