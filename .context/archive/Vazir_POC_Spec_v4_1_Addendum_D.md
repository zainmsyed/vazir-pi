# Vazir POC Spec — Addendum D
**Supplements:** v4.1, Addendum A, Addendum B, and Addendum C  
**Status:** Ratified  
**Scope:** Enhanced consolidation system — story-close mini-consolidate, Fallow recurrence tracking, promotion proposal UX, relationship between story-close and manual `/consolidate`

---

## Context

This addendum captures the decision to enrich the consolidation system with two complementary mechanisms: a targeted mini-consolidate that fires automatically at story close, and broader signal inputs for the existing manual `/consolidate` command. It does not modify any existing v4.1, Addendum A, Addendum B, or Addendum C behaviour except where explicitly noted. The only modified command is `/complete-story`. `/consolidate` gains new input sources but its user-facing behaviour and trigger model are unchanged.

The core motivation: the existing learning loop only consumes one signal source — `complaints-log.md` — and only when the user manually runs `/consolidate`. Code review findings, Fallow static analysis output, and story completion patterns all contain promotable signal that currently evaporates at story close. The story closeout moment is the highest-value time to process this signal: scope is known, findings are fresh, and the user is already in a wrap-up mindset.

---

## Two-Tier Consolidation Model

The system now has two complementary consolidation mechanisms with different scopes and trigger models. They are not redundant — they operate at different granularities.

| | Story-close mini-consolidate | Manual `/consolidate` |
|---|---|---|
| **Trigger** | Automatic, at `/complete-story` | User-initiated only |
| **Scope** | Single story — issues, review, Fallow output | All stories — complaints log, reviews, decisions, completion summaries |
| **Frequency** | Every story close | Periodic — after several stories, at milestones |
| **Value** | Fresh, scoped, high-confidence signal | Cross-story patterns, positive signals, rule confidence scoring |
| **Promotes to** | `system.md` (with user approval) | `system.md` (with user approval) |

Story-close catches what just happened. Manual `/consolidate` catches what keeps happening.

---

## Story-Close Mini-Consolidate

### Where it sits in `/complete-story`

The mini-consolidate is added as the final step in the `/complete-story` flow, after the optional story-scoped code review. It consumes the review output before the story is formally closed.

```
/complete-story
      ↓
Readiness check (existing)
      ↓
Optional story-scoped /review with Fallow pre-pass (existing — Addendum B)
      ↓
Mini-consolidate: reads story issues + review findings + Fallow output
      ↓
Proposes rule candidates → user approves, skips, or selects
      ↓
Approved rules promoted to system.md ## Learned Rules with provenance tag
      ↓
Story status set to complete (user-triggered as before)
```

If the user skips the optional code review, the mini-consolidate still runs — it reads the story's issue log directly. The review findings are an enrichment, not a dependency.

### What the mini-consolidate reads

**Story issue log** — all `/fix` entries in the active story's Issues section, including confirmed fixes and their solutions. Confirmed fixes with clear solutions are the strongest candidates — the problem and solution pair is already documented.

**Code review findings** — the `## Findings` section of the story's review file if one exists. Findings already flagged as rule candidates by the reviewer are prioritised. Severity weights promotion confidence: high-severity findings are promoted more aggressively than medium or low.

**Fallow output** — static analysis findings baked into the review file. Fallow findings carry higher promotion confidence than LLM-only review findings because they are machine-verified and deterministic. A Fallow finding that also appears in `complaints-log.md` (recurrence tracking — see below) is treated as a near-certain promotion candidate.

**Existing `system.md` rules** — cross-referenced to avoid promoting duplicates. If a candidate rule is substantially equivalent to an existing rule, the agent notes the overlap and skips promotion rather than creating redundancy.

### Promotion proposal UX

The mini-consolidate always proposes — it never auto-promotes. One prompt, after review:

```
Story closed. Found 2 rule candidates from this story:

1. Always validate form state before calling the submit handler
   (source: /fix "signup button broke" + Fallow complexity flag on handleSubmit)
   Confidence: high — confirmed fix + static analysis agreement

2. Auth middleware must be registered before route handlers
   (source: code review finding, severity: high)
   Confidence: medium — single occurrence, no prior complaints-log signal

Promote both? Skip both? Or enter numbers to select (e.g. "1" or "1 2").
```

If no promotable candidates are found, the agent says so in one line and closes the story without prompting. No noise when there is nothing to surface.

Promoted rules are written to `system.md ## Learned Rules` with provenance tags per Addendum A:

```markdown
- Always validate form state before calling the submit handler <!-- source: story-004, review-2026-05-05 -->
```

---

## Fallow Recurrence Tracking

Fallow findings that recur across multiple stories are a strong learning signal — stronger than a single LLM review observation because they are deterministic and reproducible. The system now tracks Fallow finding recurrence in `complaints-log.md` alongside bug reports.

### How it works

When `/review` runs with a Fallow pre-pass (Addendum B) and produces findings, the agent appends each distinct Fallow finding to `complaints-log.md` using the same append-only format as `/fix` entries, with a `fallow` source tag:

```markdown
2026-05-05T11:30:00Z | story-004 | [fallow] unused-export: src/utils/formatDate.ts:14 — toRelativeTime never imported | status: noted
2026-05-05T11:30:00Z | story-004 | [fallow] complexity: src/agent/vazir-context.ts:203 — applyLocalRuleDedupe exceeds threshold | status: noted
```

