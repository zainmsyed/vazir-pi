# Phase 4 Plan For A Junior Developer

Source of truth: `docs/Vazir_poc_spec_v2.3.md`

Phase 4 in the spec is:

- scorer tuning
- routing polish
- skill loading and mode injection
- basic skill file creation where still missing

Goal for this phase: make the zero-token routing feel sensible, inject the correct skill content for each mode, and polish the workflow so the model chooses between chat, interview, step-by-step, and one-shot in a predictable way.

## Expected Outcome

By the end of phase 4, a developer should be able to:

1. Submit a task and have Vazir score it consistently.
2. See clear routing behavior for chat, interview, step-by-step, and one-shot modes.
3. Load `vazir-base` plus the correct mode-specific skill before agent start.
4. Use simple `.pi/skills/*/SKILL.md` files that match the spec.
5. Manually test ambiguous and high-confidence prompts with clear expected results.

## Scope Boundaries

Do in this phase:

- Tune and stabilize the `score()` logic in `.pi/extensions/vazir-workflow.ts`.
- Keep the input routing flow aligned with the spec thresholds.
- Load skills from `.pi/skills/` directories using `SKILL.md`.
- Create any missing phase-4 skill files needed by the routing flow.
- Add tests around scorer and skill loading behavior.
- Improve user-facing prompts only where needed to make routing understandable.

Do not do in this phase:

- Replace the heuristic scorer with a model-based classifier.
- Add complex analytics or telemetry.
- Rebuild the workflow commands from phase 3.
- Add new routing modes not present in the spec.
- Over-polish the UI beyond the minimal POC needs.

## Files To Create Or Edit

- `.pi/extensions/vazir-workflow.ts`
- `.pi/skills/vazir-base/SKILL.md`
- `.pi/skills/vazir-one-shot/SKILL.md`
- `.pi/skills/vazir-step-by-step/SKILL.md`
- `.pi/skills/vazir-interview/SKILL.md`
- `tests/unit/vazir-workflow-routing.test.ts`

Optional helper exports are fine if they make `score()` and skill loading easier to test.

## Implementation Plan

### Step 1: Re-read The Routing Flow In The Spec

Before changing code, confirm the routing expectations:

- questions should pass through as chat
- underspecified tasks should route toward interview mode
- medium-confidence tasks should go through step-by-step confirmation
- high-confidence tasks should go one-shot
- `before_agent_start` should inject `vazir-base` plus the selected mode skill

Expected understanding before coding:

- which task shapes should score low, medium, and high
- how `pendingMode` moves from input handling into prompt injection
- where the skill file content is loaded from

### Step 2: Stabilize The Scorer

Keep the heuristic scorer small and explicit.

Requirements:

1. Start from the score logic already described in the spec.
2. Reward tasks that mention known file paths or strong implementation details.
3. Reward tasks with specific output expectations.
4. Penalize broad or ambiguous wording.
5. Treat obvious questions as chat instead of forcing routing.
6. Clamp scores into the `0..100` range.
7. Map score ranges to `interview`, `step-by-step`, and `one-shot` exactly as the spec describes.

Implementation notes:

- keep constants like `AMBIGUOUS`, `NEGATIONS`, and `ACTIONS` near the scorer
- avoid clever weighting systems or opaque formulas
- use `.context/memory/index.md` only as a light signal, not a dependency for correctness

### Step 3: Load Skills And Inject The Right Prompt

Build the smallest reliable skill-loading path.

Requirements:

1. Load `.pi/skills/vazir-base/SKILL.md` for routed execution modes.
2. Load `.pi/skills/vazir-<mode>/SKILL.md` for the selected mode.
3. Strip the frontmatter from skill files before injection.
4. Prepend the skills cleanly ahead of the existing system prompt.
5. Skip skill injection for plain chat mode.

Implementation notes:

- do not invent a second skill-discovery mechanism
- keep the file loader direct and tolerant of missing files
- if a skill file is missing, fail softly and continue with what is available

### Step 4: Create Or Align The Skill Files

If the skill files are still missing or incomplete, create them to match the spec.

Required skill directories:

- `.pi/skills/vazir-base/`
- `.pi/skills/vazir-one-shot/`
- `.pi/skills/vazir-step-by-step/`
- `.pi/skills/vazir-interview/`

Each directory should contain `SKILL.md` with:

1. frontmatter name and description
2. concise rules for that mode
3. instructions that match the simplified workflow from the spec

### Step 5: Polish User-Facing Routing Prompts

Keep routing prompts concise and operational.

Requirements:

1. Low-confidence tasks should present a clear clarification choice.
2. Mid-confidence tasks should explain that planning comes before file edits.
3. If the user cancels step-by-step mode, put the text back into the editor.
4. Show the current score and mode status clearly enough that routing feels explainable.

## Suggested Task Breakdown

Day 1:

1. Finalize the heuristic scoring function.
2. Add unit tests for score ranges.
3. Confirm chat-question pass-through behavior.

Day 2:

1. Implement or refine skill loading.
2. Add or align the four `SKILL.md` files.
3. Test prompt injection behavior for each mode.

Day 3:

