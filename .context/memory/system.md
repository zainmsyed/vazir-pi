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
### From failures
- Remove no-op registration hooks once the real behavior has migrated to the owning extension. <!-- source: story-020, story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- After extracting helpers to a new module, delete the original copies from the source module to prevent drift and confusion. <!-- source: story-022, story-020 --> <!-- confidence: low — no signal in last 5 stories -->
- The extension that owns a command's implementation should be the one that registers it with `pi.registerCommand`. <!-- source: story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When creating a temp mirror of a repo for external tooling, exclude the project's own brain/metadata directories to prevent the tool from analyzing generated or internal files. <!-- source: story-006, story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When extracting behaviour into a new extension, avoid importing from the extension that consumes your exports; move shared cross-cutting utilities into `.pi/lib` or a neutral helper module. <!-- source: story-021, story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When extracting lifecycle handlers into a new extension, remove the original registration to avoid duplicate event processing. <!-- source: story-020, story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When the same string-replacement sequence appears in two or more distinct code paths, extract it into a named helper so future changes to the output format happen in one place. <!-- source: story-006, story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When updating a shared state Map, merge with the existing entry rather than replacing it entirely, unless the replacement is intentionally destructive. <!-- source: story-022 --> <!-- confidence: low — no signal in last 5 stories -->
- When the same helper appears in two workflow extensions, consolidate it into the primary owner or a shared utility so fixes and enhancements apply in one place. <!-- source: story-022, story-020 --> <!-- confidence: low — no signal in last 5 stories -->
- When adding new behavior to an existing state machine or closeout flow, layer it on top of the proven architecture rather than replacing the state machine inline; validate the golden path end-to-end after every integration. <!-- source: story-005 --> <!-- confidence: low — no signal in last 5 stories -->
- When refactoring UI chrome or rendering logic, diff visual output against the previous state to catch unintended tone, color, or glyph regressions before merging. <!-- source: story-005 --> <!-- confidence: low — no signal in last 5 stories -->
- Add regression assertions for prompt builders that interpolate file paths so raw `${...}` placeholders cannot leak into agent instructions <!-- source: story-006 --> <!-- confidence: low — no signal in last 5 stories -->
- When adding a new instruction-driven signal source, validate at least one real downstream consumer path end-to-end instead of only checking prompt text <!-- source: story-006 --> <!-- confidence: low — no signal in last 5 stories -->
- Tests that modify shared binaries or runtime dependencies must use isolated temporary copies rather than mutating the shared originals directly <!-- source: story-006 --> <!-- confidence: low — no signal in last 5 stories -->
- When an instruction conditionally references a backend service, the fallback message must accurately reflect whether the service executed or was bypassed <!-- source: story-006 --> <!-- confidence: low — no signal in last 5 stories -->
- When a previously shipped feature regresses because shared helpers were later refactored, restore from the last known working commit instead of reimplementing from scratch. <!-- source: story-007 --> <!-- confidence: low — no signal in last 5 stories -->
- When extracting a combined helper that merges multiple previously separate operations, add a direct unit test that exercises all constituent operations together, not just the end-to-end consumer. <!-- source: story-007 --> <!-- confidence: low — no signal in last 5 stories -->
- Never run `fossil commit`, `git commit`, `jj commit`, or any VCS commit command unless the user explicitly asks for it with a phrase like "commit all" or "commit these changes". Do not auto-commit as part of routine file edits, story updates, or review writes. <!-- confidence: low — no signal in last 5 stories -->
- Keep story checklists to at most 7 concrete tasks. If a story needs more, split it into a follow-up story instead of growing the checklist beyond 7 items. <!-- confidence: low — no signal in last 5 stories -->
- When moving workflow logic into a different lifecycle hook, add regression coverage that exercises that exact hook and the persisted state transitions it controls. <!-- source: story-023 --> <!-- confidence: low — no signal in last 5 stories -->
- When a workflow transition depends on both in-memory flags and persisted file frontmatter, centralize the transition in one shared helper so both state sources change together. <!-- source: story-023 --> <!-- confidence: low — no signal in last 5 stories -->
- When a closeout flow marks a story complete without relying on user prompt text, record that transition as explicitly approved before the status guard runs. <!-- source: story-025 --> <!-- confidence: low — no signal in last 5 stories -->
- After extracting a module, remove imports that are now only consumed by the extracted file. <!-- source: story-025 --> <!-- confidence: low — no signal in last 5 stories -->
- Do not commit merge-tool backup files (e.g., `.baseline`, `.merge`, `.original`) to the repository; delete them or add them to `.gitignore`. <!-- source: story-025 --> <!-- confidence: low — no signal in last 5 stories -->
- Regression tests should exercise the primary code path, not just the legacy fallback. <!-- source: story-026 --> <!-- confidence: low — no signal in last 5 stories -->
- When a checklist calls for coverage 'across' a set of states, verify more than one representative state. <!-- source: story-026 --> <!-- confidence: low — no signal in last 5 stories -->
- When a workflow must survive session restarts, persist both the current phase and any user-selected completion intent in restart-safe state, then add restart-resume regression coverage for each resumed path. <!-- source: story-026 --> <!-- confidence: low — no signal in last 5 stories -->
- When normalising external inputs, reuse the canonical helper at every consumption site; do not re-implement partial extracts that drift from the canonical fallback logic. <!-- source: story-028 --> <!-- confidence: low — no signal in last 5 stories -->
- Do not silently swallow exceptions from structural persistence operations; surface a warning so users know when downstream undo or recovery actions will be unavailable. <!-- source: story-028 --> <!-- confidence: low — no signal in last 5 stories -->
- Before composing multiple VCS commands for restore or rollback, verify each command is necessary — operation-level restores in tools like jj already include working-copy state, and layering manual file operations on top creates mixed states that never existed in history. <!-- source: story-029 --> <!-- confidence: high -->
- Validation of VCS restore and undo behavior should exercise real repositories with actual tool commands rather than only stubs, because stubs can mask semantic mismatches between assumed and actual tool behavior. <!-- source: story-029 --> <!-- confidence: high -->
- UI labels for restore or undo actions must accurately describe the actual restore target; fallback actions need distinct wording when they restore a broader state than the primary path. <!-- source: story-030 --> <!-- confidence: high -->
- Picker labels used as lookup keys must be guaranteed unique; include a stable disambiguator instead of relying only on human text and coarse timestamps. <!-- source: story-030 --> <!-- confidence: high -->
- When reconciling restored disk state with stale in-memory workflow state, do not stop after clearing the stale entry; continue searching for the restored authoritative state in the same pass. <!-- source: story-031 --> <!-- confidence: high -->
- When normalizing a user-visible backend identity, do not let a stale preference advertise a backend that is not actually available in the current repo. <!-- source: story-033 --> <!-- confidence: high -->
### From successes
- When a closeout prompt aggregates work from multiple checklist sections, reuse the same aggregation helper in the action path so the selected work actually executes. <!-- source: story-020 --> <!-- confidence: low — no signal in last 5 stories -->
