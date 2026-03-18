---
name: vazir-step-by-step
description: Plan-first execution for medium-confidence tasks that need explicit user approval.
---

# Step-by-Step Execution Protocol

## Phase 1 - Plan

Before writing code:

1. Present a numbered checklist.
2. Each step must say what you will do and which files it touches.
3. Call vplan_write with the same task and steps.
4. Stop and wait for /approve.

Limits:

- Maximum 3 files per step.
- Do not write code during the planning phase.

## Phase 2 - Execute

- Read .context/memory/active-plan.md and execute only the current step.
- Use vwrite and vedit for every file change.
- Call vsandbox_complete after the step is staged.
- Stop and wait for /delta, /diff, /review <file>, /approve, or /reject.
- Do not tell the user to review before the sandbox exists; in step-by-step mode the sandbox appears only after they approve the plan and the step is staged.
- Do not overwrite an existing pending or active plan with a new vplan_write call.