1. Polish the selection and confirmation messages.
2. Run manual prompt-based testing for low, medium, and high confidence tasks.
3. Adjust thresholds only if a concrete manual test justifies it.

## Implementation Checklist

- Tune `score()` to match the spec behavior
- Preserve question pass-through as chat
- Keep the score-to-mode thresholds aligned with the spec
- Load `vazir-base` and mode-specific skills from `.pi/skills/*/SKILL.md`
- Strip skill frontmatter before injection
- Skip skill injection for chat mode
- Add or update all four skill files
- Add routing unit tests under `tests/unit/`
- Run manual prompt-based tests for low, medium, and high-confidence tasks
- Tell the user exactly how to test the routing behavior by prompt examples

## Tests To Implement

### Unit Tests For Routing And Skill Loading

1. Questions route to chat and do not force execution mode.
2. Broad ambiguous tasks score into interview mode.
3. Medium-confidence tasks score into step-by-step mode.
4. Specific file-targeted tasks score into one-shot mode.
5. Scores are clamped to `0..100`.
6. `loadSkill()` returns an empty string for missing skill files.
7. `loadSkill()` strips frontmatter from `SKILL.md` content.
8. `before_agent_start` injects base plus mode skill when mode is active.
9. `before_agent_start` skips injection when mode is chat.
10. Cancelling step-by-step mode leaves the user input in the editor.

Suggested assertions:

- returned score matches the expected bucket
- returned mode matches the score range
- injected prompt contains base skill text and selected mode text
- injected prompt does not contain frontmatter markers
- missing skill files do not crash the workflow

### Useful Prompt Fixtures For Tests

Low-confidence example:

- `improve the auth flow`

Medium-confidence example:

- `update auth.ts and session.ts to add refresh token rotation`

High-confidence example:

- `update src/auth.ts to return 401 when refresh token validation fails and add a unit test in tests/auth.test.ts`

Question example:

- `how does the auth flow work right now?`

### Integration Tests To Add If Feasible

1. A low-confidence task opens the clarification path and sets interview mode.
2. A medium-confidence task requires step-by-step confirmation.
3. A high-confidence task proceeds with one-shot mode and injects the correct skill.
4. Removing a skill file does not crash prompt injection.

## Manual Validation Checklist

Run these by hand even if unit tests exist.

### Validation 1: Interview Mode

1. Submit an underspecified task such as `improve login`.
2. Confirm Vazir offers clarification behavior instead of jumping straight into edits.
3. Confirm the selected mode is interview.

Pass condition:

- underspecified work routes into clarification instead of premature coding

### Validation 2: Step-By-Step Mode

1. Submit a moderately specific multi-file task.
2. Confirm Vazir asks for step-by-step confirmation.
3. Cancel once and confirm the text remains in the editor.
4. Accept once and confirm step-by-step mode is selected.

Pass condition:

- medium-confidence work routes through planning and preserves user control

### Validation 3: One-Shot Mode

1. Submit a highly specific task with file names and expected behavior.
2. Confirm it routes directly to one-shot mode.
3. Inspect the injected prompt if possible and confirm the correct skill is included.

Pass condition:

- clear tasks proceed without unnecessary friction

### Validation 4: Skill Loading

1. Open each `SKILL.md` file and confirm the content matches the spec.
2. Trigger each execution mode at least once.
3. Confirm the base skill is always included for routed execution modes.

Pass condition:

- skill injection is stable and matches the selected mode

## How To Direct The User During Manual Testing

When handing phase 4 to a user, do not tell them only to “try some prompts.” Give them concrete prompts to run and what to expect:

1. Give them one ambiguous prompt, one medium-confidence prompt, one high-confidence prompt, and one question.
2. Tell them which mode each prompt should trigger.
3. Ask them to check both the UI behavior and the resulting prompt/skill injection if the host exposes it.
4. Tell them to report back which prompt felt misclassified so thresholds can be tuned with evidence.
5. If a skill file is changed, tell them to rerun the matching prompt and verify the behavior changed as intended.

Manual testing in this phase is prompt-driven. The user needs examples, expected modes, and a clear idea of what counts as a misroute.

## Definition Of Done

Phase 4 is done when:

- the scorer routes low, medium, and high-confidence tasks sensibly
- chat questions pass through cleanly
- skill loading works from the expected `.pi/skills/*/SKILL.md` directories
- frontmatter is stripped before prompt injection
- all required skill files exist and match the spec
- unit tests cover routing and skill loading behavior
- manual prompt-based testing passes with understandable results

## Common Mistakes To Avoid

- Making the scorer so complicated that it becomes untestable
- Tuning thresholds without concrete examples from manual tests
- Injecting skill frontmatter into the system prompt
- Forgetting to include `vazir-base` alongside the mode-specific skill
- Treating questions as coding tasks
- Asking the user to “test it somehow” without giving example prompts and expected outcomes

## Hand-Off Notes For The Junior Dev

If you get stuck, reduce scope and make the basic routing path work first:

1. Get `score()` returning the right buckets.
2. Get `loadSkill()` returning clean skill content.
3. Inject base plus mode skill before agent start.
4. Then polish the user-facing confirmations and thresholds.

The priority is making routing understandable, stable, and easy to test manually.