# Story 019: Extension split scaffolding and ownership boundaries

**Status:** complete  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-18  
**Completed:** 2026-05-18

---

## Goal
Prepare Vazir for extension decomposition by introducing clear ownership boundaries, shared contracts, and destination scaffolding for split workflow modules without changing user-facing behavior.

## Verification
The codebase contains explicit extension-boundary scaffolding and shared ownership helpers for the planned split, while existing commands still load and behave the same way.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/chrome.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-helpers.ts`
- `.pi/extensions/vazir-review/index.ts`
- `.pi/extensions/vazir-story/index.ts`
- `.pi/extensions/vazir-vcs/index.ts`

## Out of scope — do not touch
- Moving major command implementations into the new extensions
- Behavior redesign of `/review`, `/story`, or `/complete-story`
- Footer restyling

## Dependencies
- story-016
- story-018

## Checklist
- [x] Define shared ownership boundaries for context, story, review, VCS, and chrome responsibilities
- [x] Add destination extension entry files and any minimal registration scaffolding needed for incremental extraction
- [x] Move or wrap shared helper access behind stable interfaces that future extractions can call
- [x] Ensure existing extensions can delegate to the new scaffolding without behavior changes
- [x] Document code-level split intent in the new scaffolding so future stories have clear migration targets

## Issues
- None currently.

## Completion Summary
Added shared workflow-boundary contracts in `.pi/lib/vazir-helpers.ts` covering context, story, review, VCS, and chrome ownership, including command lists, responsibilities, and migration targets.

Turned `.pi/extensions/vazir-review/index.ts`, `.pi/extensions/vazir-story/index.ts`, and `.pi/extensions/vazir-vcs/index.ts` into explicit split-target scaffolds with exported boundary metadata, summary strings, and no-op registration hooks for incremental extraction.

Added grouped helper facades in `.pi/extensions/vazir-context/helpers.ts` so future split extensions can depend on stable context/story/review/VCS helper access instead of ad hoc symbol imports.

Updated the current `vazir-context` and `vazir-tracker` entrypoints to register the new no-op scaffolds up front, preserving current behavior while establishing the future delegation path. Exposed matching chrome/VCS boundary metadata from tracker support files.

Verification: `npm test`
