# Vazir POC

Vazir is a small proof-of-concept context engine that demonstrates how an accumulated project brain (.context/) can make smaller, cheaper LLMs behave like well-informed assistants.

Key points
- Tech: built as pi-coding-agent extensions (TypeScript) + one always-on skill.
- Purpose: inject project context, track changes, and learn from rejections so agents avoid repeat mistakes.
- .context/: memory (context-map.md, system.md, index.md), learnings, checkpoints, settings.

JJ (recommended)
- JJ snapshots the working copy automatically and provides an operation log used as checkpoints.
- Useful commands: `jj git init --colocate` (enable), `jj op log`, `jj op restore {id}`, `jj diff --stat`.

Quick start
1. Ensure jj is installed and on PATH (e.g. ~/.cargo/bin). 2. Run `jj git init --colocate` in the repo (optional but recommended). 3. Start the pi agent and run `/vazir-init` to bootstrap .context/.

See docs/Vazir_POC_Spec_v3_4.md and AGENTS.md for full details.