/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
export { detectGitRepo } from "../../lib/vazir-helpers.ts";
import {
  approvalGatedVcsOperation,
  approvalTokenForFingerprint,
  buildBlockedVcsActionGuidance,
  describeVcsMirrorStatus,
  detectFossil,
  detectGitRepo,
  isProtectedVcsTarget,
  normalizeCommandFingerprint,
  readActiveVcsMode,
  readVcsMirrorSettings,
  type PendingVcsApproval,
  userInputHasVcsApproval,
} from "../../lib/vazir-helpers.ts";
import { changedFiles, invalidateStoryProgressCache, toolPathFromInput } from "./chrome.ts";

// ── Types ──────────────────────────────────────────────────────────────

export interface CheckpointMeta {
  timestamp: string;
  prompt: string;
  files: string[];
  newFiles: string[];
}

const pendingVcsApprovals = new Map<string, PendingVcsApproval>();
const acknowledgedVcsApprovals = new Map<string, Set<string>>();

export type VcsKind = "none" | "git" | "fossil";

const FOSSIL_STATUS_TIMEOUT_MS = 5000;

export interface VcsDisplayInfo {
  kind: VcsKind;
  refLabel: string;
  workingLabel: string;
  syncLabel: string;
  mirrorLabel: string;
  mirrorSeverity: "success" | "warning" | "error" | null;
}

export function clearPendingVcsApproval(cwd: string): void {
  pendingVcsApprovals.delete(cwd);
  acknowledgedVcsApprovals.delete(cwd);
}

export function noteUserVcsApproval(cwd: string, text: string): boolean {
  const pending = pendingVcsApprovals.get(cwd);
  if (!pending || !userInputHasVcsApproval(text, pending.token)) return false;

  const approved = acknowledgedVcsApprovals.get(cwd) ?? new Set<string>();
  approved.add(pending.fingerprint);
  acknowledgedVcsApprovals.set(cwd, approved);
  return true;
}

function directToolApprovalRequirement(toolName: string, input: unknown): PendingVcsApproval | null {
  if ((toolName !== "write" && toolName !== "edit") || !input || typeof input !== "object") return null;
  const rawPath = toolPathFromInput(input);
  if (rawPath === "(unknown file)" || !isProtectedVcsTarget(rawPath)) return null;

  const fingerprint = `${toolName}:${normalizeCommandFingerprint(rawPath)}`;
  return {
    token: approvalTokenForFingerprint(fingerprint),
    fingerprint,
    commandText: rawPath,
    reason: `Direct ${toolName} against protected VCS metadata requires approval.`,
    protectedTargets: [rawPath],
  };
}

function bashApprovalRequirement(cwd: string, input: unknown): PendingVcsApproval | null {
  if (!input || typeof input !== "object") return null;
  const rawCommand = (input as { command?: unknown }).command;
  if (typeof rawCommand !== "string" || !rawCommand.trim()) return null;

  const requirement = approvalGatedVcsOperation(rawCommand, cwd);
  if (!requirement.needsApproval || !requirement.reason) return null;

  const fingerprint = `bash:${normalizeCommandFingerprint(rawCommand)}`;
  return {
    token: approvalTokenForFingerprint(fingerprint),
    fingerprint,
    commandText: rawCommand.trim(),
    reason: requirement.reason,
    protectedTargets: requirement.protectedTargets,
  };
}

export function inspectVcsToolGuard(
  cwd: string,
  toolName: string | undefined,
  input: unknown,
  _lastUserPrompt: string,
): { block: false } | { block: true; reason: string } {
  const pending = toolName === "bash"
    ? bashApprovalRequirement(cwd, input)
    : directToolApprovalRequirement(toolName ?? "", input);

  if (!pending) return { block: false };

  const approved = acknowledgedVcsApprovals.get(cwd);
  if (approved?.has(pending.fingerprint)) {
    approved.delete(pending.fingerprint);
    if (approved.size === 0) acknowledgedVcsApprovals.delete(cwd);
    pendingVcsApprovals.delete(cwd);
    return { block: false };
  }

  pendingVcsApprovals.set(cwd, pending);
  return { block: true, reason: buildBlockedVcsActionGuidance(pending) };
}

export function isGitClean(cwd: string): boolean {
  try {
    return childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }).trim() === "";
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

function syncFromGit(cwd: string): void {
  try {
    const statusOut = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 });
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
        .execSync("git diff --stat HEAD", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 })
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

function fossilDiffLineCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }

  return { added, removed };
}

