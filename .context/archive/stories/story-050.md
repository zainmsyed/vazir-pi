# Story 050: Compact mirror-health footer status for Fossil→Git workflows

**Status:** complete  
**Type:** —  
**Created:** 2026-06-02
**Last accessed:** 2026-06-02  
**Completed:** 2026-06-02

---

## Goal
Replace the current verbose mirror footer/status text with short, color-coded mirror-health labels that are immediately useful during Fossil→Git mirror workflows.

## Verification
Render the footer/status chrome across representative mirror states and confirm the mirror segment uses compact labels such as configured/healthy, inactive, missing path, or invalid/missing mirror, with green/yellow/red tone changes that match the actual state and without expanding the footer with long sentences.

## Scope
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-helpers.ts`
- `.pi/lib/vazir-vcs-helpers.ts`
- Command/help copy only where needed to keep terminology aligned with the new compact labels
- Regression coverage for mirror-health status rendering

## Out of scope
- Mirror-path setup prompts themselves
- Mirror sync execution semantics
- Broader footer redesign unrelated to mirror health

## Dependencies
- story-047
- story-049

## Checklist
- [x] Define a compact mirror-health label set and severity mapping for healthy, inactive, missing-path, and invalid/missing-metadata states
- [x] Update mirror-status derivation so footer consumers receive short labels plus reliable severity signals instead of long descriptive sentences
- [x] Render the compact labels with useful green/yellow/red chrome treatment in the footer/status path
- [x] Keep detailed explanations in prompts/notifications while preventing verbose mirror prose from bloating the footer
- [x] Add regression coverage for at least one healthy state and multiple warning/error mirror states

## Issues
- None yet.

## Completion Summary
Replaced verbose mirror footer text with compact, color-coded mirror-health labels.

- Extended `VcsMirrorStatus` in `.pi/lib/vazir-helpers.ts` with a `severity` field and a new `missing-path` state. Updated `describeVcsMirrorStatus` to return short labels (`git mirror`, `mirror inactive`, `mirror path missing`, `fossil missing`, `git missing`) with severity mapping (`success`, `warning`, `error`, `null`).
- Updated `VcsDisplayInfo` in both `.pi/extensions/vazir-tracker/vcs.ts` and `.pi/lib/vazir-vcs-helpers.ts` to carry `mirrorSeverity`, and changed `buildVcsDisplayInfo` to use `shortLabel` instead of `detail` for the footer.
- Updated `.pi/extensions/vazir-tracker/chrome.ts` so `setVcsFlags` and `_vcsDisplay` accept `mirrorSeverity`, and rewrote `footerVcsStatusSegment` to derive tone directly from severity instead of fragile string matching on long sentences.
- Added regression scenarios in `scripts/validate-vazir-vcs-mirror-settings.mts` covering healthy (`git mirror` + success), inactive (`mirror inactive` + warning), missing path (`mirror path missing` + warning), missing fossil (`fossil missing` + error), and missing git (`git missing` + error) states.
