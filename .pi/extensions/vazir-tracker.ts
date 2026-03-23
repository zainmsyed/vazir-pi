import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface FileInfo {
  file: string;
  status: string;
  added: number;
  removed: number;
}

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
let useJJ = false;
let currentSessionId = "";

// ── JJ helpers ─────────────────────────────────────────────────────────

function detectJJ(cwd: string): boolean {
  try {
    childProcess.execSync("jj root", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Maps jj op IDs to the user prompt that triggered that agent turn
const jjOpPromptMap = new Map<string, string>();

function jjOpLog(cwd: string, limit = 15): Array<{ id: string; description: string; ago: string }> {
  try {
    const raw = childProcess.execSync(
      `jj op log --no-graph --limit ${limit} --template 'id.short(8) ++ "||" ++ description ++ "||" ++ time.start().ago() ++ "\\n"'`,
      { cwd, encoding: "utf-8" },
    ).trim();
    return raw.split("\n").filter(Boolean).map((line: string) => {
      const [id, description, ago] = line.split("||");
      return { id: id.trim(), description: description.trim(), ago: ago.trim() };
    });
  } catch {
    return [];
  }
}

function checkpointLabel(op: { id: string; description: string; ago: string }): string {
  const prompt = jjOpPromptMap.get(op.id);
  const label = prompt ? prompt.slice(0, 50) : op.description;
  return `${op.ago} · ${label}`;
}

function jjDiffStat(cwd: string): string {
  try {
    return childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function jjDiffFile(cwd: string, file: string): string {
  try {
    return childProcess.execSync(`jj diff --no-color -- "${file}"`, { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

function jjHasChanges(cwd: string): boolean {
  try {
    return childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim() !== "";
  } catch {
    return false;
  }
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

// ── Git helpers ────────────────────────────────────────────────────────

function syncFromGit(cwd: string) {
  try {
    const statusOut = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    const statusMap = new Map<string, string>();

    for (const line of statusOut.split("\n")) {
      if (line.length < 4) continue;
      const xy = line.slice(0, 2);
      const file = line.slice(3).trim();
      let status: string;
      if (xy.includes("M")) status = "M";
      else if (xy.includes("A")) status = "A";
      else if (xy.includes("D")) status = "D";
      else if (xy.includes("?")) status = "?";
      else status = xy.trim() || "~";
      statusMap.set(file, status);
    }

    let statOut = "";
    try {
      statOut = childProcess.execSync("git diff --stat HEAD", { cwd, encoding: "utf-8" }).trim();
    } catch {
      statOut = "";
    }
    const statMap = new Map<string, { added: number; removed: number }>();
    for (const line of statOut.split("\n")) {
      const m = line.match(/^\s*(.+?)\s+\|\s+\d+\s+([+-]*)/);
      if (!m) continue;
      statMap.set(m[1].trim(), {
        added: (m[2].match(/\+/g) || []).length,
        removed: (m[2].match(/-/g) || []).length,
      });
    }

    changedFiles.clear();
    for (const [file, status] of statusMap) {
      let added = 0, removed = 0;
      if (status === "?" || (status === "A" && !statMap.has(file))) {
        try {
          added = fs.readFileSync(path.join(cwd, file), "utf-8").split("\n").length;
        } catch { /* ignore */ }
      } else {
        const s = statMap.get(file);
        if (s) { added = s.added; removed = s.removed; }
      }
      changedFiles.set(file, { file, status, added, removed });
    }
  } catch {
    /* not a git repo */
  }
}

function syncFromJJ(cwd: string) {
  changedFiles.clear();
  try {
    const stat = jjDiffStat(cwd);
    if (!stat) return;
    for (const line of stat.split("\n")) {
      const m = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]*)/);
      if (!m) continue;
      const file = m[1].trim();
      const plusMinus = m[3];
      changedFiles.set(file, {
        file,
        status: "M",
        added: (plusMinus.match(/\+/g) || []).length,
        removed: (plusMinus.match(/-/g) || []).length,
      });
    }
  } catch { /* ignore */ }
}

function syncChanges(cwd: string) {
  if (useJJ) syncFromJJ(cwd);
  else syncFromGit(cwd);
}

function isGitClean(cwd: string): boolean {
  try {
    return childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8" }).trim() === "";
  } catch {
    return true;
  }
}

// ── Git fallback checkpoint helpers ────────────────────────────────────

function checkpointsRoot(cwd: string) { return path.join(cwd, ".context/checkpoints"); }
function sessionCheckpointDir(cwd: string, id: string) { return path.join(checkpointsRoot(cwd), id); }

function gitSnapshotFile(cwd: string, filePath: string, checkpointDir: string) {
  const abs = path.join(cwd, filePath);
  if (!fs.existsSync(abs)) return;
  const dest = path.join(checkpointDir, "files", filePath);
  fs.mkdirSync(parentDirectory(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
}

function gitRestoreCheckpoint(cwd: string, checkpointDir: string) {
  const metaPath = path.join(checkpointDir, "meta.json");
  if (!fs.existsSync(metaPath)) return;
  const meta: CheckpointMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  for (const f of meta.files) {
    const src = path.join(checkpointDir, "files", f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cwd, f));
  }
  for (const f of meta.newFiles) {
    const abs = path.join(cwd, f);
    if (fs.existsSync(abs)) fs.rmSync(abs);
  }
}

function listGitCheckpoints(cwd: string, sessionId: string) {
  const dir = sessionCheckpointDir(cwd, sessionId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .map((entry: { name: string }) => entry.name)
    .map((n: string) => parseInt(n)).filter((n: number) => !isNaN(n)).sort((a: number, b: number) => b - a)
    .map((n: number) => {
      const d = path.join(dir, String(n));
      const mp = path.join(d, "meta.json");
      if (!fs.existsSync(mp)) return null;
      return { dir: d, meta: JSON.parse(fs.readFileSync(mp, "utf-8")) as CheckpointMeta, n };
    }).filter(Boolean) as Array<{ dir: string; meta: CheckpointMeta; n: number }>;
}

function findOrphanedGitSessions(cwd: string, currentId: string): string[] {
  const root = checkpointsRoot(cwd);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).map((entry: { name: string }) => entry.name).filter((id: string) => id !== currentId);
}

// ── refreshWidget ──────────────────────────────────────────────────────

function refreshWidget() { widgetTui?.requestRender(); }

// ── Helpers for system.md + learnings ──────────────────────────────────

function appendToSystemMd(cwd: string, rule: string) {
  const p = path.join(cwd, ".context/memory/system.md");
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, "utf-8");
  const bullet = `- ${rule}`;
  content = content.includes("## Learned Rules")
    ? content.replace("## Learned Rules", `## Learned Rules\n${bullet}`)
    : content.trimEnd() + `\n\n## Learned Rules\n${bullet}\n`;
  fs.writeFileSync(p, content);
}

function appendToLearnings(cwd: string, reason: string) {
  const p = path.join(cwd, ".context/learnings/code-review.md");
  fs.mkdirSync(parentDirectory(p), { recursive: true });
  const entry = `\n---\n${new Date().toISOString()}\n${reason}\n`;
  fs.writeFileSync(p, (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "") + entry);
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Track user prompts for retry flow
  pi.on("input", async (event: { text?: string }) => {
    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  // ── session_start ────────────────────────────────────────────────────

  pi.on("session_start", async (_event: unknown, ctx: { cwd: string; hasUI: boolean; sessionManager?: { getSessionFile?: () => string } | undefined; ui: any }) => {
    const cwd = ctx.cwd;
    useJJ = detectJJ(cwd);

    // Extract session ID for git fallback
    const sessionFile = (ctx.sessionManager as any)?.getSessionFile?.() ?? "";
    const match = sessionFile.match(/_([a-f0-9]+)\.jsonl$/);
    currentSessionId = match ? match[1] : Date.now().toString(16);

    // ── Recovery check ──────────────────────────────────────────────
    if (useJJ) {
      if (jjHasChanges(cwd)) {
        ctx.ui.notify(
          "Work in progress from previous session detected. Use /reject to restore an earlier state.",
          "warning",
        );
      }
    } else {
      const orphans = findOrphanedGitSessions(cwd, currentSessionId);
      if (orphans.length > 0) {
        if (!isGitClean(cwd)) {
          ctx.ui.notify(
            "Unfinished work from a previous session detected. Use /reject to restore a checkpoint.",
            "warning",
          );
        } else {
          for (const id of orphans) {
            const d = sessionCheckpointDir(cwd, id);
            if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
          }
        }
      }
    }

    // ── Mount widget ─────────────────────────────────────────────────
    if (!ctx.hasUI) return;
    syncChanges(cwd);

    ctx.ui.setWidget("vazir-tracker", (tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }) => {
      widgetTui = tui;
      return {
        render(): string[] {
          if (changedFiles.size === 0) return [];

          const parts: string[] = [];
          for (const [, f] of changedFiles) {
            let statusLabel: string;
            switch (f.status) {
              case "M": statusLabel = "M"; break;
              case "A": statusLabel = "A"; break;
              case "D": statusLabel = "D"; break;
              default: statusLabel = "?"; break;
            }
            parts.push(`${statusLabel} ${f.file} +${f.added}/-${f.removed}`);
          }

          const vcs = useJJ ? " · jj" : "";
          const hint = " · /diff · /reject · /reset";
          const width = 120;
          const line = (" " + parts.join("   ") + vcs + hint).slice(0, width);
          return [line];
        },
        invalidate() {},
        dispose() { widgetTui = null; },
      };
    }, { placement: "belowEditor" });
  });

  // ── Git fallback: snapshot before agent writes ────────────────────────

  let gitCurrentCheckpointDir = "";
  let gitCheckpointCount = 0;

  pi.on("before_agent_start", async (_event: unknown, ctx: { cwd: string }) => {
    if (useJJ) return;

    gitCheckpointCount++;
    const dir = path.join(sessionCheckpointDir(ctx.cwd, currentSessionId), String(gitCheckpointCount));
    fs.mkdirSync(path.join(dir, "files"), { recursive: true });
    const meta: CheckpointMeta = {
      timestamp: new Date().toISOString(),
      prompt: lastUserPrompt.slice(0, 60),
      files: [],
      newFiles: [],
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    gitCurrentCheckpointDir = dir;
  });

  pi.on("tool_call", async (event: { toolName?: string; input?: { path?: string } }, ctx: { cwd: string }) => {
    if (useJJ) return;
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = (event.input as any)?.path;
      if (filePath && gitCurrentCheckpointDir) {
        // Snapshot the file before the tool modifies it
        gitSnapshotFile(ctx.cwd, filePath, gitCurrentCheckpointDir);

        // Track if the file is new (doesn't exist yet)
        const isNew = !fs.existsSync(path.join(ctx.cwd, filePath));

        // Update meta
        const mp = path.join(gitCurrentCheckpointDir, "meta.json");
        const meta: CheckpointMeta = JSON.parse(fs.readFileSync(mp, "utf-8"));
        if (!meta.files.includes(filePath)) {
          meta.files.push(filePath);
        }
        if (isNew && !meta.newFiles.includes(filePath)) {
          meta.newFiles.push(filePath);
        }
        fs.writeFileSync(mp, JSON.stringify(meta, null, 2));
      }
    }
  });

  // Sync widget after any file-writing tool
  pi.on("tool_result", async (event: { toolName?: string }, ctx: { cwd: string }) => {
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "bash") {
      syncChanges(ctx.cwd);
      refreshWidget();

      // Record current jj op ID → user prompt for human-readable checkpoint labels
      if (useJJ) {
        try {
          const opId = childProcess.execSync(
            `jj op log --no-graph --limit 1 --template 'id.short(8)'`,
            { cwd: ctx.cwd, encoding: "utf-8" },
          ).trim();
          if (opId && lastUserPrompt) jjOpPromptMap.set(opId, lastUserPrompt);
        } catch { /* ignore */ }
      }
    }
  });

  // ── /diff ─────────────────────────────────────────────────────────────

  pi.registerCommand("diff", {
    description: "Show inline terminal diff for a changed file",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      syncChanges(ctx.cwd);
      if (changedFiles.size === 0) {
        ctx.ui.notify("No changed files", "info");
        return;
      }

      const files = [...changedFiles.values()];
      let chosen: FileInfo;

      if (files.length === 1) {
        chosen = files[0];
      } else {
        const labels = files.map(f => `${f.status} ${f.file}  +${f.added}/-${f.removed}`);
        const pick = await ctx.ui.select("Diff which file?", labels);
        if (pick == null) return;
        chosen = files[labels.indexOf(pick)];
      }

      let diffText: string;
      try {
        if (useJJ) {
          diffText = jjDiffFile(ctx.cwd, chosen.file);
        } else if (chosen.status === "?") {
          const content = fs.readFileSync(path.join(ctx.cwd, chosen.file), "utf-8");
          diffText = content.split("\n").map((l: string) => `+ ${l}`).join("\n");
        } else {
          diffText = childProcess.execSync(
            `git diff --no-color HEAD -- "${chosen.file}"`,
            { cwd: ctx.cwd, encoding: "utf-8" },
          );
        }
      } catch (e: any) {
        ctx.ui.notify(`Failed to get diff: ${e.message}`, "error");
        return;
      }

      if (!diffText.trim()) {
        ctx.ui.notify("No diff output", "info");
        return;
      }

      const lines = diffText.split("\n");
      let scrollOffset = 0;

      await ctx.ui.custom((tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }, _kb: unknown, done: () => void) => {
        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
            const header = ` ${chosen.status} ${chosen.file}  +${chosen.added}/-${chosen.removed}  ↑↓ scroll · esc close`;
            const body = lines
              .slice(scrollOffset, scrollOffset + visibleRows)
              .map(l => l.slice(0, width));
            return [header.slice(0, width), ...body];
          },
          invalidate() {},
          handleInput(data: string) {
            if (matchesKey(data, Key.up)) scrollOffset = Math.max(0, scrollOffset - 1);
            else if (matchesKey(data, Key.down)) scrollOffset = Math.min(lines.length - 1, scrollOffset + 1);
            else if (matchesKey(data, Key.pageUp)) scrollOffset = Math.max(0, scrollOffset - 10);
            else if (matchesKey(data, Key.pageDown)) scrollOffset = Math.min(lines.length - 1, scrollOffset + 10);
            else if (matchesKey(data, Key.escape)) { done(); return; }
            tui.requestRender();
          },
        };
      });
    },
  });

  // ── /reject ───────────────────────────────────────────────────────────

  pi.registerCommand("reject", {
    description: "Reject the agent's last changes, restore a checkpoint, and optionally retry",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      const cwd = ctx.cwd;
      const rejectionReason = await ctx.ui.input(
        "What went wrong?",
        "e.g. never modify the ValidateToken signature",
      );

      const trimmedReason = rejectionReason?.trim() ?? "";

      if (trimmedReason) {
        appendToSystemMd(cwd, trimmedReason);
        appendToLearnings(cwd, trimmedReason);
        ctx.ui.notify("Rule saved to system.md — agent will remember this", "info");
      }

      const retry = await ctx.ui.confirm(
        "Retry?",
        "Resend your last prompt with the rejection reason as context.",
      );

      if (retry) {
        const retryPrompt = trimmedReason
          ? `Previous attempt was rejected: "${trimmedReason}"\n\n${lastUserPrompt}`
          : lastUserPrompt;

        if (!retryPrompt.trim()) {
          ctx.ui.notify("No previous prompt found — please retype your task", "warning");
          return;
        }

        await pi.sendUserMessage(retryPrompt);
        return;
      }

      // No retry: offer checkpoint restore now.
      if (useJJ) {
        // ── JJ path ─────────────────────────────────────────────────
        const ops = jjOpLog(cwd);

        if (ops.length > 1) {
          const restoreChoice = await ctx.ui.select(
            "Restore checkpoint?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from history",
              "Keep current files",
            ],
          );

          let restored = false;

          if (restoreChoice === "Previous checkpoint — undo last agent turn") {
            try {
              childProcess.execSync(`jj op restore ${ops[1].id}`, { cwd });
              restored = true;
              ctx.ui.notify(`Restored to previous checkpoint (${ops[1].ago})`, "info");
            } catch (e: any) {
              ctx.ui.notify(`Restore failed: ${e.message}`, "error");
            }
          } else if (restoreChoice === "Choose checkpoint — pick from history") {
            const pickable = ops.slice(1);
            const labels = pickable.map(op => checkpointLabel(op));

            const pick = await ctx.ui.select("Restore to which checkpoint?", labels);
            if (pick != null) {
              const chosen = pickable[labels.indexOf(pick)];
              try {
                childProcess.execSync(`jj op restore ${chosen.id}`, { cwd });
                restored = true;
                ctx.ui.notify(`Restored to checkpoint: ${checkpointLabel(chosen)}`, "info");
              } catch (e: any) {
                ctx.ui.notify(`Restore failed: ${e.message}`, "error");
              }
            }
          }

          if (restored && trimmedReason) {
            appendToSystemMd(cwd, trimmedReason);
            appendToLearnings(cwd, trimmedReason);
          }
          syncChanges(cwd);
          refreshWidget();
        } else {
          ctx.ui.notify("No checkpoints available to restore", "info");
        }
      } else {
        // ── Git fallback path ────────────────────────────────────────
        const checkpoints = listGitCheckpoints(cwd, currentSessionId);

        if (checkpoints.length > 0) {
          const restoreChoice = await ctx.ui.select(
            "Restore checkpoint?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from list",
              "Keep current files",
            ],
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
        } else {
          ctx.ui.notify("No checkpoints available to restore", "info");
        }
      }
    },
  });

  // ── /checkpoint ─────────────────────────────────────────────────────

  pi.registerCommand("checkpoint", {
    description: "Show checkpoint picker and optionally restore one",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      const cwd = ctx.cwd;

      if (useJJ) {
        const ops = jjOpLog(cwd);
        if (ops.length > 1) {
          const restoreChoice = await ctx.ui.select(
            "Restore checkpoint?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from history",
              "Keep current files",
            ],
          );

          if (restoreChoice === "Previous checkpoint — undo last agent turn") {
            try {
              childProcess.execSync(`jj op restore ${ops[1].id}`, { cwd });
              ctx.ui.notify(`Restored to previous checkpoint (${ops[1].ago})`, "info");
            } catch (e: any) {
              ctx.ui.notify(`Restore failed: ${e.message}`, "error");
            }
          } else if (restoreChoice === "Choose checkpoint — pick from history") {
            const pickable = ops.slice(1);
            const labels = pickable.map(op => checkpointLabel(op));
            const pick = await ctx.ui.select("Restore to which checkpoint?", labels);
            if (pick != null) {
              const chosen = pickable[labels.indexOf(pick)];
              try {
                childProcess.execSync(`jj op restore ${chosen.id}`, { cwd });
                ctx.ui.notify(`Restored to checkpoint: ${checkpointLabel(chosen)}`, "info");
              } catch (e: any) {
                ctx.ui.notify(`Restore failed: ${e.message}`, "error");
              }
            }
          }

          syncChanges(cwd);
          refreshWidget();
        } else {
          ctx.ui.notify("No checkpoints available to restore", "info");
        }
      } else {
        const checkpoints = listGitCheckpoints(cwd, currentSessionId);
        if (checkpoints.length > 0) {
          const restoreChoice = await ctx.ui.select(
            "Restore checkpoint?",
            [
              "Previous checkpoint — undo last agent turn",
              "Choose checkpoint — pick from list",
              "Keep current files",
            ],
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
        } else {
          ctx.ui.notify("No checkpoints available to restore", "info");
        }
      }
    },
  });

  // ── /reset ────────────────────────────────────────────────────────────

  pi.registerCommand("reset", {
    description: "Describe the current JJ change or clear git fallback checkpoints",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      if (useJJ) {
        const desc = await ctx.ui.input(
          "Describe this change (used as commit message):",
          "e.g. add refresh token to auth handler",
        );
        if (desc?.trim()) {
          try {
            childProcess.execSync(`jj describe -m ${JSON.stringify(desc.trim())}`, { cwd: ctx.cwd });
            ctx.ui.notify(`Change described: "${desc.trim()}"`, "info");
          } catch (e: any) {
            ctx.ui.notify(`jj describe failed: ${e.message}`, "error");
          }
        }
      } else {
        const d = sessionCheckpointDir(ctx.cwd, currentSessionId);
        if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
        gitCheckpointCount = 0;
        gitCurrentCheckpointDir = "";
      }

      changedFiles.clear();
      refreshWidget();
      ctx.ui.notify("Tracker cleared", "info");
    },
  });
}
