# Vazir POC Spec — Addendum B
**Supplements:** v4.1 and Addendum A  
**Status:** Ratified  
**Scope:** Static analysis integration — Fallow pre-pass in `/review`, structured findings as LLM prompt context, `code-review.md` output contract

---

## Context

This addendum captures the decision to integrate [Fallow](https://github.com/fallow-rs/fallow) as a deterministic pre-pass in the `/review` command. It does not modify any existing v4.1 behaviour or Addendum A behaviour. All commands, file contracts, and workflows remain unchanged. This addendum modifies `/review` only.

The core motivation: the LLM code review currently relies entirely on the model's own inspection of changed files. Fallow provides structured, sub-second static analysis — dead code, circular dependencies, duplication, and complexity hotspots — scoped to only the files changed since the last checkpoint. Running Fallow first means the LLM writes a single, synthesised review with machine-verified findings already baked in, rather than potentially duplicating or missing what static analysis would catch deterministically.

---

## What Changes

### `/review` — modified command

The existing `/review` command gains a Fallow pre-pass before the LLM begins its review. Everything else about `/review` is unchanged — the output file, the file location, the format, the rule-learning hook.

**Handler:** `vazir-context.ts` (unchanged owner)

**New flow:**

```
User: /review
      ↓
Agent shells out: fallow audit --base HEAD~1 --format json
      ↓
Parse JSON → extract verdict + issues array
      ↓
If fallow not installed or returns non-zero (non-issue failure):
  Log warning, continue without fallow findings
  (review proceeds as normal — no blocking)
      ↓
Fallow findings prepended to LLM prompt as structured context
      ↓
LLM writes code review, synthesising static findings with its own inspection
      ↓
Single code-review.md written to .context/reviews/
```

Fallow is never blocking. If the binary is absent, the audit scope returns zero files, or the command fails for any reason, `/review` falls back to the existing LLM-only behaviour with a logged warning.

---

## Fallow Invocation

```bash
fallow audit --base HEAD~1 --format json
```

- `audit` combines dead code + complexity + duplication in a single pass
- `--base HEAD~1` scopes analysis to files changed since the last commit — aligns with what the agent actually touched this session
- `--format json` returns a machine-parseable structure with a `verdict` field and a typed `issues` array
- For JJ repos: agent first shells out `jj diff --stat` to identify changed files, then passes them explicitly via `--file` flags if `--base` is not JJ-compatible (see Compatibility note below)

**Verdict values:** `pass` (exit 0), `warn` (exit 0, warn-severity issues only), `fail` (exit 1, error-severity issues present)

---

## Prompt Prefix Structure

The parsed Fallow output is prepended to the LLM review prompt as a clearly labelled block. The LLM is instructed to synthesise findings, not list them verbatim.

```
## Static Analysis Findings (Fallow)
Verdict: warn
Scope: 12 changed files

Issues:
- [unused-export] src/utils/formatDate.ts:14 — export `toRelativeTime` is never imported
- [complexity] src/agent/vazir-context.ts:203 — function `applyLocalRuleDedupe` exceeds complexity threshold (score: 18)
- [circular-dep] src/commands/review.ts ↔ src/context/inject.ts

Treat these as verified findings. Do not re-derive them. Synthesise with your own inspection where relevant.
```

The LLM is explicitly told the findings are machine-verified to prevent it from hedging or re-litigating them. It is free to add context around them (e.g. explaining *why* a function is complex) but should not contradict or duplicate the static output.

---

## `code-review.md` Output Contract

The output file format is unchanged from v4.1. Fallow findings are not given their own section — they are synthesised into the existing review structure. A single line at the top of the file records that Fallow was run and its verdict, for auditability.

```markdown
# Code Review — YYYY-MM-DD
**Story:** story-NNN  
**Static analysis:** fallow audit — warn (12 files scanned)

## Summary
...

## Findings
...

## Rules to consider promoting
...
```

If Fallow was not available or produced no findings, the `Static analysis` line reads:

```markdown
**Static analysis:** not run (fallow unavailable)
```

or

```markdown
**Static analysis:** fallow audit — pass (no issues found)
```

---

## Noise Management

Fallow is configured via `.fallowrc.json` at the project root. For POC projects in active development, the recommended starting configuration reduces false positives without disabling useful signal:

```jsonc
{
  "rules": {
    "circular-dependencies": "warn",
    "unused-exports": "warn",
    "unused-files": "error"
  }
}
```

This treats circular deps and unused exports as warnings (surfaced but not fail-verdict) and only hard-fails on unused files, which are more unambiguously wrong mid-development.

Inline suppression is available for intentionally scaffolded exports:

```ts
// fallow-ignore-next-line unused-export
export const futureFeature = 1;
```

Vazir does not manage or generate suppression comments — that is left to the user and the agent's normal code editing capabilities.

---

## Compatibility Note: JJ Repos

Fallow's `--base` flag expects a git ref. In JJ repos, `HEAD~1` may not resolve as expected depending on the co-located git backend state.

Fallback for JJ repos:

```bash
# Get changed files from JJ
jj diff --stat | grep -E '^\s+\S+' | awk '{print $1}'
# Pass each file explicitly
fallow audit --file src/a.ts --file src/b.ts --format json
```

The agent handles this transparently — VCS backend detection (already implemented in v4.1) determines which invocation path to use. No user configuration required.

---

## Installation

Fallow is an optional dependency. It is not bundled with Vazir. Users who want static analysis in `/review` install it separately:

```bash
npm install -D fallow
```

The agent checks for the binary on first `/review` call. If absent, it notifies the user once:

```
Fallow not found — running LLM-only review. Install with: npm install -D fallow
```

It does not prompt again in subsequent sessions unless the user asks.

---

## Relationship to Existing Commands

| Command | Fallow involvement |
|---|---|
| `/fix` | None — unchanged |
| `/consolidate` | None — unchanged |
| `/review` | Fallow pre-pass added — findings synthesised into single LLM review |
| `/memory-review` | None — unchanged |
| All others | None |

---

## What This Does NOT Change

- `/review` output location (`.context/reviews/code-review.md`) — unchanged
- Rule-learning hook from `/review` — unchanged
- `complaints-log.md` interaction from `/review` — unchanged
- Any Addendum A behaviour — unchanged
- Fallow findings are never written directly to context files — they are consumed by the LLM during the review and surfaced only through the synthesised `code-review.md`

---

*Vazir POC Spec — Addendum B. Supplements v4.1 and Addendum A. Covers: Fallow static analysis pre-pass in `/review`, prompt prefix structure, `code-review.md` auditability line, noise configuration, JJ compatibility fallback, optional installation behaviour.*