function syncFromFossil(cwd: string): void {
  changedFiles.clear();
  const statusMap = new Map<string, string>();

  try {
    const changes = childProcess.execSync("fossil changes", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS }).trim();
    for (const line of changes.split("\n")) {
      const editedMatch = line.match(/^\s*EDITED\s+(.+)$/);
      const updatedMatch = line.match(/^\s*UPDATED_BY_MERGE\s+(.+)$/);
      const missingMatch = line.match(/^\s*MISSING\s+(.+)$/);
      const addedMatch = line.match(/^\s*ADDED\s+(.+)$/);
      const deletedMatch = line.match(/^\s*DELETED\s+(.+)$/);
      const renamedMatch = line.match(/^\s*RENAMED\s+(.+)$/);

      if (editedMatch) {
        statusMap.set(editedMatch[1].trim(), "M");
      } else if (updatedMatch) {
        statusMap.set(updatedMatch[1].trim(), "M");
      } else if (missingMatch) {
        statusMap.set(missingMatch[1].trim(), "D");
      } else if (addedMatch) {
        statusMap.set(addedMatch[1].trim(), "A");
      } else if (deletedMatch) {
        statusMap.set(deletedMatch[1].trim(), "D");
      } else if (renamedMatch) {
        statusMap.set(renamedMatch[1].trim(), "R");
      }
    }
  } catch {
    // Ignore if there are no modified tracked files.
  }

  for (const [file, status] of statusMap) {
    let added = 0;
    let removed = 0;
    if (status === "A") {
      try {
        added = fs.readFileSync(path.join(cwd, file), "utf-8").split("\n").length;
      } catch {
        /* ignore */
      }
    } else if (status === "M") {
      try {
        const diff = childProcess.execFileSync("fossil", ["diff", "--", file], { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS });
        const counts = fossilDiffLineCounts(diff);
        added = counts.added;
        removed = counts.removed;
      } catch {
        /* ignore */
      }
    }
    changedFiles.set(file, { file, status, added, removed });
  }

  try {
    const extras = childProcess.execSync("fossil extras --dotfiles", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS }).trim();
    for (const line of extras.split("\n")) {
      const file = line.trim();
      if (!file) continue;
      let added = 0;
      try {
        added = fs.readFileSync(path.join(cwd, file), "utf-8").split("\n").length;
      } catch {
        /* ignore */
      }
      changedFiles.set(file, { file, status: "?", added, removed: 0 });
    }
  } catch {
    // Ignore if there are no extras.
  }
}

function gitRefLabel(cwd: string): string {
  try {
    const branch = childProcess.execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }).trim();
    if (branch && branch !== "HEAD") return branch;
    if (branch === "HEAD") {
      try {
        const sha = childProcess.execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }).trim();
        if (sha) return `detached@${sha}`;
      } catch {
        // ignore
      }
      try {
        const symRef = childProcess.execSync("git symbolic-ref --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }).trim();
        if (symRef) return symRef;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return "workspace";
}

function fossilRefLabel(cwd: string): string {
  try {
    const branch = childProcess.execSync("fossil branch current", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS }).trim();
    if (branch) return branch;
  } catch {
    // ignore
  }

  try {
    const info = childProcess.execSync("fossil info", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS });
    const checkout = info.match(/^checkout:\s+([a-f0-9]+)/m)?.[1];
    if (checkout) return `checkin@${checkout.slice(0, 8)}`;
  } catch {
    // ignore
  }

  return "fossil";
}

function fossilAutosyncEnabled(cwd: string): boolean | null {
  try {
    const value = childProcess.execSync("fossil setting autosync", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_STATUS_TIMEOUT_MS }).trim().toLowerCase();
    if (/(^|\s)on(\s|$)/.test(value) || /(^|\s)1(\s|$)/.test(value) || /(^|\s)true(\s|$)/.test(value)) return true;
    if (/(^|\s)off(\s|$)/.test(value) || /(^|\s)0(\s|$)/.test(value) || /(^|\s)false(\s|$)/.test(value)) return false;
  } catch {
    // ignore
  }

  return null;
}

function buildVcsDisplayInfo(cwd: string, kind: VcsKind): VcsDisplayInfo {
  const dirtyCount = changedFiles.size;
  const mirrorStatus = describeVcsMirrorStatus({
    activeMode: readActiveVcsMode(cwd),
    hasGitRepo: detectGitRepo(cwd),
    hasFossilRepo: detectFossil(cwd),
    settings: readVcsMirrorSettings(cwd),
  });
  const mirrorLabel = mirrorStatus.shortLabel;
  const mirrorSeverity = mirrorStatus.severity;

  if (kind === "git") {
    return {
      kind,
      refLabel: gitRefLabel(cwd),
      workingLabel: dirtyCount > 0 ? `${dirtyCount} uncommitted` : "✓ clean",
      syncLabel: "",
      mirrorLabel,
      mirrorSeverity,
    };
  }

  if (kind === "fossil") {
    const autosync = fossilAutosyncEnabled(cwd);
    return {
      kind,
      refLabel: fossilRefLabel(cwd),
      workingLabel: dirtyCount > 0 ? `${dirtyCount} uncommitted` : "✓ clean",
      syncLabel: autosync === false ? "autosync off" : "autosync on",
      mirrorLabel,
      mirrorSeverity,
    };
  }

  return {
    kind: "none",
    refLabel: "workspace",
    workingLabel: "",
    syncLabel: "",
    mirrorLabel,
    mirrorSeverity,
  };
}

export function syncChanges(cwd: string, vcsKind: VcsKind): VcsDisplayInfo {
  invalidateStoryProgressCache(cwd);
  if (vcsKind === "none") {
    changedFiles.clear();
    return buildVcsDisplayInfo(cwd, vcsKind);
  }

  if (vcsKind === "fossil") syncFromFossil(cwd);
  else syncFromGit(cwd);

  return buildVcsDisplayInfo(cwd, vcsKind);
}
