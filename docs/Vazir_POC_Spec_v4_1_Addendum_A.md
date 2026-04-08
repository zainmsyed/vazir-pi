# Vazir POC Spec — Addendum A
**Supplements:** v4.1  
**Status:** Ratified  
**Scope:** Memory hygiene system — `/memory-review` command, archive workflow, destructive operation UX hierarchy

---

## Context

This addendum captures design decisions made after v4.1 was finalized. It does not modify any existing v4.1 behaviour. All commands, file contracts, and workflows in v4.1 remain unchanged. This addendum adds net-new capabilities only.

The core motivation: as a project matures, `.context/` accumulates. Completed stories pile up, `system.md` grows, and the signal-to-noise ratio degrades. The learning loop is only as good as the hygiene around it. This addendum introduces a deliberate, user-controlled mechanism for keeping the knowledge base lean and high-quality.

---

## New Concept: `.context/archive/`

A cold storage folder for context that is no longer active but should be preserved.

- Never injected into the agent's context window
- Never scanned during normal operation
- Queryable on demand if the agent explicitly needs historical reference
- Distinct from deletion — archive is reversible, delete is not

```
.context/
├── memory/
├── stories/
├── complaints-log.md
├── archive/               ← NEW
│   ├── stories/           ← Retired/old story files moved here
│   └── reviews/           ← Old review files moved here
└── settings/
```

---

## New Command: `/memory-review`

A periodic, user-triggered deep cleanup of the knowledge base. Distinct from `/consolidate`, which is narrow and frequent (processes `complaints-log.md` → `system.md`). `/memory-review` is broader and less frequent — it looks at the whole knowledge base and proposes what to prune, archive, or flag.

**Handler:** `vazir-context.ts`

**Trigger:** User-initiated only. Never automatic. Suggested after major project milestones (post-launch, after N stories complete, or whenever the user notices `.context/` feeling bloated).

### What `/memory-review` does

Three sequential passes, each presented to the user separately:

**Pass 1 — Archive candidates**  
Stories with status `complete` or `retired` that have not been referenced by any active story's Dependencies section and are older than the last 3 completed stories. Agent presents the full list with a one-line reason per file. User confirms as a batch or removes exceptions.

**Pass 2 — Stale rule candidates**  
Rules in `system.md ## Learned Rules` that have no provenance tag (see Addendum A: Rule Provenance below) or whose source story has been archived. Agent flags these for user review — not automatic removal. User decides: keep, remove via `/unlearn`, or update manually.

**Pass 3 — Delete candidates**  
Files the agent has identified as genuinely obsolete — typically superseded drafts in `intake/` or empty/stub files. Presented separately from archive candidates with explicit destructive operation UX (see below).

---

## Rule Provenance

When a rule is promoted to `system.md ## Learned Rules` (via threshold promotion, `/remember`, or code review), the agent appends a provenance tag:

```markdown
## Learned Rules

- Always call preventDefault() before handleSignup() <!-- source: story-002 -->
- Session token must be stored in localStorage, not memory <!-- source: story-004, story-007 -->
```

This is lightweight metadata — a comment in the markdown, not a structured field. It serves two purposes:
1. During `/memory-review`, the agent can identify rules whose source stories have all been archived and flag them for review.
2. During `/unlearn`, the agent can show the user where a rule came from to help them decide whether to remove it.

Provenance is best-effort. Rules promoted before this addendum was adopted have no provenance tag and are treated as "origin unknown" — never automatically flagged for removal, only surfaced for human review.

---

## Destructive Operation UX Hierarchy

All destructive operations in Vazir follow a two-tier UX model. The tier is determined by reversibility, not by the number of files affected.

### Tier 1 — Archive (reversible)

Single batch confirmation. Agent presents the full proposed list with a brief reason per file. User reviews as a whole and approves or names exceptions to preserve.

```
Ready to archive 8 files. These haven't been referenced in 15+ stories:

  story-003.md   — "Add auth flow" (complete, 3 months ago, no active dependents)
  story-007.md   — "Fix pagination bug" (complete, no active dependents)
  review-2026-01-14.md — (complete, story-003 archived)
  ...

Archive all? Or name any files you want to keep active.
```

One confirmation, batch operation. Files move to `.context/archive/`. No second prompt.

### Tier 2 — Delete (irreversible)

Two-step confirmation with visual distinction. The agent wraps the delete prompt in a clearly marked warning block. After the user confirms intent, the agent echoes back the specific files and requires a second explicit confirmation before executing.

Step 1 — Intent confirmation (visually flagged):
```
⚠️ ──────────────────────────────────────────── ⚠️
  PERMANENT DELETION — this cannot be undone.
  
  2 files identified as obsolete:
    intake/uploads/old-wireframe-draft.png
    intake/prd/v1-scrapped.md
  
  Continue to deletion? (yes / cancel)
⚠️ ──────────────────────────────────────────── ⚠️
```

Step 2 — File echo and final confirmation:
```
You are about to permanently delete:

  intake/uploads/old-wireframe-draft.png
  intake/prd/v1-scrapped.md

Confirm deletion? (yes / cancel)
```

No "archive instead" offer at step 2 — that decision point was step 1. The two steps are intentionally simple: first confirm the action, then confirm the specific files.

**Design principle:** The friction level is calibrated to consequence, not to file count. Archiving 20 files is still one confirmation. Deleting 1 file is still two confirmations with a visual warning.

---

## Relationship to Existing Commands

| Command | Scope | Frequency | What it touches |
|---|---|---|---|
| `/fix` | Single issue | Every bug | Story issue log + `complaints-log.md` |
| `/consolidate` | Rule promotion | After several fixes | `complaints-log.md` → `system.md` |
| `/unlearn` | Single rule removal | On demand | `system.md` |
| `/memory-review` | Full knowledge base | Periodic / milestone | Stories, reviews, `system.md` rules, archive |

`/memory-review` is the only command that touches the archive. `/consolidate` remains unchanged — it does not trigger archiving.

---

## What `/memory-review` Does NOT Do

- Does not run automatically or on a schedule
- Does not delete anything without explicit two-step user confirmation
- Does not touch `complaints-log.md` (that is `/consolidate`'s domain)
- Does not modify `system.md` directly — stale rule removal goes through `/unlearn`
- Does not rewrite or summarise archived files — they move as-is

---

## Updated Command Table (delta only)

| Command | Handler | What it does |
|---|---|---|
| `/memory-review` | `vazir-context.ts` | Full knowledge base hygiene: propose archive candidates, flag stale rules, present delete candidates with two-step confirmation |

All other commands from v4.1 are unchanged.

---

*Vazir POC Spec — Addendum A. Supplements v4.1. Covers: `/memory-review` command, `.context/archive/` cold storage, rule provenance tags, destructive operation UX hierarchy (archive = batch single confirm, delete = two-step with visual warning).*
