# Vazir — Quickstart Guide

Vazir is a set of extensions, skills, and workspace conventions that add persistent context, story-driven workflows, and change tracking to your coding agent.

## Prerequisites

- Node.js (LTS recommended)
- pi-coding-agent CLI installed globally

## Install

```bash
pi install git:github.com/zainmsyed/vazir-pi
```

This makes Vazir available in all your pi sessions. In any project where you want to use it, initialize the local brain:

```bash
/vazir-init
```

## Quickstart Workflow

### 1. Plan your work

```
/plan
```

Vazir reads any intake briefs in `.context/intake/`, asks clarifying questions one at a time, and generates story files in `.context/stories/` plus a `plan.md` roadmap.

> **Tip:** Starting with a well-thought-out PRD in `.context/intake/` gives the best results, but Vazir will walk you through planning even without one.

### 2. Implement a story

```
/implement
```

Starts implementation of the active in-progress story. If no story is active, Vazir offers to start the next open story or let you pick one from the queue.

### 3. Complete the story

```
/complete-story
```

Validates the story checklist and issues, checks completion readiness, and optionally runs a story-scoped review before closing. After review, you can fix recommended items or close with remaining items noted.

## Common Next Steps

- **`/fix <description>`** — Log an issue to the active story and attempt a fix.
- **`/review [scope]`** — Run a structured code review scoped to the active story or the whole codebase.
- **`/remember [rule]`** — Promote a reusable lesson into persistent memory (`.context/memory/system.md`).
- **`/memory-review`** — Archive cold stories and reviews, flag stale rules, and review delete candidates.
- **`/story [file]`** — Open a story or plan file in a scrollable overlay.
- **`/checkpoint`** — Pick a checkpoint to restore (or `/reset` as an alias).

## Command Reference

| Command | Description |
|---|---|
| `/vazir-init` | Bootstrap `.context` and seed the project brain |
| `/plan [topic]` | Review intake, ask delta questions, and generate stories |
| `/story [file]` | Pick a plan or story file and open it in a scrollable view |
| `/implement` | Implement the active in-progress story |
| `/fix <description>` | Log an issue to the active story, then attempt a fix |
| `/complete-story` | Check readiness, optionally review, and close a story |
| `/review [scope]` | Write a review file and sync recurring rule candidates |
| `/remember [rule]` | Promote a reusable lesson into persistent memory |
| `/memory-review` | Archive cold context, flag stale rules, and review delete candidates |
| `/unlearn` | Remove a promoted rule from system memory |
| `/consolidate` | Cluster complaints and promote repeated rule candidates |
| `/design [instruction]` | Review and edit design system, brand, components |
| `/vcs-settings [mode]` | Pick or set the preferred VCS mode (auto, git, jj, fossil) |
| `/diff [file]` | Show the diff for one changed file |
| `/edits` | Show the recent file edit stream |
| `/checkpoint` | Pick a checkpoint to restore |
| `/reset` | Alias for `/checkpoint` |

Press **Ctrl+?** in pi for an interactive, searchable command list with full usage details.

## Project Layout

```
.context/          — Persistent project brain
  stories/         — Story files (plan.md + story-NNN.md)
  reviews/         — Structured per-review files
  memory/          — Learned rules and context maps
  settings/        — Project settings
  intake/          — PRDs, briefs, and planning inputs
```

## Working Rules

- Write directly to real project files.
- Keep `.context/` as the persistent project brain.
- Avoid introducing routers or external APIs — pi handles agent connections.

## Contributing

- Follow the existing code style and conventions.
- Use built-in write/edit tools when applicable.
- If unsure about which files to modify, ask before making changes.
