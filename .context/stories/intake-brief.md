# Intake Brief

**Last updated:** 2026-05-29

## Planning brief
Implement Addendum E's TUI layer for Vazir using pi built-ins and the current modular extension architecture.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md (11418 bytes)

## Distilled answers
- Users are Vazir users working inside pi's terminal UI who currently need stronger command discoverability and lower-friction structured interactions.
- v1 must get right: reliable, low-risk TUI improvements that fit pi's documented primitives and Vazir's current ownership boundaries.
- v1 includes the full Addendum E baseline plus the follow-on overlay wiring the user explicitly requested: shared UI helpers, `/story`, `/plan`, `/implement` fallback, compact HUD, and overlay wiring for `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, and `/checkpoint`/`/reset`.
- v1 should not change command semantics, `.context/` file contracts, story workflow, review workflow, or VCS safety policy.
- The stack already exists: current modular Vazir extensions under `.pi/extensions/`, shared helpers under `.pi/lib`, and pi TUI built-ins such as `SelectList`, `Markdown`, `DynamicBorder`, `Text`, `Container`, `matchesKey`, and `ctx.ui.setWidget` / `ctx.ui.custom`.
- Implementation should prefer built-in pi components over custom low-level renderers.
- Shared TUI helpers should live in `.pi/lib/vazir-ui.ts`, not inside a consuming extension.
- HUD ownership belongs in `.pi/extensions/vazir-tracker/chrome.ts` so rendering stays centralized with existing chrome/footer state.
- HUD phase 1 should be a compact single-column widget above the editor, with narrow-terminal collapse, not a fragile fake two-column dashboard.
- HUD state must stay VCS-aware and reuse existing tracker/footer VCS identity logic so Fossil, Git, and Git+JJ helper paths are represented correctly.
- Delivery should be phased: shared helpers first, then story/plan viewers, then picker/confirm overlays, then compact HUD, then remaining command overlay adoption.

## Distilled notes
### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md
- Addendum E defines TUI overlays and HUD polish only; it does not change workflow semantics.
- `showSelectionList` should wrap pi `SelectList` for selection and confirmation flows.
- `showMarkdownViewer` should wrap pi `Markdown` for story/plan viewing.
- `/story`, `/plan`, `/implement`, `/complete-story`, `/unlearn`, `/fix`, `/memory-review`, `/checkpoint`, and `/reset` are the primary consumers.
- The HUD should surface active story, queue summary, VCS identity/status, and a compact command strip using cheap local data.
- Tracker chrome is the correct owner for persistent HUD refreshes.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
