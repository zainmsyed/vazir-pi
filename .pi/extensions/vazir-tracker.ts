/// <reference path="../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../types/node-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as piTui from "@mariozechner/pi-tui";
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

interface EditStreamEntry {
  timestamp: string;
  phase: "start" | "done";
  toolName: "write" | "edit";
  file: string;
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
  completed: string;
  file: string;
  number: number;
}

interface StoryProgressSummary {
  story: StoryFrontmatter;
  slug: string;
  checklistDone: number;
  checklistTotal: number;
  openIssues: number;
}

interface FooterSessionSnapshot {
  cwd: string;
  model: { provider?: string; id?: string; reasoning?: boolean } | undefined;
  sessionManager: {
    getBranch(): Array<{ type: string; provider?: string; modelId?: string; thinkingLevel?: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>;
    getEntries(): Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>;
    getSessionName?: () => string | undefined;
  };
  getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
}

const JJ_CHECKPOINT_SCAN_LIMIT = 120;
const JJ_CHECKPOINT_MAX_CHOICES = 12;
const EDIT_STREAM_LIMIT = 48;
const EDIT_WIDGET_LINE_LIMIT = 3;
const WORKING_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
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

// ── State ──────────────────────────────────────────────────────────────

const changedFiles = new Map<string, FileInfo>();
const editStream: EditStreamEntry[] = [];
const pendingEditCalls: Array<{ toolName: "write" | "edit"; file: string }> = [];
let trackerWidgetTui: any = null;
let bannerWidgetTui: any = null;
let statusWidgetTui: any = null;
let footerWidgetTui: any = null;
let lastUserPrompt = "";
let useJJ = false;
let currentSessionId = "";
let activeToolCalls = 0;
let currentWorkingMessage = "";
let workingMessageTicker: ReturnType<typeof setInterval> | null = null;
let footerRefreshTicker: ReturnType<typeof setInterval> | null = null;
let currentFooterSnapshot: FooterSessionSnapshot | null = null;
let liveThinkingLevelGetter: (() => string) | null = null;

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

function alignFooterLine(left: string, right: string, width: number): string {
  const safeWidth = Math.max(1, width || 1);
  const leftLength = visibleLength(left);
  const rightLength = visibleLength(right);
  if (!right) return left;
  if (leftLength + 1 + rightLength >= safeWidth) {
    return `${left}${paint(" · ", "separator")}${right}`;
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

function storiesDir(cwd: string): string {
  return path.join(cwd, ".context", "stories");
}

function planPath(cwd: string): string {
  return path.join(storiesDir(cwd), "plan.md");
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

function storyPickerLabel(story: StoryFrontmatter): string {
  const fileName = path.basename(story.file);
  const accessed = story.lastAccessed ? ` · ${story.lastAccessed}` : "";
  return `${fileName} — ${story.status}${accessed}`;
}

function storyPickerChoices(cwd: string): Array<{ label: string; file: string; kind: "plan" | "story" }> {
  const choices: Array<{ label: string; file: string; kind: "plan" | "story" }> = [];

  if (fs.existsSync(planPath(cwd))) {
    choices.push({
      label: "plan.md — plan",
      file: planPath(cwd),
      kind: "plan",
    });
  }

  for (const story of listStories(cwd).sort((a, b) => a.number - b.number)) {
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

function countOpenIssues(content: string): number {
  const issues = markdownSection(content, "## Issues");
  return (issues.match(/^- \*\*Status:\*\*\s*(pending|reopened)\b/gim) || []).length;
}

function storyProgressSummary(cwd: string): StoryProgressSummary | null {
  const story = findActiveStory(cwd) ?? nonTerminalStories(cwd).sort((a, b) => a.number - b.number)[0] ?? null;
  if (!story) return null;

  const content = readIfExists(story.file);
  const checklist = checklistProgress(content);

  return {
    story,
    slug: path.basename(story.file, ".md"),
    checklistDone: checklist.done,
    checklistTotal: checklist.total,
    openIssues: countOpenIssues(content),
  };
}

function progressBar(done: number, total: number, width = 10): string {
  if (width <= 0) return "";
  if (total <= 0) return `▐${"░".repeat(width)}▌`;

  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)));
  return `▐${"█".repeat(filled)}${"░".repeat(width - filled)}▌`;
}

function issueCountLabel(count: number): string {
  return `${count} issue${count === 1 ? "" : "s"}`;
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

async function showScrollableText(
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

async function viewSelectedStoryOrPlan(
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

function recordEditStreamEntry(phase: "start" | "done", toolName: "write" | "edit", file: string): void {
  editStream.push({ timestamp: nowISO(), phase, toolName, file });
  while (editStream.length > EDIT_STREAM_LIMIT) {
    editStream.shift();
  }
}

function toolPathFromInput(input: unknown): string {
  const raw = input as { path?: string; filePath?: string } | undefined;
  return raw?.path || raw?.filePath || "(unknown file)";
}

function claimPendingEditCall(toolName: "write" | "edit"): string {
  const index = pendingEditCalls.findIndex(entry => entry.toolName === toolName);
  if (index < 0) return "(unknown file)";

  const [entry] = pendingEditCalls.splice(index, 1);
  return entry.file;
}

function formatEditStreamEntry(entry: EditStreamEntry): string {
  const phase = entry.phase === "start" ? "start" : "done ";
  return `${timeOfDay(entry.timestamp)} ${phase} ${entry.toolName} ${entry.file}`;
}

function recentEditStreamLines(limit = EDIT_WIDGET_LINE_LIMIT): string[] {
  return editStream
    .slice(-limit)
    .reverse()
    .map(formatEditStreamEntry);
}

function clipInline(text: string, max = 40): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function branchLabel(cwd: string): string {
  try {
    // Prefer git branch name when git is available in the repo.
    try {
      const branch = childProcess.execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).toString().trim();
      if (branch && branch !== "HEAD") return clipInline(branch, 24);

      // If detached HEAD, show short SHA as hint
      if (branch === "HEAD") {
        try {
          const sha = childProcess.execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
          if (sha) return clipInline(`detached@${sha}`, 24);
        } catch {
          // ignore
        }
      }
    } catch {
      // git not available or not a git repo; fall through to JJ
    }

    // If JJ is available, prefer a JJ bookmark label when present
    if (useJJ) {
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

  return useJJ ? "jj" : "workspace";
}

function fitLine(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length === width) return text;
  if (text.length < width) return text + " ".repeat(width - text.length);
  if (width === 1) return text.slice(0, 1);
  return `${text.slice(0, width - 1)}…`;
}

function vazirAsciiArt(width: number): string[] {
  const art = [
    "░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓████████▓▒░▒▓█▓▒░▒▓███████▓▒░  ",
    "░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░░▓█▓▒░ ",
    " ░▒▓█▓▒▒▓█▓▒░░▒▓█▓▒░░▒▓█▓▒░    ░▒▓██▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ",
    " ░▒▓█▓▒▒▓█▓▒░░▒▓████████▓▒░  ░▒▓██▓▒░  ░▒▓█▓▒░▒▓███████▓▒░  ",
    "  ░▒▓█▓▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░░▒▓██▓▒░    ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ",
    "  ░▒▓█▓▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ",
    "   ░▒▓██▓▒░  ░▒▓█▓▒░░▒▓█▓▒░▒▓████████▓▒░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ",
    "                                                            ",
    "                                                            ",
  ];

  return art.map(line => fitLine(line, width));
}

function sessionBannerLines(cwd: string, width: number): string[] {
  const safeWidth = Math.max(28, width || 28);
  const project = path.basename(cwd);
  const storyLabel = storyProgressSummary(cwd)?.slug ?? "no active story";
  const meta = `project · ${project}   story · ${storyLabel}   branch · ${branchLabel(cwd)}`;

  return [
    ...vazirAsciiArt(safeWidth),
    fitLine("", safeWidth),
    fitLine(meta, safeWidth),
  ];
}

function createSessionBannerComponent(cwd: string) {
  return (_tui: { requestRender(): void }, _theme: unknown) => ({
    render(width: number): string[] {
      return sessionBannerLines(cwd, width);
    },
    invalidate() {},
  });
}

function createSessionBannerWidgetFactory(cwd: string) {
  const headerComponentFactory = createSessionBannerComponent(cwd);
  return (tui: { requestRender(): void }, theme: unknown) => {
    bannerWidgetTui = tui;
    return headerComponentFactory(tui, theme);
  };
}

function ensureSessionBannerMounted(ui: any, cwd: string): void {
  const bannerComponentFactory = createSessionBannerComponent(cwd);
  const mountedHeader = callUiMethod(ui, "setHeader", bannerComponentFactory);
  if (!mountedHeader) {
    callUiMethod(ui, "setWidget", "vazir-session-banner", createSessionBannerWidgetFactory(cwd), { placement: "aboveEditor" });
  }
}

function blankHeaderComponent() {
  return () => ({
    render(): string[] {
      return [];
    },
    invalidate() {},
  });
}

function separatorDot(): string {
  return paint(" · ", "separator");
}

function storyProgressTone(summary: StoryProgressSummary): VazirTone {
  return summary.checklistTotal > 0 && summary.checklistDone >= summary.checklistTotal ? "success" : "accent";
}

function storySavedLabel(summary: StoryProgressSummary): string | null {
  const modifiedAt = safeMtimeMs(summary.story.file);
  if (modifiedAt === null) return null;
  return `last saved ${formatRelativeAge(modifiedAt)}`;
}

function footerIssueSegment(summary: StoryProgressSummary | null): string {
  if (!summary) return "";
  if (summary.openIssues > 0) {
    return paint(`⚠ ${issueCountLabel(summary.openIssues)}`, "error");
  }
  return paint("✓ clean", "success");
}

function footerContextSegment(snapshot: FooterSessionSnapshot): string {
  const contextUsage = snapshot.getContextUsage();
  if (!contextUsage) return "";
  const percent = contextUsage.percent === null ? "?" : `${contextUsage.percent.toFixed(1)}%`;
  return paint(`${percent}/${formatTokens(contextUsage.contextWindow)}`, "dim");
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

function storyStatusWidgetLines(
  cwd: string,
  _theme: { fg: (label: string, text: string) => string },
): string[] {
  const summary = storyProgressSummary(cwd);

  if (!summary) {
    return [
      `${paint("▸", "accent", true)} ${paint("no active story", "text")}`,
    ];
  }

  const issueSegment = summary.openIssues > 0
    ? paint(`⚠ ${issueCountLabel(summary.openIssues)}`, "error")
    : paint("✓ no open issues", "success");
  const progressSegment = `${paint(progressBar(summary.checklistDone, summary.checklistTotal), storyProgressTone(summary))} ${paint(`${summary.checklistDone}/${summary.checklistTotal} ${summary.checklistTotal === 1 ? "task" : "tasks"}`, "dim")}`;
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

function setFooterComponent(ui: any, factory: unknown): void {
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
  const summary = storyProgressSummary(cwd);
  const storyLabel = summary?.slug ?? "no active story";
  const branch = clipInline(footerData.getGitBranch() ?? branchLabel(cwd), 24);
  const modelLabel = clipInline(shortModelLabel(snapshot), 30);
  const thinkingLevel = latestThinkingLevel(snapshot);
  const leftSegments = [
    paint("◈ vazir", "accent", true),
    paint(storyLabel, "text"),
    paint(branch, "branch"),
    `${paint(modelLabel, "dim")} ${paint(`(${thinkingLevel})`, "dim")}`,
    footerTokenOrWorkSegment(snapshot),
    footerContextSegment(snapshot),
    paint(formatSpend(safeSessionEntries(snapshot)), "success"),
    footerIssueSegment(summary),
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
    const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender()) ?? undefined;

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

function ensureSessionChromeMounted(ui: any, cwd: string): void {
  callUiMethod(ui, "setHeader", blankHeaderComponent());
  ensureStoryStatusWidgetMounted(ui, cwd);
  if (currentFooterSnapshot) {
    setFooterComponent(ui, createSessionFooterComponent(currentFooterSnapshot));
  }
}

function startFooterRefreshTicker(): void {
  if (footerRefreshTicker || !currentFooterSnapshot) return;
  footerRefreshTicker = setInterval(() => {
    statusWidgetTui?.requestRender();
    footerWidgetTui?.requestRender();
  }, 120);
}

function stopFooterRefreshTicker(): void {
  if (!footerRefreshTicker) return;
  clearInterval(footerRefreshTicker);
  footerRefreshTicker = null;
}

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

function callUiMethod(ui: any, methodName: string, ...args: unknown[]): boolean {
  const method = ui?.[methodName];
  if (typeof method !== "function") return false;
  method(...args);
  return true;
}

function applyWorkingMessage(ui: any): void {
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
}

function stopWorkingMessageTicker(ui: any): void {
  if (workingMessageTicker) {
    clearInterval(workingMessageTicker);
    workingMessageTicker = null;
  }
  callUiMethod(ui, "setWorkingMessage");
}

function beginToolActivity(ui: any, toolName: string | undefined, input: unknown): void {
  activeToolCalls += 1;
  currentWorkingMessage = describeToolActivity(toolName, input);
  applyWorkingMessage(ui);
  ensureWorkingMessageTicker(ui);
}

function endToolActivity(ui: any): void {
  activeToolCalls = Math.max(0, activeToolCalls - 1);
  if (activeToolCalls === 0) {
    currentWorkingMessage = "";
    stopWorkingMessageTicker(ui);
    return;
  }

  applyWorkingMessage(ui);
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

// ── refreshWidgets ─────────────────────────────────────────────────────

function refreshWidgets() {
  trackerWidgetTui?.requestRender();
  bannerWidgetTui?.requestRender();
  statusWidgetTui?.requestRender();
  footerWidgetTui?.requestRender();
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  liveThinkingLevelGetter = () => pi.getThinkingLevel();

  // Track user prompts
  pi.on("input", async (event: { text?: string }) => {
    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  // ── session_start ────────────────────────────────────────────────────

  pi.on("session_start", async (_event: unknown, ctx: { cwd: string; hasUI: boolean; sessionManager?: { getSessionFile?: () => string; getBranch?: () => Array<{ type: string; provider?: string; modelId?: string; thinkingLevel?: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>; getEntries?: () => Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>; getSessionName?: () => string | undefined } | undefined; model?: { provider?: string; id?: string; reasoning?: boolean } | undefined; getContextUsage?: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined; ui: any }) => {
    const cwd = ctx.cwd;
    useJJ = detectJJ(cwd);
    if (useJJ) loadJjCheckpointLabels(cwd);
    activeToolCalls = 0;
    currentWorkingMessage = "";
    const sessionManager = {
      getBranch: ctx.sessionManager?.getBranch ?? (() => []),
      getEntries: ctx.sessionManager?.getEntries ?? (() => []),
      getSessionName: ctx.sessionManager?.getSessionName,
    };
    currentFooterSnapshot = {
      cwd,
      model: ctx.model,
      sessionManager,
      getContextUsage: ctx.getContextUsage ?? (() => undefined),
    };
    if (ctx.hasUI) {
      startFooterRefreshTicker();
    }

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
    callUiMethod(ctx.ui, "setToolOutputExpanded", false);
    applyWorkingMessage(ctx.ui);

    ensureSessionChromeMounted(ctx.ui, cwd);
    trackerWidgetTui = null;
  });

  pi.on("session_shutdown", async (_event: unknown, ctx: { ui?: any }) => {
    activeToolCalls = 0;
    currentWorkingMessage = "";
    stopWorkingMessageTicker(ctx.ui);
    setFooterComponent(ctx.ui, undefined);
    statusWidgetTui = null;
    currentFooterSnapshot = null;
    liveThinkingLevelGetter = null;
    stopFooterRefreshTicker();
  });

  // ── Git fallback: snapshot before agent writes ────────────────────────

  let gitCurrentCheckpointDir = "";
  let gitCheckpointCount = 0;

  pi.on("before_agent_start", async (_event: unknown, ctx: { cwd: string; hasUI?: boolean; ui?: any }) => {
    if (ctx.hasUI) {
      ensureSessionChromeMounted(ctx.ui, ctx.cwd);
    }

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

  pi.on("tool_call", async (event: { toolName?: string; input?: { path?: string } }, ctx: { cwd: string; ui?: any }) => {
    beginToolActivity(ctx.ui, event.toolName, event.input);

    if (event.toolName === "write" || event.toolName === "edit") {
      const toolName = event.toolName;
      const file = toolPathFromInput(event.input);
      pendingEditCalls.push({ toolName, file });
      recordEditStreamEntry("start", toolName, file);
      refreshWidgets();
    }

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
  pi.on("tool_result", async (event: { toolName?: string }, ctx: { cwd: string; ui?: any }) => {
    endToolActivity(ctx.ui);

    if (event.toolName === "write" || event.toolName === "edit") {
      const toolName = event.toolName;
      recordEditStreamEntry("done", toolName, claimPendingEditCall(toolName));
    }

    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "bash") {
      syncChanges(ctx.cwd);
      footerWidgetTui?.requestRender();
      refreshWidgets();
    }
  });

  pi.on("agent_end", async (_event: unknown, ctx: { cwd: string; hasUI?: boolean; ui?: any }) => {
    footerWidgetTui?.requestRender();
    if (ctx.hasUI) {
      ensureSessionChromeMounted(ctx.ui, ctx.cwd);
    }

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
            if (piTui.matchesKey(data, piTui.Key.up)) scrollOffset = Math.max(0, scrollOffset - 1);
            else if (piTui.matchesKey(data, piTui.Key.down)) scrollOffset = Math.min(lines.length - 1, scrollOffset + 1);
            else if (piTui.matchesKey(data, piTui.Key.pageUp)) scrollOffset = Math.max(0, scrollOffset - 10);
            else if (piTui.matchesKey(data, piTui.Key.pageDown)) scrollOffset = Math.min(lines.length - 1, scrollOffset + 10);
            else if (piTui.matchesKey(data, piTui.Key.escape)) { done(); return; }
            tui.requestRender();
          },
        };
      });
    },
  });

  // ── /story ───────────────────────────────────────────────────────────

  pi.registerCommand("story", {
    description: "Pick a story or plan file and open it in a scrollable terminal view",
    handler: async (_args: string, ctx: { cwd: string; ui: any }) => {
      const choices = storyPickerChoices(ctx.cwd);
      if (choices.length === 0) {
        ctx.ui.notify("No plan or story files found yet. Run /plan first.", "info");
        return;
      }

      const labels = choices.map(choice => choice.label);
      const pick = await ctx.ui.select("Which plan or story do you want to view?", labels);
      if (pick == null) return;

      const selected = choices[labels.indexOf(pick)];
      if (!selected) return;

      await viewSelectedStoryOrPlan(ctx, selected.file, selected.label);
    },
  });

  // ── /edits ───────────────────────────────────────────────────────────

  pi.registerCommand("edits", {
    description: "Show the recent file edit stream in an expandable terminal view",
    handler: async (_args: string, ctx: { ui: any }) => {
      if (editStream.length === 0) {
        ctx.ui.notify("No file edit activity captured yet", "info");
        return;
      }

      const lines = editStream.slice().reverse().map(formatEditStreamEntry);
      let scrollOffset = 0;

      await ctx.ui.custom((tui: { requestRender(): void }, _theme: unknown, _kb: unknown, done: () => void) => {
        return {
          render(width: number): string[] {
            const visibleRows = Math.max(5, (process.stdout.rows || 24) - 8);
            const header = ` Recent edits  ${editStream.length} events  ↑↓ scroll · esc close`;
            const body = lines
              .slice(scrollOffset, scrollOffset + visibleRows)
              .map(line => line.slice(0, width));
            return [header.slice(0, width), ...body];
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
      refreshWidgets();

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
      refreshWidgets();
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
      refreshWidgets();
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
        refreshWidgets();
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
