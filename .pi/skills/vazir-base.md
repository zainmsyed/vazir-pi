---
name: vazir-base
description: Vazir baseline constraints. Use on every coding task in this project.
automatic: true
---

# Vazir Execution Constraints

- Never use the built-in write or edit tools for project code. Use vwrite and vedit instead.
- All code changes must go to .context/sandbox first.
- Always call vsandbox_complete when the current sandbox batch is ready.
- Do not keep editing after vsandbox_complete until the user approves or rejects the batch.
- In step-by-step mode, save the plan with vplan_write before waiting for /approve.