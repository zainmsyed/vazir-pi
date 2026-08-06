# Story 063: `/plan idea-NNN` seeding and promotion status flip

**Status:** complete  
**Type:** feature  
**Created:** 2026-08-06  
**Last accessed:** 2026-08-06  
**Completed:** 2026-08-06

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
- [x] Parse the `idea-NNN` argument in the `/plan` handler and load the referenced idea file with clear errors for missing or already-resolved ideas
- [x] Seed the planning conversation with the idea content the same way intake material seeds it, keeping clarifying questions intact
- [x] Resolve conversational "plan this" after viewing an idea to `/plan idea-NNN` with no second mechanism or extra state
- [x] Flip status to `promoted` and set `Promoted to:` only after the new story file(s) actually exist at end of planning
- [x] Keep abandoned planning runs from changing idea status; `/plan` with no reference remains unchanged
- [x] Add regressions for seeded planning, successful promotion, abandoned planning, and missing-idea error paths
- [x] Run targeted validation plus a live smoke check of the full idea-to-story flow

---

## Issues

---

## Completion Summary
- Added `parseIdeaReference()` and `promoteIdea()` helpers in `.pi/extensions/vazir-context/helpers.ts` for parsing `idea-NNN` references and updating an idea file's status to `promoted` with a `Promoted to:` target.
- Extended `pendingPlanRepairRequests` in `.pi/extensions/vazir-context/index.ts` to track the seeded idea number alongside the existing story files present when `/plan` starts.
- Updated the `/plan` handler to detect an `idea-NNN` argument, validate that the idea exists and is `open`, and seed the planning instruction with the idea file's content as planning input while keeping the clarifying-question flow intact.
- Updated the `turn_end` plan-completion guard so that, after new story files are written and validated, a seeded idea is promoted to the first new story created during planning.
- Added `scripts/validate-vazir-plan-idea.mts` covering: seeded instruction content, successful promotion after a new story is written, abandoned planning leaving the idea `open`, missing-idea error, non-open idea error, and unchanged `/plan` with no reference.
- Registered the new validation script in `scripts/run-validations.mts`, updated `.context/stories/plan.md` to mark story-063 in-progress, and refreshed `.context/stories/intake-brief.md` to note the implementation.
- Added remediation hardening: idea references are validated before `/plan` side effects, seeded promotion state survives malformed-story repair turns, and plain `plan this` input is translated to the same `/plan idea-NNN` command after viewing an idea.
- Expanded `scripts/validate-vazir-plan-idea.mts` to cover repair-then-promotion, no-artifact rejection for missing ideas, and the conversational shorthand handoff.
- Verified all targeted validations plus the existing `/remember` regression pass and `git diff --check` is clean on touched files.
