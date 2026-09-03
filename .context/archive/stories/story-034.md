# Story 034: Fix `/plan` intake question flow to ask one question at a time

**Status:** complete  
**Created:** 2026-05-27  
**Last accessed:** 2026-05-28  

---

## Goal
Update the `/plan` command handler so that when implementation-blocking questions remain after Phase 1 intake review, it asks them one at a time in the chat conversation instead of batching all surviving questions into a single turn. The agent waits for the user’s full answer before asking the next question, and only proceeds to Phase 2 (writing files) after all questions are answered or explicitly skipped.

## Verification
Run `/plan` with an intentionally incomplete intake source. The agent asks the first question, waits for the user’s answer, then asks the next question only after receiving the answer. After all questions are resolved, the agent proceeds to Phase 2 and writes the plan and stories.

## Scope
- `.pi/extensions/vazir-context/index.ts`
- `.pi/extensions/vazir-context/helpers.ts`

## Out of scope
- Rewriting Phase 1 analysis logic or the fields it extracts
- Changing the story template or file formats
- Replanning from existing story files instead of primary intake sources

## Dependencies
- —

## Checklist
- [x] Diagnose why the agent was still batching questions — the no-sources path had no one-at-a-time enforcement and the mechanical `plan-pending.json` approach was slow and unreliable
- [x] Remove the `plan-pending.json` mechanical enforcement entirely (helpers, input transform, and `/plan` wiring)
- [x] Simplify the `/plan` instruction from ~50 lines of complex two-phase logic to ~20 lines of direct, clear steps
- [x] Add an unconditional, prominent one-question-per-turn rule at the top of the instruction for both intake and no-sources paths
- [x] Replace the weak no-sources "do not dump the full list" text with explicit "ask exactly ONE question at a time" guidance
- [x] Update validation scripts to verify the new concise instruction and confirm the old plan-pending.json mechanism is gone

## Issues
- None yet.

## Completion Summary
Replaced the slow, unreliable `plan-pending.json` mechanical enforcement with a dramatically simplified planning instruction that the agent can actually follow.

**What didn't work:**
The `plan-pending.json` approach added file I/O overhead on every turn, bloated the context with large continuation prompts, and still failed to prevent the agent from skipping questions or proceeding to Phase 2 early. The agent has agency — it can always choose to ignore mechanical guardrails embedded in prompt text.

**What replaced it:**
- **Removed** all `plan-pending.json` infrastructure from `helpers.ts` (`planPendingPath`, `readPlanPendingState`, `writePlanPendingState`, `clearPlanPendingState`, `buildPlanContinuationPrompt`)
- **Removed** the `input` handler transformation that intercepted user replies and replaced them with continuation prompts
- **Simplified** the `/plan` instruction from ~50 lines of complex two-phase conditional logic down to ~20 lines of clear, direct steps
- The instruction now opens with a simple, strong rule: "Ask exactly ONE clarifying question at a time. Wait for the answer before asking the next. Do NOT ask multiple questions in one turn."
- For both intake-driven and discovery-driven paths, the agent gets the same concise guidance plus a short default question list (`Who are the users?`, `What's the most important thing to get right in v1?`, etc.)
- The no-sources path no longer contains the weak "do not dump the full list at once" text that the agent interpreted as permission to batch 2–4 questions

**Validation:**
- `scripts/validate-vazir-plan-questions.mts` verifies the instruction is concise (< 40 lines), enforces one question per turn, does not mention the removed `plan-pending.json` mechanism, and works for both fresh plans and replans
- `scripts/validate-vazir-plan-seeding.mts` still passes with updated assertions