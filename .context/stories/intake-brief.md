# Intake Brief

**Last updated:** 2026-08-06

## Planning brief
Implement Addendum G: an idea tracker for Vazir — `.context/ideas/` (one numbered `idea-NNN.md` file per idea, mirroring the `stories/` convention), the `/idea` capture-or-browse command, and `/plan idea-NNN` seeding with an open/promoted/discarded lifecycle.

## Source files
- .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_G.md (10790 bytes)

## Distilled notes
### .context/intake/prd/Vazir_POC_Spec_v4_1_Addendum_G.md
- **Problem:** Half-formed ideas surfaced mid-story have no home — they become premature stories or get lost. `/idea` is a fast, deterministic parking spot that preserves scope discipline; it is a release valve, not a general brainstorming tool.
- **Who/what:** Vazir users mid-story, mid-fix, or mid-replan who want to note an impulse without breaking scope. The most important thing for v1: capture is cheap and non-interrupting, and nothing is ever auto-promoted.
- **`.context/ideas/` contract:** One `idea-NNN.md` per idea, sequentially numbered like stories. Never injected into the agent's context window, never scanned wholesale; read by `/plan` only when a specific idea is referenced. Distinct from `.context/intake/` (external raw material).
- **Template:** `# Idea NNN: [Title]`, `**Status:** open | promoted | discarded`, `**Captured:** YYYY-MM-DD`, `**Promoted to:** —`, short freeform body. No `explored` or other intermediate status. Discarded ideas are kept on disk, never deleted.
- **`/idea [description]`:** Direct capture, status `open`, no confirmation prompt, no interruption of current work. No description + relevant recent conversation → agent may draft one (same as bare `/remember`).
- **`/idea` (bare):** Numbered selector (1. Capture a new idea, 2. View existing ideas) mirroring `/unlearn`. View shows a lightweight one-line-per-idea list (title + status), then opens the selected idea in the existing `/story` scrollable markdown viewer. No new TUI machinery. User then directs the agent conversationally: expand in place (stays `open`), or "plan this".
- **`/plan idea-NNN`:** Only supported reference syntax. Seeds the planning conversation with the idea's content like intake material; clarifying questions still asked — the idea is not verification-ready. Status flips to `promoted` with `Promoted to: story-NNN` only after the story file(s) actually exist; abandoned planning leaves the idea `open`. `/plan` with no reference is unchanged. "plan this" after viewing is agent-resolved shorthand for the same command, not a second mechanism.
- **Explicitly NOT in scope:** auto-promotion under any condition, context injection of ideas, deleting discarded ideas, agent license to act on ideas outside `/plan`, relevance matching/surfacing heuristics, new viewer/picker/menu components, `/fix` auto-routing, `/memory-review` passes over ideas, changes to any existing v4.1/A/B behavior.

## Derived stories
- story-061 — Idea file foundation and `/idea [description]` direct capture
- story-062 — `/idea` browse selector, lightweight list, and viewer reuse (depends on story-061)
- story-063 — `/plan idea-NNN` seeding and promotion status flip (depends on story-061, story-062)

## Planning rules
- Treat listed source files as user-authored planning inputs unless they are explicitly marked as generated artifacts.
- Vazir-generated files in .context/stories/ are replan context, not primary intake.
- Read all text-based planning sources before asking questions.
- Ask only implementation-blocking delta questions after reviewing this brief and any raw files you actually need.
- State safe default assumptions briefly so the user can correct them.
- Surface contradictions instead of resolving them silently.
