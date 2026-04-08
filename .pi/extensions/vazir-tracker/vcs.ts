/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
export { detectGitRepo } from "../../lib/vazir-helpers.ts";
import { changedFiles, invalidateStoryProgressCache } from "./chrome.ts";

// ── Types ──────────────────────────────────────────────────────────────

export interface CheckpointMeta {
  timestamp: string;
  prompt: string;
  files: string[];
  newFiles: string[];
}

interface JjCheckpointLabelStore {
  labels: Record<string, string>;
}

export function isGitClean(cwd: string): boolean {
  try {
    return childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" }).trim() === "";
  } catch {
    return true;
  }
}

// ── Git fallback checkpoint helpers ───────────────────────────────────

function checkpointsRoot(cwd: string): string {
  return path.join(cwd, ".context/checkpoints");
}

export function sessionCheckpointDir(cwd: string, id: string): string {
  return path.join(checkpointsRoot(cwd), id);
}

export function gitSnapshotFile(cwd: string, filePath: string, checkpointDir: string): void {
  const abs = path.join(cwd, filePath);
  if (!fs.existsSync(abs)) return;
  const dest = path.join(checkpointDir, "files", filePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
}

export function gitRestoreCheckpoint(cwd: string, checkpointDir: string): void {
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

export function listGitCheckpoints(
  cwd: string,
  sessionId: string,
): Array<{ dir: string; meta: CheckpointMeta; n: number }> {
  const dir = sessionCheckpointDir(cwd, sessionId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry: { name: string }) => entry.name)
    .map((n: string) => parseInt(n))
    .filter((n: number) => !isNaN(n))
    .sort((a: number, b: number) => b - a)
    .map((n: number) => {
      const d = path.join(dir, String(n));
      const mp = path.join(d, "meta.json");
      if (!fs.existsSync(mp)) return null;
      return { dir: d, meta: JSON.parse(fs.readFileSync(mp, "utf-8")) as CheckpointMeta, n };
    })
    .filter(Boolean) as Array<{ dir: string; meta: CheckpointMeta; n: number }>;
}

export function findOrphanedGitSessions(cwd: string, currentId: string): string[] {
  const root = checkpointsRoot(cwd);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .map((entry: { name: string }) => entry.name)
    .filter((id: string) => id !== currentId);
}

// ── JJ helpers ─────────────────────────────────────────────────────────

const jjOpPromptMap = new Map<string, string>();

function jjCheckpointLabelsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json");
}

