# Story 061: Idea file foundation and `/idea [description]` direct capture

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** 2026-08-06

---

## Goal
Establish the Addendum G idea tracker foundation: a `.context/ideas/` folder of one numbered `idea-NNN.md` file per captured idea (mirroring the `stories/` convention), a canonical idea file template with `open | promoted | discarded` status frontmatter, shared parse/write/numbering helpers, and the `/idea [description]` command that captures a new idea directly with status `open` and no interruption to the current task. When invoked with no description, `/idea` prompts the user for idea text, retries after empty input, and exits only when the user provides an idea or explicitly cancels; it never drafts from the current conversation.

## Verification
Run `/idea [description]` mid-story and confirm a new `.context/ideas/idea-NNN.md` is written with the exact template (sequential numbering, `**Status:** open`, `**Captured:** <date>`, `**Promoted to:** —`) and that the current work is not interrupted by any confirmation prompt or scope discussion. Re-run to confirm numbering increments and existing files are never overwritten. Invoke bare `/idea`, enter an empty value, and confirm it prompts again; then enter an idea and confirm capture. Invoke it again and explicitly cancel to confirm no file is created and no current-work context is inferred.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts` — `/idea` command registration and direct-capture handler
- `.pi/extensions/vazir-context/helpers.ts` — idea file path, sequential numbering, template rendering, and lenient idea frontmatter parse helpers
- `.pi/skills/vazir-base/SKILL.md` or command help registry — brief `/idea` discoverability note if convention requires
- Targeted validation script for idea capture and numbering
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-061.md`

## Out of scope — do not touch
- The bare `/idea` numbered selector and browse/list UX (story-062)
- `/plan idea-NNN` seeding and status promotion (story-063)
- Injecting idea files into the agent's context window on any turn
- Auto-promotion of ideas to stories under any condition
- Deleting discarded ideas; new viewer, picker, or menu components
- An `explored` or any other intermediate status value
- Existing `/plan`, `/story`, `/remember`, `/unlearn` behavior

## Dependencies
- None (net-new capability; reuses existing `/remember`-style capture conventions)

---

## Checklist
- [x] Add idea helpers: `.context/ideas/` path resolution, next `idea-NNN` numbering, canonical template renderer, and lenient status parse (open/promoted/discarded)
- [x] Register `/idea` in `vazir-context` and implement `/idea [description]` direct capture writing status `open` with no confirmation prompt
- [x] Support bare `/idea` with no description prompting for user input, retrying empty input, and honoring explicit cancellation without drafting from recent conversation
- [x] Ensure capture never interrupts the active story and never injects idea files into context
- [x] Add regressions for template shape, sequential numbering, no-overwrite, and unprompted capture
- [x] Run targeted validation plus a live smoke check of `/idea [description]` mid-story

---

## Issues

---

## Completion Summary
- Added `.context/ideas/` path, sequential numbering, canonical `idea-NNN.md` rendering, title derivation, and lenient `open`/`promoted`/`discarded` frontmatter parsing helpers.
- Registered `/idea` in `vazir-context`: descriptions are captured immediately with an exclusive file write (`wx`) so existing ideas cannot be overwritten; bare invocation prompts for user input, retries empty input, and honors explicit cancellation without changing the active story.
- Added `scripts/validate-vazir-idea-capture.mts`, covering canonical template output, sequential numbering from an existing file, no-overwrite behavior, supported status parsing, direct capture notifications, empty-input retry, and cancellation.
- Mechanically verified the new validation script, the existing `/remember` regression, and `git diff --check`; the live Pi smoke check confirmed bare `/idea` retries empty input, captures entered text, and honors cancellation without changing story-061.
