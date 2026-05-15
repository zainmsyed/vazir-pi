/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import * as piTui from "@mariozechner/pi-tui";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  findActiveStory,
  listStories,
  nonTerminalStories,
  nowISO,
  readIfExists,
  storiesDir,
  type StoryFrontmatter,
} from "../../lib/vazir-helpers.ts";

// ── Types ──────────────────────────────────────────────────────────────

export interface FileInfo {
  file: string;
  status: string;
  added: number;
  removed: number;
}

export interface EditStreamEntry {
  timestamp: string;
  phase: "start" | "done";
  toolName: "write" | "edit";
  file: string;
}

interface StoryProgressSummary {
  story: StoryFrontmatter;
  slug: string;
  checklistDone: number;
  checklistTotal: number;
}

export interface FooterSessionSnapshot {
  cwd: string;
  model: { provider?: string; id?: string; reasoning?: boolean } | undefined;
  sessionManager: {
    getBranch(): Array<{ type: string; provider?: string; modelId?: string; thinkingLevel?: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>;
    getEntries(): Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>;
    getSessionName?: () => string | undefined;
  };
  getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
}

const EDIT_STREAM_LIMIT = 48;
const EDIT_WIDGET_LINE_LIMIT = 3;
const WORKING_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CHANGE_SYNC_INTERVAL_MS = 1000;
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
// Keep this list in sync with command registration across vazir-context.ts and this file.
const VAZIR_COMMAND_HELP: CommandHelpEntry[] = [
  { command: "/vazir-init", description: "bootstrap .context and seed the project brain" },
  { command: "/plan", description: "review intake, ask delta questions, and generate stories" },
  { command: "/story", description: "pick a plan or story file and open it in a scrollable view" },
  { command: "/fix", description: "log an issue to the active story, then attempt a fix" },
  { command: "/remember", description: "promote a reusable lesson into persistent memory" },
  { command: "/review", description: "write a review file and sync recurring rule candidates" },
  { command: "/complete-story", description: "check readiness, optionally review, and close a story" },
  { command: "/memory-review", description: "archive cold context, flag stale rules, and review delete candidates" },
  { command: "/unlearn", description: "remove a promoted rule from system memory" },
  { command: "/consolidate", description: "cluster complaints and promote repeated rule candidates" },
  { command: "/design", description: "review and edit design system, brand, components" },
  { command: "/diff", description: "show the diff for one changed file" },
  { command: "/edits", description: "show the recent file edit stream" },
  { command: "/checkpoint", description: "pick a JJ checkpoint to restore" },
  { command: "/reset", description: "alias for /checkpoint" },
];
const VAZIR_COLORS = {
  accent: "38;2;167;139;250",
  branch: "38;2;137;180;250",
  dim: "38;2;108;112;134",
  text: "38;2;205;214;244",
  success: "38;2;166;227;161",
  error: "38;2;243;139;168",
  warning: "38;2;249;226;175",
  working: "38;2;137;220;235",
  separator: "38;2;58;58;80",
} as const;

type VazirTone = keyof typeof VAZIR_COLORS;

interface TokenSummary {
  input: number | null;
  output: number | null;
}

interface CommandHelpEntry {
  command: string;
  description: string;
}

// ── Exported mutable state (VCS code writes to these) ──────────────────

/** Shared with VCS layer — syncFromGit/syncFromJJ write here; footer reads here. */
export const changedFiles = new Map<string, FileInfo>();

// ── Private chrome state ───────────────────────────────────────────────

const editStream: EditStreamEntry[] = [];
const pendingEditCalls: Array<{ toolName: "write" | "edit"; file: string }> = [];
let statusWidgetTui: any = null;
let footerWidgetTui: any = null;
let activeToolCalls = 0;
let currentWorkingMessage = "";
let workingMessageTicker: ReturnType<typeof setInterval> | null = null;
let footerRefreshTicker: ReturnType<typeof setInterval> | null = null;
let currentFooterSnapshot: FooterSessionSnapshot | null = null;
let liveModelGetter: (() => { provider?: string; id?: string; reasoning?: boolean } | null | undefined) | null = null;
let liveThinkingLevelGetter: (() => string) | null = null;
let commandHelpOpen = false;
let commandHelpInputUnsubscribe: (() => void) | null = null;
let lastChangeSyncAt = 0;
let storyProgressCacheCwd = "";
let storyProgressCache: StoryProgressSummary | null | undefined = undefined;

// Mirrors of VCS flags — synced from index.ts via setVcsFlags().
let _hasGitRepo = false;
let _useJJ = false;

// ── Lifecycle setters (called from index.ts) ───────────────────────────

export function setVcsFlags(hasGitRepo: boolean, useJJ: boolean): void {
  _hasGitRepo = hasGitRepo;
  _useJJ = useJJ;
}

export function setChromeSession(
  snapshot: FooterSessionSnapshot,
  modelGetter: () => { provider?: string; id?: string; reasoning?: boolean } | null | undefined,
  thinkingLevelGetter: () => string,
): void {
  currentFooterSnapshot = snapshot;
  liveModelGetter = modelGetter;
  liveThinkingLevelGetter = thinkingLevelGetter;
}

export function tearDownChromeSession(ui: any): void {
  activeToolCalls = 0;
  currentWorkingMessage = "";
  stopWorkingMessageTicker(ui);
  setFooterComponent(ui, undefined);
  statusWidgetTui = null;
  currentFooterSnapshot = null;
  liveModelGetter = null;
  liveThinkingLevelGetter = null;
  lastChangeSyncAt = 0;
  stopFooterRefreshTicker();
}

// ── Generic helpers ────────────────────────────────────────────────────

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function formatSpend(entries: Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>): string {
  let total = 0;
  for (const entry of entries) {
    if (entry.type === "message" && entry.message?.role === "assistant") {
      total += entry.message.usage?.cost?.total ?? 0;
    }
  }
  return `$${total.toFixed(3)}`;
}

function safeSessionEntries(snapshot: FooterSessionSnapshot): Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }> {
  try {
    return snapshot.sessionManager.getEntries?.() ?? [];
  } catch {
    return [];
  }
}

