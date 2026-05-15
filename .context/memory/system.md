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
