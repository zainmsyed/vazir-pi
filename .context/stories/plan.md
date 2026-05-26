# Vazir POC — Addenda C & D Implementation Plan

**Created:** 2026-05-05  
**Last updated:** 2026-05-26

---

## What we're building
We are implementing two ratified addenda for the Vazir POC on pi-coding-agent. Addendum C adds a persistent design system layer (`.context/design/`) so UI stories accumulate colour, typography, spacing, and component conventions across sessions. Addendum D enriches the consolidation system with an automatic story-close mini-consolidate that promotes fresh findings into `system.md` rules, tracks Fallow finding recurrence, and captures positive patterns from clean story completions.

## What we're not building (v1 scope)
- No vision analysis of PNG/JPG intake for design seeding.
- No changes to Addendum A (`/memory-review`) or Addendum B (Fallow static analysis itself).
- No new TUI widgets beyond command help registration.
- No auto-promotion of rules — user approval remains required everywhere.

## Features
### Feature 1: Design system context (Addendum C)
`.context/design/` folder with token-capped `design-system.md` (injected per-turn for UI stories), `brand.md`, and `components.md`. Silent seeding during `/plan`, lazy question flow on first UI story, `/design` update command, and design compliance checks in `/review`.

### Feature 2: Enhanced consolidation (Addendum D)
Story-close mini-consolidate runs automatically at `/complete-story`. Fallow recurrence tracking in `complaints-log.md`. Enhanced manual `/consolidate` reads completion summaries and decisions for positive patterns, scores rule confidence, and separates success-derived from failure-derived rules.

### Feature 3: JJ checkpoint and restore hardening
Trustworthy JJ undo should target one completed agent run that changed files, not raw JJ operation spam. User-facing checkpoint browsing should center on exact undo-last-run and curated milestones, while restore paths keep code and relevant `.context` workflow state aligned.

## JJ replan addendum
### Problem summary
JJ checkpoint restore is currently too noisy and not trustworthy: the primary history is flooded with low-value snapshots, and restore behavior can produce mixed or surprising state.

### Proposed behavior/spec
- **Undo last agent run:** treat one completed Pi agent run for one user prompt as the main undo unit when that run changed files.
- **Curated milestones:** show explicit user checkpoints and selected workflow-boundary milestones instead of raw JJ snapshot history.
- **Exact restore:** use one exact restore procedure for both default undo and milestone restore so rollbacks are unsurprising.
- **Restore-safe workflow state:** keep relevant `.context` story/review state synchronized with restored code and resumed sessions.

## Story queue
| Story | Title | Status | Blocks |
|---|---|---|---|
| story-001 | Design system folder, UI story detection, and seeding | not-started | — |
| story-002 | Design context injection and lazy first-UI-story questions | not-started | story-001 |
| story-003 | `/design` command and chrome registration | not-started | story-001 |
| story-004 | Design compliance in `/review` | not-started | story-001 |
| story-005 | Story-close mini-consolidate and promotion UX | not-started | — |
| story-006 | Fallow recurrence tracking in complaints-log | not-started | story-005 |
| story-007 | Enhanced manual `/consolidate` with positive patterns and confidence scoring | not-started | story-005 |
| story-016 | VCS safety policy and protected-target detection | not-started | — |
| story-017 | Runtime guardrails for destructive VCS operations | not-started | story-016 |
| story-018 | `.context` persistence enforcement in closeout flows | not-started | story-016, story-017 |
| story-019 | Extension split scaffolding and ownership boundaries | not-started | story-016, story-018 |
| story-020 | Extract review lifecycle into `vazir-review` | not-started | story-019 |
| story-021 | Extract story lifecycle into `vazir-story` | not-started | story-019, story-020 |
| story-022 | Extract VCS workflow into `vazir-vcs` | not-started | story-019, story-018 |
| story-024 | Map complete-story phases and centralize closeout state helpers | not-started | story-023 |
| story-025 | Extract complete-story orchestration into a dedicated module | not-started | story-024 |
| story-026 | Harden complete-story regression coverage and stress-test closeout flows | not-started | story-025 |
| story-027 | Descriptive `/complete-story` commit messages | not-started | story-026 |
| story-028 | Agent-run undo checkpoints for JJ | not-started | — |
| story-029 | Exact JJ restore semantics | not-started | story-028 |
| story-030 | Milestone checkpoint curation and restore UX | not-started | story-028, story-029 |
| story-031 | Restore-safe `.context` workflow state and end-to-end hardening | not-started | story-028, story-029, story-030 |

## Replanning log
- **2026-05-05** — Initial plan generated from Addenda C and D. No prior story files existed; this is the first scoped plan for the design-system and enhanced-consolidation work.
- **2026-05-15** — Replanned to add hard VCS safety rules, `.context` commit enforcement, and an incremental extension decomposition path. Preserved existing Addenda C/D queue and appended new follow-on stories starting at story-016.
- **2026-05-24** — Replanned from the current `/complete-story` stabilization work to add a focused hardening track. Preserved all existing story history and appended story-024 through story-026 for phase mapping/state centralization, module extraction/lifecycle ownership cleanup, and regression-plus-stress-test hardening before any merge toward `main`.
- **2026-05-26** — Replanned from the user request for descriptive `/complete-story` commit messages. Preserved the existing queue and appended story-027 to add short, story-aware closeout commit summaries across the supported VCS paths.
- **2026-05-26** — Replanned from the user request to fix JJ checkpoint/restore UX and reliability. Preserved existing story history and appended story-028 through story-031 for agent-run undo modeling, exact JJ restore semantics, curated milestone UX, and restore-safe `.context` workflow hardening.
