/// <reference path="../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface StoryFrontmatter {
  status: string;
  lastAccessed: string;
  completed: string;
  file: string;
  number: number;
  title: string;
}

export type ActiveVcsMode = "git" | "fossil" | "none";
export type VcsMirrorMode = "none" | "git-mirror-of-fossil";

export interface VcsMirrorSettings {
  mode: VcsMirrorMode;
  path: string;
  remoteName: string;
  branch: string;
  autosync_closeout: boolean;
}

export interface VcsMirrorStatus {
  mode: VcsMirrorMode;
  state: "disabled" | "configured" | "missing-git-metadata" | "inactive-active-vcs" | "missing-fossil-metadata" | "missing-path";
  shortLabel: string;
  warning: string | null;
  severity: "success" | "warning" | "error" | null;
}

export interface FossilGitExportPlan {
  repositoryPath: string;
  mirrorPath: string;
  argv: string[];
  commandText: string;
}

export interface VcsApprovalRequirement {
  needsApproval: boolean;
  protectedTargets: string[];
  reason: string | null;
}

export interface PendingVcsApproval {
  token: string;
  fingerprint: string;
  commandText: string;
  reason: string;
  protectedTargets: string[];
}

export interface PendingContextChanges {
  activeMode: ActiveVcsMode;
  files: string[];
}

export const PROTECTED_VCS_TARGETS = [".git/", ".jj/", ".fslckout", ".fossil-settings/"];

const PROTECTED_VCS_TARGET_PATTERNS = [
  /(^|\/)\.git(?:\/|$)/,
  /(^|\/)\.jj(?:\/|$)/,
  /(^|\/)\.fossil-settings(?:\/|$)/,
  /(^|\/)\.fslckout$/,
];

const APPROVAL_GATED_VCS_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+reset(?:\s|$)/, reason: "Git reset rewrites repository state." },
  { pattern: /\bgit\s+clean(?:\s|$)/, reason: "Git clean permanently removes untracked files." },
  { pattern: /\bgit\s+restore(?:\s|$)/, reason: "Git restore can overwrite tracked files or staged state." },
  { pattern: /\bgit\s+checkout\b[^\n]*\s--(?:\s|$)/, reason: "Git checkout -- can overwrite tracked files." },
  { pattern: /\bjj\s+(?:undo|restore|abandon|backout)(?:\s|$)/, reason: "JJ history-changing commands require approval." },
  { pattern: /\bfossil\s+(?:clean|revert|undo)(?:\s|$)/, reason: "Fossil revert-style commands discard local state." },
];

const REINITIALIZING_VCS_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+init(?:\s|$)/, reason: "Git init would create or reinitialize repository metadata." },
  { pattern: /\bjj\s+(?:git\s+init|init)(?:\s|$)/, reason: "JJ init would create or reinitialize repository metadata." },
  { pattern: /\bfossil\s+(?:init|new|open|clone)(?:\s|$)/, reason: "Fossil init/open-style commands would create or replace repository metadata." },
];

const APPROVAL_GATED_PROTECTED_TARGET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:rm|rmdir|del|erase|unlink)\b/, reason: "Deleting protected VCS metadata requires approval." },
  { pattern: /\b(?:mv|move|rename)\b/, reason: "Moving or renaming protected VCS metadata requires approval." },
  { pattern: /\b(?:cp|copy|install|dd|tee|truncate)\b/, reason: "Overwriting protected VCS metadata requires approval." },
  { pattern: /\bsed\b[^\n]*\s-i(?:\s|$)/, reason: "In-place edits against protected VCS metadata require approval." },
  { pattern: /\bperl\b[^\n]*\s-pi(?:\s|$)/, reason: "In-place edits against protected VCS metadata require approval." },
  { pattern: /(^|[^>])>(?!>)/, reason: "Shell redirection into protected VCS metadata requires approval." },
  { pattern: />>/, reason: "Shell append redirection into protected VCS metadata requires approval." },
];

