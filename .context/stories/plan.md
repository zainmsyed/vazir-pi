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

## Replanning log
- **2026-05-05** — Initial plan generated from Addenda C and D. No prior story files existed; this is the first scoped plan for the design-system and enhanced-consolidation work.
