# AGENTS.md

## Project
- Vazir POC on @mariozechner/pi-coding-agent
- Follow the spec in docs/Vazir_POC_Spec_v4_1.md

## Working Rules
- Write directly to real project files
- Keep .context/ as the persistent project brain
- Story-driven workflow: /plan generates stories, agent works one at a time
- Commands: /vazir-init, /plan, /fix, /unlearn, /consolidate, /diff, /reset
- /reject is removed — replaced by /fix with issue logging
- Avoid introducing routers or APIs; pi handles the connections

## Key Paths
- .pi/extensions/vazir-context.ts — Context injection, /vazir-init, /plan, /unlearn, /consolidate
- .pi/extensions/vazir-tracker.ts — Change tracker, /diff, /fix, /reset
- .pi/skills/vazir-base/SKILL.md — Always-on agent constraints
- .context/stories/ — Story files (plan.md + story-NNN.md)
- .context/complaints-log.md — Persistent cross-session issue log
