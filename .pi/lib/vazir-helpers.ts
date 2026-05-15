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
}

export type ActiveVcsMode = "git" | "fossil" | "none";

export interface VcsApprovalRequirement {
  needsApproval: boolean;
  protectedTargets: string[];
  reason: string | null;
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
  { pattern: /\bgit\s+init(?:\s|$)/, reason: "Git init creates or reinitializes repository metadata." },
  { pattern: /\bjj\s+(?:git\s+init|init)(?:\s|$)/, reason: "JJ init creates repository metadata." },
  { pattern: /\bjj\s+(?:undo|restore|abandon|backout)(?:\s|$)/, reason: "JJ history-changing commands require approval." },
  { pattern: /\bfossil\s+(?:clean|revert|undo)(?:\s|$)/, reason: "Fossil revert-style commands discard local state." },
  { pattern: /\bfossil\s+(?:init|new|open|clone)(?:\s|$)/, reason: "Fossil init/open-style commands create or replace repository metadata." },
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

function isCurrentDirectoryRepoRoot(cwd: string, repoRoot: string): boolean {
  return normalizeRepoRoot(cwd) === normalizeRepoRoot(repoRoot);
}

export function detectGitRepo(cwd: string): boolean {
  try {
    const topLevel = childProcess.execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
    return topLevel ? isCurrentDirectoryRepoRoot(cwd, topLevel) : false;
  } catch {
    return false;
  }
}

export function detectJJ(cwd: string): boolean {
  try {
    const root = childProcess.execSync("jj root", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
    return root ? isCurrentDirectoryRepoRoot(cwd, root) : false;
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

export function approvalGatedVcsOperation(command: string): VcsApprovalRequirement {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return { needsApproval: false, protectedTargets: [], reason: null };
  }

  for (const entry of APPROVAL_GATED_VCS_COMMAND_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return { needsApproval: true, protectedTargets: [], reason: entry.reason };
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

export function vcsSafetyRuleLines(): string[] {
  const protectedTargets = PROTECTED_VCS_TARGETS.join(", ");
  return [
    "Commit `.context` changes whenever they are part of the work, unless the user explicitly says not to commit them.",
    `Treat ${protectedTargets} as protected VCS metadata targets.`,
    "Never delete, reset, clean, reinitialize, or overwrite VCS metadata without explicit user approval for that exact action.",
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
  try {
    const jsonInfo = childProcess.execSync("fossil info --json", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
    if (jsonInfo) {
      const parsed = JSON.parse(jsonInfo) as { checkout?: { root?: string } };
      const checkoutRoot = parsed.checkout?.root?.trim();
      if (checkoutRoot) return isCurrentDirectoryRepoRoot(cwd, checkoutRoot);
    }
  } catch {
    // Fall through to plain-text parsing for older Fossil versions.
  }

  try {
    const info = childProcess.execSync("fossil info", { cwd, encoding: "utf-8", stdio: "pipe" });
    const checkoutRoot = info.match(/^local-root:\s+(.+)$/m)?.[1]?.trim();
    return checkoutRoot ? isCurrentDirectoryRepoRoot(cwd, checkoutRoot) : false;
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

export function writeProjectSettings(cwd: string, updates: Record<string, unknown>): Record<string, unknown> {
  const filePath = projectSettingsPath(cwd);
  const current = readProjectSettings(cwd);
  const next = { ...current, ...updates };
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

export function storiesDir(cwd: string): string {
  return path.join(cwd, ".context", "stories");
}

export function complaintsLogPath(cwd: string): string {
  return path.join(cwd, ".context", "complaints-log.md");
}

export function parseStoryFrontmatter(filePath: string): StoryFrontmatter | null {
  const content = readIfExists(filePath);
  if (!content) return null;

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