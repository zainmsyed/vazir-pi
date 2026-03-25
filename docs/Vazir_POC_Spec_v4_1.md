# Vazir POC Spec — pi-mono Implementation
**Version:** 4.1  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis before building the full Rust/Tauri product  
**Timeline:** 2–3 weeks to working CLI  

> **v4.1 changes from v4.0:** Three targeted additions from external spec review. (1) `/unlearn [rule]` command — lets user remove a specific promoted rule from `system.md` by index; no TTL complexity, direct user control. (2) Secrets warning on `/fix` — before writing to `complaints-log.md`, agent warns user to scrub API keys and credentials from their complaint; zero implementation cost. (3) `last_accessed` frontmatter field in story files — replaces filesystem last-modified timestamp for `/fix` routing; deterministic, immune to IDE file touches.

> **v4.0 changes from v3.6:** Major redesign of the learning loop and introduction of the story-driven workflow. The `/reject` command is replaced by `/fix` with a richer issue-logging model. The learning loop now captures problem+solution pairs with status tracking, a two-file complaint system (`complaints-log.md` + per-story issue logs), and threshold-based promotion to `system.md`. A full story planning system is introduced: `plan.md`, a `stories/` folder with one file per story, and a `/plan` command that generates the project breakdown upfront. Active story tracking uses file status fields rather than a separate pointer file. The old `learnings/code-review.md` audit trail is replaced by `complaints-log.md` as the persistent cross-session signal. Story status transitions are strictly user-controlled except for `not-started → in-progress`.

> **v3.6 changes from v3.5:** Three new automations — zero-token JJ commit auto-describe, zero-token `index.md` structural updates, lazy LLM index descriptions.

> **v3.5 changes from v3.4:** `/vazir-init` handles full JJ setup. Added `/consolidate` with diff preview.

> **v3.4 changes from v3.3:** `jj undo` replaced with `jj op restore`.

> **v3.3 changes from v3.2:** JJ replaces custom checkpoint system.

---

## Why This Is Still a POC

Two TypeScript extension files and one skill file on top of `pi-coding-agent`. The thesis is unchanged: **does accumulated project context make a cheap model produce better results than a frontier model starting cold?**

The story workflow and learning loop are the primary mechanism being validated. The `.context/` folder structure is identical to the full PRD spec. When the full product is built, users migrate their `.context/` folders directly. The brain travels.

---

## Success Criteria

After 30 days of real use on real projects:

1. **Does the context map orient the model?** Plans should reference the project structure correctly without the user re-explaining it every session.
2. **Does the self-correcting loop work?** The same mistake should not happen twice. Issues that hit threshold in `complaints-log.md` should visibly change agent behaviour once promoted to `system.md`.
3. **Does model-swap quality hold?** After 20 tasks, switching from Sonnet to Haiku should produce equivalent output — the context is doing the work, not the model.
4. **Does the story workflow contain agent drift?** The agent should not touch files outside the active story's declared scope without explicit user approval.
5. **Does the plan survive first contact?** The upfront planning conversation should produce a chunked breakdown that holds up across multiple sessions without constant replanning.

---

## Architecture

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts   # Context injection + compaction consolidation + /vazir-init + /plan
    │   └── vazir-tracker.ts   # Change tracker widget + JJ/git checkpoints + /diff + /fix + /reset
    │
    ├── .pi/skills/
    │   └── vazir-base      # automatic: true — always-on constraints
    │       └── SKILLS.md  
    ├── AGENTS.md              # Cross-framework project context
    └── .context/
        ├── memory/
        │   ├── context-map.md       # Vazir conductor — 150 tokens, injected every turn
        │   ├── system.md            # Rules + promoted learned rules — injected every turn
        │   └── index.md             # File index — auto-generated and maintained
        ├── stories/
        │   ├── plan.md              # PRD-level project breakdown
        │   ├── story-001.md         # One file per story — checklist + issues + completion
        │   ├── story-002.md
        │   └── ...
        ├── complaints-log.md        # Persistent cross-session issue log — never injected
        ├── checkpoints/             # Git fallback only
        └── settings/
            └── project.json         # model_tier, project_name
