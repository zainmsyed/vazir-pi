Vazir POC — short README
=========================

Purpose
-------
A small proof-of-concept for integrating Vazir features into the pi-coding-agent (TypeScript).

Quickstart
----------
- Use the pi-coding-agent tooling to run and develop the agent.
- Create checkpoints before large edits (preferred: jj; fallback: git).
- Check: git --version ; jj --version (optional)

Where to look
-------------
- .pi/extensions — vazir-context.ts, vazir-tracker.ts
- .pi/skills — vazir-base/SKILL.md
- .context — runtime state used by the agent

Notes
-----
Keep checkpoints and bootstrap steps explicit; JJ is recommended for fast local checkpoints, git is a functional fallback.