const BASE_SYSTEM_RULE_LINES = [
  "Follow existing project conventions.",
  "Write directly to real project files.",
  "Ask before changing ambiguous areas.",
];

const FOSSIL_DETECT_TIMEOUT_MS = 1000;

export function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizeRepoRoot(candidatePath: string): string {
  try {
    return fs.realpathSync(candidatePath);
  } catch {
    return path.resolve(candidatePath);
  }
}

function isCurrentDirectoryInsideRepo(cwd: string, repoRoot: string): boolean {
  const normalizedCwd = normalizeRepoRoot(cwd);
  const normalizedRepoRoot = normalizeRepoRoot(repoRoot);
  if (normalizedCwd === normalizedRepoRoot) return true;

  const relative = path.relative(normalizedRepoRoot, normalizedCwd);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function detectGitRepo(cwd: string): boolean {
  try {
    const topLevel = childProcess.execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 3000 }).trim();
    return topLevel ? isCurrentDirectoryInsideRepo(cwd, topLevel) : false;
  } catch {
    return false;
  }
}

export function resolveGitTopLevel(cwd: string): string | null {
  try {
    const topLevel = childProcess.execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 3000 }).trim();
    return topLevel || null;
  } catch {
    return null;
  }
}

export function detectJJ(cwd: string): boolean {
  try {
    const root = childProcess.execSync("jj root", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 3000 }).trim();
    return root ? isCurrentDirectoryInsideRepo(cwd, root) : false;
  } catch {
    return false;
  }
}

function trimShellToken(token: string): string {
  return token
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[;,]+$/g, "");
}

function tokenizeShellLike(text: string): string[] {
  return (text.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) ?? [])
    .map(trimShellToken)
    .filter(Boolean);
}

function shortHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 8);
}

export function normalizeVcsTarget(target: string): string {
  return trimShellToken(target)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

export function isProtectedVcsTarget(target: string): boolean {
  const normalized = normalizeVcsTarget(target);
  if (!normalized) return false;
  return PROTECTED_VCS_TARGET_PATTERNS.some(pattern => pattern.test(normalized));
}

export function protectedVcsTargetsInText(text: string): string[] {
  const matches: string[] = [];
  for (const token of tokenizeShellLike(text)) {
    if (isProtectedVcsTarget(token) && !matches.includes(token)) {
      matches.push(token);
    }
  }
  return matches;
}

export function protectedVcsMetadataPresent(cwd: string): string[] {
  return PROTECTED_VCS_TARGETS.filter(target => {
    const relative = target.endsWith("/") ? target.slice(0, -1) : target;
    return fs.existsSync(path.join(cwd, relative));
  });
}

export function normalizeCommandFingerprint(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function approvalTokenForFingerprint(fingerprint: string): string {
  return `vcs-${shortHash(fingerprint)}`;
}

export function vcsApprovalPhrase(token: string): string {
  return `VCS_APPROVE ${token}`;
}

export function userInputHasVcsApproval(text: string, token: string): boolean {
  return text.toUpperCase().includes(vcsApprovalPhrase(token).toUpperCase());
}

export function approvalGatedVcsOperation(command: string, cwd?: string): VcsApprovalRequirement {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return { needsApproval: false, protectedTargets: [], reason: null };
  }

  for (const entry of APPROVAL_GATED_VCS_COMMAND_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return { needsApproval: true, protectedTargets: [], reason: entry.reason };
    }
  }

  const presentTargets = cwd ? protectedVcsMetadataPresent(cwd) : [];
  for (const entry of REINITIALIZING_VCS_COMMAND_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      if (!cwd || presentTargets.length > 0) {
        return { needsApproval: true, protectedTargets: presentTargets, reason: entry.reason };
      }
      return { needsApproval: false, protectedTargets: [], reason: null };
    }
  }

  const protectedTargets = protectedVcsTargetsInText(command);
  if (protectedTargets.length === 0) {
    return { needsApproval: false, protectedTargets: [], reason: null };
  }

  for (const entry of APPROVAL_GATED_PROTECTED_TARGET_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return { needsApproval: true, protectedTargets, reason: entry.reason };
    }
  }

  return { needsApproval: false, protectedTargets, reason: null };
}

