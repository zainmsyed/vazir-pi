# Story 006: Fallow recurrence tracking in complaints-log

**Status:** complete  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-13  
**Completed:** 2026-05-13

---

## Goal
When `/review` produces Fallow findings, append them to `complaints-log.md` with recurrence tracking. Same finding across multiple stories increments a counter; at 3 occurrences it becomes a promotion candidate.

## Verification
Create a review file containing a `## Fallow Findings` section with two identical findings across two different story reviews. Run the review closeout flow — `complaints-log.md` contains two `[fallow]` entries with `status: noted`. Create a third review with the same finding — the entry updates to `status: promoted` (or becomes a candidate in the next mini-consolidate). Same finding repeated in the same story does NOT increment the counter.

## Scope — files this story may touch
- `.pi/extensions/vazir-tracker/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`
- `.pi/extensions/vazir-context/index.ts`

## Out of scope — do not touch
- Fallow static analysis engine itself (Addendum B)
- Mini-consolidate promotion UX (story-005)
- Manual `/consolidate` enhancements (story-007)

## Dependencies
- story-005

---

## Checklist
- [x] Define Fallow finding format expected in review files (e.g. lines under `## Fallow Findings` starting with `- `)
- [x] Implement `appendFallowToComplaintsLog(cwd, storyLabel, fallowFindings[])` in vazir-tracker/index.ts or helpers.ts that writes entries like:
  `2026-05-05T11:30:00Z | story-004 | [fallow] unused-export: src/utils/formatDate.ts:14 — toRelativeTime never imported | status: noted`
- [x] Implement `countFallowOccurrences(cwd, findingKey)` that returns number of distinct stories with the same finding key
- [x] Implement deduplication: if the same finding appears in multiple reviews for the same story, count as one occurrence
- [x] Update `/review` handler in vazir-context/index.ts to scan the completed review file for Fallow findings and call the appender
- [x] Update status transitions: `noted` (below threshold) → `promoted` (at 3+ distinct stories)
- [x] Ensure the complaints-log parser in `/consolidate` and mini-consolidate recognizes `[fallow]` entries as valid signal sources
- [x] Manual verification with mock review files containing fake Fallow findings

---

## Issues

---

## Completion Summary
Added structured `## Fallow Findings` support to review files using `- rule: location — summary` lines, plus helper functions to parse those findings, normalize recurrence keys, count distinct-story occurrences, and append `[fallow]` entries into `complaints-log.md`. Completed review closeout now records story-scoped Fallow findings automatically and deduplicates repeats from the same story. Once a finding appears in 3 distinct stories, all matching complaints-log entries are promoted from `status: noted` to `status: promoted`. Consolidation instructions now explicitly treat `[fallow]` complaints-log entries as valid recurring signals. Manual verification with mock review files confirmed: two stories stay `noted`, a third story promotes the cluster, and duplicate findings inside the same story review do not create extra occurrences.

