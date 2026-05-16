# Story 006: Fallow recurrence tracking in complaints-log

**Status:** in-progress  
**Created:** 2026-05-05  
**Last accessed:** 2026-05-16  
**Completed:** —

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
- [ ] Ensure the complaints-log parser in `/consolidate` and mini-consolidate recognizes `[fallow]` entries as valid signal sources
- [x] Manual verification with mock review files containing fake Fallow findings

---

## Issues

### /fix — reopened due to regression after story-014 VCS closeout refactor
- **Reported:** 2026-05-15  
- **Status:** resolved  
- **Agent note:** Story-006 helpers (`reviewFallowFindingsFromFile`, `appendFallowToComplaintsLog`, `countFallowOccurrences`) were implemented on branch `vazir/story-task-cap-7` but were not present on current main after the VCS closeout refactors (stories 014–015). They were restored into helpers.ts, and the review closeout wiring in index.ts has now been re-validated on current main for both `/review` and `/complete-story` review flows.  
- **Solution:** Added end-to-end validation coverage in `scripts/validate-vazir-fallow-review-closeout.mts` and re-ran `validate-vazir-fallow-recurrence.mts` to confirm append, dedupe, and promotion behavior.

---

## Completion Summary

