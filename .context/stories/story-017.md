# Story 017: Runtime guardrails for destructive VCS operations

**Status:** in-progress  
**Created:** 2026-05-15  
**Last accessed:** 2026-05-15  
**Completed:** —

---

## Goal
Prevent dangerous VCS-damaging operations from executing by adding runtime command guardrails that block destructive actions against protected Git, JJ, and Fossil metadata unless the user has given explicit approval in the required form.

## Verification
Attempting a blocked destructive command against protected VCS state is intercepted with a clear refusal/warning instead of executing.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-tracker/vcs.ts`
- `.pi/lib/vazir-helpers.ts`
- `types/pi-runtime-ambient.d.ts`

## Out of scope
- Reworking repository initialization flows beyond the guard checks
- Broader command auditing unrelated to VCS safety
- Extension split work

## Dependencies
- story-016

## Checklist
- [x] Identify the extension interception points where Vazir can inspect dangerous commands before execution
- [x] Block destructive command patterns when they target protected VCS metadata or would reinitialize an already initialized repo without explicit approval
- [x] Define and enforce a specific approval-token flow for intentionally destructive VCS actions
- [x] Emit user-facing guidance that explains why the operation was blocked and what exact approval is required
- [x] Ensure non-destructive VCS operations and ordinary file edits continue to work normally

## Issues
- None currently.

## Completion Summary
Added runtime VCS guardrails around tracker `tool_call` preflight so destructive `bash` commands and direct `write`/`edit` attempts against protected Git, JJ, and Fossil metadata are blocked unless the user supplies the exact one-shot `VCS_APPROVE <token>` phrase for the same action. Shared helpers now detect existing protected VCS state, avoid blocking `git init` in empty folders while still blocking reinitialization in existing repos, and emit reusable guidance text that explains the approval flow.
