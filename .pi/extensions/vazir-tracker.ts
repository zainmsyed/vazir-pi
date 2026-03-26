/// <reference path="../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../types/node-runtime-ambient.d.ts" />

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

interface JjCheckpointLabelStore {
  labels: Record<string, string>;
}

interface StoryFrontmatter {
  status: string;
  lastAccessed: string;
  file: string;
  number: number;
}

const JJ_CHECKPOINT_SCAN_LIMIT = 120;
const JJ_CHECKPOINT_MAX_CHOICES = 12;

// ── State ──────────────────────────────────────────────────────────────

const changedFiles = new Map<string, FileInfo>();
let widgetTui: any = null;
let lastUserPrompt = "";
let useJJ = false;
let currentSessionId = "";

// ── Generic helpers ────────────────────────────────────────────────────

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function storiesDir(cwd: string): string {
  return path.join(cwd, ".context", "stories");
}

function complaintsLogPath(cwd: string): string {
  return path.join(cwd, ".context", "complaints-log.md");
}

// ── Story helpers ──────────────────────────────────────────────────────

function parseStoryFrontmatter(filePath: string): StoryFrontmatter | null {
  const content = readIfExists(filePath);
  if (!content) return null;

  const statusMatch = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const lastAccessedMatch = content.match(/^\*\*Last accessed:\*\*\s*(.+)$/m);
  const fileName = path.basename(filePath);
  const numberMatch = fileName.match(/story-(\d+)\.md$/);

  if (!statusMatch || !numberMatch) return null;

  return {
    status: statusMatch[1].trim(),
    lastAccessed: lastAccessedMatch?.[1]?.trim() ?? "",
    file: filePath,
    number: parseInt(numberMatch[1], 10),
  };
}

function listStories(cwd: string): StoryFrontmatter[] {
  const dir = storiesDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name: string) => /^story-\d+\.md$/.test(name))
    .map((name: string) => parseStoryFrontmatter(path.join(dir, name)))
    .filter((s: StoryFrontmatter | null): s is StoryFrontmatter => s !== null);
}

function findActiveStory(cwd: string): StoryFrontmatter | null {
  const stories = listStories(cwd);
  const inProgress = stories.filter(s => s.status === "in-progress");

  if (inProgress.length === 0) return null;
  if (inProgress.length === 1) return inProgress[0];

  // Multiple in-progress: pick most recent last_accessed, break ties by highest number
  inProgress.sort((a, b) => {
    const dateCmp = b.lastAccessed.localeCompare(a.lastAccessed);
    if (dateCmp !== 0) return dateCmp;
    return b.number - a.number;
  });

  return inProgress[0];
}

function nonTerminalStories(cwd: string): StoryFrontmatter[] {
  return listStories(cwd).filter(story => story.status !== "complete" && story.status !== "retired");
}

function updateStoryFrontmatter(
  storyPath: string,
  updates: { status?: StoryFrontmatter["status"]; lastAccessed?: string },
): void {
  const content = readIfExists(storyPath);
  if (!content) return;

  let updated = content;
  if (updates.status) {
    updated = updated.replace(/^[*][*]Status:[*][*]\s*.+$/m, `**Status:** ${updates.status}  `);
  }
  if (updates.lastAccessed) {
    updated = updated.replace(/^[*][*]Last accessed:[*][*]\s*.+$/m, `**Last accessed:** ${updates.lastAccessed}  `);
  }

  if (updated !== content) {
    fs.writeFileSync(storyPath, updated);
  }
}

async function resolveStoryForFix(
  cwd: string,
  ui: any,
): Promise<{ story: StoryFrontmatter | null; reason: "resolved" | "missing" | "cancelled" }> {
  const active = findActiveStory(cwd);
  if (active) {
    return { story: active, reason: "resolved" };
  }

  const candidates = nonTerminalStories(cwd)
    .sort((a, b) => {
      const dateCmp = b.lastAccessed.localeCompare(a.lastAccessed);
      if (dateCmp !== 0) return dateCmp;
      return b.number - a.number;
    });

  if (candidates.length === 0) {
    return { story: null, reason: "missing" };
  }

  if (candidates.length === 1) {
    const selected = candidates[0];
    if (selected.status === "not-started") {
      updateStoryFrontmatter(selected.file, { status: "in-progress", lastAccessed: todayDate() });
      return {
        story: {
          ...selected,
          status: "in-progress",
          lastAccessed: todayDate(),
        },
        reason: "resolved",
      };
    }

    return { story: selected, reason: "resolved" };
  }

  const options = candidates.map(story => `${path.basename(story.file, ".md")} — ${story.status}`);
  const choice = await ui.select(
    "No in-progress story found. Which story should /fix log to? Selecting a not-started story will mark it in-progress.",
    [...options, "Cancel"],
  );

  if (!choice || choice === "Cancel") {
    return { story: null, reason: "cancelled" };
  }

  const index = options.indexOf(choice);
  if (index < 0) {
    return { story: null, reason: "cancelled" };
  }

  const selected = candidates[index];
  if (selected.status === "not-started") {
    updateStoryFrontmatter(selected.file, { status: "in-progress", lastAccessed: todayDate() });
    return {
      story: {
        ...selected,
        status: "in-progress",
        lastAccessed: todayDate(),
      },
      reason: "resolved",
    };
  }

  return { story: selected, reason: "resolved" };
}

