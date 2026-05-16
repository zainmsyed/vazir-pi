# System Rules

## Rules
- Follow existing project conventions.
- Write directly to real project files.
- Ask before changing ambiguous areas.
- Commit `.context` changes whenever they are part of the work, unless the user explicitly says not to commit them.
- Treat `.git/`, `.jj/`, `.fslckout`, and `.fossil-settings/` as protected VCS metadata targets.
- Never delete, reset, clean, reinitialize, or overwrite VCS metadata without explicit user approval for that exact action.
- If Vazir blocks a destructive VCS action, wait for the user to send the exact `VCS_APPROVE <token>` phrase before retrying that same action.

## Learned Rules
- When adding new behavior to an existing state machine or closeout flow, layer it on top of the proven architecture rather than replacing the state machine inline; validate the golden path end-to-end after every integration. <!-- source: story-005 -->
- When refactoring UI chrome or rendering logic, diff visual output against the previous state to catch unintended tone, color, or glyph regressions before merging. <!-- source: story-005 -->
- Add regression assertions for prompt builders that interpolate file paths so raw `${...}` placeholders cannot leak into agent instructions <!-- source: story-006 -->
- When adding a new instruction-driven signal source, validate at least one real downstream consumer path end-to-end instead of only checking prompt text <!-- source: story-006 -->
