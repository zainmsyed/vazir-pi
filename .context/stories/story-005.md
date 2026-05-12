# Story 005: Story-close mini-consolidate and promotion UX

**Status:** in-progress  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-12  
**Completed:** —

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
- [ ] Build `buildMiniConsolidateInstruction(cwd, storyLabel, reviewFilePath?)` in helpers.ts that instructs the agent to read the story file Issues section, review findings (if review ran), and any Fallow output, then propose rule candidates
- [ ] Insert mini-consolidate into `/complete-story` closeout flow in `agent_end`: after review remediation finishes and before `completeStoryNow()`, dispatch the mini-consolidate instruction via `sendInternalAgentMessage`
- [ ] Implement promotion proposal UX: present candidates with confidence (high/medium/low) and source attribution; prompt user to "Promote both? Skip both? Or enter numbers to select"
- [ ] Implement `promoteRulesToSystemMd(cwd, rules[])` in helpers.ts that appends approved rules to `system.md ## Learned Rules` with `<!-- source: story-NNN -->` provenance tags
- [ ] Cross-reference existing `system.md` rules to avoid duplicates; if equivalent rule exists, note overlap and skip
- [ ] If no candidates found, emit one-line note and proceed to close
- [ ] Ensure the mini-consolidate runs even when the user skips the optional code review (reads story issues directly)

---

## Issues

### /fix — "can you add the color back to the issues tracker that was just added back"
- **Reported:** 2026-05-06  
- **Status:** resolved  
- **Agent note:** Restored red `error` tone to the issue tracker segment in `storyStatusWidgetLines`. The `⚠` glyph now renders in the red `error` ANSI color instead of the yellow `warning` tone.  
- **Solution:** Changed `paint("⚠", "warning")` + `paint(..., "warning")` back to `paint("⚠", "error")` + `paint(..., "error")` in `.pi/extensions/vazir-tracker/chrome.ts`.


---

## Completion Summary