function appendToStoryIssues(storyPath: string, description: string): void {
  const content = readIfExists(storyPath);
  if (!content) return;

  const issueEntry = [
    `### /fix — "${description}"`,
    `- **Reported:** ${todayDate()}  `,
    `- **Status:** pending  `,
    `- **Agent note:** —  `,
    `- **Solution:** —`,
    "",
  ].join("\n");

  // Insert after ## Issues heading
  const issuesHeading = "## Issues";
  const issuesIndex = content.indexOf(issuesHeading);
  if (issuesIndex >= 0) {
    const insertPos = issuesIndex + issuesHeading.length;
    const updated = content.slice(0, insertPos) + "\n\n" + issueEntry + content.slice(insertPos);
    fs.writeFileSync(storyPath, updated);
  } else {
    // Append at end if no Issues section
    fs.writeFileSync(storyPath, content.trimEnd() + "\n\n## Issues\n\n" + issueEntry + "\n");
  }
}

function appendToComplaintsLog(cwd: string, storyName: string, description: string): void {
  const logPath = complaintsLogPath(cwd);
  fs.mkdirSync(parentDirectory(logPath), { recursive: true });

  const entry = `${nowISO()} | ${storyName} | "${description}" | status: pending\n`;
  const existing = readIfExists(logPath);
  fs.writeFileSync(logPath, existing.trimEnd() + "\n" + entry);
}

// ── JJ helpers ─────────────────────────────────────────────────────────

function detectJJ(cwd: string): boolean {
  try {
    childProcess.execSync("jj root", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const jjOpPromptMap = new Map<string, string>();

function jjCheckpointLabelsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json");
}

function loadJjCheckpointLabels(cwd: string) {
  jjOpPromptMap.clear();

  const labelsPath = jjCheckpointLabelsPath(cwd);
  if (!fs.existsSync(labelsPath)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(labelsPath, "utf-8")) as Partial<JjCheckpointLabelStore>;
    for (const [opId, label] of Object.entries(parsed.labels ?? {})) {
      if (typeof label === "string" && label.trim()) {
        jjOpPromptMap.set(opId, label.trim());
      }
    }
  } catch {
    /* ignore invalid label store */
  }
}

function saveJjCheckpointLabel(cwd: string, opId: string, prompt: string) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;

  const labelsPath = jjCheckpointLabelsPath(cwd);
  fs.mkdirSync(parentDirectory(labelsPath), { recursive: true });

  let store: JjCheckpointLabelStore = { labels: {} };
  if (fs.existsSync(labelsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(labelsPath, "utf-8")) as Partial<JjCheckpointLabelStore>;
      if (parsed.labels && typeof parsed.labels === "object") {
        store = { labels: { ...parsed.labels } };
      }
    } catch {
      store = { labels: {} };
    }
  }

  const label = trimmedPrompt.slice(0, 80);
  store.labels[opId] = label;
  fs.writeFileSync(labelsPath, JSON.stringify(store, null, 2));
  jjOpPromptMap.set(opId, label);
}

function persistCurrentJjCheckpointLabel(cwd: string, prompt: string) {
  const opId = currentJjOpId(cwd);
  if (opId) saveJjCheckpointLabel(cwd, opId, prompt);
}

function autoDescribeCurrentJjChange(cwd: string, prompt: string) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;

  childProcess.execSync(`jj describe -m ${JSON.stringify(trimmedPrompt.slice(0, 72))}`, {
    cwd,
    stdio: "pipe",
  });
}

function isJjDescribeOperation(op: { description: string }): boolean {
  return op.description.startsWith("describe commit ");
}

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

function isUserVisibleJjCheckpoint(op: { description: string }): boolean {
  return op.description === "snapshot working copy" || op.description === "restore to operation";
}

function fallbackJjCheckpointLabel(op: { description: string }): string {
  if (op.description === "restore to operation") {
    return "Restored checkpoint";
  }
  return "Checkpoint";
}