function paint(text: string, tone: VazirTone, bold = false): string {
  if (!text) return "";
  return `\x1b[${bold ? "1;" : ""}${VAZIR_COLORS[tone]}m${text}\x1b[0m`;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function truncateAnsi(text: string, width: number): string {
  const safeWidth = Math.max(0, width || 0);
  if (safeWidth === 0) return "";

  let visible = 0;
  let index = 0;
  let result = "";
  while (index < text.length && visible < safeWidth) {
    if (text[index] === "\x1b") {
      const match = text.slice(index).match(/^\x1b\[[0-9;]*m/);
      if (match) {
        result += match[0];
        index += match[0].length;
        continue;
      }
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const glyph = String.fromCodePoint(codePoint);
    result += glyph;
    index += glyph.length;
    visible += 1;
  }

  if (visible < visibleLength(text)) {
    result += "\x1b[0m";
  }

  return result;
}

function alignFooterLine(left: string, right: string, width: number): string {
  const safeWidth = Math.max(1, width || 1);
  const separator = paint(" · ", "separator");
  const combined = right ? `${left}${separator}${right}` : left;
  if (visibleLength(combined) > safeWidth) {
    if (!right) {
      return truncateAnsi(combined, safeWidth);
    }

    const reservedWidth = visibleLength(separator) + visibleLength(right);
    const leftWidth = Math.max(0, safeWidth - reservedWidth);
    if (leftWidth === 0) {
      return truncateAnsi(right, safeWidth);
    }
    return `${truncateAnsi(left, leftWidth)}${separator}${right}`;
  }

  const leftLength = visibleLength(left);
  const rightLength = visibleLength(right);
  if (!right) return left;
  if (leftLength + 1 + rightLength >= safeWidth) {
    return combined;
  }
  return `${left}${" ".repeat(safeWidth - leftLength - rightLength)}${right}`;
}

function formatRelativeAge(timestampMs: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestampMs);
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function safeMtimeMs(filePath: string): number | null {
  try {
    return (fs as unknown as { statSync(path: string): { mtimeMs: number } }).statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function shortModelLabel(snapshot: FooterSessionSnapshot): string {
  const modelLabel = latestModelLabel(snapshot);
  const parts = modelLabel.split("/");
  return parts[parts.length - 1] || modelLabel;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = numberValue(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function usageTokenSummary(usage: unknown): TokenSummary {
  const raw = objectValue(usage);
  const tokens = objectValue(raw.tokens);
  const input = firstNumber(
    raw.input_tokens,
    raw.inputTokens,
    raw.prompt_tokens,
    raw.promptTokens,
    tokens.input,
    tokens.prompt,
  );
  const output = firstNumber(
    raw.output_tokens,
    raw.outputTokens,
    raw.completion_tokens,
    raw.completionTokens,
    raw.generated_tokens,
    tokens.output,
    tokens.completion,
  );

  return { input, output };
}

function sessionTokenSummary(snapshot: FooterSessionSnapshot): TokenSummary {
  let inputTotal = 0;
  let outputTotal = 0;
  let sawInput = false;
  let sawOutput = false;

  for (const entry of safeSessionEntries(snapshot)) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const usage = usageTokenSummary((entry.message as { usage?: unknown }).usage);
    if (usage.input !== null) {
      inputTotal += usage.input;
      sawInput = true;
    }
    if (usage.output !== null) {
      outputTotal += usage.output;
      sawOutput = true;
    }
  }

  return {
    input: sawInput ? inputTotal : null,
    output: sawOutput ? outputTotal : null,
  };
}

function sessionBranchEntries(snapshot: FooterSessionSnapshot): Array<{ type: string; provider?: string; modelId?: string; thinkingLevel?: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }> {
  try {
    return snapshot.sessionManager.getBranch();
  } catch {
    return [];
  }
}

function latestModelLabel(snapshot: FooterSessionSnapshot): string {
  const liveModel = liveModelGetter?.();
  if (liveModel?.provider && liveModel?.id) {
    return `${liveModel.provider}/${liveModel.id}`;
  }

  const branchEntries = sessionBranchEntries(snapshot);
  for (let index = branchEntries.length - 1; index >= 0; index--) {
    const entry = branchEntries[index];
    if (entry.type === "model_change" && entry.provider && entry.modelId) {
      return `${entry.provider}/${entry.modelId}`;
    }
  }

  const model = snapshot.model;
  if (model?.provider && model?.id) {
    return `${model.provider}/${model.id}`;
  }

  return "no-model";
}

function latestThinkingLevel(snapshot: FooterSessionSnapshot): string {
  const liveThinkingLevel = liveThinkingLevelGetter?.();
  if (liveThinkingLevel) {
    return liveThinkingLevel;
  }

  const branchEntries = sessionBranchEntries(snapshot);
  for (let index = branchEntries.length - 1; index >= 0; index--) {
    const entry = branchEntries[index];
    if (entry.type === "thinking_level_change" && entry.thinkingLevel) {
      return entry.thinkingLevel;
    }
  }

  return "off";
}

function timeOfDay(iso: string): string {
  return iso.slice(11, 19);
}

function planPath(cwd: string): string {
  return path.join(storiesDir(cwd), "plan.md");
}

function systemMemoryPath(cwd: string): string {
  return path.join(cwd, ".context", "memory", "system.md");
}

function projectSettingsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "project.json");
}

function isVazirInitialized(cwd: string): boolean {
  return fs.existsSync(systemMemoryPath(cwd)) || fs.existsSync(projectSettingsPath(cwd));
}

// ── Story helpers ──────────────────────────────────────────────────────

export function invalidateStoryProgressCache(cwd?: string): void {
  if (!cwd || storyProgressCacheCwd === cwd) {
    storyProgressCacheCwd = "";
    storyProgressCache = undefined;
  }
}

function storyPickerLabel(story: StoryFrontmatter): string {
  const storyLabel = path.basename(story.file, ".md");
  const title = storyPickerTitle(story);
  const accessed = story.lastAccessed ? ` · ${story.lastAccessed}` : "";
  if (title) {
    return `${storyLabel} — ${story.status} — ${title}${accessed}`;
  }
  return `${storyLabel} — ${story.status}${accessed}`;
}

function storyPickerTitle(story: StoryFrontmatter): string | null {
  const content = readIfExists(story.file);
  const match = content.match(/^#\s+Story\s+\d+:\s*(.+)$/m);
  const title = match?.[1]?.trim() ?? "";
  return title || null;
}

function storyPickerStatusRank(status: string): number {
  switch (status) {
    case "in-progress":
      return 0;
    case "not-started":
      return 1;
    case "complete":
      return 2;
    case "retired":
      return 3;
    default:
      return 4;
  }
}

function compareStoriesForStoryPicker(left: StoryFrontmatter, right: StoryFrontmatter): number {
  const rankDiff = storyPickerStatusRank(left.status) - storyPickerStatusRank(right.status);
  if (rankDiff !== 0) return rankDiff;
  return left.number - right.number;
}

export function storyPickerChoices(cwd: string): Array<{ label: string; file: string; kind: "plan" | "story" }> {
  const choices: Array<{ label: string; file: string; kind: "plan" | "story" }> = [];

  if (fs.existsSync(planPath(cwd))) {
    choices.push({
      label: "plan.md — plan",
      file: planPath(cwd),
      kind: "plan",
    });
  }

  for (const story of listStories(cwd).sort(compareStoriesForStoryPicker)) {
    choices.push({
      label: storyPickerLabel(story),
      file: story.file,
      kind: "story",
    });
  }

  return choices;
}

function markdownSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === heading);
  if (headingIndex < 0) return "";

  const sectionLines: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) break;
    if (/^---\s*$/.test(line) && sectionLines.length > 0) break;
    sectionLines.push(line);
  }

  return sectionLines.join("\n").trim();
}

function checklistProgress(content: string): { done: number; total: number } {
  const checklist = markdownSection(content, "## Checklist");
  const items = checklist
    .split("\n")
    .map(line => line.trim())
    .filter(line => /^- \[[ xX]\]\s+/.test(line));

  return {
    done: items.filter(line => /^- \[[xX]\]\s+/.test(line)).length,
    total: items.length,
  };
}

function openIssueCount(content: string): number {
  const issues = markdownSection(content, "## Issues");
  return [...issues.matchAll(/^\-\s*\*\*Status:\*\*\s*(.+?)\s*$/gm)]
    .map(match => match[1].trim().toLowerCase())
    .filter(status => status === "pending" || status === "unresolved" || status === "reopened")
    .length;
}

function storyProgressSummary(cwd: string): StoryProgressSummary | null {
  if (storyProgressCacheCwd === cwd && storyProgressCache !== undefined) {
    return storyProgressCache;
  }

  const story = findActiveStory(cwd) ?? nonTerminalStories(cwd).sort((a, b) => a.number - b.number)[0] ?? null;
  if (!story) {
    storyProgressCacheCwd = cwd;
    storyProgressCache = null;
    return null;
  }

  const content = readIfExists(story.file);
  const checklist = checklistProgress(content);

  const summary = {
    story,
    slug: path.basename(story.file, ".md"),
    checklistDone: checklist.done,
    checklistTotal: checklist.total,
  };

  storyProgressCacheCwd = cwd;
  storyProgressCache = summary;
  return summary;
}

function progressBar(done: number, total: number, width = 10): string {
  if (width <= 0) return "";
  if (total <= 0) return `▐${"░".repeat(width)}▌`;

  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)));
  return `▐${"█".repeat(filled)}${"░".repeat(width - filled)}▌`;
}

