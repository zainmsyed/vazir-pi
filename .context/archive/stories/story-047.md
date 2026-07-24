# Story 047: Add explicit Fossil→Git mirror settings and mixed-VCS guidance

**Status:** complete  
**Type:** —  
**Created:** 2026-06-02
**Last accessed:** 2026-06-02  
**Completed:** 2026-06-02

---

## Goal
Add explicit VCS settings and UX guidance for repos where Fossil is the canonical workflow VCS and Git exists as a mirror, so Vazir can explain and respect that setup without inferring behavior from dual detection alone.

## Verification
Configure a repo with Fossil active and mirror mode enabled in a mixed Fossil+Git checkout. Confirm Vazir keeps Fossil authoritative for workflow operations, shows mirror-aware status/guidance text, warns clearly when mirror expectations and detected metadata disagree, and does not attempt sync, push, export, or VCS mode switching automatically.

## Scope
- `.pi/lib/vazir-helpers.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/extensions/vazir-vcs/index.ts`
- `.pi/extensions/vazir-context/index.ts`
- `.context` settings/state files if the new mirror setting needs persistence
- Regression coverage for mixed-VCS detection, settings normalization, and mirror-aware status behavior

## Out of scope
- Running `fossil git export`
- Auto-sync, auto-push, or cron/timer setup
- Inferring mirror mode solely from dual VCS detection
- General bidirectional mirroring workflows beyond the primary Fossil→Git use case

## Dependencies
- story-014
- story-015
- story-016
- story-033

## Checklist
- [x] Define and persist an explicit mirror-aware VCS settings shape that keeps one authoritative active VCS mode
- [x] Normalize mixed-VCS detection so mirror guidance is opt-in and never silently rewires command behavior
- [x] Update footer/status/settings UX to communicate “Fossil active, Git mirror configured” and related mismatch states clearly
- [x] Keep diff/reset/checkpoint/closeout workflows pinned to the active VCS while surfacing mirror-aware guidance only where relevant
- [x] Add regression coverage for configured mirror mode, missing Git mirror metadata, and dual-detected repos without mirror mode enabled

## Issues
- `npm test` still stops at the pre-existing missing script reference `scripts/validate-vazir-overlay-reader.mts` from `scripts/run-validations.mts`; targeted story validations passed, but the full aggregate suite is not currently green for this unrelated reason.

## Completion Summary
Implemented explicit mirror-aware VCS settings for the Fossil→Git workflow without changing command authority away from the configured active VCS.

- Added normalized `vcs_mirror` settings support in `.pi/lib/vazir-helpers.ts`, including persistence helpers and mirror-status derivation for configured, missing-metadata, and inactive-mismatch states.
- Extended `/vcs-settings` and the generated settings README so users can explicitly enable or disable the informational `git-mirror-of-fossil` mode via settings rather than dual-detection guesswork.
- Updated tracker VCS display publishing and footer chrome to surface mirror-aware status text such as `fossil active, git mirror configured` and mismatch warnings while keeping diff/reset/checkpoint/closeout behavior pinned to the active VCS mode.
- Published initial VCS state immediately on session start so the footer reflects the resolved backend before the deferred refresh tick.
- Added `scripts/validate-vazir-vcs-mirror-settings.mts` plus aggregate-run registration to cover settings normalization, configured mixed-VCS resolution, missing Git mirror metadata warnings, and dual-detected repos with mirror mode disabled.