function checkpointLabel(op: { id: string; description: string; ago: string; label?: string }): string {
  const prompt = op.label ?? jjOpPromptMap.get(op.id);
  const label = prompt ? prompt.slice(0, 50) : fallbackJjCheckpointLabel(op);
  return `${op.ago} · ${label}`;
}

function currentJjOpId(cwd: string): string {
  try {
    return childProcess.execSync(
      `jj op log --no-graph --limit 1 --template 'id.short(8)'`,
      { cwd, encoding: "utf-8" },
    ).trim();
  } catch {
    return "";
  }
}

function currentJjCheckpointId(
  ops: Array<{ id: string; description: string; ago: string }>,
  currentOpId: string,
): string {
  if (ops.length === 0) return "";

  const currentIndex = ops.findIndex(op => op.id === currentOpId);
  if (currentIndex === -1) {
    return isUserVisibleJjCheckpoint(ops[0]) ? ops[0].id : "";
  }

  const currentOp = ops[currentIndex];
  if (isUserVisibleJjCheckpoint(currentOp)) {
    return currentOp.id;
  }

  for (let index = currentIndex + 1; index < ops.length; index++) {
    if (isUserVisibleJjCheckpoint(ops[index])) {
      return ops[index].id;
    }
  }

  return "";
}

function jjCheckpointChoices(cwd: string): Array<{ id: string; description: string; ago: string; label?: string }> {
  loadJjCheckpointLabels(cwd);

  const ops = jjOpLog(cwd, JJ_CHECKPOINT_SCAN_LIMIT);
  if (ops.length <= 1) return [];

  const currentOpId = currentJjOpId(cwd) || ops[0]?.id || "";
  const currentCheckpointId = currentJjCheckpointId(ops, currentOpId);
  const visible = ops
    .map((op, index) => {
      if (op.id === currentOpId || op.id === currentCheckpointId || !isUserVisibleJjCheckpoint(op)) {
        return null;
      }

      const directLabel = jjOpPromptMap.get(op.id);
      const adjacentDescribeLabel = index > 0 && isJjDescribeOperation(ops[index - 1])
        ? jjOpPromptMap.get(ops[index - 1].id)
        : undefined;

      return {
        ...op,
        label: directLabel ?? adjacentDescribeLabel,
      };
    })
    .filter(Boolean) as Array<{ id: string; description: string; ago: string; label?: string }>;

  return visible.slice(0, JJ_CHECKPOINT_MAX_CHOICES);
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

function jjRestoreCheckpoint(cwd: string, opId: string) {
  childProcess.execSync(`jj op restore ${opId}`, { cwd, stdio: "pipe" });
  childProcess.execSync("jj restore --from @-", { cwd, stdio: "pipe" });
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

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // Track user prompts
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
    if (useJJ) loadJjCheckpointLabels(cwd);

    const sessionFile = (ctx.sessionManager as any)?.getSessionFile?.() ?? "";
    const match = sessionFile.match(/_([a-f0-9]+)\.jsonl$/);
    currentSessionId = match ? match[1] : Date.now().toString(16);

    // ── Recovery check ──────────────────────────────────────────────
    if (useJJ) {
      if (jjHasChanges(cwd)) {
        ctx.ui.notify(
          "Work in progress from previous session detected. Use /reset to restore an earlier state.",
          "warning",
        );
      }
    } else {
      const orphans = findOrphanedGitSessions(cwd, currentSessionId);
      if (orphans.length > 0) {
        if (!isGitClean(cwd)) {
          ctx.ui.notify(
            "Unfinished work from a previous session detected. Use /reset to restore a checkpoint.",
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
            const added = theme.fg("success", `+${f.added}`);
            const removed = theme.fg("error", `-${f.removed}`);
            parts.push(`${statusLabel} ${f.file} ${added}/${removed}`);
          }

          const vcs = useJJ ? " · jj" : "";
          const hint = " · /diff · /fix · /reset";
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
        gitSnapshotFile(ctx.cwd, filePath, gitCurrentCheckpointDir);

        const isNew = !fs.existsSync(path.join(ctx.cwd, filePath));

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
    }
  });

  pi.on("agent_end", async (_event: unknown, ctx: { cwd: string }) => {
    if (!useJJ || !lastUserPrompt.trim()) return;

    try {
      persistCurrentJjCheckpointLabel(ctx.cwd, lastUserPrompt);
    } catch {
      /* silent — fallback labels still work */
    }

    try {
      autoDescribeCurrentJjChange(ctx.cwd, lastUserPrompt);
    } catch {
      /* silent — not critical */
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

  // ── /fix ──────────────────────────────────────────────────────────────

  pi.registerCommand("fix", {
    description: "Log an issue to the active story and complaints-log, then attempt a fix",
    handler: async (args: string, ctx: { cwd: string; ui: any }) => {
      const cwd = ctx.cwd;

      // Get description from args or prompt
      let description = args.trim();
      if (!description) {
        description = (await ctx.ui.input(
          "What went wrong?",
          "e.g. signup button not submitting after refactor",
        ))?.trim() ?? "";
      }
      if (!description) {
        ctx.ui.notify("No description provided — /fix cancelled", "info");
        return;
      }

      // Secrets warning per spec v4.1
      ctx.ui.notify(
        "Before logging — make sure your complaint doesn't contain API keys, database URLs, or credentials. complaints-log.md is plaintext and persists across sessions.",
        "warning",
      );

      const resolved = await resolveStoryForFix(cwd, ctx.ui);
      if (resolved.reason === "missing") {
        ctx.ui.notify("No active or available story found. Run /plan first so /fix can log against a story file.", "warning");
        return;
      }

      if (resolved.reason === "cancelled" || !resolved.story) {
        ctx.ui.notify("/fix cancelled — no story selected", "info");
        return;
      }

      const active = resolved.story;
      const storyName = path.basename(active.file, ".md");

      appendToStoryIssues(active.file, description);
      updateStoryFrontmatter(active.file, { lastAccessed: todayDate() });

      ctx.ui.notify(`Issue logged to ${storyName}`, "info");

      // Append to complaints-log.md
      appendToComplaintsLog(cwd, storyName, description);

      // Instruct the agent to attempt the fix
      const instruction = [
        `The user reported an issue via /fix: "${description}"`,
        "",
        `Issue logged to ${storyName} and complaints-log.md.`,
        "",
        "Your job:",
        "1. Investigate and attempt to fix the issue.",
        "2. After fixing, explicitly state what you can verify mechanically and what requires user confirmation.",
        '3. If you cannot verify the fix (UI behaviour, browser state), leave the issue status as "pending" and ask the user to confirm.',
        '4. Never claim "should be working now" without declaring your verification limits.',
      ].join("\n");

      // Send as a user message so the agent acts on it
      await pi.sendUserMessage(instruction);
    },
  });

  async function runCheckpointRestore(ctx: { cwd: string; ui: any }) {
    const cwd = ctx.cwd;

    if (useJJ) {
      const pickable = jjCheckpointChoices(cwd);
      if (pickable.length === 0) {
        ctx.ui.notify("No checkpoints available to restore", "info");
        return;
      }

      const restoreChoice = await ctx.ui.select(
        "Restore checkpoint?",
        [
          "Previous checkpoint — undo last agent turn",
          "Choose checkpoint — pick from history",
          "Cancel",
        ],
      );

      if (restoreChoice === "Cancel" || restoreChoice == null) return;

      if (restoreChoice === "Previous checkpoint — undo last agent turn") {
        try {
          jjRestoreCheckpoint(cwd, pickable[0].id);
          ctx.ui.notify(`Restored to previous checkpoint (${checkpointLabel(pickable[0])})`, "info");
        } catch (e: any) {
          ctx.ui.notify(`Restore failed: ${e.message}`, "error");
        }
      } else if (restoreChoice === "Choose checkpoint — pick from history") {
        const labels = pickable.map(op => checkpointLabel(op));
        const pick = await ctx.ui.select("Restore to which checkpoint?", labels);
        if (pick != null) {
          const chosen = pickable[labels.indexOf(pick)];
          try {
            jjRestoreCheckpoint(cwd, chosen.id);
            ctx.ui.notify(`Restored to checkpoint: ${checkpointLabel(chosen)}`, "info");
          } catch (e: any) {
            ctx.ui.notify(`Restore failed: ${e.message}`, "error");
          }
        }
      }

      syncChanges(cwd);
      refreshWidget();
      return;
    }

    const checkpoints = listGitCheckpoints(cwd, currentSessionId);
    if (checkpoints.length === 0) {
      ctx.ui.notify("No checkpoints available to restore", "info");
      return;
    }

    const restoreChoice = await ctx.ui.select(
      "Restore checkpoint?",
      [
        "Previous checkpoint — undo last agent turn",
        "Choose checkpoint — pick from list",
        "Cancel",
      ],
    );

    if (restoreChoice === "Cancel" || restoreChoice == null) return;

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

  // ── /checkpoint and /reset ────────────────────────────────────────────

  pi.registerCommand("checkpoint", {
    description: "JJ checkpoint picker — restore to a previous operation",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      await runCheckpointRestore(ctx);
    },
  });

  pi.registerCommand("reset", {
    description: "Alias for /checkpoint",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      await runCheckpointRestore(ctx);
    },
  });
}