function storyStatusTone(status: string): VazirTone {
  switch (status) {
    case "in-progress":
      return "warning";
    case "complete":
      return "success";
    case "retired":
      return "error";
    default:
      return "dim";
  }
}

function storyProgressTone(summary: StoryProgressSummary): VazirTone {
  return summary.checklistTotal > 0 && summary.checklistDone >= summary.checklistTotal ? "success" : "accent";
}

// ── Scrollable UI components ───────────────────────────────────────────

export async function showScrollableText(
  ctx: { ui: any },
  title: string,
  subtitle: string,
  body: string,
): Promise<void> {
  const lines = body.split("\n");
  let scrollOffset = 0;

  await ctx.ui.custom((tui: { requestRender(): void }, _theme: unknown, _kb: unknown, done: () => void) => {
    return {
      render(width: number): string[] {
        const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
        const header = ` ${title}  ${subtitle}  ↑↓ scroll · pgup/pgdn · esc close`;
        const bodyLines = lines
          .slice(scrollOffset, scrollOffset + visibleRows)
          .map(line => line.slice(0, width));
        return [header.slice(0, width), ...bodyLines];
      },
      invalidate() {},
      handleInput(data: string) {
        if (piTui.matchesKey(data, piTui.Key.up)) scrollOffset = Math.max(0, scrollOffset - 1);
        else if (piTui.matchesKey(data, piTui.Key.down)) scrollOffset = Math.min(Math.max(0, lines.length - 1), scrollOffset + 1);
        else if (piTui.matchesKey(data, piTui.Key.pageUp)) scrollOffset = Math.max(0, scrollOffset - 10);
        else if (piTui.matchesKey(data, piTui.Key.pageDown)) scrollOffset = Math.min(Math.max(0, lines.length - 1), scrollOffset + 10);
        else if (piTui.matchesKey(data, piTui.Key.escape)) { done(); return; }
        tui.requestRender();
      },
    };
  });
}

