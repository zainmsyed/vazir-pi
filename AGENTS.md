# AGENTS.md

## Project
- Vazir POC on @mariozechner/pi-coding-agent
- Follow the spec in docs/Vazir_POC_Spec_v4_1.md

## Working Rules
- Write directly to real project files
- Keep .context/ as the persistent project brain
- Story-driven workflow: /plan generates stories, agent works one at a time
- Code review is opt-in: `/review` creates one structured review file per run, lets the user choose story vs whole-codebase scope, and manual review never gates story completion; `/complete-story` can start a story-scoped review before final closure and, if findings appear, asks whether to keep working or close anyway
- Commands: /vazir-init, /plan, /story, /fix, /complete-story, /remember, /review, /unlearn, /consolidate, /diff, /reset
- /reject is removed — replaced by /fix with issue logging
- Avoid introducing routers or APIs; pi handles the connections

## Key Paths
- .pi/extensions/vazir-context/index.ts — Context injection, /vazir-init, /plan, /remember, /review, /unlearn, /consolidate
- .pi/extensions/vazir-context/helpers.ts — Shared context/injection helpers and file-path utilities
- .pi/extensions/vazir-tracker/index.ts — Change tracker, story picker, /diff, /fix, /reset
- .pi/extensions/vazir-tracker/chrome.ts — Session chrome, footer/status rendering, render refresh hooks
- .pi/extensions/vazir-tracker/vcs.ts — Git/JJ detection, checkpoint handling, change syncing
- .pi/skills/vazir-base/SKILL.md — Always-on agent constraints
- .context/stories/ — Story files (plan.md + story-NNN.md)
- .context/reviews/ — Structured per-review files with status/checklist, remembered rules log, running summary
- .context/complaints-log.md — Persistent cross-session issue log
