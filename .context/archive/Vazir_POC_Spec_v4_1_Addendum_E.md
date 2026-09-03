# Vazir POC Spec — Addendum E
**Supplements:** v4.1, Addendum A, Addendum B, Addendum C, and Addendum D  
**Status:** Ratified  
**Scope:** pi TUI overlays and HUD polish for the current Vazir extension architecture

---

## Context

This addendum defines a pragmatic TUI layer for Vazir inside pi. It does **not** change command semantics, `.context/` file contracts, story workflow, review workflow, or VCS safety policy. It only defines how existing Vazir workflows should surface visually.

The goal is better discoverability and lower-friction structured interaction:

- new users should immediately see Vazir's command surface
- structured choices should use native TUI overlays instead of ad-hoc chat prompts where appropriate
- story and plan viewing should use a readable scrollable viewer
- the implementation should fit the **current** modular codebase and pi's documented TUI primitives

This addendum intentionally prefers **built-in pi TUI components** over custom low-level rendering where possible.

---

## Implementation stance

This addendum replaces the earlier "build everything from scratch" approach with a lower-risk plan:

1. Use `ctx.ui.setWidget(...)` for a persistent Vazir HUD above the editor.
2. Use `ctx.ui.custom(..., { overlay: true })` for modal overlays.
3. Use pi's built-in **`SelectList`** for selection flows.
4. Use pi's built-in **`Markdown`** component for story/plan viewers.
5. Keep HUD ownership in the existing tracker/chrome layer so status rendering stays centralized.
6. Put shared overlay helpers in a neutral shared module under `.pi/lib`, not inside one consuming extension.

This keeps the implementation aligned with pi docs and with Vazir's existing ownership boundaries.

---

## pi TUI primitives used

| Primitive | Used for |
|---|---|
| `ctx.ui.setWidget(id, component, { placement: "aboveEditor" })` | Persistent Vazir HUD above the editor |
| `ctx.ui.custom(factory, { overlay: true, overlayOptions })` | Modal overlays |
| `SelectList` | Story pickers, confirmations, ambiguous routing, rule selection |
| `Markdown` | Read-only story and plan viewers |
| `matchesKey(data, Key.*)` | Overlay close and custom key handling |
| `DynamicBorder` / themed `Text` / `Container` | Framing and headings for overlays |
| `truncateToWidth`, `visibleWidth`, `wrapTextWithAnsi` | Width-safe rendering |

Overlays are awaitable via `ctx.ui.custom<T>()`. They are modal and singleton. Fresh component instances must be created on each open.

---

## Shared UI helpers

### Location

Shared TUI helpers live in:

```text
.pi/lib/vazir-ui.ts
```

This module is shared by:

- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-tracker/index.ts`
- future extracted workflow owners as needed

It must not import from a consuming extension.

---

## Shared helper: `showSelectionList`

### Purpose

Wrap pi's built-in `SelectList` in a Vazir-styled overlay helper so commands get one consistent picker/confirm UI.

### Signature

```typescript
interface SelectOption {
  label: string;
  description?: string;
  value: string;
}

interface ShowSelectionListOptions {
  title: string;
  prompt?: string;
  options: SelectOption[];
  width?: string;
  maxVisibleRows?: number;
  danger?: boolean;
  initialValue?: string;
}