function isCommandHelpShortcut(data: string): boolean {
  return [
    piTui.Key.ctrl("?"),
    piTui.Key.ctrl("/"),
    piTui.Key.ctrlShift("/"),
    piTui.Key.shiftCtrl("/"),
  ].some(key => piTui.matchesKey(data, key));
}

function commandHelpBody(): string {
  const lines = [
    "Vazir command list",
    "",
    ...VAZIR_COMMAND_HELP.map(entry => `${entry.command.padEnd(14)} ${entry.description}`),
    "",
    "Use Esc to close and PgUp/PgDn to scroll if the list grows.",
  ];
  return lines.join("\n");
}

async function showCommandHelp(ctx: { ui: any }): Promise<void> {
  await showScrollableText(ctx, "Vazir commands", "Ctrl+? or Esc to close", commandHelpBody());
}

export function registerCommandHelpShortcut(ctx: { ui: { onTerminalInput(handler: (data: string) => { consume?: boolean; data?: string } | undefined): () => void } }): void {
  if (typeof ctx.ui.onTerminalInput !== "function") {
    commandHelpInputUnsubscribe = null;
    return;
  }

  commandHelpInputUnsubscribe?.();
  commandHelpInputUnsubscribe = ctx.ui.onTerminalInput((data: string) => {
    if (!isCommandHelpShortcut(data) || commandHelpOpen) {
      return undefined;
    }

    commandHelpOpen = true;
    void showCommandHelp(ctx).finally(() => {
      commandHelpOpen = false;
    });
    return { consume: true };
  });
}

