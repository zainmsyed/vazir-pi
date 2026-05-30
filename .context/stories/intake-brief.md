# Intake Brief

**Last updated:** 2026-05-30

## Planning brief
i want to update the help and readme. i want the help overlay to be selectable and when the user selcts a line they are taken to another overlay that describes that that command does. also i want to highlight the most common workflow as a quickstart for users. which is /plan, /implement, /complete-story. and i also want to update the readme to a quickstart quide that the user can use if needed

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md (12100 bytes)

## Distilled notes
### User intent
- Keep the existing Ctrl+? quick-reference help list (command + one-line description).
- Make the help overlay selectable: navigating to a command and pressing Enter opens a detail overlay with richer docs.
- Rich detail overlays must include usage syntax, examples, arguments, and a longer description.
- Highlight the most common workflow as a quickstart banner inside the help overlay: `/plan` → `/implement` → `/complete-story`.
- Rewrite the root `README.md` into a concise quickstart guide users can read outside of pi.

### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_E.md
Addendum E establishes shared TUI overlay helpers (`showSelectionList`, `showMarkdownViewer`, `VazirPanel`) in `.pi/lib/vazir-ui.ts`, built on pi's `SelectList`, `Markdown`, and `Container` primitives. The overlay infrastructure already exists from story-035 and story-036. This replan builds on that foundation.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