export function buildBlockedVcsActionGuidance(approval: PendingVcsApproval): string {
  const targetLine = approval.protectedTargets.length > 0
    ? `Protected targets: ${approval.protectedTargets.join(", ")}.`
    : "Protected VCS state is already present in this repo.";
  return [
    `Blocked destructive VCS action: ${approval.reason}`,
    targetLine,
    `To approve exactly this action, send: ${vcsApprovalPhrase(approval.token)}`,
    "Then ask Vazir to retry the same command unchanged.",
  ].join(" ");
}

export function vcsSafetyRuleLines(): string[] {
  const protectedTargets = PROTECTED_VCS_TARGETS.join(", ");
  return [
    "Commit `.context` changes whenever they are part of the work, unless the user explicitly says not to commit them.",
    `Treat ${protectedTargets} as protected VCS metadata targets.`,
    "Never delete, reset, clean, reinitialize, or overwrite VCS metadata without explicit user approval for that exact action.",
    "If Vazir blocks a destructive VCS action, wait for the user to send the exact `VCS_APPROVE <token>` phrase before retrying that same action.",
  ];
}

export function buildVcsSafetyGuidanceText(): string {
  return ["[VCS Safety Policy]", ...vcsSafetyRuleLines().map(line => `- ${line}`)].join("\n");
}

export function hasVcsSafetyPolicyText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return vcsSafetyRuleLines().every(line => normalized.includes(line));
}

export function buildDefaultSystemRulesMarkdown(): string {
  return [
    "# System Rules",
    "",
    "## Rules",
    ...[...BASE_SYSTEM_RULE_LINES, ...vcsSafetyRuleLines()].map(line => `- ${line}`),
    "",
    "## Learned Rules",
    "",
  ].join("\n");
}

export function detectFossil(cwd: string): boolean {
  if (fs.existsSync(path.join(cwd, ".fslckout"))) return true;

  try {
    const jsonInfo = childProcess.execSync("fossil info --json", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_DETECT_TIMEOUT_MS }).trim();
    if (jsonInfo) {
      const parsed = JSON.parse(jsonInfo) as { checkout?: { root?: string } };
      const checkoutRoot = parsed.checkout?.root?.trim();
      if (checkoutRoot) return isCurrentDirectoryInsideRepo(cwd, checkoutRoot);
    }
  } catch {
    // Fall through to plain-text parsing for older Fossil versions.
  }

  try {
    const info = childProcess.execSync("fossil info", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_DETECT_TIMEOUT_MS });
    const checkoutRoot = info.match(/^local-root:\s+(.+)$/m)?.[1]?.trim();
    return checkoutRoot ? isCurrentDirectoryInsideRepo(cwd, checkoutRoot) : false;
  } catch {
    return false;
  }
}

export function projectSettingsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "project.json");
}