export async function viewSelectedStoryOrPlan(
  ctx: { cwd: string; ui: any },
  selectedFile: string,
  label: string,
): Promise<void> {
  const content = readIfExists(selectedFile).trimEnd();
  if (!content) {
    ctx.ui.notify(`No content found in ${label}`, "info");
    return;
  }

  const title = path.basename(selectedFile);
  await showScrollableText(ctx, title, label, content);
}

// ── Edit stream ────────────────────────────────────────────────────────

export function recordEditStreamEntry(phase: "start" | "done", toolName: "write" | "edit", file: string): void {
  editStream.push({ timestamp: nowISO(), phase, toolName, file });
  while (editStream.length > EDIT_STREAM_LIMIT) {
    editStream.shift();
  }
}

export function toolPathFromInput(input: unknown): string {
  const raw = input as { path?: string; filePath?: string } | undefined;
  return raw?.path || raw?.filePath || "(unknown file)";
}

export function claimPendingEditCall(toolName: "write" | "edit"): string {
  const index = pendingEditCalls.findIndex(entry => entry.toolName === toolName);
  if (index < 0) return "(unknown file)";

  const [entry] = pendingEditCalls.splice(index, 1);
  return entry.file;
}

export function pushPendingEditCall(toolName: "write" | "edit", file: string): void {
  pendingEditCalls.push({ toolName, file });
}

export function formatEditStreamEntry(entry: EditStreamEntry): string {
  const phase = entry.phase === "start" ? "start" : "done ";
  return `${timeOfDay(entry.timestamp)} ${phase} ${entry.toolName} ${entry.file}`;
}

/** Returns a reversed snapshot of the edit stream for the /edits command. */
export function getEditStreamSnapshot(): EditStreamEntry[] {
  return editStream.slice().reverse();
}

export function recentEditStreamLines(limit = EDIT_WIDGET_LINE_LIMIT): string[] {
  return editStream
    .slice(-limit)
    .reverse()
    .map(formatEditStreamEntry);
}

// ── Branch label ───────────────────────────────────────────────────────

