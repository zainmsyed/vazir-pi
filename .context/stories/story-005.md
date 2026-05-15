# Story 005: Story-close mini-consolidate and promotion UX

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-15  
**Completed:** 2026-05-15

---

## Goal
Add an automatic mini-consolidate step to `/complete-story` that reads the story's issues and review findings, proposes rule candidates with confidence levels, and lets the user approve, skip, or select before the story is closed.

## Verification
Run `/complete-story` on an in-progress story that has `/fix` issues logged. After the optional review closeout, the agent presents 1–2 rule candidates with confidence labels. Selecting a candidate promotes it to `system.md ## Learned Rules` with a provenance tag. Skipping leaves the story to close without promotion. If no candidates are found, the agent closes the story with a one-line note.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`

## Out of scope — do not touch
- Fallow recurrence tracking (story-006)
- Manual `/consolidate` enhancements (story-007)
- Design system features (stories 001–004)

## Dependencies
- —

---

## Checklist
- [x] Build `buildMiniConsolidateInstruction(cwd, storyLabel, reviewFilePath?)` in helpers.ts that instructs the agent to read the story file Issues section, review findings (if review ran), and any Fallow output, then propose rule candidates
- [x] Insert mini-consolidate into `/complete-story` closeout flow in `agent_end`: after review remediation finishes and before `completeStoryNow()`, dispatch the mini-consolidate instruction via `sendInternalAgentMessage`
- [x] Implement promotion proposal UX: present candidates with confidence (high/medium/low) and source attribution; prompt user to "Promote both? Skip both? Or enter numbers to select"
- [x] Implement `promoteRulesToSystemMd(cwd, rules[])` in helpers.ts that appends approved rules to `system.md ## Learned Rules` with `<!-- source: story-NNN -->` provenance tags
- [x] Cross-reference existing `system.md` rules to avoid duplicates; if equivalent rule exists, note overlap and skip
- [x] If no candidates found, emit one-line note and proceed to close
- [x] Ensure the mini-consolidate runs even when the user skips the optional code review (reads story issues directly)

---

## Issues

### /fix — "can you add the color back to the issues tracker that was just added back"
- **Reported:** 2026-05-06  
- **Status:** resolved  
- **Agent note:** Restored red `error` tone to the issue tracker segment in `storyStatusWidgetLines`. The `⚠` glyph now renders in the red `error` ANSI color instead of the yellow `warning` tone.  
- **Solution:** Changed `paint("⚠", "warning")` + `paint(..., "warning")` back to `paint("⚠", "error")` + `paint(..., "error")` in `.pi/extensions/vazir-tracker/chrome.ts`.


---

## Completion Summary

Implemented story-close mini-consolidate and promotion UX across `vazir-context`.

`helpers.ts` gained four new exports:
- `miniConsolidateCandidatesPath` — determines the temporary candidates file path for a story.
- `buildMiniConsolidateInstruction` — instructs the agent to read the story Issues section (and review file if present), then write 0–2 rule candidates to the temporary file with confidence labels (`high`/`medium`/`low`).
- `parseMiniConsolidateCandidates` — reads the agent-written file and returns structured candidates.
- `promoteRulesToSystemMd` — promotes selected rules into `system.md ## Learned Rules`, cross-references existing rules via `appendLearnedRules` to avoid duplicates, and reports which were promoted vs skipped.

`index.ts` changes:
- `PendingCompleteStoryRequest` now tracks `closeIntent` and `miniConsolidatePhase` to defer story completion until after the mini-consolidate agent turn.
- `processCompleteStoryReviewCloseout` now stores the close intent instead of completing immediately, allowing the outer `agent_end` to run mini-consolidate next.
- The `/complete-story` handler similarly defers completion by setting the pending request and dispatching the mini-consolidate instruction.
- `agent_end` handles the deferred closeout: after review remediation (or immediately if no review), it checks for the candidates file. If present, it presents the promotion UX (`runMiniConsolidateCloseout`). If not yet written, it sends the instruction and waits for the next `agent_end`. If no candidates are found, it emits a one-line notification and closes. If candidates exist, it shows a picker with options like "Promote all", "Skip all", or "Promote N", then promotes the selected rules and finally closes the story.

The `validate-vazir-complete-story.mts` test script was updated to simulate the mini-consolidate agent turn (writing `No candidates found.`) and calling the extra `agent_end` required before stories are now marked complete.