async function showSelectionList(
  ctx: ExtensionContext,
  options: ShowSelectionListOptions,
): Promise<string | null>
```

### Implementation rules

- Build the overlay with `ctx.ui.custom(..., { overlay: true, overlayOptions })`.
- Use **`SelectList`**, not a custom list implementation.
- Wrap it in a Vazir frame using themed `Container`, `Text`, and optional `DynamicBorder`.
- `danger: true` switches border/title styling to error colors.
- Destructive confirms must default focus to the non-destructive option.
- `esc` returns `null`.
- Every rendered line must stay within width limits.

### Primary use cases

- `/implement` story picker fallback
- `/story` picker when there is no active story
- `/complete-story` choice prompt
- `/unlearn` rule selection and confirmation
- `/fix` ambiguous routing picker
- `/memory-review` archive/delete confirmations
- `/checkpoint` / `/reset` restore picker
- future lightweight confirmations

---

## Shared helper: `showMarkdownViewer`

### Purpose

Open story, plan, review, or other long-form `.md` content in a read-only overlay.

### Signature

```typescript
async function showMarkdownViewer(
  ctx: ExtensionContext,
  options: {
    title: string;
    content: string;
    width?: string;
    maxHeight?: string;
  },
): Promise<void>
```

### Implementation rules

- Use pi's built-in **`Markdown`** component for body rendering.
- Wrap it in a light Vazir frame with a title and close hint.
- `esc` closes the overlay.
- If scrolling needs custom handling, the wrapper may intercept keys, but the markdown renderer remains the content primitive.

### Primary use cases

- `/story`
- `/plan`
- review file viewing when that workflow grows UI support

---

## Persistent HUD

### Owner

The persistent HUD is owned by:

```text
.pi/extensions/vazir-tracker/chrome.ts
```

Reason:

- the tracker/chrome layer already owns footer/status rendering
- it already aggregates story, VCS, and session signals
- HUD updates should layer onto the existing refresh path instead of creating a second competing UI owner

### Placement

Render with:

```typescript
ctx.ui.setWidget("vazir-hud", component, { placement: "aboveEditor" })
```

The HUD is informational only. It is not clickable and does not intercept typing.

### Initial scope

Start with a **compact single-column HUD**, not a fragile fake two-column dashboard.

Example shape:

```text
┌─ vazir ───────────────────────────────────────────────┐
│ story: story-003 · dashboard polish · 3/5            │
│ queue: 001● 002● 003◉ 004○ 005○                      │
│ vcs: fossil · checkout f0ec088 · clean               │
│ cmds: /implement /story /fix /review /complete-story │
└───────────────────────────────────────────────────────┘
```

This is the required POC baseline. A wider two-column treatment may be added later only if the compact version proves stable.

### HUD contents

The HUD should show only bounded, cheap, local state:

| Element | Source |
|---|---|
| Active story id/title/progress | `.context/stories/story-NNN.md` |
| Story queue summary | `.context/stories/` frontmatter/status |
| VCS backend/status | existing tracker VCS helpers |
| Core command strip | static command list |

Optional later additions:

- learned rule count
- complaint count
- active model label

These are optional because the first goal is discoverability and story-state visibility, not density.

### Refresh strategy

The HUD must refresh through the same centralized render/update path already used by tracker chrome.

Requirements:

- no file watchers
- no polling loop solely for HUD state
- commands that mutate story/VCS-visible state trigger a chrome refresh via the existing owner
- if the implementation uses a widget/component handle, it may request re-render from the owner, but ownership remains centralized in tracker chrome

---

## HUD states

### State 1 — Uninitialized

If `.context/` does not exist, render a minimal setup prompt:

```text
┌─ vazir ─────────────────────────────────────┐
│ no context found                            │
│ run /vazir-init to initialize this project  │
└─────────────────────────────────────────────┘
```

No command strip beyond `/vazir-init` is shown.

### State 2 — Initialized, no active story

```text
┌─ vazir ───────────────────────────────────────────────┐
│ no active story · run /plan or /implement            │
│ queue: 004○ 005○ 006○                                │
│ cmds: /plan /implement /story /review                │
└───────────────────────────────────────────────────────┘
```

### State 3 — Active story present

Show active story + queue + VCS + command strip.

### State 4 — Narrow terminal

Below a width threshold, collapse to a single line:

```text
▸ story-003 (3/5) · /implement to continue
```

If uninitialized in narrow mode:

```text
vazir · run /vazir-init to begin
```

---

## Overlay wiring by command

| Command | UI | Notes |
|---|---|---|
| `/story` | `showMarkdownViewer` or `showSelectionList` → `showMarkdownViewer` | Active story opens directly; otherwise show picker |
| `/plan` | `showMarkdownViewer` | Open `plan.md` in overlay |
| `/implement` | `showSelectionList` when no active story | Reuse for start-vs-pick fallback and story picker |
| `/complete-story` | `showSelectionList` | Review first / close now / keep working |
| `/unlearn` | `showSelectionList` | Rule picker, then confirm |
| `/fix` | `showSelectionList` | Ambiguous story routing only |
| `/memory-review` | `showSelectionList` | Batch confirmations |
| `/checkpoint` | `showSelectionList` | Restore target picker |
| `/reset` | `showSelectionList` | Alias path should present the same UI as `/checkpoint` |
| `/review` | optional later viewer overlay | Not required in phase 1 |

---

## Current file structure target

```text
.pi/extensions/
  vazir-context/
    index.ts
    helpers.ts
    complete-story.ts
  vazir-tracker/
    index.ts
    chrome.ts
    vcs.ts
.pi/lib/
  vazir-helpers.ts
  vazir-vcs-helpers.ts
  vazir-ui.ts        ← NEW shared TUI helpers
```

---

## VCS-aware HUD requirement

The HUD must respect Vazir's active VCS mode and current repo reality.

It must not assume Git-only behavior.

Supported display identities:

- `fossil`
- `git`
- `git+jj` when JJ is the active checkpoint helper path
- `none`

The HUD should surface the same backend identity the tracker/footer already exposes. Any status text must come from the existing VCS helper layer rather than duplicating repo detection logic inside the UI helper.

---

## What this does not change

- command behavior from v4.1 and earlier addenda
- `.context/` file schemas
- closeout rules, learned-rule flow, review policy, or checkpoint safety policy
- current command ownership between extensions
- chat as the primary interaction mode

This addendum changes **presentation**, not workflow semantics.

---

## Delivery order

Recommended implementation order:

1. Add `.pi/lib/vazir-ui.ts` with `showSelectionList`
2. Add `showMarkdownViewer`
3. Wire `/story` and `/plan` first
4. Wire `/implement` fallback picker to shared overlay helper
5. Add compact HUD in `vazir-tracker/chrome.ts`
6. Expand remaining commands onto shared selection UI
7. Only after validation, consider a richer HUD layout

This order keeps risk low and provides immediate visible UX gains early.

---

## Relationship to the PWA

This addendum still establishes the POC-to-PWA bridge, but through a conservative TUI layer:

- shared queue and active-story data model
- consistent modal interaction patterns
- stable VCS identity display
- command discoverability from session start

The PWA can evolve richer layout later without requiring the terminal POC to solve every dashboard problem now.

---

*Vazir POC Spec — Addendum E. Supplements v4.1, Addendum A, Addendum B, Addendum C, and Addendum D. Covers: compact persistent HUD via `setWidget`, shared `showSelectionList` and `showMarkdownViewer` helpers in `.pi/lib/vazir-ui.ts`, tracker-chrome ownership, SelectList/Markdown-based overlays, current file-structure alignment, fossil/git-aware HUD state, and phased delivery for safe implementation.*