export function clipInline(text: string, max = 40): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function branchLabel(cwd: string): string {
  if (!_hasGitRepo && !_useJJ) {
    return isVazirInitialized(cwd) ? "no-git" : "run /vazir-init";
  }

  try {
    try {
      const branch = childProcess.execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).toString().trim();
      if (branch && branch !== "HEAD") return clipInline(branch, 24);

      if (branch === "HEAD") {
        try {
          const sha = childProcess.execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
          if (sha) return clipInline(`detached@${sha}`, 24);
        } catch {
          // ignore
        }
        // Empty repo (no commits yet) — symbolic-ref gives the configured default branch name.
        try {
          const symRef = childProcess.execSync("git symbolic-ref --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
          if (symRef) return clipInline(symRef, 24);
        } catch {
          // ignore
        }
      }
    } catch {
      // git not available; fall through to JJ
    }

    if (_useJJ) {
      try {
        const label = childProcess.execSync("jj bookmark list --revision @ --no-graph", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
        if (label) return clipInline(label, 24);
      } catch {
        // ignore
      }
      return "jj";
    }

    return "workspace";
  } catch {
    /* ignore VCS label lookup */
  }

  return _useJJ ? "jj" : "workspace";
}

function repoNameLabel(cwd: string): string {
  return path.basename(cwd);
}

// ── Footer segments ────────────────────────────────────────────────────

function separatorDot(): string {
  return paint(" · ", "separator");
}

function storySavedLabel(summary: StoryProgressSummary): string | null {
  const modifiedAt = safeMtimeMs(summary.story.file);
  if (modifiedAt === null) return null;
  return `last saved ${formatRelativeAge(modifiedAt)}`;
}

function footerGitStatusSegment(): string {
  const dirtyCount = changedFiles.size;
  if (dirtyCount <= 0) {
    return paint("✓ clean", "success");
  }

  const tone: VazirTone = dirtyCount <= 5 ? "warning" : "error";
  return paint(`${dirtyCount} uncommitted`, tone);
}

function footerSpendSegment(snapshot: FooterSessionSnapshot): string {
  return paint(formatSpend(safeSessionEntries(snapshot)), "success");
}

function footerContextSegment(snapshot: FooterSessionSnapshot): string {
  const contextUsage = snapshot.getContextUsage();
  if (!contextUsage) return "";
  const percent = contextUsage.percent === null ? "?" : `${contextUsage.percent.toFixed(1)}%`;
  const tone: VazirTone =
    contextUsage.percent === null
      ? "dim"
      : contextUsage.percent >= 75
        ? "error"
        : contextUsage.percent >= 50
          ? "warning"
          : "dim";
  return paint(`${percent}/${formatTokens(contextUsage.contextWindow)}`, tone);
}

function footerTokenOrWorkSegment(snapshot: FooterSessionSnapshot): string {
  if (activeToolCalls > 0 && currentWorkingMessage) {
    return `${paint(spinnerFrame(), "working")}${paint(` ${clipInline(currentWorkingMessage, 30)}`, "working")}`;
  }

  const tokens = sessionTokenSummary(snapshot);
  if (tokens.input !== null || tokens.output !== null) {
    const input = tokens.input === null ? "?" : formatTokens(tokens.input);
    const output = tokens.output === null ? "?" : formatTokens(tokens.output);
    return paint(`↑${input} ↓${output}`, "dim");
  }

  return "";
}

function footerHint(): string {
  return activeToolCalls > 0 && currentWorkingMessage
    ? paint("Ctrl+C to abort", "dim")
    : paint("Ctrl+? for help", "dim");
}

function footerSeparatorLine(width: number): string {
  return paint("━".repeat(Math.max(1, width || 1)), "separator");
}

// ── Widget components ──────────────────────────────────────────────────

function storyStatusWidgetLines(
  cwd: string,
  _theme: { fg: (label: string, text: string) => string },
): string[] {
  if (!isVazirInitialized(cwd)) {
    return [
      `${paint("▸", "accent", true)} ${paint("run /vazir-init to bootstrap Vazir", "text")}`,
    ];
  }

  const summary = storyProgressSummary(cwd);

  if (!summary) {
    return [
      `${paint("▸", "accent", true)} ${paint("no active story", "text")}`,
    ];
  }

  const progressSegment = `${paint(progressBar(summary.checklistDone, summary.checklistTotal), storyProgressTone(summary))} ${paint(`${summary.checklistDone}/${summary.checklistTotal} ${summary.checklistTotal === 1 ? "task" : "tasks"}`, "dim")}`;
  const openIssues = openIssueCount(readIfExists(summary.story.file));
  const issueSegment = openIssues === 0
    ? `${paint("✓", "success")} ${paint("no open issues", "dim")}`
    : `${paint("⚠", "error")} ${paint(`${openIssues} open issue${openIssues === 1 ? "" : "s"}`, "error")}`;

  const segments = [
    `${paint("▸", "accent", true)} ${paint(summary.slug, "text")}`,
    paint(summary.story.status, storyStatusTone(summary.story.status)),
    progressSegment,
    issueSegment,
  ];

  const savedLabel = activeToolCalls > 0 ? null : storySavedLabel(summary);
  if (savedLabel) {
    segments.push(paint(savedLabel, "dim"));
  }

  return [
    segments.join(separatorDot()),
  ];
}

function createStoryStatusWidgetComponent(cwd: string) {
  return (_tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }) => ({
    render(): string[] {
      return storyStatusWidgetLines(cwd, theme);
    },
    invalidate() {},
  });
}

