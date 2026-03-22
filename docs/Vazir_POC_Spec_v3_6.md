# Vazir POC Spec — pi-mono Implementation
**Version:** 3.6  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis before building the full Rust/Tauri product  
**Timeline:** 2–3 weeks to working CLI  

> **v3.6 changes from v3.5:** Three new automations. (1) Zero-token JJ commit auto-describe: after every `agent_end`, `lastUserPrompt` calls `jj describe -m` automatically — no user input, no tokens, no latency. (2) Zero-token `index.md` structural updates: after every agent turn, deleted/renamed files patched out of `index.md` immediately with no LLM call; new files get `(undescribed)` placeholder. (3) Lazy LLM index descriptions: undescribed files batch-described during `/consolidate` or `session_shutdown`. Added explicit `/vazir-init` checklist — every step numbered, nothing implicit, `index.md` always generated.

> **v3.5 changes from v3.4:** `/vazir-init` handles full JJ setup. Added `/consolidate` with diff preview.

> **v3.4 changes from v3.3:** `jj undo` replaced with `jj op restore`. Checkpoint terminology throughout UI.

> **v3.3 changes from v3.2:** JJ replaces custom checkpoint system as primary backend.

> **v3.2 changes from v3.1:** Custom file snapshot checkpoint system.

> **v3.1 changes from v3.0:** Automatic `index.md` generation in `/vazir-init`.

> **v3.0 changes from v2.4:** Major simplification. Two extension files, one skill.

---

## Why JJ Unlocks Vazir

The POC thesis is about accumulated context making models smarter. But the safety net around that loop — checkpoint/restore — was becoming its own complexity. The custom file snapshot system in v3.2 was ~150 lines of infrastructure that still had a known gap: bash-executed changes couldn't be pre-snapshotted.

JJ solves this completely and for free:

- **Working copy is always a commit.** Every `jj` command — including the ones the agent triggers indirectly — auto-snapshots the working directory. No interception code needed.
- **Operation log = perfect checkpoint history.** `jj op log` lists every snapshot with timestamps. `jj op restore {id}` jumps the entire repo state back to that moment. Complete, reliable, handles bash side effects.
- **`jj op restore` = safe, explicit rollback.** Always restores to a specific named checkpoint ID. No undo/redo cycle possible — every restore is a forward operation in the log.
- **`jj diff` = better diff output.** Understands change IDs, cleaner ANSI output than `git diff`.
- **Colocated mode = zero disruption.** `jj git init --colocate` works in any existing git repo. GitHub, CI, teammates — nothing changes. Delete `.jj/` to go back to plain git.

The result: the entire checkpoint system becomes ~20 lines of JJ CLI calls instead of ~150 lines of custom file management.

---

## What This Is

A proof of concept, not a product. The full Vazir PRD describes a Rust/Tauri desktop application with a custom context engine, zero-token Rust operations, linting pipeline, and polished IDE surface. This POC builds none of that.

What it builds — **two TypeScript extension files and one skill file** on top of `pi-coding-agent` — is the core thesis: **does accumulated project context make a cheap model produce better results than a frontier model starting cold?**

The `.context/` folder structure is identical to the full PRD spec from day one. When the full product is built, users migrate their existing `.context/` folders directly. The brain travels.

---

## Success Criteria

After 30 days of real use on real projects:

1. **Does the context map orient the model?** Plans should reference the project structure correctly without the user re-explaining it every session.
2. **Does the self-correcting loop work?** The same mistake should not happen twice. Rejection reasons written to `system.md` should visibly change agent behaviour on the next task.
3. **Does model-swap quality hold?** After 20 tasks, switching from Claude Sonnet to Haiku should produce equivalent output on project-specific tasks — the context is doing the work, not the model.
4. **Does the compaction-based consolidation keep `system.md` clean?** After weeks of use, rules should be deduplicated and coherent, not a wall of contradictory text.

If yes: build the product. If no: you've learned something cheap.

---

## Architecture

```
pi-coding-agent (base)
    ├── .pi/extensions/
    │   ├── vazir-context.ts   # Context injection + compaction consolidation + /vazir-init
    │   └── vazir-tracker.ts   # Change tracker widget + JJ/git checkpoints + /diff + /reject + /reset
    │
    ├── .pi/skills/
    │   └── vazir-base.md      # automatic: true — always-on constraints
    │
    ├── AGENTS.md              # Cross-framework project context (Claude Code, Cursor, Windsurf)
    └── .context/
        ├── memory/
        │   ├── context-map.md    # Vazir conductor — 150 tokens, injected every turn
        │   ├── system.md         # Rules + learned rules — injected every turn
        │   └── index.md          # File index — auto-generated by /vazir-init
        ├── checkpoints/          # Git fallback only — not used when JJ is present
        ├── learnings/
        │   └── code-review.md    # Append-only rejection audit trail
        └── settings/
            └── project.json      # model_tier, project_name
```

---

## VCS Backend Detection

On `session_start`, Vazir detects which VCS backend is available:

```
session_start
      ↓
try: execSync("jj root", { cwd })
      ↓
SUCCESS → useJJ = true  — full JJ path, zero custom checkpoint infrastructure
FAILURE → useJJ = false — git fallback, .context/checkpoints/ file snapshots
```

Both paths expose the same commands (`/diff`, `/reject`, `/reset`) with identical UX. The user never needs to know which backend is running.

---

## The Checkpoint Flow

### JJ path (primary)

```
User prompts
      ↓
JJ auto-snapshots working copy on every agent write/edit/bash call
(happens automatically — no Vazir code needed)
      ↓
widget: M src/auth.ts +12/-4   A src/types.ts +30
      ↓
user keeps prompting...
every agent turn is a new checkpoint in the JJ operation log
      ↓
user happy → /reset → jj describe -m "add refresh token" → jj git push
      ↓ OR ↓
user runs /reject
  ↓
"What went wrong?" → rule saved to system.md
  ↓
"Retry?" → resend original prompt + rejection reason
  ↓ NO
"Restore checkpoint?"
  "Previous checkpoint" → jj op restore {ops[1].id}  ← pre-selected, instant
  "Choose checkpoint"   → SelectList picker showing user prompts + timestamps
  ↓
jj op restore {id} — entire repo state restored, including bash side effects
No undo/redo cycle possible — every restore is a new forward operation in the log
widget syncs from jj diff
  ↓
rejection reason is re-applied after restore so system.md / learnings keep the rule
```

### Git fallback path

```
Same UX — checkpoint picker shows file snapshot entries from .context/checkpoints/
restore copies files back from snapshot folder
handles write/edit only (bash side effects not captured — noted in picker)
```

### Session start recovery (both paths)

```
session_start
      ↓
JJ: jj diff --stat → any output means work in progress
Git: git status --porcelain → dirty = work in progress
      ↓
work in progress from before?
  JJ:  warn user → "Use /reject to restore an earlier checkpoint or continue"
       (jj op log always has the full history — nothing is ever lost)
  Git: check .context/checkpoints/ for orphaned session folders
       dirty + orphaned → warn + show checkpoint picker
       clean → delete old checkpoint folders silently
```

