# Vazir POC Spec — Addendum G
**Supplements:** v4.1, Addendum A, Addendum B
**Status:** Draft — for review
**Scope:** Idea tracker — `.context/ideas/`, `/idea` command, viewer reuse, consumption during `/plan`

---

## Context

This addendum captures a gap in the existing planning flow: there is currently no place for a half-formed idea to live. Today it has exactly two fates — it becomes a premature story (scoped and templated before it's actually ready), or it gets mentioned in conversation and quietly lost by the next session.

The motivating case is narrower than general idea capture: mid-story, something comes up that's tempting to act on right now but is out of scope for the active story. The user doesn't want to either (a) break scope to chase it, or (b) suppress it and risk losing it. `/idea` exists to give that impulse a fast, deterministic parking spot so the user can note it and immediately return to the current story — consistent with Vazir's scope-discipline principle. It is not a general-purpose brainstorming tool; it's a release valve for the flow-state / scope-discipline tension that already exists in the story workflow.

A plain scratchpad or freeform note could capture the text, but it wouldn't solve the actual problem: a scratch note has no status field, isn't referenceable by `/plan`, and doesn't distinguish "parked" from "acted on" from "decided against." The value here is the lifecycle and the hand-off to planning, not the act of writing text down — which is why this mirrors the `stories/` convention rather than inventing a lighter-weight mechanism.

This addendum does not modify any existing v4.1, Addendum A, or Addendum B behaviour. All commands, file contracts, and workflows described elsewhere remain unchanged. This addendum adds net-new capability only.

---

## New Concept: `.context/ideas/`

A folder of one file per captured idea — mirrors the `stories/` convention deliberately, so the same mental model applies: a folder of numbered files, each with a status field, browsed via a viewer and picked up by reference.

- **Not injected into the agent's context window on any turn.** Same treatment as `plan.md` and `intake-brief.md` — planning material, not runtime memory.
- **Read by `/plan` only when a specific idea is referenced** (see Consumption, below). Not scanned or summarized wholesale.
- **Never auto-promoted to a story.** Consistent with the rest of Vazir's philosophy (`/unlearn`, `/remember`, threshold promotion) — a human always decides when an idea becomes scoped work.
- **Distinct from `.context/intake/`.** Intake is raw external material brought in from outside the project. Ideas are generated during the project itself — surfaced mid-story, during a fix, during replanning — and don't yet have a home.

```
.context/
├── memory/
├── stories/
│   ├── plan.md
│   ├── intake-brief.md
│   └── story-NNN.md
├── ideas/                  ← NEW
│   ├── idea-001.md
│   └── idea-002.md
├── intake/
├── complaints-log.md
├── reviews/
├── archive/
└── settings/
```

---

## Idea File Template

One file per idea, `idea-NNN.md`, numbered sequentially like stories. Deliberately lightweight — capture is cheap, structure is added later if and when it graduates.

```markdown
# Idea NNN: [Title]

**Status:** open | promoted | discarded
**Captured:** YYYY-MM-DD
**Promoted to:** — (story-NNN once folded in)

---

[One to a few sentences. What the idea is, and what prompted it. Doesn't
need to be verification-ready — that's what /plan does with it later.
The user or agent can expand this further at any time before it's picked up.]
```

**Status values:**
- `open` — captured, not yet acted on
- `promoted` — folded into a story; `Promoted to:` names it
- `discarded` — user decided not to pursue it; record stays, file is not deleted

No `explored` status, no intermediate states. An idea is either sitting there, has become a story, or has been explicitly discarded. This keeps the status field an unambiguous checkoff — no confusion for the user or the agent about what's been acted on.

---

## New Command: `/idea`

**Handler:** `vazir-context.ts`

### `/idea [description]`

Direct capture, no menu. Writes a new `idea-NNN.md` with the given description, status `open`. If invoked mid-story, this does not interrupt the current task — no confirmation prompt, no scope discussion. Log it and get back to work is the entire point.

If no description is provided but the agent has relevant recent conversation to draw from, it may draft one — same pattern as `/remember` with no argument.

### `/idea` (bare)

Presents a short numbered selector, same pattern already used by `/unlearn`:

```
1. Capture a new idea
2. View existing ideas
(enter number, or 'cancel')
```

**Option 1 — Capture a new idea:** same as `/idea [description]`, prompts for the idea text.

**Option 2 — View existing ideas:** shows a lightweight numbered list first — title and status only, one line each, same as `/unlearn`'s rule list — before opening anything heavier:

```
Open ideas:
1. idea-003 — Batch lazy index descriptions during idle time (open)
2. idea-004 — Reconsider port range once multi-project lands (open)
(enter number to open in viewer, or 'cancel')
```

Selecting a number opens that idea in the same scrollable popup viewer used by `/story`. Once open, the user directs the agent in plain conversation — same pattern as reading a story file today. Common next actions:

- "Flesh this out more" — agent expands the idea file's body in place, still status `open`
- Ask the agent to plan it — the agent maps this to `/plan idea-NNN` (see below); there is no separate "plan this" mechanism, the agent is just translating conversational shorthand to the one real command
- Close the popup and leave it parked — no action required, status stays `open`

No new TUI machinery — this reuses the numbered-selector and popup-viewer patterns that already exist for `/unlearn` and `/story`.

---

## Consumption During `/plan`

`/plan` does not grow its own idea-browsing logic. Browsing happens via `/idea`'s viewer, same as browsing stories happens via `/story`. `/plan` only needs to accept a reference to an idea already in hand.

**The only supported syntax is `/plan idea-NNN`.** It can be typed directly, with or without having browsed the idea first — the user doesn't need to open the viewer to know the number, e.g. from a `/idea` list they just saw. If the user says something conversational instead, like "plan this" right after reading an idea in the viewer, the agent maps that phrase to `/plan idea-NNN` using the idea currently open in the viewer — it is shorthand the agent resolves, not a second mechanism with its own state or rules.

```
User: /idea → 2 (view existing) → selects idea-004 → viewer popup
      ↓
User: "plan this" (agent resolves to /plan idea-004)
   — or, equivalently, typed directly: /plan idea-004
      ↓
Agent seeds the planning conversation with idea-004's content,
same as it would seed from intake material
      ↓
Normal /plan flow proceeds — clarifying questions still asked.
An idea file is not verification-ready by definition; it does not
skip the planning conversation, only starts it with more context.
      ↓
plan.md + story file(s) generated as usual
      ↓
idea-004.md status → promoted, Promoted to: story-NNN
```

`/plan` with no idea reference behaves exactly as in v4.1 — unchanged.

**Status only flips to `promoted` once the story file actually exists at the end of planning** — not the moment the idea is referenced. If the user picks an idea into a planning conversation and then abandons it before a story is generated, the idea stays `open`. This avoids a half-state where an idea claims to be promoted with nothing to point to.

---

## Relationship to Existing Commands

| Command | Idea involvement |
|---|---|
| `/idea` | New — capture or browse, per above |
| `/plan idea-NNN` | Seeds planning conversation from a specific idea file; `/plan` with no reference is unchanged |
| `/story` | Unchanged — stories and ideas remain separate lists, separate commands, shared viewer component only |
| `/fix` | None directly. A `/fix` carryover that's really "this needs a redesign, not a patch" is a candidate for `/idea` rather than staying in the issue-tracking system — but this is a user judgment call, not an automated routing rule |
| `/memory-review` | None. If `.context/ideas/` grows large, a future addendum could extend `/memory-review`'s passes to include stale idea files — out of scope here |
| `/consolidate` | None — unchanged |
| All others | None |

---

## What This Addendum Does NOT Do

- Does not auto-promote ideas to stories under any condition
- Does not inject any idea file into the agent's context window on any turn
- Does not delete discarded ideas — status changes, file stays
- Does not give the agent license to act on a captured idea outside `/plan`
- Does not add relevance-matching, surfacing heuristics, or proactive prompting logic to `/plan` — the user picks by reference, deliberately, the same way they pick a story to work
- Does not introduce a new viewer, picker, or menu component — reuses the existing `/story` viewer
- Does not add an `explored` or other intermediate status

---

## Updated Command Table (delta only)

| Command | Handler | What it does |
|---|---|---|
| `/idea [description]` | `vazir-context.ts` | Capture a new idea directly into `.context/ideas/idea-NNN.md`, status `open`, no interruption to current work |
| `/idea` | `vazir-context.ts` | Numbered selector (capture new / view existing); view option shows a lightweight list, then opens the `/story`-pattern viewer |
| `/plan idea-NNN` | `vazir-context.ts` | Seeds the planning conversation from a specific idea file; `/plan` with no reference is unchanged from v4.1 |

All other commands from v4.1, Addendum A, and Addendum B are unchanged.

---

## Updated `.context/` Folder Contract (delta only)

**Not injected (background signal only) — addition:**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/ideas/idea-NNN.md` | `/idea` | `/idea` (expand), `/plan` (status → promoted) | Read only when explicitly referenced by `/plan`. Never injected every turn, never scanned wholesale. |

---

*Vazir POC Spec — Addendum G. Supplements v4.1, Addendum A, Addendum B. Covers: `.context/ideas/` idea tracker (one file per idea, mirrors `stories/` convention), `/idea` numbered capture-or-browse selector, viewer reuse from `/story` and `/unlearn`, `/plan idea-NNN` seeding, open/promoted/discarded status lifecycle.*
