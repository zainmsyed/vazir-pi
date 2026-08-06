# Story 061: Idea file foundation and `/idea [description]` direct capture

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** —

---

## Goal
Establish the Addendum G idea tracker foundation: a `.context/ideas/` folder of one numbered `idea-NNN.md` file per captured idea (mirroring the `stories/` convention), a canonical idea file template with `open | promoted | discarded` status frontmatter, shared parse/write/numbering helpers, and the `/idea [description]` command that captures a new idea directly with status `open` and no interruption to the current task. When invoked with no description but relevant recent conversation exists, the agent may draft one, matching the bare-`/remember` pattern.

## Verification
Run `/idea [description]` mid-story and confirm a new `.context/ideas/idea-NNN.md` is written with the exact template (sequential numbering, `**Status:** open`, `**Captured:** <date>`, `**Promoted to:** —`) and that the current work is not interrupted by any confirmation prompt or scope discussion. Re-run to confirm numbering increments and existing files are never overwritten. Invoke `/idea` with no description in a session with relevant recent conversation and confirm the agent drafts a description instead of failing.

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
- [ ] Add idea helpers: `.context/ideas/` path resolution, next `idea-NNN` numbering, canonical template renderer, and lenient status parse (open/promoted/discarded)
- [ ] Register `/idea` in `vazir-context` and implement `/idea [description]` direct capture writing status `open` with no confirmation prompt
- [ ] Support bare `/idea` with no description drafting from recent conversation, mirroring the `/remember` no-argument pattern
- [ ] Ensure capture never interrupts the active story and never injects idea files into context
- [ ] Add regressions for template shape, sequential numbering, no-overwrite, and unprompted capture
- [ ] Run targeted validation plus a live smoke check of `/idea [description]` mid-story

---

## Issues

---

## Completion Summary
