# Story 002: Design context injection and lazy first-UI-story questions

**Status:** not-started  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-05  
**Completed:** —

---

## Goal
Inject `design-system.md` into the system prompt for UI stories only. Ensure the agent reads `brand.md` and `components.md` at story start, and ask lazy surface-level design questions when `design-system.md` is empty or incomplete.

## Verification
Start a UI story (`.tsx` scope or `Type: ui`) — the injected system prompt contains the contents of `design-system.md`. Start a non-UI story (e.g. API route `.ts`) — no design content is injected. With an empty `design-system.md`, the first UI story implementation triggers the agent to ask the four standard gap questions before writing code.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/index.ts`

## Out of scope — do not touch
- `/design` command (story-003)
- Review compliance checklist (story-004)
- Token cap trimming logic (handled by `/design` command in story-003)

## Dependencies
- story-001

---

## Checklist
- [ ] Update `before_agent_start` in vazir-context/index.ts to detect active story UI status via helpers from story-001
- [ ] If UI story, read `design-system.md` and append it to the injected context alongside context-map.md and system.md
- [ ] Ensure `brand.md` and `components.md` are NOT injected per-turn; instead, update `buildImplementStoryInstruction()` in vazir-tracker/index.ts to tell the agent to read them at story start
- [ ] Update `buildImplementStoryInstruction()` to include: "If this is a UI story, read `.context/design/brand.md` and `.context/design/components.md` before writing component code"
- [ ] Add lazy-question logic: if `design-system.md` is empty or contains `—` placeholders, the implement instruction tells the agent to pause and ask the four standard gap questions (primary colour, font, visual style, hard constraints)
- [ ] After user answers, the agent fills gaps in `design-system.md` and `brand.md` and marks fields with `<!-- source: story-NNN -->`
- [ ] Confirm non-UI stories skip all design injection and questioning

---

## Issues

---

## Completion Summary

