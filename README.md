# Vazir POC for pi

This repository contains a project-local Vazir proof of concept built on top of `@mariozechner/pi-coding-agent`.

## What is included

Files:
- README.md — Project overview and usage instructions. Review sandboxed changes before apply.
- task.md — Structured Vazir task template. One-line prompt for tasks.
- .context/ — Project-local runtime data and sandbox for staged edits.
  - .context/chat — Chat transcripts.
  - .context/history — Interaction history.
  - .context/learnings — Captured learnings and code-review notes.
  - .context/memory — Persistent agent memory and active plans.
  - .context/prd — Production artifacts.
  - .context/settings — Project-specific settings.
  - .context/technical — Technical notes and specs.
  - .context/templates — Prompt and task templates.
- .pi/extensions/ — Vazir context injection, sandboxing, workflow commands, and zero-token scoring
- .pi/skills/ — Vazir base, one-shot, step-by-step, and interview protocols
- .pi/prompts/ — Task and feature templates

## Local validation

```bash
npm install
npm run typecheck
npm run smoke-test
```

## Using it in pi

Start pi from this repository root so project-local resources auto-discover:

```bash
cd /Users/zain/Documents/coding/vazir-pi
pi
```

Inside pi:

1. Run `/vazir-init` once to create `.context/` and `AGENTS.md`.
2. Run `/reload` if pi was already open before these files existed.
3. Submit a task. Vazir will choose one-shot, step-by-step, or interview mode.
4. Sandbox: staged edits appear under .context/sandbox and must be reviewed before they are applied.
5. Use `/delta` to see the staged file list plus `+/-` counts, `/diff` to print the full staged diffs, and `/review <path>` to inspect one file's diff.

The sandbox is a staging area under `.context/sandbox/`. The agent writes there first, you inspect the staged changes, and only `/approve` copies them into the real project files.

## Inside pi — quick review commands

Use these commands inside the pi prompt to inspect and manage staged edits in the sandbox before applying them:

- `/delta` — Show a compact summary of staged files with `+/-` counts.
- `/diff` — Print the full unified diffs for all staged changes.
- `/review <path>` — Print the staged diff for a single file.
- `/approve` — Apply the staged changes from `.context/sandbox` to the real files.
- `/reject` — Discard the current staged changes.

## pi commands (typed into the pi prompt)

- `/vazir-init` — Initialize project-local context files (run once per repo).
- `/reload` — Reload project-local resources in the running pi session.
- `/delta`, `/diff`, `/review <path>` — Inspect staged changes in the sandbox.
- `/approve`, `/reject` — Apply or discard staged edits.

## Suggested test flow

Use a small real task with 1-2 files, for example adding a heading to this README or adjusting a prompt template. That is enough to verify:

- context injection
- plan capture with `vplan_write`
- sandbox-only file writes
- review before apply
- `/delta` summary counts, `/diff` full staged diffs, and `/review <file>` for one file
- `/approve` and `/reject`
- learning capture in `.context/learnings/code-review.md`

The repo also includes a smoke test script that checks local type safety and runs pi against `/vazir-init`:

```bash
npm run smoke-test
```