export function readProjectSettings(cwd: string): Record<string, unknown> {
  const filePath = projectSettingsPath(cwd);
  if (!fs.existsSync(filePath)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeVcsMirrorSettings(raw: unknown): VcsMirrorSettings {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const mode = typeof record.mode === "string" ? record.mode.trim().toLowerCase() : "";
  const pathValue = typeof record.path === "string" ? record.path.trim() : "";
  const remoteName = typeof record.remoteName === "string" && record.remoteName.trim() ? record.remoteName.trim() : "origin";
  const branch = typeof record.branch === "string" && record.branch.trim() ? record.branch.trim() : "main";
  const autosyncCloseout = typeof record.autosync_closeout === "boolean" ? record.autosync_closeout : false;

  return {
    mode: mode === "git-mirror-of-fossil" ? "git-mirror-of-fossil" : "none",
    path: pathValue,
    remoteName,
    branch,
    autosync_closeout: autosyncCloseout,
  };
}

export function readVcsMirrorSettings(cwd: string): VcsMirrorSettings {
  const settings = readProjectSettings(cwd);
  return normalizeVcsMirrorSettings(settings.vcs_mirror);
}

export function describeVcsMirrorStatus(options: {
  activeMode: ActiveVcsMode;
  hasGitRepo: boolean;
  hasFossilRepo: boolean;
  settings: VcsMirrorSettings;
}): VcsMirrorStatus {
  const { activeMode, hasGitRepo, hasFossilRepo, settings } = options;

  if (settings.mode !== "git-mirror-of-fossil") {
    return {
      mode: "none",
      state: "disabled",
      shortLabel: "",
      warning: null,
      severity: null,
    };
  }

  if (activeMode !== "fossil") {
    return {
      mode: settings.mode,
      state: "inactive-active-vcs",
      shortLabel: "mirror inactive",
      warning: "Git mirror mode is configured for Fossil, but Fossil is not the active VCS.",
      severity: "warning",
    };
  }

  if (!hasFossilRepo) {
    return {
      mode: settings.mode,
      state: "missing-fossil-metadata",
      shortLabel: "fossil missing",
      warning: "Git mirror mode expects Fossil metadata, but no Fossil checkout was detected.",
      severity: "error",
    };
  }

  if (!settings.path.trim()) {
    return {
      mode: settings.mode,
      state: "missing-path",
      shortLabel: "mirror path missing",
      warning: "Git mirror mode is enabled, but no mirror path is configured. Set vcs_mirror.path to use /vcs-mirror-sync.",
      severity: "warning",
    };
  }

  if (!hasGitRepo) {
    return {
      mode: settings.mode,
      state: "missing-git-metadata",
      shortLabel: "git missing",
      warning: "Git mirror mode is enabled, but no Git metadata was detected in this repo.",
      severity: "error",
    };
  }

  return {
    mode: settings.mode,
    state: "configured",
    shortLabel: "git mirror",
    warning: null,
    severity: "success",
  };
}

export function resolveConfiguredMirrorPath(cwd: string, settings: VcsMirrorSettings): string | null {
  const trimmedPath = settings.path.trim();
  if (!trimmedPath) return null;
  return path.resolve(cwd, trimmedPath);
}

export function fossilRepositoryPath(cwd: string): string | null {
  try {
    const info = childProcess.execSync("fossil info", { cwd, encoding: "utf-8", stdio: "pipe", timeout: FOSSIL_DETECT_TIMEOUT_MS });
    const repositoryPath = info.match(/^repository:\s+(.+)$/m)?.[1]?.trim();
    return repositoryPath || null;
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildFossilGitExportPlan(repositoryPath: string, mirrorPath: string): FossilGitExportPlan {
  const argv = ["git", "export", repositoryPath, mirrorPath, "--autopush"];
  return {
    repositoryPath,
    mirrorPath,
    argv,
    commandText: ["fossil", ...argv].map(shellQuote).join(" "),
  };
}

export function runAutoMirrorExportAtCloseout(cwd: string): { ran: boolean; ok: boolean; message: string } {
  const settings = readVcsMirrorSettings(cwd);

  if (settings.mode !== "git-mirror-of-fossil") {
    return { ran: false, ok: true, message: "" };
  }

  if (!settings.autosync_closeout) {
    return { ran: false, ok: true, message: "" };
  }

  const activeMode = readActiveVcsMode(cwd);
  if (activeMode !== "fossil") {
    return { ran: false, ok: true, message: "Mirror autosync skipped: Fossil is not the active VCS." };
  }

  try {
    childProcess.execFileSync("fossil", ["version"], { stdio: "pipe" });
  } catch {
    return { ran: false, ok: false, message: "Mirror autosync skipped: Fossil is not installed." };
  }

  if (!detectFossil(cwd)) {
    return { ran: false, ok: false, message: "Mirror autosync skipped: no Fossil checkout detected." };
  }

  const repositoryPath = fossilRepositoryPath(cwd);
  if (!repositoryPath) {
    return { ran: false, ok: false, message: "Mirror autosync skipped: could not resolve Fossil repository path." };
  }

  const resolvedMirrorPath = resolveConfiguredMirrorPath(cwd, settings);
  if (!resolvedMirrorPath) {
    return { ran: false, ok: false, message: "Mirror autosync skipped: no mirror path is configured." };
  }

  if (!fs.existsSync(resolvedMirrorPath)) {
    return { ran: false, ok: false, message: `Mirror autosync skipped: configured mirror path does not exist: ${resolvedMirrorPath}` };
  }

  if (!detectGitRepo(resolvedMirrorPath)) {
    return { ran: false, ok: false, message: `Mirror autosync skipped: configured mirror path is not a Git checkout: ${resolvedMirrorPath}` };
  }

  const plan = buildFossilGitExportPlan(repositoryPath, resolvedMirrorPath);
  try {
    childProcess.execFileSync("fossil", plan.argv, { cwd, stdio: "pipe" });
    return { ran: true, ok: true, message: `Mirror auto-sync complete: exported to ${resolvedMirrorPath}.` };
  } catch (error: any) {
    const stderr = error?.stderr?.toString?.("utf-8")?.trim() || error?.message || String(error);
    return { ran: true, ok: false, message: `Mirror auto-sync failed: ${stderr}` };
  }
}

export function writeProjectSettings(cwd: string, updates: Record<string, unknown>): Record<string, unknown> {
  const filePath = projectSettingsPath(cwd);
  const current = readProjectSettings(cwd);
  const next = { ...current, ...updates };

  if ("vcs_mirror" in updates) {
    next.vcs_mirror = {
      ...normalizeVcsMirrorSettings(current.vcs_mirror),
      ...normalizeVcsMirrorSettings(updates.vcs_mirror),
    };
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function readActiveVcsMode(cwd: string): ActiveVcsMode {
  const settings = readProjectSettings(cwd);
  const active = typeof settings.active_vcs_mode === "string" ? settings.active_vcs_mode.trim().toLowerCase() : "";
  if (active === "git" || active === "fossil" || active === "none") return active;

  const legacyPreference = typeof settings.vcs_preference === "string" ? settings.vcs_preference.trim().toLowerCase() : "";
  if (legacyPreference === "git" || legacyPreference === "jj") return "git";
  if (legacyPreference === "fossil") return "fossil";
  return "none";
}

function parseGitStatusPaths(output: string): string[] {
  return output
    .split("\n")
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => line.replace(/^[ MARCUD?!]{1,2}\s+/, ""))
    .map(line => line.includes(" -> ") ? line.split(" -> ").pop() ?? line : line)
    .map(line => line.trim())
    .filter(Boolean);
}

function parseFossilStatusPaths(output: string): string[] {
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[A-Z?]+\s+/, "").trim())
    .filter(Boolean);
}

export function listPendingContextChanges(cwd: string): PendingContextChanges {
  const activeMode = readActiveVcsMode(cwd);

  if (activeMode === "fossil" && detectFossil(cwd)) {
    const files = new Set<string>();
    try {
      for (const file of parseFossilStatusPaths(childProcess.execSync("fossil changes", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }))) {
        if (file === ".context" || file.startsWith(".context/")) files.add(file);
      }
    } catch {
      /* ignore */
    }
    try {
      for (const file of parseFossilStatusPaths(childProcess.execSync("fossil extras", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 }))) {
        if (file === ".context" || file.startsWith(".context/")) files.add(file);
      }
    } catch {
      /* ignore */
    }
    return { activeMode, files: [...files].sort() };
  }

  if (detectGitRepo(cwd) || detectJJ(cwd) || activeMode === "git") {
    try {
      const output = childProcess.execSync("git status --porcelain -- .context", { cwd, encoding: "utf-8", stdio: "pipe", timeout: 5000 });
      return { activeMode, files: parseGitStatusPaths(output).filter(file => file === ".context" || file.startsWith(".context/")).sort() };
    } catch {
      return { activeMode, files: [] };
    }
  }

  return { activeMode, files: [] };
}

export function hasPendingContextChanges(cwd: string): boolean {
  return listPendingContextChanges(cwd).files.length > 0;
}

export function storiesDir(cwd: string): string {
  return path.join(cwd, ".context", "stories");
}

export function complaintsLogPath(cwd: string): string {
  return path.join(cwd, ".context", "complaints-log.md");
}

export function parseStoryFrontmatter(filePath: string): StoryFrontmatter | null {
  const content = readIfExists(filePath);
  if (!content) return null;

  const headingMatch = content.match(/^#\s+Story\s+(\d+):\s*(.+)$/m);
  const statusMatch = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const lastAccessedMatch = content.match(/^\*\*Last accessed:\*\*\s*(.+)$/m);
  const completedMatch = content.match(/^\*\*Completed:\*\*\s*(.+)$/m);
  const fileName = path.basename(filePath);
  const numberMatch = fileName.match(/story-(\d+)\.md$/);

  if (!statusMatch || !numberMatch) return null;

  return {
    status: statusMatch[1].trim(),
    lastAccessed: lastAccessedMatch?.[1]?.trim() ?? "",
    completed: completedMatch?.[1]?.trim() ?? "—",
    file: filePath,
    number: parseInt(numberMatch[1], 10),
    title: headingMatch?.[2]?.trim() ?? "",
  };
}

export function listStories(cwd: string): StoryFrontmatter[] {
  const dir = storiesDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name: string) => /^story-\d+\.md$/.test(name))
    .map((name: string) => parseStoryFrontmatter(path.join(dir, name)))
    .filter((story: StoryFrontmatter | null): story is StoryFrontmatter => story !== null);
}

