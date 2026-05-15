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