---

## The Learning Loop

Unchanged from v3.0 — this is the core thesis and it doesn't change with JJ.

**Immediate — within the current task:**
```
Agent writes bad code
  ↓
/reject "don't touch ValidateToken signature"
  ↓
rule written to system.md ## Learned Rules (permanent, injected every session)
reason appended to learnings/code-review.md (audit trail)
  ↓
"Retry?" → pi.sendUserMessage("Previous attempt rejected: [reason]\n\n[original task]")
  ↓ NO
"Restore checkpoint?"
  JJ:  "Previous checkpoint" → jj op restore ops[1].id
   "Choose checkpoint"   → picker showing prompts + timestamps
  Git: file snapshot picker
  ↓
rejection reason is re-applied after restore so system.md / learnings keep the rule
      ↓
agent reruns with the rule already in system.md — doesn't repeat the mistake
```

**Persistent — across sessions and long sessions:**
```
Context fills up → pi triggers compaction → session_before_compact fires
      ↓
cheap LLM call: deduplicate + merge + clean system.md ## Learned Rules
      ↓
compaction summary returned to pi — session stays clean indefinitely
```

`session_shutdown` fires the same consolidation as a fallback.

---

## Extension Files

### 1. `vazir-context.ts` — Context Injection + Consolidation + Init

Four responsibilities:
- Inject `context-map.md` + `system.md` + `index.md` before every agent turn
- Run LLM consolidation automatically on compaction and shutdown (silent)
- `/vazir-init` — JJ setup + bootstrap `.context/` + generate `index.md` via LLM
- `/consolidate` — manual consolidation trigger with diff preview + confirmation

#### `/vazir-init` — Explicit Checklist

Every step runs in order. Nothing is skipped. The checklist below is exactly what happens when you run `/vazir-init` on a fresh project.

```
☐ 1. Create .context/ directory structure
  .context/memory/
  .context/learnings/
  .context/settings/
  create system.md, project.json, and AGENTS.md if missing
  .context/checkpoints/   ← git fallback only

☐ 2. Generate .context/memory/index.md  (ALWAYS — overwrite if exists)
  find all source files (ts, js, go, py, rs, etc.) excluding noise dirs
  LLM call → one-line description per file
  write to index.md
  notify "✓ index.md generated — review descriptions after init"

☐ 3. Write .context/memory/context-map.md  (skip if exists)
  template with HTML comment placeholders
  if missing, create it first
  draft from AGENTS.md + source files (LLM call)
  notify "context-map.md drafted — review and tighten it"

☐ 4. Bootstrap summary notify
  "✓ Vazir bootstrap complete
   • context-map.md: [drafted | fill in manually | existing]
   • index.md: N files indexed
   Next: Git check runs now"

☐ 5. Git check
  try: git rev-parse --git-dir
  NOT a git repo →
    select: "Yes — initialise git" | "No — I understand, skip git and JJ"
    "Yes — initialise git" → git init
       notify "✓ git initialised
               Remember to add a remote:
               git remote add origin <url>"
    "No — I understand, skip git and JJ" →
       notify "No git — JJ skipped, checkpoints unavailable"
       done; files are already created
  IS a git repo → continue

☐ 6. JJ install check
  try: jj --version
  NOT installed →
    notify:
      "JJ is not installed. It gives Vazir a full checkpoint history of every agent turn.

       To install:  brew install jj  (macOS)
                    cargo install jj-cli  (Linux)

       After installing, run:  jj git init --colocate
       Or just re-run /vazir-init — files are already set up."
    continue; JJ is optional
  INSTALLED → continue

☐ 7. JJ repo init (only if git exists and JJ is available)
  try: jj root
  NOT a JJ repo → jj git init --colocate
         jj bookmark track main@origin (or master@origin)
         add .jj/ to .gitignore if missing
         notify "✓ JJ initialised"
  ALREADY JJ    → notify "JJ already initialised" (skip)

☐ 8. Final summary notification
  "✓ Vazir initialised
   • JJ: [active | git fallback]
   • context-map.md: [drafted | fill in manually | existing]
   • index.md: N files indexed
   Next: review context-map.md, then start your first task"
```

**Key guarantees:**
- `index.md` is **always** generated (step 2), even if everything else already existed
- `context-map.md` is **drafted automatically** (step 3) only on first run, never overwritten
- Steps 1–4 are idempotent — running `/vazir-init` again on an existing project is safe
- Git is checked only after the files are written, so missing version control never blocks the bootstrap
- JJ setup only runs after a git repo exists, so JJ failures are explicit and non-blocking

#### `/consolidate` — Manual Consolidation with Preview

```
/consolidate
      ↓
Read current system.md + learnings/code-review.md
      ↓
LLM call: same prompt as automatic consolidation
  → deduplicate, merge overlapping rules, remove contradictions
  → return cleaned ## Learned Rules section
      ↓
Show diff in ctx.ui.custom() overlay:
  BEFORE:                          AFTER:
  - don't touch ValidateToken      - never modify auth signatures
  - never modify auth signatures     (merged ↑)
  - use project logger             - use project logger, not console.log
  - don't use console.log            (merged ↑)
  - always use := in Go            - always use := in Go
      ↓
"Apply these changes?" Yes / No
      ↓
Yes → write cleaned section to system.md
      ctx.ui.notify("system.md consolidated — X rules merged, Y removed", "info")
No  → discard, system.md unchanged
      ctx.ui.notify("Consolidation discarded", "info")
```

The automatic consolidation (compaction + shutdown) skips the preview and writes directly — it's a maintenance operation. The manual `/consolidate` shows the diff because the user is actively choosing to review their rules.

---

#### New Automations in v3.6

**All three run in `vazir-context.ts` on `agent_end`.**

##### 1. Zero-token JJ commit auto-describe

After every agent turn, the working-copy commit is automatically described with the user's prompt. No user input. No tokens. No latency — just one shell call.

