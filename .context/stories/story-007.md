# Story 007: Enhanced manual `/consolidate` with positive patterns and confidence scoring

**Status:** not-started  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-15  
**Completed:** —

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
- [ ] Update `buildConsolidationInstruction()` in helpers.ts to include:
  - Read story completion summaries for positive patterns (clean closes, repeated approaches)
  - Read `.context/decisions.md` if it exists for recurring decision types
  - Mine `complaints-log.md` for both `/fix` and `[fallow]` entries
- [ ] Update `parseLearnedRuleEntry()` and `formatLearnedRuleEntry()` in helpers.ts to support `<!-- confidence: ... -->` comments alongside `<!-- source: ... -->`
- [ ] Update `replaceLearnedRules()` to preserve and emit confidence comments
- [ ] Implement `updateRuleConfidence(cwd)` in helpers.ts that scans last N story completions/reviews and appends confidence comments:
  - High: referenced in recent review/finding/fix
  - Low: no signal in last N stories
- [ ] Update `appendLearnedRules()` or add `organizeLearnedRules()` to group rules under `### From failures` and `### From successes` subsections within `## Learned Rules`
- [ ] Update `/consolidate` handler in vazir-context/index.ts to call confidence scoring after rule deduplication
- [ ] Verify that existing rules without confidence tags are left intact (backwards compatibility)
- [ ] Manual verification: run `/consolidate` and inspect `system.md` for subsections and confidence annotations

---

## Issues

---

## Completion Summary