Fallow entries participate in the same clustering and threshold logic as `/fix` entries. At 3 occurrences of the same Fallow finding across different stories, it graduates to a promotion candidate during the next mini-consolidate or manual `/consolidate` — whichever runs first.

**Deduplication:** If the same Fallow finding appears in multiple reviews for the same story (e.g. the issue was not fixed between reviews), it counts as one occurrence for that story. Recurrence only increments when the finding appears in a different story's scope.

**Status values for Fallow entries:**
- `noted` — finding recorded, below threshold
- `promoted` — threshold hit, rule promoted to `system.md`
- `resolved` — finding no longer appears in subsequent reviews of the same files (agent updates on next clean Fallow pass)

---

## Enhanced Manual `/consolidate`

The manual `/consolidate` command is unchanged in its trigger model and user-facing behaviour. It gains additional input sources that make its proposals richer.

### Additional inputs (new)

**Story completion summaries** — mined for positive patterns. When multiple stories close cleanly with similar approaches noted in their completion summaries, the agent surfaces this as a positive rule candidate. Example: three stories in a row note "used React Query for all data fetching — no state management issues" → candidate rule "prefer React Query over manual fetch + useState for server data."

**Decisions log** — if `.context/decisions.md` exists (see session handoff / decision log convention), `/consolidate` reads it for recurring decision types. Decisions made the same way more than twice are surfaced as rule candidates.

**Rule confidence adjustment** — rules in `system.md ## Learned Rules` that have not been referenced in any review finding, `/fix` report, or Fallow output across the last N stories are flagged as low-confidence candidates for `/memory-review`. The agent does not remove them — it appends a confidence comment:

```markdown
- Always call preventDefault() before handleSignup() <!-- source: story-002 --> <!-- confidence: low — no signal in last 8 stories -->
```

This feeds `/memory-review`'s stale rule detection (Addendum A) with real usage data rather than pure age-based heuristics.

### What manual `/consolidate` does NOT do

- Does not re-process stories already handled by a story-close mini-consolidate unless new cross-story patterns emerge
- Does not touch the archive (Addendum A's domain)
- Does not auto-promote — same proposal-then-approve UX as always

---

## Positive Pattern Capture

Both the mini-consolidate and manual `/consolidate` now look for positive patterns, not just failures. The system currently learns only from what broke. Cleanly completed stories carry signal too.

**Positive pattern signal sources:**
- Story completion summary "what went well" notes
- Stories with zero `/fix` calls — what did the scope, approach, or constraints have in common?
- Code review findings with zero high-severity issues

**Promotion format for positive rules:**

Positive rules are promoted to `system.md` under a distinct subsection to keep them visually separated from failure-derived rules:

```markdown
## Learned Rules

### From failures
- Always validate form state before calling the submit handler <!-- source: story-004 -->

### From successes  
- Scope declarations under 8 files consistently produce clean story closes <!-- source: story-002, story-005, story-007 -->
```

This separation matters for `/memory-review` — failure rules and success rules have different staleness profiles. A success rule that stops being true is a regression signal. A failure rule that stops firing might mean the problem is solved.

---

## Updated `/complete-story` Flow (full, incorporating this addendum)

```
User: /complete-story
      ↓
Agent inspects target story:
  — unchecked checklist items?
  — open issues (pending / unresolved / reopened)?
  — completion summary written?
      ↓
NOT READY: agent fills gaps, reports blockers, returns to user
      ↓
READY: "Close now, run a review first, or keep working?"
      ↓
REVIEW: story-scoped /review with Fallow pre-pass (Addendum B)
  — review file written to .context/reviews/
  — Fallow findings appended to complaints-log.md with recurrence tracking
      ↓
Mini-consolidate runs (always — with or without review):
  — reads story issues + review findings (if review ran) + Fallow output
  — cross-references existing system.md rules
  — proposes rule candidates with confidence levels
  — user approves, skips, or selects
  — approved rules written to system.md with provenance tags
      ↓
Story status set to complete
Agent confirms closure in one line
```

---

## Relationship to Existing Commands (full picture)

| Command | Consolidation involvement |
|---|---|
| `/fix` | Appends to `complaints-log.md` — feeds both consolidation tiers |
| `/review` | Fallow findings appended to `complaints-log.md` for recurrence tracking |
| `/complete-story` | Triggers story-close mini-consolidate automatically |
| `/consolidate` | Manual broad pass — all stories, cross-story patterns, rule confidence |
| `/memory-review` | Consumes confidence scores set by `/consolidate` — unchanged |

---

## What This Does NOT Change

- `/consolidate` trigger model — still user-initiated only
- `/fix` flow — unchanged
- Addendum A (`/memory-review`) — unchanged; now receives richer confidence signal as input
- Addendum B (Fallow) — unchanged; Fallow output now additionally feeds recurrence tracking in `complaints-log.md`
- Addendum C (design system) — unchanged
- Story status transitions — user still controls `complete`; mini-consolidate runs before closure, not after
- Promotion is always user-approved — no auto-promotion anywhere in the system

---

*Vazir POC Spec — Addendum D. Supplements v4.1, Addendum A, Addendum B, and Addendum C. Covers: two-tier consolidation model (story-close mini-consolidate + manual `/consolidate`), Fallow recurrence tracking in `complaints-log.md`, promotion proposal UX, positive pattern capture, enhanced manual `/consolidate` input sources, rule confidence scoring, updated `/complete-story` flow.*
