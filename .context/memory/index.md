# File Index

.pi/extensions/vazir-context/helpers.ts — Context injection, init, plan, and consolidation extension
.pi/extensions/vazir-context/index.ts — Context injection, init, plan, and consolidation extension
.pi/extensions/vazir-live-reload.ts — Watches `.pi/extensions` for source edits and triggers Pi reloads via an internal command.
.pi/extensions/vazir-tracker/chrome.ts — Change tracker, diff, fix, and reset extension
.pi/extensions/vazir-tracker/index.ts — Change tracker, diff, fix, and reset extension
.pi/extensions/vazir-tracker/vcs.ts — Change tracker, diff, fix, and reset extension
.pi/lib/vazir-helpers.ts — Shared filesystem, story frontmatter, project-settings, and VCS-detection helpers used across Vazir extensions.
.pi/skills/vazir-base/SKILL.md — Vazir baseline skill instructions
AGENTS.md — Cross-framework project guidance and working notes
package-lock.json — package-lock.json configuration file
package.json — package.json configuration file
test_exec.js — Tiny Node child-process smoke test that runs `node -e` and prints the captured output.
types/node-runtime-ambient.d.ts — Minimal ambient Node typings for child_process, fs, path, os, module, url, and process used by stripped-TypeScript runtime loading.
types/pi-runtime-ambient.d.ts — Minimal ambient Pi SDK and pi-tui module typings for extension compilation without full upstream type packages.

.pi/lib/vazir-vcs-helpers.ts — VCS checkpoint, guardrail, and repo-state helpers for the tracker extension (changed-files tracking, checkpoint metadata, VCS-kind detection, and pending-approval state).
.pi/extensions/vazir-review/index.ts — Scaffold for future review lifecycle extraction; target owner for /review command orchestration and review draft closeout.
.pi/extensions/vazir-story/index.ts — Scaffold for future story workflow extraction; target owner for /story, /implement, /fix, and /complete-story orchestration.
.pi/extensions/vazir-vcs/index.ts — Scaffold for future VCS/settings extraction; target owner for VCS mode selection, checkpoint restore/sync, and VCS guardrails.

.pi/extensions/vazir-context/complete-story.ts — Complete-story orchestration module owning phase detection, closeout prompting, remediation dispatch, learned-rule closeout, and final story close/commit handoff.
.pi/lib/vazir-ui.ts — Shared pi TUI overlay helpers for Vazir selection lists, markdown viewers, and bordered panel rendering.
install.sh — One-line installer script for macOS/Linux that bootstraps pi-coding-agent and installs the Vazir extension.