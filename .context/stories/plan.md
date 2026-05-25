# Vazir POC — Addenda C & D Implementation Plan

**Created:** 2026-05-05  
**Last updated:** 2026-05-05

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

## Replanning log
- **2026-05-05** — Initial plan generated from Addenda C and D. No prior story files existed; this is the first scoped plan for the design-system and enhanced-consolidation work.
- **2026-05-15** — Replanned to add hard VCS safety rules, `.context` commit enforcement, and an incremental extension decomposition path. Preserved existing Addenda C/D queue and appended new follow-on stories starting at story-016.
- **2026-05-24** — Replanned from the current `/complete-story` stabilization work to add a focused hardening track. Preserved all existing story history and appended story-024 through story-026 for phase mapping/state centralization, module extraction/lifecycle ownership cleanup, and regression-plus-stress-test hardening before any merge toward `main`.