function createStoryStatusWidgetFactory(cwd: string) {
  const componentFactory = createStoryStatusWidgetComponent(cwd);
  return (tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }) => {
    statusWidgetTui = tui;
    return {
      ...componentFactory(tui, theme),
      dispose() {
        if (statusWidgetTui === tui) {
          statusWidgetTui = null;
        }
      },
    };
  };
}

function ensureStoryStatusWidgetMounted(ui: any, cwd: string): void {
  callUiMethod(ui, "setWidget", "vazir-story-status", createStoryStatusWidgetFactory(cwd), { placement: "aboveEditor" });
}

export function setFooterComponent(ui: any, factory: unknown): void {
  if (callUiMethod(ui, "setFooterFactory", factory)) return;
  callUiMethod(ui, "setFooter", factory);
}

function sessionFooterLine(
  snapshot: FooterSessionSnapshot,
  _theme: { fg: (label: string, text: string) => string },
  footerData: { getGitBranch(): string | null | undefined },
  width: number,
): string {
  const cwd = snapshot.cwd;
  if (!isVazirInitialized(cwd)) {
    const left = [
      paint(`◈ ${repoNameLabel(cwd)}`, "accent", true),
      paint("setup required", "warning"),
      paint("run /vazir-init", "text"),
    ].join(separatorDot());
    return alignFooterLine(left, footerHint(), width);
  }

  const summary = storyProgressSummary(cwd);
  const storyLabel = summary?.slug ?? "no active story";
  const branch = clipInline(_hasGitRepo ? (footerData.getGitBranch() ?? branchLabel(cwd)) : branchLabel(cwd), 24);
  const branchWithStatus = `${paint(branch, "branch")}${separatorDot()}${footerGitStatusSegment()}`;
  const branchLabelSegment = paint(branch, "branch");
  const repoLabel = clipInline(repoNameLabel(cwd).replace(/-pi$/, ""), 12);
  const modelLabel = clipInline(shortModelLabel(snapshot), 30);
  const thinkingLevel = latestThinkingLevel(snapshot);
  const leftSegments = activeToolCalls > 0 && currentWorkingMessage
    ? [
        paint(repoLabel, "accent", true),
        paint(storyLabel, "text"),
        branchLabelSegment,
        footerContextSegment(snapshot),
        footerSpendSegment(snapshot),
        footerTokenOrWorkSegment(snapshot),
      ].filter(Boolean)
    : [
        paint(repoLabel, "accent", true),
        paint(storyLabel, "text"),
        branchWithStatus,
        `${paint(modelLabel, "dim")} ${paint(`(${thinkingLevel})`, "dim")}`,
        footerTokenOrWorkSegment(snapshot),
        footerContextSegment(snapshot),
        footerSpendSegment(snapshot),
      ].filter(Boolean);
  const left = leftSegments.join(separatorDot());
  return alignFooterLine(left, footerHint(), width);
}

function createSessionFooterComponent(snapshot: FooterSessionSnapshot) {
  return (
    tui: { requestRender(): void },
    theme: { fg: (label: string, text: string) => string },
    footerData: { getGitBranch(): string | null | undefined; onBranchChange?: (callback: () => void) => () => void },
  ) => {
    footerWidgetTui = tui;
    const unsubscribe = _hasGitRepo
      ? footerData.onBranchChange?.(() => tui.requestRender()) ?? undefined
      : undefined;

    return {
      render(width: number): string[] {
        return [
          footerSeparatorLine(width),
          sessionFooterLine(snapshot, theme, footerData, width),
        ];
      },
      invalidate() {},
      dispose() {
        unsubscribe?.();
        if (footerWidgetTui === tui) {
          footerWidgetTui = null;
        }
      },
    };
  };
}

function blankHeaderComponent() {
  return () => ({
    render(): string[] {
      return [];
    },
    invalidate() {},
  });
}