export function loadJjCheckpointLabels(cwd: string): void {
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

function saveJjCheckpointLabel(cwd: string, opId: string, prompt: string): void {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;

  const labelsPath = jjCheckpointLabelsPath(cwd);
  fs.mkdirSync(path.dirname(labelsPath), { recursive: true });

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

export function persistCurrentJjCheckpointLabel(cwd: string, prompt: string): void {
  const opId = currentJjOpId(cwd);
  if (opId) saveJjCheckpointLabel(cwd, opId, prompt);
}

export function autoDescribeCurrentJjChange(cwd: string, prompt: string): void {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return;
  childProcess.execFileSync("jj", ["describe", "-m", trimmedPrompt.slice(0, 72)], { cwd, stdio: "pipe" });
}

function isJjDescribeOperation(op: { description: string }): boolean {
  return op.description.startsWith("describe commit ");
}

function jjOpLog(cwd: string, limit = 15): Array<{ id: string; description: string; ago: string }> {
  try {
    const raw = childProcess
      .execSync(
        `jj op log --no-graph --limit ${limit} --template 'id.short(8) ++ "||" ++ description ++ "||" ++ time.start().ago() ++ "\\n"'`,
        { cwd, encoding: "utf-8" },
      )
      .trim();
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line: string) => {
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
  if (op.description === "restore to operation") return "Restored checkpoint";
  return "Checkpoint";
}

export function checkpointLabel(op: { id: string; description: string; ago: string; label?: string }): string {
  const prompt = op.label ?? jjOpPromptMap.get(op.id);
  const label = prompt ? prompt.slice(0, 50) : fallbackJjCheckpointLabel(op);
  return `${op.ago} · ${label}`;
}

function currentJjOpId(cwd: string): string {
  try {
    return childProcess
      .execSync(`jj op log --no-graph --limit 1 --template 'id.short(8)'`, { cwd, encoding: "utf-8" })
      .trim();
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
  if (isUserVisibleJjCheckpoint(currentOp)) return currentOp.id;

  for (let index = currentIndex + 1; index < ops.length; index++) {
    if (isUserVisibleJjCheckpoint(ops[index])) return ops[index].id;
  }

  return "";
}

const JJ_CHECKPOINT_SCAN_LIMIT = 120;
const JJ_CHECKPOINT_MAX_CHOICES = 12;

export function jjCheckpointChoices(
  cwd: string,
): Array<{ id: string; description: string; ago: string; label?: string }> {
  loadJjCheckpointLabels(cwd);

  const ops = jjOpLog(cwd, JJ_CHECKPOINT_SCAN_LIMIT);
  if (ops.length <= 1) return [];

  const currentOpId = currentJjOpId(cwd) || ops[0]?.id || "";
  const currentCheckpointId = currentJjCheckpointId(ops, currentOpId);

  const visible = ops
    .map((op, index) => {
      if (op.id === currentOpId || op.id === currentCheckpointId || !isUserVisibleJjCheckpoint(op)) return null;
      const directLabel = jjOpPromptMap.get(op.id);
      const previousDescribeLabel =
        index > 0 && isJjDescribeOperation(ops[index - 1]) ? jjOpPromptMap.get(ops[index - 1].id) : undefined;
      return { ...op, label: directLabel ?? previousDescribeLabel };
    })
    .filter(Boolean) as Array<{ id: string; description: string; ago: string; label?: string }>;

  return visible.slice(0, JJ_CHECKPOINT_MAX_CHOICES);
}

export function jjDiffStat(cwd: string): string {
  try {
    return childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export function jjDiffFile(cwd: string, file: string): string {
  try {
    return childProcess.execFileSync("jj", ["diff", "--no-color", "--", file], { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function jjHasChanges(cwd: string): boolean {
  try {
    return childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8" }).trim() !== "";
  } catch {
    return false;
  }
}

export function jjRestoreCheckpoint(cwd: string, opId: string): void {
  childProcess.execFileSync("jj", ["op", "restore", opId], { cwd, stdio: "pipe" });
  childProcess.execFileSync("jj", ["restore", "--from", "@-"], { cwd, stdio: "pipe" });
}

// ── VCS sync ───────────────────────────────────────────────────────────

function syncFromGit(cwd: string): void {
  try {
    const statusOut = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" });
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
      statOut = childProcess
        .execSync("git diff --stat HEAD", { cwd, encoding: "utf-8", stdio: "pipe" })
        .trim();
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
      let added = 0,
        removed = 0;
      if (status === "?" || (status === "A" && !statMap.has(file))) {
        try {
          added = fs.readFileSync(path.join(cwd, file), "utf-8").split("\n").length;
        } catch {
          /* ignore */
        }
      } else {
        const s = statMap.get(file);
        if (s) {
          added = s.added;
          removed = s.removed;
        }
      }
      changedFiles.set(file, { file, status, added, removed });
    }
  } catch {
    /* not a git repo */
  }
}

function syncFromJJ(cwd: string): void {
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
  } catch {
    /* ignore */
  }
}

export function syncChanges(cwd: string, hasGitRepo: boolean, useJJ: boolean): void {
  invalidateStoryProgressCache(cwd);
  if (!hasGitRepo && !useJJ) {
    changedFiles.clear();
    return;
  }
  if (useJJ) syncFromJJ(cwd);
  else syncFromGit(cwd);
}
