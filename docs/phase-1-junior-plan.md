# Phase 1 Plan For A Junior Developer

Source of truth: `docs/Vazir_poc_spec_v2.3.md`

Phase 1 in the spec is:

- `vazir-context.ts`
- `/vazir-init`

Goal for this phase: make the agent load project context reliably and give the repo a one-command way to create the minimum Vazir brain files.

## Expected Outcome

By the end of phase 1, a developer should be able to:

1. Start the coding agent inside the repo.
2. Have Vazir inject `.context/memory/context-map.md` into the system prompt when it exists.
3. Fall back to `AGENTS.md` when `context-map.md` does not exist.
4. Run `/vazir-init` to create the required `.context/` structure and seed files.
5. Re-run `/vazir-init` safely without destroying existing files.

## Scope Boundaries

Do in this phase:

- Build `vazir-context.ts`.
- Add `/vazir-init` to `vazir-workflow.ts`.
- Create seed templates for `context-map.md`, `system.md`, `project.json`, and `AGENTS.md`.
- Validate that injection and initialization work.

Do not do in this phase:

- Backup and restore logic.
- `/approve`, `/reject`, or `/diff` behavior beyond stubs if needed.
- Scoring and routing logic.
- Skill loading behavior.
- Indexing or learning loop improvements beyond what is required to avoid broken references.

## Files To Create Or Edit

- `.pi/extensions/vazir-context.ts`
- `.pi/extensions/vazir-workflow.ts`
- Optional shared helper file only if the implementation becomes repetitive

Do not create extra abstractions unless they clearly reduce duplication.

## Implementation Plan

### Step 1: Read the Pi Extension Docs First

Before writing code, read the parts of the pi docs that cover:

- extension lifecycle events
- `before_agent_start`
- command registration
- session hooks if you keep the compaction summary from the spec

Expected understanding before coding:

- where extensions live
- how slash commands are registered
- what an event handler is allowed to return

### Step 2: Implement `vazir-context.ts`

Build the smallest version that satisfies the spec.

Requirements:

1. On `before_agent_start`, look for `.context/memory/context-map.md` in the current working directory.
2. If it exists, read it and inject it into the system prompt.
3. If it does not exist, look for `AGENTS.md` in the repo root and inject that instead.
4. If neither file exists, do nothing.
5. Strip HTML comments before injecting content.
6. Preserve the original system prompt by appending or prepending cleanly.

Implementation notes:

- Use `existsSync`, `readFileSync`, and `path.join`.
- Keep the file small and direct.
- Return early when there is no context file.
- Avoid adding configuration flags unless the spec asks for them.

Nice-to-have only if trivial:

- keep the `session_before_compact` summary shown in the spec

### Step 3: Add `/vazir-init` To `vazir-workflow.ts`

Implement a command that creates the minimum required Vazir structure.

Required directories:

- `.context/memory`
- `.context/learnings`
- `.context/history`
- `.context/prd/features`
- `.context/technical`
- `.context/templates`
- `.context/settings`

Required seeded files if missing:

- `.context/memory/context-map.md`
- `.context/memory/system.md`
- `.context/settings/project.json`
- `AGENTS.md`

Command behavior:

1. Create directories recursively.
2. Only write seed files if they do not already exist.
3. Do not overwrite user content.
4. Show a short success notification.

Implementation notes:

- Put template strings near the bottom of the file or in a tiny helper section.
- Keep template content aligned with the spec.
- Keep `project.json` minimal and valid JSON.

### Step 4: Make The Two Pieces Work Together

After `/vazir-init` runs, the next agent turn should be able to load `.context/memory/context-map.md`.

Check this flow:

1. Fresh repo without `.context/`
2. Run `/vazir-init`
3. Confirm files exist
4. Start a new prompt
5. Confirm `vazir-context.ts` now uses `context-map.md`

### Step 5: Keep The Code Junior-Friendly

While implementing, keep these standards:

- one responsibility per helper
- explicit types at boundaries
- no `any` unless unavoidable
- early returns instead of nested conditionals
- no hidden side effects
- no speculative architecture for future phases

## Suggested Task Breakdown

Day 1:

1. Read pi docs relevant to extensions and commands.
2. Scaffold `.pi/extensions/vazir-context.ts`.
3. Get simple context injection working with a hardcoded local test file.

Day 2:

1. Finish fallback behavior from `context-map.md` to `AGENTS.md`.
2. Strip HTML comments.
3. Add or keep compaction summary only if it stays simple.
4. Start `/vazir-init` in `.pi/extensions/vazir-workflow.ts`.

Day 3:

1. Finish directory creation and seed file creation.
2. Make `/vazir-init` idempotent.
3. Run manual validations.
4. Add tests for the critical paths.

## Tests To Implement

If the test harness is not set up yet, treat this list as the minimum automated test plan to add when tests are introduced.

### Unit Tests For `vazir-context.ts`

1. Injects `.context/memory/context-map.md` when that file exists.
2. Falls back to `AGENTS.md` when `context-map.md` is missing.
3. Returns no prompt modification when neither file exists.
4. Removes HTML comments from injected content.
5. Preserves the existing system prompt content.

Suggested assertions:

- returned object exists only when expected
- resulting prompt contains the context text
- resulting prompt does not contain `<!-- ... -->`
- prompt still contains the original system prompt

### Unit Tests For `/vazir-init`

1. Creates all required directories in a clean repo.
2. Creates `context-map.md`, `system.md`, `project.json`, and `AGENTS.md` when missing.
3. Does not overwrite existing files on a second run.
4. Writes valid JSON to `project.json`.
5. Returns or triggers a success notification.

Suggested assertions:

- files exist after the command runs
- second run keeps original custom file content intact
- `JSON.parse` succeeds for `project.json`

### Integration Tests

1. Running `/vazir-init` followed by a new agent turn causes `context-map.md` to be used.
2. If `context-map.md` is removed after init, a new turn falls back to `AGENTS.md`.
3. Fresh repo with no context files does not crash agent startup.

## Manual Validation Checklist

Run these by hand even if automated tests exist.

### Validation 1: Fresh Repo Init

1. Start from a repo with no `.context/` and no `AGENTS.md`.
2. Run `/vazir-init`.
3. Confirm the folder tree is created.
4. Open the seeded files and confirm they contain template content.

Pass condition:

- all required directories and files exist

### Validation 2: Idempotent Init

1. Edit `AGENTS.md` and `.context/memory/system.md` manually.
2. Run `/vazir-init` again.
3. Confirm your edits were preserved.

Pass condition:

- existing files are not overwritten

### Validation 3: Context Injection Preference

1. Ensure both `.context/memory/context-map.md` and `AGENTS.md` exist.
2. Put different obvious marker text in each file.
3. Trigger a new agent prompt.
4. Confirm the injected content comes from `context-map.md`.

Pass condition:

- `context-map.md` wins over `AGENTS.md`

### Validation 4: Fallback Behavior

1. Remove or rename `context-map.md`.
2. Keep `AGENTS.md` present.
3. Trigger a new agent prompt.
4. Confirm the injected content now comes from `AGENTS.md`.

Pass condition:

- fallback works without errors

### Validation 5: Comment Stripping

1. Add an HTML comment to `context-map.md`.
2. Trigger a new agent prompt.
3. Inspect the resulting injected prompt or logged output.

Pass condition:

- comment text is not present in the injected prompt

## Definition Of Done

Phase 1 is done when:

- `vazir-context.ts` loads context from `context-map.md` with `AGENTS.md` fallback
- HTML comments are stripped before injection
- `/vazir-init` creates the required Vazir directories and seed files
- `/vazir-init` is safe to run more than once
- manual validations pass
- critical tests for injection and initialization are implemented or at least written down as pending work

## Common Mistakes To Avoid

- Overwriting `AGENTS.md` or `.context` files on repeated init
- Adding backup logic in this phase
- Mixing scorer logic into context injection
- Building a generic framework before the simple path works
- Forgetting that `context-map.md` should take priority over `AGENTS.md`

## Hand-Off Notes For The Junior Dev

If you get stuck, reduce scope and make the simple version work first:

1. Get `before_agent_start` injection working.
2. Get `/vazir-init` creating files safely.
3. Then add polish like comment stripping or compaction summary.

The priority is proving the workflow, not building a perfect architecture.