```typescript
pi.on("agent_end", async (_event, ctx) => {
  if (!useJJ || !lastUserPrompt.trim()) return;
  try {
    // Describe the working-copy commit with the prompt that triggered this turn.
    // User can always override with /reset → jj describe -m "better message"
    execSync(
      `jj describe -m "${lastUserPrompt.trim().slice(0, 72).replace(/"/g, '\\"')}"`,
      { cwd: ctx.cwd }
    );
  } catch { /* silent — not critical */ }
});
```

Result: `jj log` always shows meaningful descriptions instead of `(no description set)`. The user gets a readable history of what the agent did at each turn without any extra steps.

##### 2. Zero-token `index.md` structural updates

After every agent turn, `index.md` is patched to reflect the current file state — **no LLM call**. Deleted files are removed, renamed files are updated, new files get a `(undescribed)` placeholder.

```typescript
pi.on("agent_end", async (_event, ctx) => {
  if (!useJJ) return;
  const indexPath = join(ctx.cwd, ".context/memory/index.md");
  if (!existsSync(indexPath)) return;

  try {
    // Get files added/deleted this turn from JJ
    const diffOut = execSync("jj diff --stat", { cwd: ctx.cwd, encoding: "utf-8" });

    // Parse: "src/foo.ts    | 12 ++++++------"
    // Also catches new files (all + lines) and deleted files (all - lines)
    const added:   string[] = [];
    const deleted: string[] = [];

    for (const line of diffOut.split("\n")) {
      const m = line.match(/^\s*(.+?)\s+\|\s+\d+\s+([+-]+)/);
      if (!m) continue;
      const file    = m[1].trim();
      const changes = m[2];
      if (!changes.includes("-")) deleted.push(file); // all + = new file? no
      // JJ diff --stat shows net changes — use name-only for clarity
    }

    // Use name-only for precise new/deleted detection
    const nameOnly = execSync(
      "jj diff --name-only",
      { cwd: ctx.cwd, encoding: "utf-8" }
    ).trim().split("\n").filter(Boolean);

    // Check which are new (didn't exist before) vs modified vs deleted
    let index = readFileSync(indexPath, "utf-8");
    let changed = false;

    for (const file of nameOnly) {
      const absPath = join(ctx.cwd, file);
      const inIndex = index.includes(file);

      if (!existsSync(absPath) && inIndex) {
        // File deleted — remove its line from index
        index = index.split("\n").filter(l => !l.startsWith(file)).join("\n");
        changed = true;
      } else if (existsSync(absPath) && !inIndex) {
        // New file — add placeholder line
        index = index.trimEnd() + `\n${file} — (undescribed)\n`;
        changed = true;
      }
      // Modified files — descriptions stay valid, no change needed
    }

    if (changed) writeFileSync(indexPath, index);
  } catch { /* silent */ }
});
```

##### 3. Lazy LLM descriptions for undescribed files

During `/consolidate` and `session_shutdown`, any `(undescribed)` entries in `index.md` are batch-described with a single LLM call. This runs after the rule consolidation — same session, no extra user interaction.

```typescript
async function describeUndescribedFiles(cwd: string) {
  const indexPath = join(cwd, ".context/memory/index.md");
  if (!existsSync(indexPath)) return;

  const index = readFileSync(indexPath, "utf-8");
  const undescribed = index
    .split("\n")
    .filter(l => l.includes("(undescribed)"))
    .map(l => l.split(" — ")[0].trim())
    .filter(Boolean);

  if (undescribed.length === 0) return;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content:
            `For each file below, write one line: path — description (under 15 words).\n` +
            `Return ONLY the lines, no preamble.\n\n` +
            undescribed.join("\n"),
        }],
      }),
    });
    const data        = await response.json();
    const descriptions = data.content?.[0]?.text?.trim();
    if (!descriptions) return;

    // Patch index — replace (undescribed) lines with real descriptions
    let updated = index;
    for (const line of descriptions.split("\n")) {
      const [file] = line.split(" — ");
      if (file?.trim()) {
        updated = updated.replace(
          new RegExp(`${file.trim()} — \\(undescribed\\)`),
          line.trim()
        );
      }
    }
    writeFileSync(indexPath, updated);
  } catch { /* silent */ }
}
```

This is called at the end of `runConsolidation()` and in `session_shutdown` — piggybacking on existing triggers with no new user-facing mechanism needed.

#### `vazir-context.ts` — Code

Key additions in v3.5: JJ install check + `jj git init --colocate` in `/vazir-init`, `/consolidate` with diff preview. Context injection, compaction, and shutdown hooks unchanged from v3.1.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { Container, Key, matchesKey } from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {

  // ── Context injection ─────────────────────────────────────────────────
  pi.on("before_agent_start", async (event, _ctx) => {
    const parts: string[] = [];
    const cwd = process.cwd();
    const paths = {
      contextMap: join(cwd, ".context/memory/context-map.md"),
      agents:     join(cwd, "AGENTS.md"),
      system:     join(cwd, ".context/memory/system.md"),
      index:      join(cwd, ".context/memory/index.md"),
    };

    if (existsSync(paths.contextMap))   parts.push(strip(readFileSync(paths.contextMap, "utf-8")));
    else if (existsSync(paths.agents))  parts.push(strip(readFileSync(paths.agents, "utf-8")));
    if (existsSync(paths.system)) { const s = strip(readFileSync(paths.system, "utf-8")); if (s) parts.push(s); }
    if (existsSync(paths.index))  { const i = strip(readFileSync(paths.index, "utf-8"));  if (i) parts.push(i); }
    if (parts.length === 0) return;
    return { systemPrompt: `${parts.join("\n\n---\n\n")}\n\n---\n\n${event.systemPrompt || ""}` };
  });

  // ── Compaction — silent automatic consolidation ───────────────────────
  pi.on("session_before_compact", async () => {
    await runConsolidation({ dryRun: false });
    return { summary: "Vazir context consolidated. Rules in .context/memory/system.md." };
  });

  // ── Shutdown fallback — silent ────────────────────────────────────────
  pi.on("session_shutdown", async () => { await runConsolidation({ dryRun: false }); });

  // ── /vazir-init ───────────────────────────────────────────────────────

  pi.registerCommand("vazir-init", {
    description: "Initialise JJ + .context/ folder for this project",
    handler: async (_args, ctx) => {
      const cwd = process.cwd();

      // ── Step 1: JJ install check ────────────────────────────────────
      let jjAvailable = false;
      try {
        execSync("jj --version", { stdio: "pipe" });
        jjAvailable = true;
      } catch {
        const choice = await ctx.ui.select(
          "JJ (Jujutsu) is not installed. It powers Vazir's checkpoint system.",
          [
            "Install automatically — let the agent handle it",
            "Show install instructions",
            "Skip JJ — use git fallback",
          ]
        );

        if (choice === "Install automatically — let the agent handle it") {
          await pi.sendUserMessage(
            "Please install jj (Jujutsu) using the appropriate package manager. " +
            "macOS: brew install jj. Linux: cargo install jj-cli or check " +
            "https://jj-vcs.dev/latest/install-and-setup for distro packages. " +
            "After installing, please run /vazir-init again."
          );
          return; // agent installs, user re-runs
        }
        if (choice === "Show install instructions") {
          ctx.ui.notify("https://jj-vcs.dev/latest/install-and-setup", "info");
          return;
        }
        // "Skip JJ" → jjAvailable stays false
        ctx.ui.notify("Continuing without JJ — git fallback active", "info");
      }

      // ── Step 2: Init JJ repo if available ────────────────────────────
      if (jjAvailable) {
        try {
          execSync("jj root", { cwd, stdio: "pipe" });
          ctx.ui.notify("JJ already initialised", "info");
        } catch {
          execSync("jj git init --colocate", { cwd });
          ctx.ui.notify("✓ JJ initialised (colocated with git)", "info");
          // Track default branch
          for (const branch of ["main", "master"]) {
            try { execSync(`jj bookmark track ${branch}@origin`, { cwd, stdio: "pipe" }); break; }
            catch { /* try next */ }
          }
        }
        // Add .jj/ to .gitignore
        const ignorePath = join(cwd, ".gitignore");
        const ignoreContent = existsSync(ignorePath) ? readFileSync(ignorePath, "utf-8") : "";
        if (!ignoreContent.includes(".jj/")) {
          writeFileSync(ignorePath, ignoreContent.trimEnd() + "\n.jj/\n");
          ctx.ui.notify("Added .jj/ to .gitignore", "info");
        }
      }

      // ── Step 3: Bootstrap .context/ ──────────────────────────────────
      const root = join(cwd, ".context");
      for (const dir of ["memory", "learnings", "settings"])
        mkdirSync(join(root, dir), { recursive: true });

      if (!existsSync(join(root, "memory/context-map.md")))
        writeFileSync(join(root, "memory/context-map.md"), CONTEXT_MAP_TEMPLATE);
      if (!existsSync(join(root, "memory/system.md")))
        writeFileSync(join(root, "memory/system.md"), SYSTEM_MD_TEMPLATE);
      if (!existsSync(join(root, "settings/project.json")))
        writeFileSync(join(root, "settings/project.json"),
          JSON.stringify({ project_name: "", model_tier: "balanced" }, null, 2));
      if (!existsSync(join(cwd, "AGENTS.md")))
        writeFileSync(join(cwd, "AGENTS.md"), AGENTS_MD_TEMPLATE);

      // ── Step 4: Generate index.md ─────────────────────────────────────
      await generateIndexMd(ctx, root, cwd);

      ctx.ui.notify(
        "✓ Vazir initialised — fill in context-map.md and AGENTS.md to orient the agent",
        "info"
      );
    },
  });

  // ── /consolidate — manual with diff preview ───────────────────────────

  pi.registerCommand("consolidate", {
    description: "Review and consolidate learned rules in system.md",
    handler: async (_args, ctx) => {
      const systemPath = join(process.cwd(), ".context/memory/system.md");
      if (!existsSync(systemPath)) {
        ctx.ui.notify("No system.md — run /vazir-init first", "warning");
        return;
      }

      ctx.ui.setWorkingMessage("Consolidating rules via LLM...");
      const cleaned = await runConsolidation({ dryRun: true });
      ctx.ui.setWorkingMessage();

      if (!cleaned) {
        ctx.ui.notify("Nothing to consolidate", "info");
        return;
      }

      const currentMd    = readFileSync(systemPath, "utf-8");
      const currentRules = extractLearnedRules(currentMd).split("\n").filter(l => l.trim().startsWith("-"));
      const newRules     = extractLearnedRules(cleaned).split("\n").filter(l => l.trim().startsWith("-"));
      const removed      = currentRules.filter(l => !newRules.includes(l));
      const added        = newRules.filter(l => !currentRules.includes(l));
      const kept         = newRules.filter(l => currentRules.includes(l));

      const diffLines = [
        `  ${kept.length} rule${kept.length !== 1 ? "s" : ""} unchanged`,
        ...removed.map(l => `  - ${l.replace(/^-\s*/, "")}`),
        ...added.map(l =>   `  + ${l.replace(/^-\s*/, "")}`),
        "",
        "  y = apply · n = discard",
      ];

      let accepted = false;
      let scrollOffset = 0;

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 6);
            return diffLines
              .slice(scrollOffset, scrollOffset + visibleRows)
              .map(l => {
                if (l.startsWith("  -")) return theme.fg("error",   l);
                if (l.startsWith("  +")) return theme.fg("success", l);
                return theme.fg("dim", l);
              });
          },
          invalidate() {},
          handleInput(data: Buffer) {
            const key = data.toString();
            if      (matchesKey(data, Key.up))     scrollOffset = Math.max(0, scrollOffset - 1);
            else if (matchesKey(data, Key.down))   scrollOffset = Math.min(diffLines.length - 1, scrollOffset + 1);
            else if (key === "y" || key === "Y")   { accepted = true;  done(); return; }
            else if (key === "n" || key === "N")   { accepted = false; done(); return; }
            else if (matchesKey(data, Key.escape)) { done(); return; }
            tui.requestRender();
          },
        };
      });

      if (accepted) {
        const newLearnedSection = extractLearnedRules(cleaned);
        const updated = currentMd.includes("## Learned Rules")
          ? currentMd.replace(/## Learned Rules[\s\S]*$/, newLearnedSection)
          : currentMd.trimEnd() + "\n\n" + newLearnedSection + "\n";
        writeFileSync(systemPath, updated);
        ctx.ui.notify(
          `system.md consolidated — ${removed.length} merged/removed, ${added.length} new`,
          "info"
        );
      } else {
        ctx.ui.notify("Consolidation discarded", "info");
      }
    },
  });
}

// ── Shared consolidation LLM call ─────────────────────────────────────────
// dryRun: true  → returns cleaned text, does NOT write (used by /consolidate)
// dryRun: false → writes directly, returns null    (used by auto triggers)

async function runConsolidation(opts: { dryRun: boolean }): Promise<string | null> {
  const systemPath    = join(process.cwd(), ".context/memory/system.md");
  const learningsPath = join(process.cwd(), ".context/learnings/code-review.md");
  if (!existsSync(systemPath)) return null;

  const systemMd  = readFileSync(systemPath, "utf-8");
  const learnings = existsSync(learningsPath) ? readFileSync(learningsPath, "utf-8") : "";
  if (!systemMd.trim()) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content:
            `You maintain a rule set for a coding agent.\n\n` +
            `Current system.md:\n<system_md>${systemMd}</system_md>\n\n` +
            `Recent rejection log:\n<learnings>${learnings || "(none)"}</learnings>\n\n` +
            `Return a cleaned ## Learned Rules section only:\n` +
            `- Merge rules that say the same thing differently\n` +
            `- Remove rules contradicted by newer ones\n` +
            `- One concise bullet per rule\n` +
            `- No new rules\n` +
            `- Return ONLY the ## Learned Rules section`,
        }],
      }),
    });
    const data    = await response.json();
    const cleaned = data.content?.[0]?.text?.trim();
    if (!cleaned || !cleaned.startsWith("## Learned Rules")) return null;

    if (!opts.dryRun) {
      const updated = systemMd.includes("## Learned Rules")
        ? systemMd.replace(/## Learned Rules[\s\S]*$/, cleaned)
        : systemMd.trimEnd() + "\n\n" + cleaned + "\n";
      writeFileSync(systemPath, updated);
    }
    return cleaned;
  } catch { return null; }
}