```

---

## The Story Workflow

### Core Principle

Every project starts with a planning conversation. The resulting plan lives in `.context/stories/` as markdown files the agent reads and updates. No UI required — the story files are the interface.

The agent works one story at a time by convention, not by hard constraint. The user can jump between stories freely — flow-state is non-negotiable. The story file structure ensures nothing gets lost when they do.

### Story Status

Four statuses only — no paused, no blocked, no pending-review:

| Status | Set by | Meaning |
|---|---|---|
| `not-started` | agent (on creation) | Story exists, work hasn't begun |
| `in-progress` | agent (when work begins) | Agent is actively working this story |
| `complete` | user only | User has verified and accepted the story |
| `retired` | user only | Story scrapped — history preserved, excluded from active queue |

**Status transition rules:**
- Agent may set `not-started → in-progress` autonomously when beginning work
- `in-progress → complete`: user only — explicit confirmation or "mark this done"
- `anything → retired`: user only — explicit instruction to scrap
- `complete → in-progress`: user only — reopen edge case, allowed
- Agent may **never** set `complete` or `retired` — these are always user-triggered

When a user force-completes a story with unchecked items, the agent automatically appends to the completion summary:
```
Marked complete by user. Unverified items: [list of unchecked checklist items]
```
No judgment — just a record. Useful signal for the learning system if those items cause downstream `/fix` reports.

### `/fix` Routing

When the user calls `/fix`, the agent logs the issue to the `in-progress` story with the most recent `last_accessed` date in its frontmatter. The agent updates `last_accessed` to today's date every time it works on a story. This is deterministic and immune to IDE file touches or git branch switches changing filesystem timestamps.

If multiple stories share the same `last_accessed` date, the agent picks the one with the highest story number (most recent by creation order) and notifies the user which story it logged to.

---

## The Story Template

Every story file (`story-NNN.md`) follows this exact structure. The template is the enforcement mechanism — agent drift is caught by deviations from it, not by runtime checks.

```markdown
# Story NNN: [Title]

**Status:** not-started | in-progress | complete | retired  
**Created:** YYYY-MM-DD  
**Last accessed:** YYYY-MM-DD  
**Completed:** —

---

## Goal
[One paragraph. What this story delivers. Written in terms the user can verify — not "implement auth" but "user can sign up, log in, and log out. Session persists on refresh."]

## Verification
[One to three sentences. Exactly how the user confirms this story is done — observable actions in the UI or measurable behaviour. Agent must ask user to verify before marking complete. Agent states what it can and cannot verify mechanically before asking.]

## Scope — files this story may touch
- src/auth/
- src/components/LoginForm.tsx
- src/hooks/useSession.ts

[Agent must not modify files outside this list without explicit user approval. If a required file is outside scope, agent asks before touching it.]

## Out of scope — do not touch
- src/dashboard/
- Database schema
- Email verification (story-005)

## Dependencies
- Requires: story-001 (project scaffolding) ✅
- Blocks: story-005 (email verification), story-008 (dashboard access control)

---

## Checklist
- [ ] Task one
- [ ] Task two
- [ ] Task three

[Agent updates checkboxes as work progresses. Checklist is the source of truth for where the agent left off between sessions.]

---

## Issues
[Populated by /fix commands during this story. Agent logs every issue here immediately.]

---

