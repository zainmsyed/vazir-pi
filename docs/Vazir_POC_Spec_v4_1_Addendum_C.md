# Vazir POC Spec — Addendum C
**Supplements:** v4.1, Addendum A, and Addendum B  
**Status:** Ratified — rev 1 (patch: token cap, UI detection, visual intake scope, design compliance in `/review`)  
**Scope:** Design system context — `.context/design/` folder, lazy seeding via `/plan`, UI story detection, `/design` update command, design compliance checklist in `/review`

---

## Context

This addendum captures the decision to add a design system layer to the `.context/` folder. It does not modify any existing v4.1, Addendum A, or Addendum B behaviour. All commands, file contracts, and workflows remain unchanged. This addendum modifies `/plan` and adds one new command (`/design`).

The core motivation: the agent currently has zero persistent design context. Every UI story starts cold — the agent invents component patterns, spacing conventions, and colour choices from scratch each session, with no memory of what was established in previous stories. A `.context/design/` folder gives the agent accumulated design knowledge that travels with the project, the same way `.context/memory/` does for code conventions.

Design context is UI-story-only. Non-UI stories never touch it. The system is lazy by design — no upfront interrogation during `/plan`, no questions until there is a concrete UI story in front of the user.

---

## New Concept: `.context/design/`

A persistent folder for design system context. Lives alongside the existing `.context/` structure.

```
.context/
├── memory/
├── stories/
├── complaints-log.md
├── archive/
├── design/                     ← NEW
│   ├── design-system.md        ← Injected for UI stories. Token-capped.
│   ├── brand.md                ← Read on demand. Not injected.
│   └── components.md           ← Read on demand. Not injected.
└── settings/
```

### File roles

**`design-system.md`** — The injected file. Covers colours, typography, spacing scale, and top-level component conventions. Soft cap: 300 tokens. If it grows beyond that, the agent warns during `/design` and proposes trimming rather than auto-truncating. The user decides what to cut. Trim priority order when space is needed (sacrifice last-listed first):

1. Colors — never trim
2. Typography — trim scale details before family name
3. Spacing — trim verbose descriptions, keep the base unit and scale values
4. Component conventions — move to `components.md` before trimming anything above

Injected automatically for UI stories only — never for non-UI stories.

**`brand.md`** — Tone of voice, naming conventions, logo and asset notes, and any brand constraints (e.g. "never use rounded corners", "always sentence case"). Not injected. Agent reads it at the start of any UI story and when generating copy or naming components.

**`components.md`** — Living registry of established components: what exists, what props they accept, and what conventions they follow. Not injected. Agent reads it before writing any new UI component to avoid reinventing what already exists.

---

## UI Story Detection

A story is treated as a UI story when its **Scope** section contains at least one path matching an unambiguously frontend file extension: `.tsx`, `.jsx`, `.css`, `.scss`, `.html`, or `.svelte`.

`.ts` is explicitly excluded from auto-detection — utility files, types, API clients, and hooks all use `.ts` and produce false positives. Stories that write hooks, context files, or other `.ts` UI-adjacent files should use the `Type: ui` override instead.

This is the primary signal. No heuristic inference, no prompt-time question. If the scope paths don't match, the design system is not consulted and `design-system.md` is not injected.

**Override:** A story can be explicitly tagged `Type: ui` in its frontmatter to force UI treatment regardless of scope paths. Useful for stories that write theme files, generate design tokens, or touch the design system itself without touching component files directly. The agent sets this tag during `/plan` when the story description clearly implies UI work but the scope paths are ambiguous; the user can add or remove it manually.

```markdown
# Story NNN: [Title]

**Status:** not-started  
**Type:** ui               ← optional override
**Created:** YYYY-MM-DD  
**Last accessed:** YYYY-MM-DD  
```

If `Type` is absent, scope-path detection is the sole signal. No default value is written.

---

## Seeding Flow — `/plan` integration

`/plan` gains a silent design context pass. It does not ask design questions and does not block or extend the planning conversation.

```
/plan triggered
      ↓
Agent scans .context/intake/references/ for design-flavoured files
(look for: style guides, brand docs, design tokens, colour palette files,
typography specs — text-extractable files only)
Note: PNG, JPG, and other image files in intake/ are not vision-analyzed
during seeding. If a user drops screenshots or mood boards into intake/,
the agent notes it cannot parse them and asks the user to describe the
relevant design decisions in plain text instead.
      ↓
FOUND: seed what can be extracted into design-system.md, brand.md,
and components.md. Mark each field's origin as <!-- source: intake -->
      ↓
NOT FOUND: create design/ folder with empty stub files.
No questions asked. No user-facing output.
      ↓
Planning conversation continues as normal.
Design questions are deferred to the first UI story.
```

The user sees nothing during `/plan` related to design unless intake materials produce a seeding summary worth surfacing (e.g. "Found a brand guide in intake — seeded colour palette and typography into design-system.md"). Even then, it's a one-line note, not a prompt for confirmation.

---

## First UI Story — Lazy Question Flow

When the agent begins work on a UI story and finds `design-system.md` is empty or has unfilled gaps (fields present but marked `—`), it pauses before writing any code and asks surface-level questions in the story's context.

Questions are batched into a single turn — not asked one at a time. The agent asks only for what is genuinely missing. If the colour palette was seeded from intake, it does not ask about colours.

**Standard gap questions (ask only if missing):**

- What's the primary colour? (hex, name, or "don't care")
- What font are you using, or should I pick something neutral?
- Roughly what visual style — minimal, playful, dense/data-heavy?
- Any hard constraints I should know (e.g. dark mode only, no external font CDN)?

