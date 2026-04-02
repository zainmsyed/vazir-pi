Vazir POC — Proof of Concept for pi-coding-agent integration
=============================================================

What is Vazir?
---------------
Vazir is the set of extensions, skills, and workspace conventions developed for this project to enhance the pi-coding-agent with persistent context, change tracking, and workflow helpers. Core capabilities in this repo include:
- Context injection (provides runtime state and consolidated context to the agent)
- Change tracking (recording diffs, rejecting and resetting edits)
- Baseline skills (constraints and policies injected into the system prompt)

Purpose
-------
A proof-of-concept demonstrating integration of Vazir features into the pi-coding-agent (TypeScript). This repository contains extensions, skills, and workspace conventions used by the agent.

Highlights
----------
- Context injection extension: .pi/extensions/vazir-context.ts
- Change tracker, story picker, and diff/reset helpers: .pi/extensions/vazir-tracker.ts
- Review loop: per-review markdown files plus a running summary in .context/reviews/
- Base skill definitions: .pi/skills/vazir-base/SKILL.md
- Persistent project brain: .context/

Prerequisites
-------------
- Node.js (recommended LTS)
- pi-coding-agent CLI (installed globally where applicable)
- Optional: jj for fast local checkpoints (recommended); git as a functional fallback

Quickstart
----------
1. Install dependencies (if any):
   - npm install
2. Use the pi tooling to run and develop the agent. See docs/ and the pi examples for guidance.
3. Create checkpoints before large edits:
   - Preferred: jj (fast local snapshots): use the jj commands below
   - Fallback: git: git add -A && git commit -m "describe change"

jj (checkpoint) examples
------------------------
Note: the exact commands and flags depend on the local "jj" installation; run `jj --help` if unsure. Common jj usage patterns used in this project:
- Create a snapshot:
  - jj snap -m "brief message describing change"
- List snapshots:
  - jj list    # or jj ls (depending on your jj version)
- Show a snapshot's details:
  - jj show <snapshot-id>
- Restore a snapshot:
  - jj restore <snapshot-id>
- Compare snapshots / show a diff:
  - jj diff <snapshot-id-1> <snapshot-id-2>

In Vazir, the in-app restore command is `/checkpoint` (with `/reset` kept as an alias).

If jj is not available, use git as the fallback checkpoint mechanism.

Useful commands
---------------
- Check versions:
  - git --version
  - jj --version
- Inspect project files and extensions:
  - ls -la .pi/extensions
  - ls -la .pi/skills

Project layout
--------------
- .pi/extensions — vazir-context.ts, vazir-tracker.ts
- .pi/skills — vazir-base/SKILL.md
- .context — runtime state used by the agent (persistent project brain)
- docs — additional notes and specs (including Vazir_POC_Spec_v3_4.md)
- AGENTS.md — project-level working rules and guidance

Working rules
-------------
- Write directly to real project files (use provided tools)
- Keep .context/ as the persistent project brain
- Use /vazir-init, /plan, /story, /fix, /remember, /review, and /reset as core commands when interacting with the agent; `/remember` can draft the rule from recent fix context if you do not pass one
- Avoid introducing routers or external APIs — pi handles agent connections

Contributing
------------
- Follow the existing code style and conventions
- Use built-in write/edit tools when applicable for automated changes
- If unsure about which files to modify, ask before making changes

Further reading
---------------
- pi-coding-agent docs and examples (installed globally with the pi package) — see the pi package README and docs directory
- AGENTS.md in this repo for project-specific workflows

If you want a license block added or further detail (examples, exact pi commands, or contributor guidelines), tell me what to include.
