# Vazir POC Spec — pi-mono Implementation
**Version:** 3.4  
**Base:** `@mariozechner/pi-coding-agent` extension system  
**Goal:** Validate the context engine thesis before building the full Rust/Tauri product  
**Timeline:** 2–3 weeks to working CLI  

> **v3.4 changes from v3.3:** Refined the JJ `/reject` flow. Replaced `jj undo` with `jj op restore ops[1].id` for the "previous checkpoint" fast path — avoids the undo/redo cycle trap where undoing an undo sends you back to the bad state. Both restore options now use the same `jj op restore {id}` primitive, just with a pre-selected ID for the fast path. All "operation" language in the UI replaced with "checkpoint" — users see a checkpoint picker, never JJ internals. Checkpoint labels now show the user's original prompt + timestamp, making the picker human-readable.

> **v3.3 changes from v3.2:** JJ (Jujutsu) replaces the custom `.context/checkpoints/` system entirely when detected. JJ auto-snapshots on every agent write/edit/bash. `jj op log` becomes the checkpoint list. Git file-snapshot system kept as fallback.

> **v3.2 changes from v3.1:** Replaced `git checkout .` rollback with a custom file snapshot checkpoint system.

> **v3.1 changes from v3.0:** Added automatic `index.md` generation to `/vazir-init`.

> **v3.0 changes from v2.4:** Major simplification. Two extension files, one skill. `/reject` writes to `system.md` immediately. Compaction-based LLM consolidation for long sessions.

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
"Restore checkpoint?"
  "Previous checkpoint" → jj op restore {ops[1].id}  ← pre-selected, instant
  "Choose checkpoint"   → SelectList picker showing user prompts + timestamps
      ↓
jj op restore {id} — entire repo state restored, including bash side effects
No undo/redo cycle possible — every restore is a new forward operation in the log
widget syncs from jj diff
      ↓
"Retry?" → resend original prompt + rejection reason
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
"Restore checkpoint?"
  JJ:  "Previous checkpoint" → jj op restore ops[1].id
       "Choose checkpoint"   → picker showing prompts + timestamps
  Git: file snapshot picker
      ↓
"Retry?" → pi.sendUserMessage("Previous attempt rejected: [reason]\n\n[original task]")
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

Unchanged from v3.1. Full code in previous spec. Three responsibilities:
- Inject `context-map.md` + `system.md` + `index.md` before every agent turn
- Run LLM consolidation on compaction and shutdown
- `/vazir-init` — bootstrap `.context/`, generate `index.md` via LLM

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

Add to `/vazir-init` output and README:

```bash
# Install JJ (macOS)
brew install jj

# Enable JJ in an existing git repo (colocated — git still works normally)
cd your-project
jj git init --colocate

# Verify — your repo is still a git repo, just with a .jj/ folder alongside .git/
git log   # still works
jj log    # also works — shows the same history plus working copy as a commit
```

Add to `.gitignore`:
```
.jj/
```

JJ is optional. If `jj root` fails on `session_start`, Vazir falls back to the git checkpoint system silently. The user sees the same commands and same UX.

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

| File | Purpose | Notes |
|---|---|---|
| `.context/memory/context-map.md` | Project structure, key rules, fragile areas | Keep under 150 tokens. Distilled from AGENTS.md. |
| `.context/memory/system.md` | Hard rules + `## Learned Rules` section | Learned rules appended on every `/reject`, consolidated on compaction. |
| `.context/memory/index.md` | One-line description of every source file | Auto-generated by `/vazir-init`. Review and correct after init. |

```
[project root]/
├── AGENTS.md                        ← Write first. Free-form. Cross-framework.
├── .jj/                             ← JJ metadata (add to .gitignore)
└── .context/
    ├── memory/
    │   ├── context-map.md           ← 150 tokens max. Injected every turn.
    │   ├── system.md                ← Rules + Learned Rules. Auto-consolidated.
    │   └── index.md                 ← Auto-generated. One line per file.
    ├── checkpoints/                 ← Git fallback only. Empty when using JJ.
    ├── learnings/
    │   └── code-review.md           ← Rejection audit trail. Append-only.
    └── settings/
        └── project.json
```

---

## Build Order

**Days 1–2:** Install JJ + `/vazir-init`  
`brew install jj`, `jj git init --colocate`, then `/vazir-init`. Review `index.md`. Fill in `context-map.md` and `AGENTS.md`.

**Days 3–4:** Widget + `/diff`  
Verify `jj diff --stat` parsing. Verify inline `jj diff` scrolls cleanly.

**Days 5–6:** `/reject` JJ flow  
Reject something intentionally. Verify `jj undo` restores correctly. Test `jj op log` picker with several operations. Verify rule lands in `system.md`. Verify retry works.

**Days 7–8:** `/reject` git fallback  
Test on a project without JJ. Verify file snapshot checkpoints work. Verify picker shows correct entries.

**Days 9–10:** Session recovery  
Close pi mid-task (dirty working copy). Reopen. Verify JJ path shows warning. Verify git fallback shows checkpoint picker.

**Days 11–13:** Compaction consolidation  
Force a compaction. Verify `system.md` gets cleaned.

**Days 14–30:** Real use  
Track rejection rate. Track model-swap. Watch `system.md` coherence.

---

## Known Limitations vs Full PRD

| Feature | POC (JJ path) | POC (Git fallback) | Full Product |
|---|---|---|---|
| Checkpoint completeness | Full — JJ snapshots everything including bash | Partial — bash side effects not captured | Atomic sandbox with pre-accept lint |
| Diff view | `jj diff` inline terminal | `git diff` inline terminal | CM6 MergeView side-by-side |
| History navigation | `jj op log` — complete op history | `.context/checkpoints/` | Full timeline UI |
| Rule consolidation | LLM call on compaction/shutdown | Same | Rust background process |
| Context injection | `before_agent_start` | Same | ContextProfile per call type |
| Index management | LLM-generated at init | Same | Rust + LLM enrichment, auto-updated |
| Desktop UI | Terminal | Terminal | Tauri + CodeMirror 6 |

Everything in `.context/` is identical and portable to the full product.

---

## Transition Point

Move to full product when:
1. Rejection rate visibly trends down across 20 tasks
2. Model-swap test passes — Haiku with mature `.context/` matches Sonnet cold
3. You miss things the terminal can't give — side-by-side diff, inline linting, onboarding UI

---

*Vazir POC Spec v3.4 — Refined JJ checkpoint flow. `jj undo` replaced with `jj op restore ops[1].id` for the "previous checkpoint" fast path — eliminates undo/redo cycle trap. Both restore options use the same `jj op restore {id}` primitive. All "operation" language replaced with "checkpoint" in the UI. Checkpoint labels show user's original prompt + timestamp instead of JJ internal descriptions. `jjOpPromptMap` stores op ID → prompt mapping after each agent tool result for human-readable picker labels.*