## Completion Summary
[Agent writes this when user marks complete. Covers what was built, key decisions, gotchas, and approach. If force-completed by user, lists unverified checklist items. This feeds the learning system — write it to be useful in a future session.]
```

---

## Issue Logging Format

When `/fix` is called, the agent appends to the Issues section of the active story:

```markdown
### /fix — "login works but page refresh logs me out"
- **Reported:** 2026-03-24  
- **Status:** pending  
- **Agent note:** Cannot verify session persistence mechanically — requires user confirmation in browser.  
- **Solution:** —
```

When the fix is confirmed by the user:

```markdown
### /fix — "login works but page refresh logs me out"
- **Reported:** 2026-03-24  
- **Status:** confirmed  
- **Agent note:** Cannot verify session persistence mechanically — requires user confirmation in browser.  
- **Solution:** Session token was being stored in memory only. Moved to localStorage with expiry. Auth middleware now reads from localStorage on mount.
```

If the story ends without resolution:

```markdown
- **Status:** unresolved — carried forward to complaints-log.md
```

**Status values for issues:**
- `pending` — fix attempted, awaiting user confirmation
- `confirmed` — user confirmed it's working
- `unresolved` — session ended without a clean fix
- `reopened` — was confirmed, broke again in a later story

`reopened` issues skip the complaints-log threshold and go straight to `system.md` — a confirmed fix that regressed is a stronger signal than a first-time complaint.

---

## The Two-File Learning System

The learning loop uses two files with different scopes:

### 1. Per-story issue log (in `story-NNN.md`)

- Scoped to the current story
- Agent reads this every turn (it's part of the active story context)
- Survives JJ reverts — `.context/` is not in the code tree
- Cleared when the story is complete (issues stay in the file as history, but `complaints-log.md` holds the persistent signal)

### 2. `complaints-log.md` (persistent, cross-session)

- Append-only, never injected into the agent's context window
- Every `/fix` call appends here simultaneously with the story file
- Tracks frequency across sessions — same issue from different stories counts toward the threshold
- LLM clusters similar entries during `/consolidate` and `session_shutdown`
- At threshold (3 occurrences of the same clustered issue): entry graduates to `system.md` as a permanent rule, removed from the log

```markdown
# Complaints Log

---
2026-03-24T14:22:00Z | story-002 | "login works but page refresh logs me out" | status: confirmed | solution: moved session token to localStorage
2026-03-24T16:45:00Z | story-004 | "page refresh logs me out again" | status: reopened → promoted to system.md
2026-03-25T09:12:00Z | story-002 | "signup button not submitting" | status: confirmed | solution: missing onSubmit handler after refactor
```

**Threshold promotion flow:**
```
complaints-log.md: 3 entries cluster as same issue
      ↓
LLM extracts rule during /consolidate or session_shutdown
      ↓
Rule appended to system.md ## Learned Rules
      ↓
Clustered entries marked promoted in complaints-log.md
      ↓
Rule injected every future turn — agent cannot repeat the pattern
```

**Reopened fast-track:**
```
Issue marked confirmed in story-002
      ↓
Same issue surfaces as /fix in story-005
      ↓
Status → reopened
      ↓
Skip threshold → promote directly to system.md
Agent's shallow fix is now a permanent rule
```

---

## Confirmation and Verification

### Who confirms a fix?

The agent declares what it can and cannot verify before claiming a fix is done:

- **Mechanically verifiable** (tests pass, server starts, API returns 200): agent self-reports with evidence and marks `pending` → `confirmed` automatically
- **Not mechanically verifiable** (UI behaviour, visual state, user flows): agent explicitly flags "I cannot verify this — please check [specific thing] in the browser" and leaves status as `pending`

This behaviour is enforced in `vazir-base.md`. Agents that say "should be working now!" without declaring their verification limits are violating the skill constraint.

### Who confirms a story is done?

The user only. Always. Agent asks, user confirms. The agent never flips a story to `complete`.

---

## The Planning Conversation — `/plan`

### Command: `/plan`

Triggered when the user describes what they want to build. The agent asks clarifying questions (baked into the skill file), then generates:

1. `plan.md` — PRD-level document
2. One `story-NNN.md` per story, chunked from the plan

The user reviews the generated stories before work begins. Stories that are too big get broken down further. Stories that are wrong get edited or retired immediately.

### Story Sizing Rule

A story is correctly sized when:
- The agent can complete it in a single focused session
- The user can verify it in one clear observational step
- The scope declaration lists fewer than ~10 files

If a story has more than one verification step, it's too big — split it.

### `plan.md` Structure

```markdown
# [Project Name] — Plan

**Created:** YYYY-MM-DD  
**Last updated:** YYYY-MM-DD

---