export function ensureSessionChromeMounted(ui: any, cwd: string): void {
  callUiMethod(ui, "setHeader", blankHeaderComponent());
  ensureStoryStatusWidgetMounted(ui, cwd);
  if (currentFooterSnapshot) {
    setFooterComponent(ui, createSessionFooterComponent(currentFooterSnapshot));
  }
}

// ── Footer refresh ticker ──────────────────────────────────────────────

/**
 * Starts the footer/widget refresh ticker. Receives a syncFn callback to avoid
 * a circular import with the VCS layer that owns syncChanges.
 */
export function startFooterRefreshTicker(syncFn: (cwd: string) => void): void {
  if (footerRefreshTicker || !currentFooterSnapshot) return;
  footerRefreshTicker = setInterval(() => {
    if (currentFooterSnapshot && Date.now() - lastChangeSyncAt >= CHANGE_SYNC_INTERVAL_MS) {
      syncFn(currentFooterSnapshot.cwd);
      lastChangeSyncAt = Date.now();
    }
    statusWidgetTui?.requestRender();
    footerWidgetTui?.requestRender();
  }, 120);
  (footerRefreshTicker as unknown as { unref?: () => void }).unref?.();
}

export function stopFooterRefreshTicker(): void {
  if (!footerRefreshTicker) return;
  clearInterval(footerRefreshTicker);
  footerRefreshTicker = null;
}

// ── Spinner and working message ────────────────────────────────────────

function spinnerFrame(): string {
  return WORKING_SPINNER_FRAMES[Math.floor(Date.now() / 80) % WORKING_SPINNER_FRAMES.length];
}

function describeToolActivity(toolName: string | undefined, input: unknown): string {
  const name = (toolName || "tool").toLowerCase();
  const raw = (input ?? {}) as Record<string, unknown>;
  const filePath = toolPathFromInput(input);
  const command = typeof raw.command === "string" ? raw.command : "";
  const query = typeof raw.query === "string" ? raw.query : "";

  if (name === "read" || name === "read_file") {
    return `Reading · ${path.basename(filePath)}`;
  }
  if (name === "write" || name === "write_file") {
    return `Writing · ${path.basename(filePath)}`;
  }
  if (name === "edit" || name === "str_replace" || name === "apply_patch") {
    return `Editing · ${path.basename(filePath)}`;
  }
  if (name === "bash") {
    return `Running · ${clipInline(command || "shell command")}`;
  }
  if (name.includes("search") || name === "grep") {
    return `Searching · ${clipInline(query || "workspace")}`;
  }
  if (filePath !== "(unknown file)") {
    return `Using ${toolName} · ${path.basename(filePath)}`;
  }

  return `Using ${toolName || "tool"}`;
}

export function callUiMethod(ui: any, methodName: string, ...args: unknown[]): boolean {
  const method = ui?.[methodName];
  if (typeof method !== "function") return false;
  method(...args);
  return true;
}

export function applyWorkingMessage(ui: any): void {
  if (activeToolCalls > 0 && currentWorkingMessage) {
    callUiMethod(ui, "setWorkingMessage", currentWorkingMessage);
    return;
  }

  callUiMethod(ui, "setWorkingMessage");
}

function ensureWorkingMessageTicker(ui: any): void {
  if (workingMessageTicker || typeof ui?.setWorkingMessage !== "function") return;
  workingMessageTicker = setInterval(() => {
    applyWorkingMessage(ui);
  }, 80);
  (workingMessageTicker as unknown as { unref?: () => void }).unref?.();
}

export function stopWorkingMessageTicker(ui: any): void {
  if (workingMessageTicker) {
    clearInterval(workingMessageTicker);
    workingMessageTicker = null;
  }
  callUiMethod(ui, "setWorkingMessage");
}

export function beginToolActivity(ui: any, toolName: string | undefined, input: unknown): void {
  activeToolCalls += 1;
  currentWorkingMessage = describeToolActivity(toolName, input);
  applyWorkingMessage(ui);
  ensureWorkingMessageTicker(ui);
}

export function endToolActivity(ui: any): void {
  activeToolCalls = Math.max(0, activeToolCalls - 1);
  if (activeToolCalls === 0) {
    currentWorkingMessage = "";
    stopWorkingMessageTicker(ui);
    return;
  }

  applyWorkingMessage(ui);
}

export function refreshWidgets(): void {
  statusWidgetTui?.requestRender();
  footerWidgetTui?.requestRender();
}
