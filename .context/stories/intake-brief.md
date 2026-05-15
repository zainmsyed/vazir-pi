# Intake Brief

**Last updated:** 2026-05-15

## Planning brief
The next planning slice adds two priorities on top of the existing Addenda C/D roadmap.

### Priority 1: harden persistence and VCS safety
The Vazir system guidance must explicitly treat these as non-negotiable:
- Commit `.context` changes whenever they are part of the work, unless the user explicitly says not to.
- Never delete, reset, clean, reinitialize, or overwrite VCS files or metadata without explicit user approval for that exact action.

Prompt rules alone are not enough. Vazir should also add runtime guardrails that block dangerous commands when they target protected VCS state.

Protected paths and metadata to cover at minimum:
- `.git/`
- `.jj/`
- `.fslckout`
- `.fossil-settings/`

Guardrails should also treat repo-shaping commands as dangerous when they would mutate initialized VCS state, including patterns like:
- `rm -rf`
- `git clean`
- `git reset --hard`
- re-init/open flows such as `jj git init` or `fossil open` when the repo is already initialized

For ambiguous repo files such as `.gitignore`, prefer warning/confirmation rather than silent mutation or blanket blocking. Destructive VCS actions should require a very explicit confirmation token.

### Priority 2: reduce extension sprawl
The current extension surface is large enough that reviews and fixes feel slow and overly coupled. The preferred direction is to split by responsibility, not by arbitrary file size.

Working split direction:
- Keep `vazir-context` focused on init, plan, memory, consolidation, and learned-rules/system-prompt assembly.
- Split review lifecycle into a dedicated review extension.
- Split story lifecycle and story-close flows into a dedicated story extension.
- Split VCS/checkpoint/settings logic into a dedicated VCS extension.
- Keep tracker or UI-focused chrome/status rendering separate from workflow logic.

The highest-risk areas during the split are:
- `.context` persistence
- story/review closeout handoffs
- checkpoint sync and active-mode refresh
- footer refresh timing and chrome state
- shared helper drift

### Safe planning assumptions
- The split should be incremental and behavior-preserving, with regression coverage added before or alongside moves.
- `.pi/lib/vazir-helpers.ts` remains the shared source for common helpers unless a cleaner shared module emerges during implementation.
- Existing stories `story-001` through `story-015` are preserved as history; new work starts at `story-016`.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md
- User replanning direction captured in the current planning conversation

## Distilled notes
- Addendum C remains the source of truth for design-system behavior.
- Addendum D remains the source of truth for mini-consolidate, recurrence tracking, and consolidation UX.
- New scope adds security and maintainability work around `.context` persistence, VCS safety, and extension decomposition.
- The user wants both prompt-level rules and programmatic enforcement for VCS safety.
- The user wants the extension split to improve review/fix performance by narrowing responsibility boundaries.

## Planning rules
- Preserve existing story files and queue entries.
- Express new scope only as additive story rows and new `story-016+` files.
- Keep each story small enough for one focused implementation session.
- Do not place questions or open issues inside story checklist items.