## What we're building
[2–3 sentences. The product, who it's for, what problem it solves.]

## What we're not building (v1 scope)
[Explicit exclusions. Prevents scope creep mid-project.]

## Features
### Feature 1: [Name]
[Description. Which stories implement this feature.]

### Feature 2: [Name]
...

## Story queue
| Story | Title | Status | Blocks |
|---|---|---|---|
| story-001 | Project scaffolding | complete | story-002, story-003 |
| story-002 | User authentication | in-progress | story-005 |
| story-003 | Dashboard shell | not-started | story-006 |

## Replanning log
[Append-only. When scope changes, agent records what changed, why, and which stories were affected. Never delete history.]
```

### Replanning

When the user changes scope mid-project, the agent:
1. Rewrites the affected sections of `plan.md`
2. Re-chunks only the impacted stories (unaffected stories stay untouched)
3. Appends a replanning note to `plan.md`'s replanning log
4. Creates new story files or retires invalidated ones

Story dependencies declared in each story file are what determine what's affected — the agent follows the dependency graph, not its own judgment.

---

## Updated `.context/` Folder Contract

**Injected every turn (agent sees these):**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/memory/context-map.md` | `/vazir-init` | User manually | 150 tokens max. LLM-drafted on first init. |
| `.context/memory/system.md` | `/vazir-init` | `/fix` threshold promotion, `/consolidate` | Rules + Promoted Learned Rules. |
| `.context/memory/index.md` | `/vazir-init` | `agent_end` zero-token patches + lazy LLM | Always generated. Structural updates free. |
| Active `story-NNN.md` | `/plan` | Agent continuously | Checklist + issues. Agent injects active story each turn. |

**Not injected (background signal only):**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/stories/plan.md` | `/plan` | Agent on replan | PRD-level. Agent reads on demand. |
| `.context/complaints-log.md` | `/fix` | `/fix` appends | Persistent cross-session log. Threshold tracking. |
| `AGENTS.md` | `/vazir-init` | User manually | Cross-framework. Free-form. |
| `.context/settings/project.json` | `/vazir-init` | User manually | `project_name`, `model_tier`. |

```
[project root]/
├── AGENTS.md
├── .jj/                              ← JJ metadata. In .gitignore.
└── .context/
    ├── memory/
    │   ├── context-map.md            ← LLM-drafted at init. 150 tokens max.
    │   ├── system.md                 ← Rules + ## Promoted Rules. Auto-consolidated.
    │   └── index.md                  ← Always generated. Zero-token patches on agent_end.
    ├── stories/
    │   ├── plan.md                   ← PRD-level. Agent reads on demand.
    │   ├── story-001.md              ← One file per story.
    │   └── story-002.md
    ├── complaints-log.md             ← Persistent. Append-only. Never injected.
    ├── checkpoints/                  ← Git fallback only. Empty when using JJ.
    └── settings/
        └── project.json
```

---

## Updated Skill File — `vazir-base.md`

```markdown
---
name: vazir-base
description: Vazir baseline constraints — always injected into the system prompt
automatic: true
---

# Vazir Constraints

## File writes
- Use the built-in `write` and `edit` tools. Write directly to real project files.
- Only modify files listed in the active story's Scope section.
- If a required change is outside declared scope, ask the user before touching the file.

## Story workflow
- Work against the active story's Checklist. Update checkboxes as tasks complete.
- Do not begin work on another story unless the user explicitly directs you to.
- When you believe a story is done, state what you can and cannot verify mechanically, then ask the user to verify.
- Never set a story status to `complete` or `retired` — these are user-only transitions.
- You may set `not-started → in-progress` when beginning work on a story.

## Issue logging
- When the user calls /fix, immediately log the issue to the Issues section of the most recently modified in-progress story file.
- Simultaneously append to `.context/complaints-log.md`.
- After attempting a fix, state explicitly what you can and cannot verify. If you cannot verify mechanically, leave status as `pending` and ask the user to confirm.
- Never claim a fix is working if you cannot verify it. "Should be working now" is not acceptable — declare your uncertainty explicitly.

## Verification honesty
- Before claiming any task complete, state: what you verified mechanically, and what requires user confirmation.
- For UI and browser behaviour: always defer to user confirmation. You cannot see the UI.

## General
- When finished a turn, state clearly what was changed and stop.
- If unsure which files to modify, ask — do not guess.
```

---

## Updated Commands

| Command | Handler | What it does |
|---|---|---|
| `/vazir-init` | `vazir-context.ts` | Bootstrap `.context/`, generate `index.md`, draft `context-map.md`, set up JJ |
| `/plan` | `vazir-context.ts` | Planning conversation → generate `plan.md` + all story files |
| `/fix [description]` | `vazir-tracker.ts` | Warn re: secrets, log issue to active story + `complaints-log.md`, attempt fix, track status |
| `/unlearn [rule]` | `vazir-context.ts` | Show numbered list of promoted rules, remove selected rule from `system.md` |
| `/consolidate` | `vazir-context.ts` | Preview + apply rule consolidation, cluster `complaints-log.md`, promote threshold hits |
| `/diff` | `vazir-tracker.ts` | Show JJ or git diff for current changes |
| `/reset` | `vazir-tracker.ts` | JJ checkpoint picker — restore to a previous operation |

**Removed from v3.6:** `/reject` — replaced by `/fix` with richer semantics.

---

## `/plan` Command Flow

```
User: "I want to build a SaaS dashboard for tracking team OKRs"
      ↓
Agent asks clarifying questions (from skill file prompt):
  - Who are the users? (admin, team member, viewer?)
  - What's the most important thing to get right in v1?
  - What are we explicitly NOT building in v1?
  - What stack are we using / what already exists?
      ↓
User answers
      ↓
Agent generates plan.md (PRD-level)
      ↓
Agent chunks into story files — each sized to one verifiable unit
      ↓
Agent presents story list to user:
  "Here's how I've broken this down — 8 stories.
   story-001: Project scaffolding (Next.js + Supabase setup)
   story-002: Auth — sign up, log in, log out, session persistence
   ...
   Does this look right? Anything too big, too small, or wrong?"
      ↓
User adjusts
      ↓
Agent updates story files
      ↓
Work begins on story-001
```

---

## `/fix` Command Flow

```
User: /fix "you broke the signup button again"
      ↓
Agent warns: "Before I log this — make sure your complaint doesn't contain
  API keys, database URLs, or credentials. complaints-log.md is plaintext
  and persists across sessions."
      ↓
Agent identifies in-progress story with most recent last_accessed date
      ↓
Appends to story Issues section:
  ### /fix — "you broke the signup button again"
  - Reported: 2026-03-24 (2nd time)
  - Status: pending
  - Solution: —
      ↓
Appends to complaints-log.md:
  2026-03-24T14:22Z | story-002 | "you broke the signup button again" | count: 2
      ↓
Agent attempts fix
      ↓
Agent states: "I've rewired the onSubmit handler. I can verify the handler
  is correctly attached via code review. I cannot verify the button submits
  in the browser — please check."
      ↓
User confirms or reports still broken
      ↓
CONFIRMED:
  Story issue → status: confirmed, solution written
  complaints-log.md entry → status: confirmed
  Check complaints-log.md for threshold (3x same issue cluster)
    → if threshold hit: promote to system.md ## Promoted Rules
      ↓
STILL BROKEN:
  Status stays pending
  User keeps iterating
  Each /fix call increments the count in complaints-log.md
```

---

## `/unlearn` Command Flow

```
User: /unlearn
      ↓
Agent reads system.md ## Promoted Rules section
      ↓
Displays numbered list:
  Promoted rules in system.md:
  1. Never modify auth middleware registration order
  2. Always call preventDefault() before handleSignup()
  3. Session token must be stored in localStorage, not memory
      ↓
"Which rule do you want to remove? (enter number, or 'cancel')"
      ↓
User selects: 2
      ↓
Agent confirms: "Remove rule 2: 'Always call preventDefault() before handleSignup()'? (y/n)"
      ↓
User confirms: y
      ↓
Rule removed from system.md
Agent notifies: "Rule removed. It will no longer constrain the agent."
      ↓
complaints-log.md entry for that rule (if present) marked as unlearned
— does not re-trigger threshold promotion
```

**Design notes:**
- No TTL, no automatic expiry — removal is always a deliberate user action
- The removed rule's history stays in `complaints-log.md` as a record, marked `unlearned`
- If the same pattern causes problems again after unlearning, it will re-accumulate through the normal threshold mechanism — the learning loop self-corrects without special cases
- `/unlearn` can also be called with a number directly: `/unlearn 2` skips the list display and goes straight to confirmation

---

## Session Continuity

### Mid-story session end

The story file persists as-is. On next session:
1. Agent reads `context-map.md` + `system.md` + `index.md` (injected automatically)
2. Agent reads the active story file (most recently modified `in-progress` story)
3. Agent sees checklist state, open issues, and picks up exactly where it left off
4. No re-explanation required — the story file is the memory

### Cross-session learning

`complaints-log.md` is persistent and append-only. Issues reported in session 1 count toward threshold in session 3. The learning system works across sessions without any user action.

### JJ revert safety

If the user reverts via JJ:
- Code changes are restored to the checkpoint state
- `.context/` files are NOT reverted — they live outside the code tree
- Issue logged to the story file survives the revert
- `complaints-log.md` entry survives the revert
- The signal is never lost even when the code rolls back

---

## VCS Backend Detection

Unchanged from v3.6.

```
session_start
      ↓
try: execSync("jj root", { cwd })
      ↓
SUCCESS → useJJ = true  — full JJ path
FAILURE → useJJ = false — git fallback
```

---

## Zero-Token Automations

Unchanged from v3.6. All three run on `agent_end`:

1. **JJ commit auto-describe** — `jj describe -m "[last user prompt]"` — zero tokens, zero latency
2. **`index.md` structural updates** — deleted/renamed files patched out, new files get `(undescribed)` — zero tokens
3. **Lazy LLM descriptions** — `(undescribed)` files batch-described during `/consolidate` or `session_shutdown`

---

## Updated Build Order

**Days 1–2:** `/vazir-init` — unchanged from v3.6  
Verify all 11 checklist steps complete. Verify `index.md` generated, `context-map.md` drafted.

**Days 3–4:** `/plan` command  
Test planning conversation end-to-end. Verify `plan.md` + story files generated correctly. Verify story template structure is complete and well-formed. Test replanning flow (change scope mid-session).

**Days 5–6:** Story workflow  
Work a story start to finish. Verify checklist updates in real time. Verify agent stays within declared scope. Verify agent asks before marking complete. Verify force-complete logs unverified items.

**Days 7–8:** `/fix` + issue logging  
Call `/fix` mid-story. Verify secrets warning appears. Verify issue logged to correct story file using `last_accessed` routing — not filesystem timestamp. Verify `complaints-log.md` appended. Verify pending/confirmed status transitions. Test `reopened` fast-track to `system.md`. Test `/unlearn` — verify rule removed from `system.md`, entry marked in `complaints-log.md`.

**Days 9–10:** Threshold promotion  
Trigger same issue 3 times across stories. Verify LLM clustering in `/consolidate`. Verify promotion to `system.md`. Verify agent behaviour changes on next task.

**Days 11–12:** Widget + `/diff` + `/reset`  
Unchanged from v3.6 build order.

**Days 13–14:** `/consolidate` + lazy descriptions  
Unchanged from v3.6.

**Days 15–16:** Git fallback  
Unchanged from v3.6.

**Days 17–30:** Real use  
Track: same mistake recurrence rate, story completion rate, agent scope drift incidents, complaints-log threshold promotions. Watch `system.md` coherence over time.

---

## Known Limitations vs Full PRD

| Feature | POC v4.0 | Full Product |
|---|---|---|
| Planning UI | Terminal conversation → markdown files | Structured onboarding UI with story board |
| Story management | Markdown files in `.context/stories/` | Visual kanban-style story board |
| Issue tracking | `/fix` → story file + complaints-log | Integrated issue panel with history |
| Verification | User manually checks in browser | Automated test hooks where available |
| Scope enforcement | Skill file constraint + agent judgment | File-level write guards |
| Rule removal | `/unlearn` — user removes by index | Rule versioning + audit log |
| Checkpoint completeness (JJ) | Full — JJ snapshots everything | Atomic sandbox with pre-accept lint |
| Checkpoint completeness (git) | Partial — bash not captured | Full |
| Diff view | `jj diff` inline terminal | CM6 MergeView side-by-side |
| Context injection | `before_agent_start` | ContextProfile per call type |
| Desktop UI | Terminal | Tauri + CodeMirror 6 |

Everything in `.context/` is identical and portable to the full product.

---

## Transition Point

Move to full product when:
1. Same mistake recurrence rate visibly trends down across 20 tasks
2. Model-swap test passes — Haiku with mature `.context/` matches Sonnet cold
3. Story workflow validates — user can plan, execute, and verify without re-explaining context each session
4. You miss things the terminal can't give — side-by-side diff, visual story board, inline linting

---

*Vazir POC Spec v4.1 — Three targeted additions: `/unlearn` command for removing promoted rules, secrets warning on `/fix`, `last_accessed` frontmatter field for deterministic story routing.*