The agent does not ask about component patterns, spacing scale, or brand voice at this stage — those emerge from the first few UI stories and are recorded in `components.md` as the agent makes decisions. The questions are intentionally shallow. The goal is enough to start, not a complete design brief.

After the user answers, the agent:
1. Fills the gaps in `design-system.md` and `brand.md`
2. Proceeds with story implementation immediately — no second confirmation
3. Marks filled fields with `<!-- source: story-NNN -->` for provenance

This question pass happens **once per project** (or until `design-system.md` is complete). Subsequent UI stories inject `design-system.md` and proceed without interruption.

---

## Living Updates — `components.md`

`components.md` is not seeded upfront. It is populated incrementally as the agent writes UI components.

When the agent creates a new component during a UI story, it appends a registry entry:

```markdown
## Button
- **File:** src/components/Button.tsx
- **Story:** story-003
- **Variants:** primary, secondary, ghost
- **Props:** label (string), onClick (fn), disabled (bool), size (sm | md | lg)
- **Notes:** Always uses the primary colour token. Never hardcode hex values here.
```

When the agent modifies an existing component's interface, it updates the entry. This is a best-effort record — the agent writes to `components.md` as part of its normal story work, not as a separate step.

`components.md` is never injected. The agent reads it at the start of any UI story before writing component code, the same way it reads the active story file.

---

## New Command: `/design`

An explicit entry point for reviewing and updating design context at any time.

**Handler:** `vazir-context.ts`

```
User: /design
      ↓
Agent presents current state of design-system.md, brand.md, components.md
as a readable summary (not raw file dump)
      ↓
"What would you like to update?"
      ↓
User describes change (e.g. "switch primary colour to #2D6BE4",
"we're adding dark mode", "remove the Button entry — we switched to shadcn")
      ↓
Agent applies the change to the relevant design file
      ↓
If design-system.md exceeds 300 tokens after the update:
  Agent warns and proposes what to trim based on priority order
  (colors protected, component conventions moved to components.md first)
  User approves trim before agent executes — no silent auto-trimming
      ↓
Agent confirms what changed. Done.
```

`/design` can also be called with a direct instruction to skip the summary step:

```
/design switch primary colour to slate-900
```

No planning conversation. No story required. Design context is always editable regardless of what story is active.

---

## Injection Model

`design-system.md` is injected alongside `context-map.md` and `system.md` **only when the active story is a UI story** (scope-path detection or explicit `Type: ui` tag). For non-UI stories it is never loaded.

`brand.md` and `components.md` are read at story start for UI stories, not injected per-turn. They are treated the same as `intake-brief.md` — background context, not always-on prompt payload.

| File | UI story | Non-UI story |
|---|---|---|
| `design-system.md` | Injected every turn | Never loaded |
| `brand.md` | Read at story start | Never loaded |
| `components.md` | Read at story start | Never loaded |

---

## Updated `.context/` Folder Contract (delta only)

**Injected per turn (UI stories only):**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/design/design-system.md` | `/plan` or `/vazir-init` | Lazy question flow, `/design` | 300 token soft cap. UI stories only. |

**Read at story start (UI stories only):**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/design/brand.md` | `/plan` | Lazy question flow, `/design` | Tone, naming, brand constraints. |
| `.context/design/components.md` | First UI story | Agent during UI stories | Living component registry. |

---

## Updated Command Table (delta only)

| Command | Handler | What it does |
|---|---|---|
| `/design` | `vazir-context.ts` | Present design context summary, apply user-described updates to design files, trim design-system.md if over token cap |

`/plan` is modified (silent design seeding pass) but its command signature and user-facing behaviour are unchanged.

---

## Design Compliance in `/review`

When `/review` runs against a UI story, the review checklist gains a design compliance section. This is appended automatically to the review file when the story is detected as UI (same detection logic as injection).

```markdown
## Design Compliance (UI stories only)
- [ ] Colors reference design-system.md tokens — no hardcoded hex values in component files
- [ ] Spacing follows the declared scale — no arbitrary pixel values
- [ ] Typography uses declared families and scale sizes
- [ ] No component reinvention — components.md was checked before creating new components
```

These checks are LLM-evaluated — Fallow cannot detect semantic design system violations. Findings from design compliance checks feed the standard review findings format and are eligible for rule promotion during the story-close mini-consolidate (Addendum D).

If `design-system.md` is empty or incomplete, the agent skips design compliance checks and notes this in the review file rather than flagging false violations.

---

## What This Does NOT Change

- Non-UI stories — completely unaffected, no design files loaded
- `/plan` conversation flow — design seeding is silent, no new questions added to planning
- `complaints-log.md`, `system.md`, `/consolidate` — unchanged
- Addendum A (`/memory-review`) — `/memory-review` does not scan `.context/design/` unless explicitly extended in a future addendum
- Addendum B (Fallow) — unchanged

---

*Vazir POC Spec — Addendum C rev 1. Supplements v4.1, Addendum A, and Addendum B. Covers: `.context/design/` folder, `design-system.md` / `brand.md` / `components.md` file roles, UI story detection via scope-path extension matching (`.ts` excluded) with explicit `Type: ui` override, silent seeding during `/plan` (text files only — no vision analysis), lazy question flow on first UI story, living `components.md` registry, `/design` update command, 300-token soft cap with trim priority order, injection model (UI stories only), design compliance checklist in `/review` for UI stories.*
