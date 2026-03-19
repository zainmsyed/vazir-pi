# Copilot Instructions

This repository is the Vazir proof of concept built on `@mariozechner/pi-coding-agent`. Optimize for validating the context-engine thesis quickly, not for product completeness. Prefer the simplest implementation that proves the workflow.

## Product Intent

- Treat this as a POC with a 1 to 2 week build target.
- Preserve the simplified model from the spec: agents write to real files, backup happens before the first write, `/approve` archives, and `/reject` restores.
- Do not introduce a custom sandbox, shadow filesystem, preview overlay, or `vwrite`/`vedit` style tool wrappers unless the spec changes.
- Keep the `.context/` folder contract stable so it can migrate to the full product later.

## Expected Project Shape

- `.pi/extensions/` holds the workflow extensions, especially `vazir-context.ts`, `vazir-backup.ts`, and `vazir-workflow.ts`.
- `.pi/skills/` holds routing-mode skills such as `vazir-base`, `vazir-one-shot`, `vazir-step-by-step`, and `vazir-interview`.
- `AGENTS.md` provides cross-framework project context.
- `.context/` is the persistent project brain: `memory/`, `learnings/`, `history/`, `prd/`, `templates/`, and `settings/`.
- Prefer repo-wide conventions that fit `pi-coding-agent` discovery rules instead of inventing custom loading mechanisms.

## Pi-Coding-Agent Guidance

- When working on extension behavior, use the documented event flow and command model from `pi-coding-agent` docs.
- Prefer built-in `write` and `edit` flows plus extension hooks over custom tools when the standard toolchain is sufficient.
- Use skills for mode-specific guidance, not for core state management.
- Keep commands narrow and explicit: `/approve`, `/reject`, `/diff`, `/plan`, `/verify`, and `/vazir-init` should each have one clear responsibility.
- Favor recoverable workflows. If a change can be rejected, make restoration deterministic and easy to reason about.

## TypeScript Best Practices

- Use strict TypeScript and keep types explicit at API boundaries.
- Prefer `type` and `interface` definitions over implicit object shapes for extension APIs, command payloads, and persisted data.
- Avoid `any`. If an external API forces uncertainty, narrow with runtime checks or small type guards close to the boundary.
- Prefer small pure helpers for parsing, diff summaries, path walking, and settings access.
- Keep side effects localized. File I/O, UI notifications, and session branching should stay near command handlers or well-named helper functions.
- Use early returns to keep command handlers readable.
- Preserve ESM-style imports and existing naming unless there is a clear reason to change them.
- Avoid clever abstractions. In this repo, direct and readable code is better than reusable-but-indirect frameworks.
- Keep module-level mutable state to a minimum. If global tracking is used for the POC, document it in code and keep it easy to reset.

## Workflow Rules

- Before changing architecture, check the current spec in `docs/` and follow the latest version.
- Maintain backward-compatible command names and folder names from the spec unless the task explicitly changes them.
- When editing backup or restore logic, protect existing files first and handle missing files deliberately.
- When capturing learnings, prefer append-only behavior and simple deduplication over heavy data models.
- Keep user-facing messaging concise and operational.

## Validation

- If the repo has runnable verification commands, run the smallest relevant check after changes.
- Prefer targeted validation over broad churn.
- If validation is not available yet, keep edits minimal and mention what could not be verified.

## Default Agent Behavior

- Trust these instructions first and only search further when repository context is missing or contradicted.
- Keep responses concise.
- Do not expand scope from the POC into product-grade infrastructure unless explicitly asked.