# Intake Brief

**Last updated:** 2026-05-26

## Planning brief
I want `/complete-story` commit paths to use a short descriptive commit message instead of only `complete story-026`. Include the story name/title and a concise description of what was done.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_C.md (13039 bytes)
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_D.md (12436 bytes)

## Distilled notes
### Requested change
- Add a follow-up story for descriptive `/complete-story` commit messages.
- Keep the message short and concise.
- Include the story label/title and a brief summary of completed work.

### Relevant intake context
- Addendum D makes `/complete-story` the owner of story-close mini-consolidate and closeout completion, so this follow-up belongs on that closeout path.
- Existing closeout flows already support Git, JJ, and Fossil commit paths; the message-format change should preserve that behavior.
- Story history through `story-026` is preserved; the new scope should be added as a fresh follow-up story starting at `story-027`.

### Safe planning assumptions
- The descriptive message should be derived from existing story metadata/content rather than by asking the user for a custom message during closeout.
- Fallback behavior is still needed when the completion summary is weak or absent, so validation should cover both rich and sparse story content.
- This request changes only `/complete-story` closeout commit messaging, not unrelated manual commit flows.

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