function extractLearnedRules(md: string): string {
  const match = md.match(/## Learned Rules[\s\S]*$/);
  return match ? match[0] : "## Learned Rules\n";
}

function strip(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

async function generateIndexMd(ctx: any, root: string, cwd: string) {
  // Unchanged from v3.1 — omitted for brevity
}

// Templates (CONTEXT_MAP_TEMPLATE, SYSTEM_MD_TEMPLATE, AGENTS_MD_TEMPLATE)
// Unchanged from v3.1 — omitted for brevity
```

---

### 2. `vazir-tracker.ts` — Change Tracker + JJ/Git Checkpoints + Diff + Reject

JJ path is the primary implementation. Git fallback is used when `jj root` fails.
Note how the checkpoint section shrinks from ~120 lines to ~20 lines.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
  copyFileSync, rmSync, readdirSync
} from "fs";
import { join, dirname } from "path";
import { Container, Key, matchesKey, Text } from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

// ── Types ──────────────────────────────────────────────────────────────

interface FileInfo {
  file: string;
  status: string;
  added: number;
  removed: number;
}

// Git fallback checkpoint types
interface CheckpointMeta {
  timestamp: string;
  prompt: string;
  files: string[];
  newFiles: string[];
}

// ── State ──────────────────────────────────────────────────────────────

const changedFiles = new Map<string, FileInfo>();
let widgetTui: any = null;
let lastUserPrompt = "";
let useJJ = false;           // set on session_start
let currentSessionId = "";   // git fallback only

// ── JJ helpers ─────────────────────────────────────────────────────────

function detectJJ(cwd: string): boolean {
  try { execSync("jj root", { cwd, stdio: "pipe" }); return true; }
  catch { return false; }
}

// Maps jj op IDs to the user prompt that triggered that agent turn
// Stored in memory — used to make checkpoint labels human-readable
const jjOpPromptMap = new Map<string, string>();

function jjOpLog(cwd: string, limit = 15): Array<{ id: string; description: string; ago: string }> {
  try {
    // Use JJ template to get structured output — one line per op
    const raw = execSync(
      `jj op log --no-graph --limit ${limit} --template 'id.short(8) ++ "||" ++ description ++ "||" ++ time.ago() ++ "\\n"'`,
      { cwd, encoding: "utf-8" }
    ).trim();
    return raw.split("\n").filter(Boolean).map(line => {
      const [id, description, ago] = line.split("||");
      return { id: id.trim(), description: description.trim(), ago: ago.trim() };
    });
  } catch { return []; }
}

// Format checkpoint labels for the picker — show user prompt instead of JJ internals
function checkpointLabel(op: { id: string; description: string; ago: string }): string {
  const prompt = jjOpPromptMap.get(op.id);
  const label  = prompt ? prompt.slice(0, 50) : op.description;
  return `${op.ago} · ${label}`;
}

function jjDiffStat(cwd: string): string {
  try {
    return execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim();
  } catch { return ""; }
}

function jjDiffFile(cwd: string, file: string): string {
  try {
    return execSync(`jj diff --color always -- "${file}"`, { cwd, encoding: "utf-8" });
  } catch { return ""; }
}

function jjHasChanges(cwd: string): boolean {
  try {
    return execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim() !== "";
  } catch { return false; }
}

// ── Git helpers ─────────────────────────────────────────────────────────

function syncFromGit(cwd: string) {
  try {
    const statusOut = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    const statusMap = new Map<string, string>();

    for (const line of statusOut.split("\n")) {
      if (line.length < 4) continue;
      const xy   = line.slice(0, 2);
      const file = line.slice(3).trim();
      let status: string;
      if (xy.includes("M"))      status = "M";
      else if (xy.includes("A")) status = "A";
      else if (xy.includes("D")) status = "D";
      else if (xy.includes("?")) status = "?";
      else                       status = xy.trim() || "~";
      statusMap.set(file, status);
    }

    const statOut = execSync("git diff --stat HEAD", { cwd, encoding: "utf-8" }).trim();
    const statMap = new Map<string, { added: number; removed: number }>();
    for (const line of statOut.split("\n")) {
      const m = line.match(/^\s*(.+?)\s+\|\s+\d+\s+([+-]*)/);
      if (!m) continue;
      statMap.set(m[1].trim(), {
        added:   (m[2].match(/\+/g) || []).length,
        removed: (m[2].match(/-/g)  || []).length,
      });
    }

    changedFiles.clear();
    for (const [file, status] of statusMap) {
      let added = 0, removed = 0;
      if (status === "?") {
        try { added = readFileSync(join(cwd, file), "utf-8").split("\n").length; } catch {}
      } else {
        const s = statMap.get(file);
        if (s) { added = s.added; removed = s.removed; }
      }
      changedFiles.set(file, { file, status, added, removed });
    }
  } catch { /* not a git repo */ }
}

function syncFromJJ(cwd: string) {
  // Parse jj diff --stat for the widget
  // Format: "path/to/file | 12 +++++------"
  changedFiles.clear();
  try {
    const stat = jjDiffStat(cwd);
    if (!stat) return;
    for (const line of stat.split("\n")) {
      const m = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]*)/);
      if (!m) continue;
      const file    = m[1].trim();
      const plusMinus = m[3];
      changedFiles.set(file, {
        file,
        status: "M",
        added:   (plusMinus.match(/\+/g) || []).length,
        removed: (plusMinus.match(/-/g)  || []).length,
      });
    }
  } catch { /* ignore */ }
}

function syncChanges(cwd: string) {
  if (useJJ) syncFromJJ(cwd);
  else        syncFromGit(cwd);
}

function isGitClean(cwd: string): boolean {
  try { return execSync("git status --porcelain", { cwd, encoding: "utf-8" }).trim() === ""; }
  catch { return true; }
}

// ── Git fallback checkpoint helpers ────────────────────────────────────
// Only used when useJJ = false

function checkpointsRoot(cwd: string) { return join(cwd, ".context/checkpoints"); }
function sessionCheckpointDir(cwd: string, id: string) { return join(checkpointsRoot(cwd), id); }

function gitSnapshotFile(cwd: string, filePath: string, checkpointDir: string) {
  const abs = join(cwd, filePath);
  if (!existsSync(abs)) return; // new file — restore = delete (handled in meta)
  const dest = join(checkpointDir, "files", filePath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(abs, dest);
}

function gitRestoreCheckpoint(cwd: string, checkpointDir: string) {
  const metaPath = join(checkpointDir, "meta.json");
  if (!existsSync(metaPath)) return;
  const meta: CheckpointMeta = JSON.parse(readFileSync(metaPath, "utf-8"));
  for (const f of meta.files) {
    const src = join(checkpointDir, "files", f);
    if (existsSync(src)) copyFileSync(src, join(cwd, f));
  }
  for (const f of meta.newFiles) {
    const abs = join(cwd, f);
    if (existsSync(abs)) rmSync(abs);
  }
}

function listGitCheckpoints(cwd: string, sessionId: string) {
  const dir = sessionCheckpointDir(cwd, sessionId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map(n => parseInt(n)).filter(n => !isNaN(n)).sort((a, b) => b - a)
    .map(n => {
      const d = join(dir, String(n));
      const mp = join(d, "meta.json");
      if (!existsSync(mp)) return null;
      return { dir: d, meta: JSON.parse(readFileSync(mp, "utf-8")) as CheckpointMeta, n };
    }).filter(Boolean) as Array<{ dir: string; meta: CheckpointMeta; n: number }>;
}

function findOrphanedGitSessions(cwd: string, currentId: string): string[] {
  const root = checkpointsRoot(cwd);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(id => id !== currentId);
}

// ── refreshWidget ───────────────────────────────────────────────────────

function refreshWidget() { widgetTui?.requestRender(); }

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Track user prompts for retry flow
  pi.on("input", async (event) => {
    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  // ── session_start ─────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;
    useJJ = detectJJ(cwd);

    // Extract session ID (git fallback only)
    const sessionFile = (ctx.sessionManager as any).getSessionFile?.() ?? "";
    const match = sessionFile.match(/_([a-f0-9]+)\.jsonl$/);
    currentSessionId = match ? match[1] : Date.now().toString(16);

    // ── Recovery check ───────────────────────────────────────────────
    if (useJJ) {
      // JJ: if there are uncommitted changes, just show them — op log is always there
      if (jjHasChanges(cwd)) {
        ctx.ui.notify(
          "Work in progress from previous session detected. Use /reject to restore an earlier state.",
          "warning"
        );
      }
    } else {
      // Git fallback: check for orphaned checkpoint folders
      const orphans = findOrphanedGitSessions(cwd, currentSessionId);
      if (orphans.length > 0) {
        if (!isGitClean(cwd)) {
          ctx.ui.notify(
            "⚠ Unfinished work from a previous session detected. Use /reject to restore a checkpoint.",
            "warning"
          );
        } else {
          // Clean tree — safe to delete old checkpoints
          for (const id of orphans) {
            const d = sessionCheckpointDir(cwd, id);
            if (existsSync(d)) rmSync(d, { recursive: true, force: true });
          }
        }
      }
    }

    // ── Mount widget ─────────────────────────────────────────────────
    if (!ctx.hasUI) return;
    syncChanges(cwd);

    ctx.ui.setWidget("vazir-tracker", (tui, theme) => {
      widgetTui = tui;
      return {
        render(): string[] {
          if (changedFiles.size === 0) return [];

          const parts: string[] = [];
          for (const [, f] of changedFiles) {
            let s: string;
            switch (f.status) {
              case "M": s = theme.fg("warning", "M"); break;
              case "A": s = theme.fg("success", "A"); break;
              case "D": s = theme.fg("error",   "D"); break;
              default:  s = theme.fg("muted",   "?"); break;
            }
            const counts =
              theme.fg("success", `+${f.added}`) +
              theme.fg("dim", "/") +
              theme.fg("error", `-${f.removed}`);
            parts.push(`${s} ${f.file} ${counts}`);
          }

          const vcs   = useJJ ? theme.fg("dim", " · jj") : "";
          const hint  = theme.fg("dim", " · /diff · /reject · /reset");
          return [" " + parts.join("   ") + vcs + hint];
        },
        invalidate() {},
        dispose()    { widgetTui = null; },
      };
    }, { placement: "belowEditor" });
  });

  // ── Git fallback: snapshot before agent writes ────────────────────────
  // JJ snapshots automatically — no interception needed on JJ path.

  let gitCurrentCheckpointDir = "";
  let gitCheckpointCount = 0;

  pi.on("before_agent_start", async (_event, ctx) => {
    if (useJJ) return; // JJ handles snapshotting natively

    // Create a new checkpoint folder for this turn
    gitCheckpointCount++;
    const dir = join(sessionCheckpointDir(ctx.cwd, currentSessionId), String(gitCheckpointCount));
    mkdirSync(join(dir, "files"), { recursive: true });
    const meta: CheckpointMeta = {
      timestamp: new Date().toISOString(),
      prompt: lastUserPrompt.slice(0, 60),
      files: [],
      newFiles: [],
    };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    gitCurrentCheckpointDir = dir;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (useJJ) return; // JJ handles snapshotting natively
    const name = (event as any).toolName;
    if (name === "write" || name === "edit") {
      const filePath = (event as any).input?.path;
      if (filePath && gitCurrentCheckpointDir) {
        gitSnapshotFile(ctx.cwd, filePath, gitCurrentCheckpointDir);
        // Update meta.files
        const mp = join(gitCurrentCheckpointDir, "meta.json");
        const meta: CheckpointMeta = JSON.parse(readFileSync(mp, "utf-8"));
        if (!meta.files.includes(filePath)) {
          meta.files.push(filePath);
          writeFileSync(mp, JSON.stringify(meta, null, 2));
        }
      }
    }
  });

  // Sync widget after any file-writing tool
  // JJ path: also record the current op ID → user prompt mapping for checkpoint labels
  pi.on("tool_result", async (event, ctx) => {
    const name = (event as any).toolName;
    if (name === "write" || name === "edit" || name === "bash") {
      syncChanges(ctx.cwd);
      refreshWidget();

      // Record current op ID → prompt so checkpoint picker shows human labels
      if (useJJ) {
        try {
          const opId = execSync(
            `jj op log --no-graph --limit 1 --template 'id.short(8)'`,
            { cwd: ctx.cwd, encoding: "utf-8" }
          ).trim();
          if (opId && lastUserPrompt) jjOpPromptMap.set(opId, lastUserPrompt);
        } catch { /* ignore */ }
      }
    }
  });

  // ── /diff ─────────────────────────────────────────────────────────────

  pi.registerCommand("diff", {
    description: "Show inline terminal diff for a changed file",
    handler: async (_args, ctx) => {
      syncChanges(ctx.cwd);
      if (changedFiles.size === 0) { ctx.ui.notify("No changed files", "info"); return; }

      const files = [...changedFiles.values()];
      let chosen: FileInfo;

      if (files.length === 1) {
        chosen = files[0];
      } else {
        const labels = files.map(f => `${f.status} ${f.file}  +${f.added}/-${f.removed}`);
        const pick   = await ctx.ui.select("Diff which file?", labels);
        if (pick == null) return;
        chosen = files[labels.indexOf(pick)];
      }

      // JJ path: jj diff -- file  /  Git path: git diff --color=always HEAD -- file
      let diffText: string;
      try {
        if (useJJ) {
          diffText = jjDiffFile(ctx.cwd, chosen.file);
        } else if (chosen.status === "?") {
          const content = readFileSync(join(ctx.cwd, chosen.file), "utf-8");
          diffText = content.split("\n").map(l => `\x1b[32m+ ${l}\x1b[0m`).join("\n");
        } else {
          diffText = execSync(
            `git diff --color=always HEAD -- "${chosen.file}"`,
            { cwd: ctx.cwd, encoding: "utf-8" }
          );
        }
      } catch (e: any) {
        ctx.ui.notify(`Failed to get diff: ${e.message}`, "error");
        return;
      }

      if (!diffText.trim()) { ctx.ui.notify("No diff output", "info"); return; }

      const lines = diffText.split("\n");
      let scrollOffset = 0;

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(
          theme.fg("accent", ` ${chosen.status} ${chosen.file}`) +
          theme.fg("dim", `  +${chosen.added}/-${chosen.removed}  ↑↓ scroll · esc close`),
          0, 0
        ));
        container.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));

        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
            return lines
              .slice(scrollOffset, scrollOffset + visibleRows)
              .map(l => l.length > width ? l.slice(0, width - 1) : l);
          },
          invalidate() {},
          handleInput(data: Buffer) {
            if      (matchesKey(data, Key.up))       scrollOffset = Math.max(0, scrollOffset - 1);
            else if (matchesKey(data, Key.down))     scrollOffset = Math.min(lines.length - 1, scrollOffset + 1);
            else if (matchesKey(data, Key.pageUp))   scrollOffset = Math.max(0, scrollOffset - 10);
            else if (matchesKey(data, Key.pageDown)) scrollOffset = Math.min(lines.length - 1, scrollOffset + 10);
            else if (matchesKey(data, Key.escape))   { done(); return; }
            tui.requestRender();
          },
        };
      });
    },
  });

  // ── /reject ───────────────────────────────────────────────────────────
  // 1. Capture reason → system.md + learnings
  // 2. Restore checkpoint (JJ op log picker or git file snapshot picker)
  // 3. Retry with reason prepended

  pi.registerCommand("reject", {
    description: "Reject the agent's last changes, restore a checkpoint, and optionally retry",
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd;

      // Step 1 — capture reason
      const reason = await ctx.ui.input(
        "What went wrong?",
        "e.g. never modify the ValidateToken signature"
      );

      if (reason?.trim()) {
        appendToSystemMd(reason.trim());
        appendToLearnings(reason.trim());
        ctx.ui.notify("Rule saved to system.md — agent will remember this", "info");
      }

      // Step 2 — restore checkpoint
      if (useJJ) {
        // ── JJ path ──────────────────────────────────────────────────
        // Both options use jj op restore {id} — no jj undo, no undo cycle possible.
        // "Previous checkpoint" pre-selects ops[1] (before last agent write).
        // "Choose checkpoint" shows the full picker.
        const ops = jjOpLog(cwd);

        if (ops.length > 1) {
          const restoreChoice = await ctx.ui.select(
            "Restore files?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from history",
              "Keep current files",
            ]
          );

          if (restoreChoice === "Previous checkpoint — undo last agent turn") {
            // ops[0] = current state, ops[1] = before last agent write
            try {
              execSync(`jj op restore ${ops[1].id}`, { cwd });
              syncChanges(cwd);
              refreshWidget();
              ctx.ui.notify(
                `Restored to previous checkpoint (${ops[1].ago})`,
                "info"
              );
            } catch (e: any) {
              ctx.ui.notify(`Restore failed: ${e.message}`, "error");
            }

          } else if (restoreChoice === "Choose checkpoint — pick from history") {
            // Skip ops[0] (current state) — show ops[1] onward
            const pickable = ops.slice(1);
            const labels   = pickable.map(op => checkpointLabel(op));

            const pick = await ctx.ui.select("Restore to which checkpoint?", labels);
            if (pick != null) {
              const chosen = pickable[labels.indexOf(pick)];
              try {
                execSync(`jj op restore ${chosen.id}`, { cwd });
                syncChanges(cwd);
                refreshWidget();
                ctx.ui.notify(
                  `Restored to checkpoint: ${checkpointLabel(chosen)}`,
                  "info"
                );
              } catch (e: any) {
                ctx.ui.notify(`Restore failed: ${e.message}`, "error");
              }
            }
          }
          // "Keep current files" → fall through
        }
      } else {
        // ── Git fallback path ─────────────────────────────────────────
        const checkpoints = listGitCheckpoints(cwd, currentSessionId);

        if (checkpoints.length > 0) {
          const restoreChoice = await ctx.ui.select(
            "Restore files?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from list",
              "Keep current files",
            ]
          );

          if (restoreChoice === "Previous checkpoint — undo last agent turn") {
            gitRestoreCheckpoint(cwd, checkpoints[0].dir);
            syncChanges(cwd);
            refreshWidget();
            ctx.ui.notify("Restored to previous checkpoint", "info");
          } else if (restoreChoice === "Choose checkpoint — pick from list") {
            const labels = checkpoints.map(cp => {
              const t = new Date(cp.meta.timestamp).toLocaleTimeString();
              return `#${cp.n} · ${t} · ${cp.meta.prompt || "—"} · ${cp.meta.files.slice(0, 3).join(", ")}`;
            });
            const pick = await ctx.ui.select("Choose checkpoint to restore:", labels);
            if (pick != null) {
              const chosen = checkpoints[labels.indexOf(pick)];
              gitRestoreCheckpoint(cwd, chosen.dir);
              syncChanges(cwd);
              refreshWidget();
              ctx.ui.notify(`Restored checkpoint #${chosen.n}`, "info");
            }
          }
        }
      }

      // Step 3 — retry
      const retry = await ctx.ui.confirm(
        "Retry?",
        "Resend your last prompt with the rejection reason as context."
      );

      if (!retry) return;

      const retryPrompt = reason?.trim()
        ? `Previous attempt was rejected: "${reason.trim()}"\n\n${lastUserPrompt}`
        : lastUserPrompt;

      if (!retryPrompt.trim()) {
        ctx.ui.notify("No previous prompt found — please retype your task", "warning");
        return;
      }

      await pi.sendUserMessage(retryPrompt);
    },
  });

  // ── /reset ────────────────────────────────────────────────────────────
  // JJ: describe the working-copy commit (give it a real name before pushing)
  // Git: clear tracker + checkpoint folder

  pi.registerCommand("reset", {
    description: useJJ
      ? "Describe the current JJ change and clear the tracker"
      : "Clear the change tracker and checkpoints (run after git commit)",
    handler: async (_args, ctx) => {
      if (useJJ) {
        const desc = await ctx.ui.input(
          "Describe this change (used as commit message):",
          "e.g. add refresh token to auth handler"
        );
        if (desc?.trim()) {
          try {
            execSync(`jj describe -m "${desc.trim().replace(/"/g, '\\"')}"`, { cwd: ctx.cwd });
            ctx.ui.notify(`Change described: "${desc.trim()}"`, "info");
          } catch (e: any) {
            ctx.ui.notify(`jj describe failed: ${e.message}`, "error");
          }
        }
      } else {
        // Delete git checkpoint folder for this session
        const d = sessionCheckpointDir(ctx.cwd, currentSessionId);
        if (existsSync(d)) rmSync(d, { recursive: true, force: true });
        gitCheckpointCount = 0;
        gitCurrentCheckpointDir = "";
      }

      changedFiles.clear();
      refreshWidget();
      ctx.ui.notify("Tracker cleared", "info");
    },
  });

}

