# Story 022: Extract VCS workflow into `vazir-vcs`

**Status:** complete  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-20    
**Completed:** 2026-05-21

---

## Goal
Move VCS detection, settings, checkpoint, and mode-sync workflow into a dedicated `vazir-vcs` extension so repository-state logic is isolated from story and review flows.

## Verification
VCS preference, active-mode refresh, and checkpoint-related behavior execute through `vazir-vcs` while preserving current Git/JJ and Fossil behavior.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/extensions/vazir-vcs/index.ts`
- `.pi/lib/vazir-helpers.ts`
- `types/pi-runtime-ambient.d.ts`

## Out of scope — do not touch
- Footer/chrome restyling
- Story lifecycle extraction
- New VCS features beyond parity-preserving moves

## Dependencies
- story-019
- story-018

## Checklist
- [x] Identify VCS-specific handlers and state-sync code that should live outside `vazir-tracker`
- [x] Move or delegate VCS preference, detection, and checkpoint flows into `vazir-vcs`
- [x] Preserve Fossil vs Git/JJ mode selection behavior during the extraction
- [x] Keep tracker/chrome integration limited to consuming published VCS state
- [x] Verify the extracted module remains the single owner of VCS workflow decisions

## Issues
- None currently.

## Completion Summary
Extracted the active VCS workflow into `.pi/extensions/vazir-vcs/index.ts` and left `vazir-tracker` as a thin consumer/delegate. `vazir-vcs` now owns VCS command registration (`/vcs-settings`, `/diff`, `/checkpoint`, `/reset`), mode resolution, repo-state sync, checkpoint recovery/snapshot flows, and VCS tool guard/event handling; `vazir-tracker` now re-exports `refreshVcsState()`/`getResolvedVcsKind()` for compatibility and only mounts chrome/session UI helpers.

Preserved existing Git/JJ vs Fossil selection behavior by moving the same settings/init logic into the new owner module and validating the main tracker/init/checkpoint/status-chrome flows end to end.
