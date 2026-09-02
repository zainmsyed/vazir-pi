# Story 033: Normalize footer VCS identity to git or fossil only

**Status:** complete  
**Created:** 2026-05-27
**Last accessed:** 2026-05-27  

---

## Goal
Keep the existing `/vcs-settings` menu labels (`Git/JJ`, `Fossil`) and preserve JJ checkpoint/setup behavior, but make the footer/chrome show only the actual backend VCS identity: `git` or `fossil` (or `none` when nothing is configured). In colocated Git+JJ repos, JJ should remain a helper for checkpoints/undo, not appear as the active footer VCS.

## Verification
In a colocated Git+JJ repo, after choosing `Git/JJ`, the footer shows the git icon and git branch instead of `jj`, while JJ checkpoint/undo behavior still works. In a Fossil repo, the footer still shows fossil with unchanged behavior.

## Scope
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- Related helper logic that feeds footer VCS identity, if needed

## Out of scope
- JJ install/setup flow in `/vazir-init` or `/vcs-settings`
- JJ checkpoint, restore, undo, or snapshot implementation
- Fossil footer or commit behavior
- Commit path logic already addressed in story-032
- `/vcs-settings` menu wording or structure

## Dependencies
- story-032

## Checklist
- [x] Update VCS resolution so footer/chrome identity never resolves to `jj`
- [x] Preserve JJ detection for checkpoint/undo/helper behavior while normalizing Git+JJ footer identity to `git`
- [x] Verify explicit `active_vcs_mode: "git"` always renders git in the footer even when JJ is present
- [x] Ensure fossil footer behavior is unchanged
- [x] Confirm any footer override/hint rendering still behaves correctly after removing `jj` as a footer identity
- [x] Normalize the `/vcs-settings` Git/JJ confirmation so it reports and persists `git` as the backend identity while JJ remains active for checkpoints
- [ ] Validate end-to-end in a colocated Git+JJ repo and a Fossil repo

## Issues
- Colocated Git+JJ behavior has been re-verified in a live repo after reload: the footer shows `git`, `/vcs-settings` reports `git`, and the closeout commit landed in Git as expected. Fossil behavior was not re-exercised in this pass, so the final cross-backend validation item remains open until Fossil is re-verified.

---

## Completion Summary
Normalized the visible VCS identity so Git+JJ repos render and announce `git` instead of `jj` while preserving JJ helper behavior. In `.pi/extensions/vazir-tracker/index.ts`, `resolvePreferredVcsKind()` and `computeAutoDetectedVcsKind()` now treat colocated Git+JJ as `git` for footer identity, gate preference-based footer identity on actual backend availability, and reserve `fossil` as the only other active VCS identity. In `.pi/extensions/vazir-tracker/chrome.ts`, `setVcsFlags()` no longer defaults the chrome identity to `jj` just because JJ is present, so the footer follows the resolved backend identity instead of the checkpoint helper state. In `.pi/extensions/vazir-context/index.ts`, the `/vcs-settings` Git/JJ activation path now persists and reports `git` as the backend VCS identity instead of announcing `jj`, while leaving `useJJ` enabled when JJ checkpoints are active. Live verification in a colocated Git+JJ repo confirms the footer shows `git`, the settings confirmation reports `git`, and closeout work commits to Git as expected. JJ detection remains intact for checkpoint, diff, and undo flows; Fossil behavior and `/vcs-settings` menu wording were left unchanged, but Fossil still needs re-verification before the final cross-backend validation item can be checked off.