// ── Helpers ────────────────────────────────────────────────────────────

function appendToSystemMd(rule: string) {
  const p = join(process.cwd(), ".context/memory/system.md");
  if (!existsSync(p)) return;
  let content = readFileSync(p, "utf-8");
  const bullet = `- ${rule}`;
  content = content.includes("## Learned Rules")
    ? content.replace("## Learned Rules", `## Learned Rules\n${bullet}`)
    : content.trimEnd() + `\n\n## Learned Rules\n${bullet}\n`;
  writeFileSync(p, content);
}

function appendToLearnings(reason: string) {
  const p = join(process.cwd(), ".context/learnings/code-review.md");
  mkdirSync(dirname(p), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\n`;
  writeFileSync(p, (existsSync(p) ? readFileSync(p, "utf-8") : "") + entry);
}
```

---

## Getting Started with JJ

JJ setup is now handled automatically by `/vazir-init` — you don't need to run any JJ commands manually. When you run `/vazir-init` in a project:

1. Vazir checks if JJ is installed
2. If not, offers to let the agent install it or shows the install page
3. If installed, runs `jj git init --colocate` and `jj bookmark track main@origin`
4. Adds `.jj/` to `.gitignore` automatically

If you want to set up JJ manually before running `/vazir-init`:

```bash
brew install jj                  # macOS
jj git init --colocate           # in your project root
jj bookmark track main@origin    # track the default branch
```

JJ is optional. If JJ is not installed and the user skips it, Vazir falls back to the git file-snapshot checkpoint system silently with identical UX.

---

## No `/approve` Command

There is no `/approve` in Vazir. This is intentional.

With JJ, accepting the agent's work is just normal VCS workflow:

```
happy with changes?
      ↓
/reset → jj describe -m "add refresh token"   ← name the change
      ↓
jj git push --bookmark feature-name           ← share it
```

The approve/reject gate was the old sandbox model. JJ's operation log means files are already real and fully recoverable — there's nothing to "approve into existence." You either keep going, describe and push, or `/reject` to restore a checkpoint.

---

## Skill Files

Unchanged from v3.1.

### `.pi/skills/vazir-base.md`

```markdown
---
name: vazir-base
description: Vazir baseline constraints — always injected into the system prompt
automatic: true
---

# Vazir Constraints

- Use the built-in `write` and `edit` tools. Write directly to real project files.
- If unsure which files to modify, ask — do not guess.
- When finished, state clearly what was changed and stop.
- The user reviews changes via the tracker widget below the editor.
```

---

## `.context/` Folder Contract

**Three files the agent sees every turn:**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `.context/memory/context-map.md` | `/vazir-init` (step 5+9) | User manually | 150 tokens max. LLM-drafted on first init. |
| `.context/memory/system.md` | `/vazir-init` (step 6) | `/reject` appends, `/consolidate` cleans | Rules + Learned Rules. Auto-consolidated. |
| `.context/memory/index.md` | `/vazir-init` (step 10) | `agent_end` zero-token patches + lazy LLM descriptions | Always generated. Structural updates are free. |

**Also written by Vazir:**

| File | Created by | Updated by | Notes |
|---|---|---|---|
| `AGENTS.md` | `/vazir-init` (step 8) | User manually | Cross-framework. Free-form. |
| `.context/learnings/code-review.md` | `/reject` | `/reject` appends | Rejection audit trail. Append-only. |
| `.context/settings/project.json` | `/vazir-init` (step 7) | User manually | `project_name`, `model_tier`. |

```
[project root]/
├── AGENTS.md                        ← Free-form. Cross-framework. Created by /vazir-init.
├── .jj/                             ← JJ metadata. In .gitignore.
└── .context/
    ├── memory/
    │   ├── context-map.md           ← LLM-drafted at init. 150 tokens max. Edit manually.
    │   ├── system.md                ← Rules + ## Learned Rules. Auto-consolidated.
    │   └── index.md                 ← Always generated. Zero-token patches on agent_end.
    ├── checkpoints/                 ← Git fallback only. Empty when using JJ.
    ├── learnings/
    │   └── code-review.md           ← Rejection audit trail. Append-only.
    └── settings/
        └── project.json             ← project_name, model_tier.
```

---

## Build Order

**Days 1–2:** `/vazir-init` — full setup  
Run `/vazir-init`. Verify all 11 checklist steps complete. Verify JJ paths (install + skip). Check `index.md` generated with real descriptions. Check `context-map.md` drafted. Fill in anything the LLM got wrong.

**Days 3–4:** Widget + `/diff`  
Verify `jj diff --stat` parsing. Verify inline `jj diff` scrolls cleanly.

**Days 5–6:** Auto-describe + zero-token index updates  
Run a task. After `agent_end`, verify `jj log` shows the prompt as the commit description. Modify a file, delete a file, add a new file — verify `index.md` updates correctly with no LLM call. Verify new files show `(undescribed)`.

**Days 7–8:** `/reject` JJ checkpoint flow  
Reject something. Verify "Previous checkpoint" uses `jj op restore ops[1].id`. Test picker labels show user prompts. Verify retry works.

**Days 9–10:** `/consolidate` + lazy descriptions  
Add several rejections. Run `/consolidate`. Verify diff preview. Verify `(undescribed)` files get described during consolidation. Accept and check `system.md` + `index.md`.

**Days 11–12:** Automatic consolidation  
Force compaction. Verify silent consolidation + lazy descriptions fire together.

**Days 13–14:** Git fallback  
Test on a project without JJ. Verify identical UX.

**Days 15–30:** Real use  
Track rejection rate. Track model-swap. Watch `system.md` coherence.

---

## Known Limitations vs Full PRD

| Feature | POC (JJ path) | POC (Git fallback) | Full Product |
|---|---|---|---|
| Checkpoint completeness | Full — JJ snapshots everything | Partial — bash not captured | Atomic sandbox with pre-accept lint |
| Diff view | `jj diff` inline terminal | `git diff` inline terminal | CM6 MergeView side-by-side |
| History navigation | `jj op log` — complete history | `.context/checkpoints/` | Full timeline UI |
| Rule consolidation | LLM on compaction/shutdown + `/consolidate` | Same | Rust background process |
| Index maintenance | Zero-token structural + lazy LLM descriptions | Manual | Rust watcher, instant |
| Context injection | `before_agent_start` | Same | ContextProfile per call type |
| context-map.md | LLM-drafted at init, user-maintained | Same | Auto-updated by Rust |
| Desktop UI | Terminal | Terminal | Tauri + CodeMirror 6 |

Everything in `.context/` is identical and portable to the full product.

---

## Transition Point

Move to full product when:
1. Rejection rate visibly trends down across 20 tasks
2. Model-swap test passes — Haiku with mature `.context/` matches Sonnet cold
3. You miss things the terminal can't give — side-by-side diff, inline linting, onboarding UI

---

*Vazir POC Spec v3.6 — Three new automations added. (1) Zero-token auto-describe: `agent_end` calls `jj describe -m lastUserPrompt` — readable `jj log` history with no effort. (2) Zero-token `index.md` structural patches: deleted/renamed files removed on `agent_end`, new files get `(undescribed)` placeholder — no LLM needed. (3) Lazy LLM descriptions: `(undescribed)` files batch-described during `/consolidate` and `session_shutdown`, piggybacking on existing triggers. The `/vazir-init` order now guarantees the `.context/` bootstrap and `index.md` generation happen before JJ setup, so a JJ failure cannot block the mandatory files.*
