# Vazir POC — Addenda C & D Implementation Plan

**Created:** 2026-05-05
**Last updated:** 2026-05-27

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

### Feature 4: VCS commit semantics hardening
`active_vcs_mode` should own the commit operation. `vcs_preference` should control display and checkpoints only. In colocated git+jj repos with `vcs_preference: "jj"`, "commit all" must create a real git commit, not run `jj describe`.

## JJ replan addendum
### Problem summary
JJ checkpoint restore is currently too noisy and not trustworthy: the primary history is flooded with low-value snapshots, and restore behavior can produce mixed or surprising state.

### Proposed behavior/spec
- **Undo last agent run:** treat one completed Pi agent run for one user prompt as the main undo unit when that run changed files.
- **Curated milestones:** show explicit user checkpoints and selected workflow-boundary milestones instead of raw JJ snapshot history.
- **Exact restore:** use one exact restore procedure for both default undo and milestone restore so rollbacks are unsurprising.
- **Restore-safe workflow state:** keep relevant `.context` story/review state synchronized with restored code and resumed sessions.

## VCS commit replan addendum
### Problem summary
In colocated git+jj repos, when `vcs_preference` is `"jj"`, the `commitStoryCloseChanges` function bypasses `git commit` and runs `jj describe` instead. `jj describe` does not create a git commit, so the user sees files remain uncommitted after choosing "commit all".

### Proposed behavior/spec
- When `active_vcs_mode === "git"`, always use `git commit` regardless of `vcs_preference`.
- Remove the `detectJJ(cwd)` fallback commit path that uses `jj describe` when `active_vcs_mode === "none"`.
- Clean up dead duplicate condition in `resolvePreferredVcsKind`.
- Preserve Fossil commit path, JJ install/setup flow, footer display, and checkpoint/undo behavior.

## Story queue
| Story | Title | Status | Blocks |
|---|---|---|---|
| story-001 | Design system folder, UI story detection, and seeding | archived | — |
| story-002 | Design context injection and lazy first-UI-story questions | complete | story-001 |
| story-003 | `/design` command and chrome registration | complete | story-001 |
| story-004 | Design compliance in `/review` | complete | story-001 |
| story-005 | Story-close mini-consolidate and promotion UX | complete | — |
| story-006 | Fallow recurrence tracking in complaints-log | complete | story-005 |
| story-007 | Enhanced manual `/consolidate` with positive patterns and confidence scoring | complete | story-005 |
| story-014 | `/vazir-init` version control system (VCS) repo-scan setup and active-mode settings | complete | — |
| story-015 | VCS preference discoverability and override | complete | story-014 |
| story-016 | VCS safety policy and protected-target detection | complete | — |
| story-017 | Runtime guardrails for destructive VCS operations | complete | story-016 |
| story-018 | `.context` persistence enforcement in closeout flows | archived | story-016, story-017 |
| story-019 | Extension split scaffolding and ownership boundaries | archived | story-016, story-018 |
| story-020 | Extract review lifecycle into `vazir-review` | not-started | story-019 |
| story-021 | Extract story lifecycle into `vazir-story` | archived | story-019, story-020 |
| story-022 | Extract VCS workflow into `vazir-vcs` | archived | story-019, story-018 |
| story-023 | Fix review closeout remediation to trigger new agent turns | archived | story-021 |
| story-024 | Map complete-story phases and centralize closeout state helpers | archived | story-023 |
| story-025 | Extract complete-story orchestration into a dedicated module | complete | story-024 |
| story-026 | Harden complete-story regression coverage and stress-test closeout flows | complete | story-025 |
| story-027 | Descriptive `/complete-story` commit messages | complete | story-026 |
| story-028 | Agent-run undo checkpoints for JJ | complete | — |
| story-029 | Exact JJ restore semantics | complete | story-028 |
| story-030 | Milestone checkpoint curation and restore UX | complete | story-028, story-029 |
| story-031 | Restore-safe `.context` workflow state and end-to-end hardening | complete | story-028, story-029, story-030 |
| story-032 | Fix git commit bypass when `vcs_preference` is `jj` in colocated repos | complete | — |
| story-033 | Normalize footer VCS identity to git or fossil only | complete | story-032 |
| story-034 | Fix `/plan` intake question flow to ask one question at a time | not-started | — |
| story-035 | Shared pi TUI overlay helpers for Vazir selection lists and markdown viewers | complete | — |
| story-036 | Wire `/story`, `/plan`, and `/implement` to shared TUI selectors and document overlays | complete | story-035 |
| story-037 | Keep standard Pi selection lists for Vazir while reserving overlays for documents | in-progress | story-035, story-036 |
| story-038 | Add compact persistent Vazir HUD in tracker chrome | not-started | story-035, story-036 |

## Replanning log
- **2026-05-05** — Initial plan generated from Addenda C and D. No prior story files existed; this is the first scoped plan for the design-system and enhanced-consolidation work.
- **2026-05-15** — Replanned to add hard VCS safety rules, `.context` commit enforcement, and an incremental extension decomposition path. Preserved existing Addenda C/D queue and appended new follow-on stories starting at story-016.
- **2026-05-24** — Replanned from the current `/complete-story` stabilization work to add a focused hardening track. Preserved all existing story history and appended story-024 through story-026 for phase mapping/state centralization, module extraction/lifecycle ownership cleanup, and regression-plus-stress-test hardening before any merge toward `main`.
- **2026-05-26** — Replanned from the user request for descriptive `/complete-story` commit messages. Preserved the existing queue and appended story-027 to add short, story-aware closeout commit summaries across the supported VCS paths.
- **2026-05-26** — Replanned from the user request to fix JJ checkpoint/restore UX and reliability. Preserved existing story history and appended story-028 through story-031 for agent-run undo modeling, exact JJ restore semantics, curated milestone UX, and restore-safe `.context` workflow hardening.
- **2026-05-27** — Replanned from the user request to fix git commit bypass when `vcs_preference` is `"jj"`. Preserved existing queue and appended story-032 to remove the `vcsPreference === "jj"` bypass in `commitStoryCloseChanges`, remove the `detectJJ` fallback commit path, and clean up the dead duplicate condition in `resolvePreferredVcsKind`.
- **2026-05-27** — Replanned from the user request to normalize the footer so only git or fossil appear as active VCS identities. Preserved the existing queue and appended story-033 to keep JJ available for checkpoints while rendering Git+JJ repos as git in the footer/chrome.
- **2026-05-27** — Replanned from the user request to fix the `/plan` intake question flow. Updated queue statuses to reflect completed/archived stories. Appended story-034 to fix the one-at-a-time question behavior in `/plan`.
- **2026-05-29** — Replanned from Addendum E after revising the spec toward pi built-ins and current extension ownership. Preserved all existing story history and appended story-035 through story-038 for shared `SelectList`/`Markdown` helpers, story/plan/implement overlay adoption, remaining command picker and confirmation overlays, and a compact VCS-aware HUD in tracker chrome.
- **2026-05-29** — Replanned after live selector previews. Locked in the split of markdown documents on overlays vs. pickers in the normal text-entry area, explored alternate selector styling for flows including `/story`, `/plan`, and `/implement`, marked story-035 and story-036 complete in the queue, and retargeted story-037 toward selector consistency while keeping opened documents in overlays.
- **2026-05-30** — Replanned after testing the custom inline selector rollout in real Pi sessions. Reverted Vazir to Pi's standard selection lists for continuity and runtime safety, kept overlays only for opened story/plan/review markdown, and deferred global theme exploration plus any future picker-rendering change to follow-up planning.
