# Intake Brief

**Last updated:** 2026-05-24

## Planning brief
Harden the `/complete-story` workflow by isolating its orchestration into a maintainable module, making lifecycle phases explicit, centralizing transitions that touch both in-memory state and persisted review/story files, expanding lifecycle-aware regression coverage, and stress testing the full closeout path before any merge back toward `main`.

## Objectives
- Keep `complete-story-fix` as the known-good base while follow-up hardening happens on a separate branch.
- Reduce fragility in the `/complete-story` path by making review closeout, remediation, learned-rule closeout, and final completion phases explicit.
- Improve maintainability by moving complete-story orchestration out of the large context extension file into a focused owner module.
- Preserve existing behavior while making the flow easier to reason about, test, and change safely.

## Success metrics
- `/complete-story` has one clear orchestration path.
- `turn_end` and `agent_end` responsibilities are unambiguous.
- Review/remediation/learned-rule/final-closeout phases are centralized and explicit.
- Regression coverage exercises the exact lifecycle hooks and persisted state transitions that drive closeout behavior.
- Interactive stress testing confirms no prompt loops, missing prompts, or story/review state drift before merge consideration.

## Users and journeys
- Primary user: the maintainer operating Vazir through Pi’s TUI.
- Main journey: run `/complete-story`, optionally run a story-scoped review, choose remediation or closeout actions, handle learned-rule promotion, and finish the story without lifecycle loops or missing prompts.
- Maintenance journey: evolve the flow safely by editing a dedicated complete-story module instead of tracing behavior across scattered handlers.

## Inputs and outputs
- Inputs: active story file, review file frontmatter and findings, learned-rule draft/candidates, pending in-memory closeout state, lifecycle events (`turn_end`, `agent_end`), and active VCS mode.
- Outputs: stable closeout prompts, remediation dispatches, learned-rule promotion choices, final story close/commit behavior, and regression coverage for each phase.

## Integrations
- `.pi/extensions/vazir-context/index.ts` and a new dedicated complete-story module under `.pi/extensions/vazir-context/`
- `.context/stories/`, `.context/reviews/`, `.context/memory/system.md`, and learned-rule closeout JSON/candidate files
- validation harnesses such as `scripts/validate-vazir-complete-story.mts` and related review-loop coverage
- existing review and mini-consolidate behavior from Addendum D

## Auth and security
- No new auth model.
- Preserve current VCS safety rules and `.context` persistence behavior.
- Do not widen destructive VCS behavior while hardening this flow.

## Acceptance criteria
- The current `/complete-story` lifecycle is mapped before extraction.
- One shared phase model derives the closeout phase from in-memory state plus persisted files.
- Shared transition helpers own required pending-state updates and frontmatter rewrites together.
- Complete-story orchestration is extracted to a dedicated owner module while command registration stays with the owning extension.
- Lifecycle ownership is narrowed so prompt-triggered orchestration lives in `turn_end` and non-interactive cleanup stays in `agent_end`.
- Regression coverage includes restart/re-entry and repeated `turn_end` scenarios.
- The flow passes interactive stress testing across review, remediation, learned-rule, and close/commit paths.

## Constraints and non-goals
- Preserve existing story files as history; do not repurpose them.
- Do not rewrite the whole state machine in one jump.
- Do not move command ownership away from the owning extension.
- Do not duplicate helpers across modules.
- Do not leave stale lifecycle handlers registered after extraction.
- Main trunk should remain untouched until the hardened branch proves stable.

## Edge cases
- Review completes but closeout prompt must appear immediately.
- Review remediation must rewrite the review file back to `in-progress` and avoid re-prompt loops.
- Learned-rule closeout must not re-enter review closeout.
- Story should stay open until mini-consolidate finishes.
- Restart/re-entry must restore the correct phase from persisted files plus pending state.
- Repeated `turn_end` emissions must be idempotent.

## Monitoring and verification
- Validation harness coverage for complete-story and review-loop flows.
- Interactive TUI stress testing across no-review, review-without-findings, fix-high, fix-all, learned-rule selection, close-now, close-and-commit, and interrupted-session cases.

## Deployment and merge strategy
- Branch from `complete-story-fix` into a dedicated hardening branch (assumed name: `complete-story-hardening`).
- Merge toward `main` only after tests pass and manual stress testing confirms stability.

## Timeline and stakeholders
- Immediate follow-up hardening work for the current maintainer.
- No external stakeholder or release timeline was specified; safe default is to prioritize stability over speed.

## Assumptions
- Safe default: split the hardening work into multiple focused follow-up stories rather than one oversized story.
- Safe default: branch name `complete-story-hardening` is the working target unless the user chooses a different name later.
- Safe default: interactive stress testing is part of the implementation scope and must happen before merge consideration.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md
- .context/stories/intake-brief.md (prior distilled replan context)

## Planning rules
- Treat listed source files as user-authored planning inputs unless explicitly marked as generated artifacts.
- Preserve existing story history and append only new plan rows/stories for this hardening scope.
- Keep each new story within one focused session and at most 7 checklist tasks.
- Prefer incremental extraction layered on proven behavior, with validation after each integration step.
- Surface contradictions instead of resolving them silently.