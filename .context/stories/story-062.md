# Story 062: `/idea` browse selector, lightweight list, and viewer reuse

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** —

---

## Goal
Implement the bare `/idea` interactive flow from Addendum G: a short numbered selector offering "Capture a new idea" and "View existing ideas" (same pattern as `/unlearn`), where the view option first shows a lightweight one-line-per-idea numbered list (title and status only, same as `/unlearn`'s rule list) and selecting a number opens that idea in the existing scrollable markdown viewer used by `/story`. Once the idea is open, the user directs the agent in plain conversation — fleshing out the body in place (status stays `open`) or asking to plan it, which the agent maps to `/plan idea-NNN`. No new TUI machinery is introduced.

## Verification
Run `/idea` with no arguments and confirm the two-option numbered selector appears with a cancel path. Choosing capture behaves like `/idea [description]` with a prompt for the idea text. Choosing view shows the numbered title-plus-status list of existing ideas; selecting one opens it in the shared markdown viewer; cancel exits cleanly at both levels. In conversation after viewing, ask the agent to expand the idea and confirm the file body grows in place with status still `open`. Confirm a user-requested status change to `discarded` updates the file without deleting it.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts` — bare-`/idea` selector flow, list rendering, and viewer wiring
- `.pi/extensions/vazir-context/helpers.ts` — idea listing/summarization helpers feeding the one-line list
- `.pi/lib/vazir-ui.ts` — only if a small gap in shared selection-list or markdown-viewer helpers must be closed; prefer reuse as-is
- Targeted validation script for the selector, list, and viewer paths
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-062.md`

## Out of scope — do not touch
- `/idea [description]` direct capture internals (story-061), beyond routing the capture option to it
- `/plan idea-NNN` seeding and promotion mechanics (story-063) — this story only ensures the conversational "plan this" mapping is understood
- New viewer, picker, or menu components
- Injecting idea files into the agent's context window or scanning them wholesale
- Auto-promotion, relevance matching, or proactive idea surfacing
- `/story`, `/unlearn` command behavior

## Dependencies
- story-061

---

## Checklist
- [ ] Wire bare `/idea` to a numbered selector with "Capture a new idea" / "View existing ideas" options and cancel handling, mirroring `/unlearn`
- [ ] Route the capture option through the story-061 capture path with a text prompt
- [ ] Render the view option as a lightweight numbered list of title plus status, one line per idea
- [ ] Open a selected idea in the shared markdown viewer used by `/story`, reusing `.pi/lib/vazir-ui.ts` helpers
- [ ] Support conversational expansion of an open idea in place (status stays `open`) and explicit `discarded` transitions without file deletion
- [ ] Add regressions for each selector branch, empty-ideas state, cancel at both levels, and in-place expansion
- [ ] Run targeted validation plus a live smoke check of the full browse flow

---

## Issues

---

## Completion Summary