export function compareStoriesByRecencyDesc(left: StoryFrontmatter, right: StoryFrontmatter): number {
  const dateCmp = right.lastAccessed.localeCompare(left.lastAccessed);
  if (dateCmp !== 0) return dateCmp;
  return right.number - left.number;
}

export function compareStoriesByCompletionDesc(left: StoryFrontmatter, right: StoryFrontmatter): number {
  const leftCompleted = left.completed === "—" ? "" : left.completed;
  const rightCompleted = right.completed === "—" ? "" : right.completed;
  const dateCmp = rightCompleted.localeCompare(leftCompleted);
  if (dateCmp !== 0) return dateCmp;
  return right.number - left.number;
}

export function findActiveStory(cwd: string): StoryFrontmatter | null {
  const stories = listStories(cwd);
  const inProgress = stories.filter(story => story.status === "in-progress");

  if (inProgress.length === 0) return null;
  if (inProgress.length === 1) return inProgress[0];

  inProgress.sort(compareStoriesByRecencyDesc);
  return inProgress[0];
}

export function nonTerminalStories(cwd: string): StoryFrontmatter[] {
  return listStories(cwd).filter(story => story.status !== "complete" && story.status !== "retired");
}

export function updateStoryFrontmatter(
  storyPath: string,
  updates: { status?: StoryFrontmatter["status"]; lastAccessed?: string; completed?: string },
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
  if (updates.completed) {
    updated = updated.replace(/^[*][*]Completed:[*][*]\s*.+$/m, `**Completed:** ${updates.completed}`);
  }

  if (updated !== content) {
    fs.writeFileSync(storyPath, updated);
  }
}