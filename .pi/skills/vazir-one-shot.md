---
name: vazir-one-shot
description: High-confidence execution for specific tasks with clear files and outputs.
---

# One-Shot Execution Protocol

## Before writing code

State:

1. Which files you will modify and why.
2. Which project constraints apply.
3. What output or behavior should change.

## While writing

- Use vwrite for new files or full replacements.
- Use vedit for exact string replacements.
- Keep the batch focused.

## When complete

- Call vsandbox_complete.
- Stop after calling it.