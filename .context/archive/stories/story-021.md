# Story 021: Extract story lifecycle into `vazir-story`

**Status:** complete  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-20  
**Completed:** 2026-05-20

---

## Goal
Move story-picking, implementation, issue-closeout, and `/complete-story` lifecycle logic into a dedicated `vazir-story` extension while preserving the current story workflow.

## Verification
Story lifecycle commands execute through `vazir-story` and preserve existing story selection, issue handling, and closeout behavior.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-story/index.ts`
- `.pi/lib/vazir-helpers.ts`
- `types/pi-runtime-ambient.d.ts`

## Out of scope — do not touch
- Review lifecycle extraction
- VCS/settings extraction
- New story UX beyond parity-preserving moves

## Dependencies
- story-019
- story-020

## Checklist
- [x] Identify story lifecycle handlers and helpers split across current extensions
- [x] Move or delegate `/story`, `/implement`, and `/complete-story` lifecycle logic into `vazir-story`
- [x] Preserve issue logging and story state transitions during the extraction
- [x] Keep cross-extension calls to review and VCS helpers explicit and minimal
- [x] Verify story-close handoffs still work before and after optional review flows

## Issues
- None currently.

## Completion Summary
Extracted story lifecycle into `.pi/extensions/vazir-story/index.ts`: command handlers (`/story`, `/implement`, `/fix`, `/complete-story`), event handlers (`input`, `before_agent_start`, `agent_end`, `session_shutdown`), and all closeout helpers (readiness assessment, review handoff, learned-rule closeout, mini-consolidate). `vazir-context` and `vazir-tracker` now hold thin delegates that import from `vazir-story`. Fixed a `sendInternalAgentMessage` argument-order bug in `startLearnedRuleCloseout` and restored `assessStoryCompletionReadiness` to match the original issue-status filter (`pending`/`unresolved`/`reopened`). Added `STORY_WORKFLOW_BOUNDARY` and `storyWorkflowScaffoldSummary` exports. Updated all validation scripts to load `vazir-story` alongside dependent extensions and resolved module-instantiation cache-key mismatches. Full validation suite passes.
