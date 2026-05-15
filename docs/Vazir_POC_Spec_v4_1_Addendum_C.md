# Vazir POC Spec — Addendum C
**Supplements:** v4.1, Addendum A, Addendum B  
**Status:** Ratified  
**Scope:** `/plan` extraction behavior — read-first principle, intake authority levels, question gate

---

## Context

This addendum captures the behavioral correction made to `/plan` after observing over-questioning on the `intake_found = true` path. When a user provided a detailed PRD, Vazir was generating clarifying questions for fields already answered in the source material. The root cause was a classification heuristic that treated informal or non-quantified wording as `incomplete`, and a question generation step that had no suppression gate.

No commands, file contracts, or other workflows are changed. This addendum modifies `/plan` behavior only.

---

## Guiding Principle (now canonical)

When user-authored planning material exists, `/plan` defaults to extraction and story generation — not discovery. Questions are the exception, reserved for genuine implementation-blocking gaps. This is the behavioral anchor for all `/plan` logic.

---

## Intake Authority Levels

Not all files in `.context/` carry equal weight as planning input. `/plan` now observes a strict authority hierarchy:

**Primary intake — user-authored:**
1. `plan.md` in the repo root or `.context/` — only if predating generated story artifacts
2. Any files in `.context/intake/` — the canonical drop zone
3. Any top-level `*.prd.md` or `PRD.md` files

**Replan context only — Vazir-generated:**
- `.context/stories/plan.md`
- Any `story-NNN.md` files
- `intake-brief.md`

Generated artifacts are never treated as primary PRD input. They are available as prior context when the user explicitly requests a replan, but they do not satisfy `intake_found = true` and do not trigger the extraction path.

---

## Read-First Rule

When `intake_found = true`, Vazir reads all user-authored intake sources in full before doing anything else. Extraction and classification happen only after the full read. Skimming and immediately asking is a violation of this rule.

For very large files: read enough to extract evidence for every field. For unsupported binaries: skip with a note. The bar is full comprehension of text-based planning material, not selective preview.

---

## Classification Test

The previous heuristic (`numeric KPI → present`, `vague wording → incomplete`) is replaced by a single implementation-blocking test applied to each field:

> *"If I tried to write story files right now without knowing more about this field, would I be forced to make an assumption that could be wrong in a way that materially affects implementation?"*

- **No** → `present`. This is the default. Clear intent in any form — informal, non-quantified, or loosely worded — counts as present if a developer would know what to do.
- **Yes, partial signal exists** → `incomplete`
- **Yes, zero signal exists** → `missing`
- **Multiple intake files contradict each other** → `conflict`

Vague wording alone is never sufficient to mark a field non-`present`.

---

## Question Gate

Before generating any question for an `incomplete`, `missing`, or `conflict` field, Vazir applies this gate:

> *"Can I answer this by reading the intake more carefully, or by making a safe, reasonable default assumption that a developer would make?"*

If yes → do not ask. State the assumption explicitly in the output and proceed.

If no → generate one question for that field. One only. It must be directly answerable, clearly implementation-blocking, and something the intake genuinely does not address.

If no questions survive the gate, Vazir states this and proceeds directly to generating `plan.md` and story files. An empty question set is a valid and expected outcome when the user has provided a complete spec.

---

## Implementation Notes

- The intake detection helper was expanded to cover the full authority hierarchy above
- The `/plan` instruction text was rewritten to enforce read-first, gate-based questioning within the existing one-pass conversational flow — no architectural change to the extension
- `plan.md` user-authorship is currently detected via file modification time relative to generated story artifacts — this is a heuristic and may be replaced with a frontmatter marker (`source: user`) if false negatives are observed in practice
- Validation harness updated to cover top-level PRD intake detection

---

*Vazir POC Spec — Addendum C. Supplements v4.1, Addendum A, Addendum B. Covers: `/plan` read-first principle, intake authority levels, implementation-blocking classification test, question gate. No other commands or workflows affected.*
