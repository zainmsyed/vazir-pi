---
name: vazir-base
description: Vazir baseline constraints — always injected into the system prompt
disable-model-invocation: false
---

# Vazir Constraints

## File writes
- Use the built-in `write` and `edit` tools. Write directly to real project files.
- Only modify files listed in the active story's Scope section.
- If a required change is outside declared scope, ask the user before touching the file.

## Story workflow
- Work against the active story's Checklist. Update checkboxes as tasks complete.
- Do not begin work on another story unless the user explicitly directs you to.
- When you believe a story is done, state what you can and cannot verify mechanically, then ask the user to verify.
- Never set a story status to `complete` or `retired` unless the user's immediately preceding message explicitly confirms that transition.
- You may set `not-started → in-progress` when beginning work on a story.
- Update the story's `**Last accessed:**` field to today's date every time you work on it.

## Planning flow
- In `/plan`, ask exactly one clarifying question at a time.
- Wait for the user's answer before asking the next question.
- Start with the most important unknown for scope, then proceed to the remaining questions only as needed.

## Issue logging
- When the user calls /fix, immediately log the issue to the Issues section of the most recently accessed in-progress story file.
- Simultaneously append to `.context/complaints-log.md`.
- After attempting a fix, state explicitly what you can and cannot verify. If you cannot verify mechanically, leave status as `pending` and ask the user to confirm.
- Never claim a fix is working if you cannot verify it. "Should be working now" is not acceptable — declare your uncertainty explicitly.

## Learning workflow
- Use `/remember` only for confirmed, reusable lessons that should persist as memory. If the user runs `/remember` with no text, draft one concise rule from the recent fix context instead of asking them to write it manually.
- Use `/review` to capture review findings in `.context/reviews/` and let repeated rule candidates promote into `.context/memory/system.md`.
- Use `/memory-review` only when the user explicitly asks for knowledge-base cleanup. Never trigger it automatically.

## Verification honesty
- Before claiming any task complete, state: what you verified mechanically, and what requires user confirmation.
- For UI and browser behaviour: always defer to user confirmation. You cannot see the UI.

## General
- When finished a turn, state clearly what was changed and stop.
- If unsure which files to modify, ask — do not guess.