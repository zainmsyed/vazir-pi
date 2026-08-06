# Story 063: `/plan idea-NNN` seeding and promotion status flip

**Status:** not-started  
**Type:** feature  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** —

---

## Goal
Add the Addendum G consumption path: `/plan idea-NNN` seeds the planning conversation with the referenced idea file's content, exactly as it would seed from intake material, and then proceeds through the normal v4.1 planning flow unchanged — clarifying questions are still asked because an idea file is not verification-ready. Once planning actually produces story file(s), the idea's status flips to `promoted` and `Promoted to:` names the new story-NNN. If the planning conversation is abandoned before any story file exists, the idea stays `open`. The conversational shorthand "plan this" with an idea open in the viewer resolves to the same single mechanism; `/plan` with no reference behaves exactly as before.

## Verification
Run `/plan idea-NNN` against an existing open idea and confirm the agent starts the planning conversation already aware of the idea's content while still asking clarifying questions. Complete planning and confirm the generated story file(s) follow the normal template and the idea file now reads `**Status:** promoted` with `**Promoted to:** story-NNN` pointing at the real new story. Start `/plan idea-NNN` and abandon before story files are written, and confirm the idea remains `open` with `Promoted to:` unchanged. Confirm `/plan` with no argument is byte-for-byte unchanged in behavior and that referencing a missing or non-open idea yields a clear, actionable message rather than silent failure.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts` — `/plan` argument parsing for `idea-NNN`, seeding of the planning prompt, and post-planning promotion hook
- `.pi/extensions/vazir-context/helpers.ts` — idea reference parsing/validation and promoted-status write helpers
- Targeted validation script for seeding, promotion, and abandoned-planning paths
- `.context/stories/plan.md`
- `.context/stories/intake-brief.md`
- `.context/stories/story-063.md`

## Out of scope — do not touch
- `/idea` capture or browse UX (story-061, story-062)
- Idea browsing inside `/plan` — `/plan` grows no idea-listing or picker logic
- Skipping or shortening the planning clarifying-question flow for idea-seeded runs
- Auto-promotion at reference time; promotion happens only after story file(s) exist
- Injecting `.context/ideas/` wholesale into context or adding relevance-matching/surfacing heuristics
- Changing `/plan` behavior when invoked without an idea reference
- `/fix` carryover routing or `/memory-review` passes over ideas

## Dependencies
- story-061
- story-062

---

## Checklist
- [ ] Parse the `idea-NNN` argument in the `/plan` handler and load the referenced idea file with clear errors for missing or already-resolved ideas
- [ ] Seed the planning conversation with the idea content the same way intake material seeds it, keeping clarifying questions intact
- [ ] Resolve conversational "plan this" after viewing an idea to `/plan idea-NNN` with no second mechanism or extra state
- [ ] Flip status to `promoted` and set `Promoted to:` only after the new story file(s) actually exist at end of planning
- [ ] Keep abandoned planning runs from changing idea status; `/plan` with no reference remains unchanged
- [ ] Add regressions for seeded planning, successful promotion, abandoned planning, and missing-idea error paths
- [ ] Run targeted validation plus a live smoke check of the full idea-to-story flow

---

## Issues

---

## Completion Summary
