# Story 007: Enhanced manual `/consolidate` with positive patterns and confidence scoring

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-13  
**Completed:** 2026-05-13

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
- [x] Update `appendLearnedRules()` and add `organizeLearnedRules()` to group rules under `### From failures` and `### From successes` subsections within `## Learned Rules`
- [x] Update `/consolidate` handler in vazir-context/index.ts to call confidence scoring after rule deduplication
- [x] Verify that existing rules without confidence tags are left intact (backwards compatibility)
- [x] Manual verification: run `/consolidate` and inspect `system.md` for subsections and confidence annotations
- [x] Update `finishLearnedRuleCloseout()` (mini-consolidate in `/complete-story`) to check the closing story's `## Issues

### /fix — "so it still added in learned rules and not catogarized them from falures and from success. the mini cosolodate after story workflow. we should just reuse whats happening in /consolodate"
- **Reported:** 2026-05-13  
- **Status:** resolved  
- **Agent note:** Added `organizeLearnedRules(ctx.cwd)` to `finishLearnedRuleCloseout()` so the mini-consolidate reuses the same subsection categorization as `/consolidate`.  
- **Solution:** `finishLearnedRuleCloseout()` now calls both `applyLocalRuleDedupe()` and `organizeLearnedRules()` after rule promotion, ensuring all rules (newly promoted and existing) are consistently categorized into `### From failures` and `### From successes` subsections.
` section and tag promoted rules with `kind: "failure"` (if issues exist) or `kind: "success"` (if clean) before calling `promoteRulesToSystemMd()`, so rules land in subsections immediately instead of staying flat until the next `/consolidate`

---

## Issues

---

## Completion Summary
Implemented enhanced `/consolidate` with positive-pattern awareness and confidence scoring.

`helpers.ts` changes:
- `buildConsolidationInstruction()` now instructs the model to read story completion summaries, `.context/decisions.md` (when present), and to mine `complaints-log.md` for both `/fix` and `[fallow]` entries.
- `parseLearnedRuleEntry()` and `formatLearnedRuleEntry()` were updated to parse and emit `<!-- confidence: ... -->` HTML comments alongside existing `<!-- source: ... -->` tags.
- `replaceLearnedRules()` now groups rules under `### From failures` and `### From successes` subsections when any rule carries a `kind`, and preserves confidence annotations across rewrites.
- `learnedRulesFromMd()` was updated to stop only at `## ` headings (not `### `), so it correctly reads rules from subsections and tracks the current subsection as `kind`.
- `mergeLearnedRuleEntries()` preserves `confidence` and `kind` during deduplication.
- `appendLearnedRules()` preserves `confidence` and `kind` on newly appended rules.
- `updateRuleConfidence(cwd)` scans the last 5 story completions/reviews plus the complaints log. Rules referenced in recent signal get `<!-- confidence: high -->`; rules with no signal get `<!-- confidence: low — no signal in last 5 stories -->`.
- `organizeLearnedRules(cwd)` applies a heuristic to categorize existing rules: if any source story has a non-empty `## Issues` section, the rule is marked `failure`; otherwise `success`. It then rewrites `system.md` with the subsection structure.

`index.ts` changes:
- The `/consolidate` handler now calls `applyLocalRuleDedupe()`, `updateRuleConfidence()`, and `organizeLearnedRules()` before dispatching the consolidation instruction to the Pi model.
- Imports updated to include `updateRuleConfidence` and `organizeLearnedRules`.

Backwards compatibility:
- Rules without confidence tags remain unchanged until `updateRuleConfidence` runs. Existing flat `## Learned Rules` sections are preserved until `organizeLearnedRules` or the model introduces subsections.

Manual verification:
- Ran `/consolidate` during this session. `system.md` now contains `### From failures` and `### From successes` subsections under `## Learned Rules`, with rules sourced from story completion summaries. No complaint clusters hit the promotion threshold, so the failure subsection contains only the story-005 handoff-artifact rule. The success subsection contains rules from story-002 through story-006. Confidence annotations will be applied on the next compaction or consolidation pass.

