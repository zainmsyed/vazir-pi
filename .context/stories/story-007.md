# Story 007: Enhanced manual `/consolidate` with positive patterns and confidence scoring

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-17  
**Completed:** 2026-05-17

---

## Goal
Update manual `/consolidate` to consume story completion summaries and decisions for positive patterns, score rule confidence based on recent signal, and organize `system.md` into failure-derived and success-derived subsections.

## Verification
Run `/consolidate` — the consolidation instruction mentions reading story completion summaries and `.context/decisions.md` for positive patterns. After running, `system.md` contains `### From failures` and `### From successes` under `## Learned Rules`. Rules with no signal across the last several stories have `<!-- confidence: low — no signal in last N stories -->` appended. Low-confidence rules are surfaced for `/memory-review` consideration.

## Scope — files this story may touch
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/index.ts`

## Out of scope — do not touch
- `/memory-review` command itself (Addendum A)
- Mini-consolidate flow (story-005)
- Fallow tracking (story-006)

## Dependencies
- story-005
- story-006

---

## Checklist
- [x] Update `buildConsolidationInstruction()` in helpers.ts to include:
  - Read story completion summaries for positive patterns (clean closes, repeated approaches)
  - Read `.context/decisions.md` if it exists for recurring decision types
  - Mine `complaints-log.md` for both `/fix` and `[fallow]` entries
- [x] Update `parseLearnedRuleEntry()` and `formatLearnedRuleEntry()` in helpers.ts to support `<!-- confidence: ... -->` comments alongside `<!-- source: ... -->`
- [x] Update `replaceLearnedRules()` to preserve and emit confidence comments
- [x] Implement `updateRuleConfidence(cwd)` in helpers.ts that scans last N story completions/reviews and appends confidence comments:
  - High: referenced in recent review/finding/fix
  - Low: no signal in last N stories
- [x] Update `appendLearnedRules()` or add `organizeLearnedRules()` to group rules under `### From failures` and `### From successes` subsections within `## Learned Rules`
- [x] Update `/consolidate` handler in vazir-context/index.ts to call confidence scoring after rule deduplication
- [x] Verify that existing rules without confidence tags are left intact (backwards compatibility)
- [x] Manual verification: ran `updateRuleConfidence()` and `organizeLearnedRules()` directly on the real project; `system.md` gained confidence annotations (`high` on all current rules) and a `### From failures` subsection. Original file restored after verification.

---

## Issues

### /fix — reopened due to regression after story-014 VCS closeout refactor
- **Reported:** 2026-05-15  
- **Status:** resolved  
- **Agent note:** Story-007 consolidation enhancements (confidence scoring, subsection categorization) were merged from branch `vazir/story-task-cap-7` but later VCS closeout refactors (stories 014–015) overwrote the `parseLearnedRuleEntry`/`replaceLearnedRules`/`appendLearnedRules` implementations, stripping out `confidence`/`kind` support. The old code was restored into helpers.ts, and the `/consolidate` handler on current main is now wired again to call `updateRuleConfidence()` and `organizeLearnedRules()`. Validation scripts passed after the patch.  
- **Solution:** Restored the richer consolidation instruction in `helpers.ts`, re-wired `/consolidate` in `index.ts`, re-ran validation scripts, and manually verified `updateRuleConfidence` + `organizeLearnedRules` on the real project directory.

---

## Completion Summary

Restored the story-007 consolidation behavior that had previously shipped on trunk and was later regressed by VCS closeout refactors.

Completed in this pass:
- Reinstated the richer `/consolidate` instruction so it reads story completion summaries, optionally reads `.context/decisions.md`, and preserves confidence annotations while organizing rules into failure/success subsections.
- Re-wired the `/consolidate` handler to run local dedupe, `updateRuleConfidence()`, and `organizeLearnedRules()` before handing off to the model.
- Re-verified helper behavior with:
  - `node scripts/validate-vazir-confidence-and-subsections.mts`
  - `node scripts/validate-vazir-fallow-signal-sources.mts`

Manual verification completed on real project:
- `updateRuleConfidence` promoted all 6 existing learned rules to `high` confidence.
- `organizeLearnedRules` grouped rules under `### From failures` (source stories have issues sections) and preserved formatting.
- Original `system.md` was restored after verification.

