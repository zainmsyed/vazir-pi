/// <reference path="../../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import * as fs from "fs";
import * as path from "path";
export { detectGitRepo } from "../../lib/vazir-helpers.ts";
import {
  compareStoriesByCompletionDesc,
  compareStoriesByRecencyDesc,
  complaintsLogPath,
  findActiveStory,
  listStories,
  nonTerminalStories,
  nowISO,
  readIfExists,
  storiesDir,
  todayDate,
  type StoryFrontmatter,
} from "../../lib/vazir-helpers.ts";

export const SOURCE_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".cs",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);

export const SKIP_DIRS = new Set([
  ".git",
  ".jj",
  ".context",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "target",
  "vendor",
  "tmp",
  "temp",
  ".venv",
  "venv",
  "__pycache__",
]);


export const MAX_INTAKE_PREVIEW_BYTES = 4000;
export const MAX_INTAKE_PREVIEW_LINES = 12;
export const REVIEW_PROMOTION_THRESHOLD = 2;
export const PREVIEWABLE_TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".csv",
  ".tsv",
  ".xml",
  ".html",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".sql",
  ".sh",
]);
export const GENERAL_APPROVALS = new Set(["yes", "y", "done", "approved", "looks good", "ship it"]);

export type ReviewScope = "story" | "whole-codebase";


export type InitFileStatus = {
  label: string;
  present: boolean;
};

export interface ReviewDraft {
  created: string;
  focus: string;
  scope: ReviewScope;
  storyLabel: string;
  trigger: string;
  fileName: string;
  filePath: string;
}

export interface ReviewFrontmatter {
  status: string;
  created: string;
  completed: string;
  scope: string;
  story: string;
  focus: string;
  trigger: string;
  file: string;
}

export interface ReviewFindingSummary {
  severity: string;
  category: string;
  summary: string;
}

export interface ReviewRecommendedFix {
  checked: boolean;
  severity: string;
  summary: string;
}

export interface StoryCompletionReadiness {
  uncheckedChecklistItems: string[];
  openIssueStatuses: string[];
  hasCompletionSummary: boolean;
}

export interface LearnedRuleEntry {
  text: string;
  sourceStories: string[];
}

export interface RuleCandidateEntry {
  text: string;
  sourceStories: string[];
}

export interface ArchiveCandidate {
  filePath: string;
  label: string;
  reason: string;
  kind: "story" | "review";
}

export interface DeleteCandidate {
  filePath: string;
  label: string;
  reason: string;
}

export interface StaleRuleCandidate {
  ruleIndex: number;
  text: string;
  sourceStories: string[];
  reason: string;
}

// ── Path helpers ───────────────────────────────────────────────────────

export function memoryDir(cwd: string) {
  return path.join(cwd, ".context", "memory");
}

export function settingsDir(cwd: string) {
  return path.join(cwd, ".context", "settings");
}

export function intakeBriefPath(cwd: string) {
  return path.join(storiesDir(cwd), "intake-brief.md");
}

export function intakeDir(cwd: string) {
  return path.join(cwd, ".context", "intake");
}

export function reviewsDir(cwd: string) {
  return path.join(cwd, ".context", "reviews");
}

export function archiveDir(cwd: string) {
  return path.join(cwd, ".context", "archive");
}

export function archiveStoriesDir(cwd: string) {
  return path.join(archiveDir(cwd), "stories");
}

export function archiveReviewsDir(cwd: string) {
  return path.join(archiveDir(cwd), "reviews");
}

export function reviewSummaryPath(cwd: string) {
  return path.join(reviewsDir(cwd), "summary.md");
}

export function rememberedRulesPath(cwd: string) {
  return path.join(reviewsDir(cwd), "remembered.md");
}

export function indexPath(cwd: string) {
  return path.join(memoryDir(cwd), "index.md");
}

export function systemPath(cwd: string) {
  return path.join(memoryDir(cwd), "system.md");
}

export function contextMapPath(cwd: string) {
  return path.join(memoryDir(cwd), "context-map.md");
}

export function intakeReadmePath(cwd: string) {
  return path.join(intakeDir(cwd), "README.md");
}

export const INTAKE_README_TEMPLATE = [
  "# Vazir Intake",
  "",
  "Drop planning materials here before running /plan.",
  "",
  "Use this folder for raw project inputs such as:",
  "- PRDs and POC notes",
  "- Domain dictionaries and glossary files",
  "- API references or schema notes",
  "- Research notes, screenshots, or supporting docs",
  "",
  "Suggested subfolders:",
  "- prd/",
  "- dictionaries/",
  "- references/",
  "- uploads/",
  "",
  "Rules:",
  "- Treat files here as planning inputs, not permanent system rules.",
  "- /plan should read these first, then ask only for missing or conflicting information.",
  "- plan.md and story files remain the distilled working artifacts.",
  "",
].join("\n");

export const REVIEW_SUMMARY_TEMPLATE = [
  "# Review Summary",
  "",
  "**Last updated:** —",
  "",
  "## Findings",
  "- None yet",
  "",
].join("\n");

export const REMEMBERED_RULES_TEMPLATE = [
  "# Remembered Rules",
  "",
  "Manual rules captured via /remember.",
  "",
].join("\n");

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureIntakeStructure(cwd: string): void {
  ensureDir(intakeDir(cwd));
  for (const segment of ["prd", "dictionaries", "references", "uploads"]) {
    ensureDir(path.join(intakeDir(cwd), segment));
  }
}

export function ensureReviewStructure(cwd: string): void {
  ensureDir(reviewsDir(cwd));
  if (!fs.existsSync(reviewSummaryPath(cwd))) {
    fs.writeFileSync(reviewSummaryPath(cwd), REVIEW_SUMMARY_TEMPLATE);
  }
  if (!fs.existsSync(rememberedRulesPath(cwd))) {
    fs.writeFileSync(rememberedRulesPath(cwd), REMEMBERED_RULES_TEMPLATE);
  }
}

export function ensureArchiveStructure(cwd: string): void {
  ensureDir(archiveStoriesDir(cwd));
  ensureDir(archiveReviewsDir(cwd));
}

export function relativeToCwd(cwd: string, fullPath: string): string {
  if (fullPath === cwd) return "";
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

export function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

export function compactTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export function strip(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function safeFileSize(filePath: string): number | null {
  try {
    return (fs as unknown as { statSync(path: string): { size: number } }).statSync(filePath).size;
  } catch {
    return null;
  }
}

export function fileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function isPreviewableTextFile(filePath: string): boolean {
  return PREVIEWABLE_TEXT_EXTENSIONS.has(fileExtension(filePath));
}

export function clipTextPreview(content: string): string {
  return content
    .split("\n")
    .slice(0, MAX_INTAKE_PREVIEW_LINES)
    .join("\n")
    .trim();
}

export function buildIntakeBrief(cwd: string, planningBrief: string, intakeFiles: string[]): string {
  const sections = [
    "# Intake Brief",
    "",
    `**Last updated:** ${todayDate()}`,
    "",
    "## Planning brief",
    planningBrief,
    "",
  ];

  if (intakeFiles.length === 0) {
    sections.push(
      "## Source files",
      "- None provided",
      "",
      "## Distilled notes",
      "No intake materials were present when /plan ran. Planning should rely on the user conversation.",
      "",
    );
    return sections.join("\n");
  }

  sections.push("## Source files");
  for (const relPath of intakeFiles) {
    const fullPath = path.join(cwd, relPath);
    const size = safeFileSize(fullPath);
    sections.push(`- ${relPath}${size == null ? "" : ` (${size} bytes)`}`);
  }

  sections.push("", "## Distilled notes");
  for (const relPath of intakeFiles) {
    const fullPath = path.join(cwd, relPath);
    const size = safeFileSize(fullPath) ?? 0;
    sections.push(`### ${relPath}`);

    if (!isPreviewableTextFile(relPath)) {
      sections.push("Unsupported preview type. Use the raw file only if the user specifically points to it.", "");
      continue;
    }

    if (size > MAX_INTAKE_PREVIEW_BYTES) {
      sections.push(
        `Large file (${size} bytes). Do not read it wholesale by default. Skim selectively or ask the user which section matters most.`,
        "",
      );
      continue;
    }

    const content = readIfExists(fullPath);
    if (!content.trim()) {
      sections.push("Empty file.", "");
      continue;
    }

    const preview = clipTextPreview(content);
    sections.push("```text", preview, "```", "");
  }

  sections.push(
    "## Planning rules",
    "- Treat intake files as raw planning inputs, not permanent system rules.",
    "- Ask only delta questions after reviewing this brief and any raw files you actually need.",
    "- Surface contradictions instead of resolving them silently.",
    "",
  );

  return sections.join("\n");
}

export function listIntakeFiles(cwd: string): string[] {
  const root = intakeDir(cwd);
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];

  function walk(dir: string) {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relPath = relativeToCwd(cwd, fullPath).replace(/\\/g, "/");
      if (relPath === ".context/intake/README.md") continue;
      files.push(relPath);
    }
  }

  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

export function findWorkableStory(cwd: string): StoryFrontmatter | null {
  const active = findActiveStory(cwd);
  if (active) return active;

  const candidates = nonTerminalStories(cwd).sort((a, b) => a.number - b.number);

  return candidates[0] ?? null;
}

export function snapshotStoryFrontmatter(cwd: string): Map<string, { status: string; completed: string }> {
  return new Map(
    listStories(cwd).map(story => [story.file, { status: story.status, completed: story.completed }]),
  );
}

export function userExplicitlyApprovedStatusChange(prompt: string, nextStatus: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  if (GENERAL_APPROVALS.has(normalized)) return true;

  if (nextStatus === "complete") {
    return [
      "mark this done",
      "mark it done",
      "mark this complete",
      "mark it complete",
      "complete this story",
      "complete the story",
      "this is complete",
      "story is complete",
      "mark story complete",
      "close the story",
      "close this story",
      "close it",
      "close story",
      "done with this story",
      "done with the story",
      "this story is done",
      "story is done",
      "wrap up the story",
      "wrap this story",
      "finish the story",
      "finish this story",
    ].some(phrase => normalized.includes(phrase));
  }

  if (nextStatus === "retired") {
    return [
      "retire this story",
      "retire the story",
      "mark this retired",
      "mark it retired",
      "scrap this story",
      "scrap the story",
      "cancel this story",
      "cancel the story",
      "drop this story",
      "drop the story",
    ].some(phrase => normalized.includes(phrase));
  }

  return false;
}

export function restoreStoryFrontmatter(filePath: string, previous: { status: string; completed: string }): boolean {
  const content = readIfExists(filePath);
  if (!content) return false;

  let updated = content.replace(/^\*\*Status:\*\*\s*.+$/m, `**Status:** ${previous.status}  `);
  updated = updated.replace(/^\*\*Completed:\*\*\s*.+$/m, `**Completed:** ${previous.completed}`);

  if (updated === content) return false;
  fs.writeFileSync(filePath, updated);
  return true;
}

export function nextStoryNumber(cwd: string): number {
  const stories = listStories(cwd);
  if (stories.length === 0) return 1;
  return Math.max(...stories.map(s => s.number)) + 1;
}

export function storyFileName(num: number): string {
  return `story-${String(num).padStart(3, "0")}.md`;
}

export function storyTemplate(num: number, title: string): string {
  const today = todayDate();
  return [
    `# Story ${String(num).padStart(3, "0")}: ${title}`,
    "",
    `**Status:** not-started  `,
    `**Created:** ${today}  `,
    `**Last accessed:** ${today}  `,
    `**Completed:** —`,
    "",
    "---",
    "",
    "## Goal",
    "[One paragraph. What this story delivers.]",
    "",
    "## Verification",
    "[How the user confirms this story is done.]",
    "",
    "## Scope — files this story may touch",
    "- ",
    "",
    "## Out of scope — do not touch",
    "- ",
    "",
    "## Dependencies",
    "- ",
    "",
    "---",
    "",
    "## Checklist",
    "- [ ] ",
    "",
    "---",
    "",
    "## Issues",
    "",
    "---",
    "",
    "## Completion Summary",
    "",
  ].join("\n");
}

export function normalizeProjectBrief(input: string, projectName: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed) return trimmed;
  if (projectName.trim()) return `${projectName.trim()} v1`;
  return "the project v1";
}

export function planTemplate(projectName: string): string {
  const today = todayDate();
  return [
    `# ${projectName || "Project"} — Plan`,
    "",
    `**Created:** ${today}  `,
    `**Last updated:** ${today}`,
    "",
    "---",
    "",
    "## What we're building",
    "[2–3 sentences. The product, who it's for, what problem it solves.]",
    "",
    "## What we're not building (v1 scope)",
    "[Explicit exclusions.]",
    "",
    "## Features",
    "### Feature 1: [Name]",
    "[Description. Which stories implement this feature.]",
    "",
    "## Story queue",
    "| Story | Title | Status | Blocks |",
    "|---|---|---|---|",
    "",
    "## Replanning log",
    "",
  ].join("\n");
}

// ── File index helpers ─────────────────────────────────────────────────

export function isIndexableFile(relPath: string): boolean {
  if (!relPath || relPath.startsWith("docs/")) return false;
  if (relPath === "AGENTS.md") return true;
  if (relPath.startsWith(".pi/skills/") && relPath.endsWith(".md")) return true;
  return SOURCE_FILE_EXTENSIONS.has(path.extname(relPath));
}

export function walkSourceFiles(cwd: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeToCwd(cwd, fullPath).replace(/\\/g, "/");
      if (!relPath) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".pi") continue;
        walk(fullPath);
        continue;
      }

      if (entry.name.startsWith(".")) continue;
      if (isIndexableFile(relPath)) files.push(relPath);
    }
  }

  walk(cwd);
  return files.sort((left, right) => left.localeCompare(right));
}

export function guessDescriptionFromPath(relPath: string): string | null {
  const fileName = baseName(relPath);
  const lowerPath = relPath.toLowerCase();

  if (lowerPath === "agents.md") return "Cross-framework project guidance and working notes";
  if (lowerPath.includes("vazir-context")) return "Context injection, init, plan, and consolidation extension";
  if (lowerPath.includes("vazir-tracker")) return "Change tracker, diff, fix, and reset extension";
  if (lowerPath.endsWith("/skill.md")) return "Vazir baseline skill instructions";
  if (lowerPath.endsWith(".json")) return `${fileName} configuration file`;
  if (lowerPath === "readme.md") return "Project overview and setup notes";
  return null;
}

export function formatIndex(entries: Array<{ file: string; description: string }>): string {
  const lines = ["# File Index", ""];
  for (const entry of entries) {
    lines.push(`${entry.file} — ${entry.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeIndex(cwd: string, sourceFiles: string[]): { total: number; undescribed: number } {
  const entries = sourceFiles.map(file => {
    const description = guessDescriptionFromPath(file);
    return {
      file,
      description: description ?? "(undescribed)",
    };
  });
  const indexContent = formatIndex(entries);
  fs.writeFileSync(indexPath(cwd), indexContent);
  return {
    total: entries.length,
    undescribed: entries.filter(entry => entry.description === "(undescribed)").length,
  };
}

export function draftContextMap(cwd: string, sourceFiles: string[]): string | null {
  const agents = readIfExists(path.join(cwd, "AGENTS.md")).trim();
  if (!agents) return null;

  const importantPaths = ["AGENTS.md", ".context/memory/system.md", ".context/memory/index.md"];
  const topLevelDirs = [...new Set(sourceFiles.map(file => file.split("/")[0]).filter(Boolean))].slice(0, 8);

  return [
    "# Context Map",
    "",
    "<!-- Keep this under 150 tokens. Review and tighten after bootstrap. -->",
    "",
    "- Project: see AGENTS.md",
    "- Stack: see AGENTS.md",
    `- Key dirs: ${topLevelDirs.join(", ") || "."}`,
    `- Important paths: ${importantPaths.join(", ")}`,
    `- Files indexed: ${sourceFiles.length}`,
    "",
  ].join("\n");
}

export function hasStoryTemplateShape(content: string): boolean {
  const requiredMarkers = [
    "**Status:**",
    "**Created:**",
    "**Last accessed:**",
    "**Completed:**",
    "## Goal",
    "## Verification",
    "## Scope — files this story may touch",
    "## Out of scope — do not touch",
    "## Dependencies",
    "## Checklist",
    "## Issues",
    "## Completion Summary",
  ];

  return requiredMarkers.every(marker => content.includes(marker));
}

export function malformedStoryFiles(cwd: string): string[] {
  return listStories(cwd)
    .map(story => story.file)
    .filter(filePath => !hasStoryTemplateShape(readIfExists(filePath)));
}

export function undescribedIndexFiles(cwd: string): string[] {
  const lines = readIfExists(indexPath(cwd)).split("\n");
  return lines
    .filter(line => line.includes(" — (undescribed)"))
    .map(line => line.split(" — ")[0]?.trim())
    .filter(Boolean) as string[];
}

// ── Learned rules helpers ──────────────────────────────────────────────

const STORY_LABEL_PATTERN = /^story-\d+$/i;
const DELETE_CANDIDATE_NAME_PATTERN = /(?:^|[-_.])(draft|scrapped|obsolete|backup|bak|old)(?:[-_.]|$)/i;
const STUB_CONTENT_PATTERNS = [
  /^\[?(todo|placeholder|stub)\]?$/i,
  /^tbd$/i,
  /^coming soon$/i,
  /^fill me in$/i,
];

function normalizeStoryLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  return STORY_LABEL_PATTERN.test(normalized) ? normalized : null;
}

function uniqueStoryLabels(labels: string[]): string[] {
  return [...new Set(labels
    .map(label => normalizeStoryLabel(label))
    .filter((label): label is string => Boolean(label)))];
}

function toLearnedRuleEntry(rule: string | LearnedRuleEntry): LearnedRuleEntry {
  if (typeof rule === "string") return parseLearnedRuleEntry(rule);
  return {
    text: rule.text.trim(),
    sourceStories: uniqueStoryLabels(rule.sourceStories ?? []),
  };
}

export function parseLearnedRuleEntry(rawRule: string): LearnedRuleEntry {
  const trimmed = rawRule.trim();
  const match = trimmed.match(/^(.*?)(?:\s*<!--\s*source:\s*([^>]+?)\s*-->)?\s*$/i);
  const text = (match?.[1] ?? trimmed).trim();
  const sourceStories = uniqueStoryLabels((match?.[2] ?? "").split(","));
  return { text, sourceStories };
}

export function formatLearnedRuleEntry(rule: LearnedRuleEntry): string {
  const text = rule.text.trim();
  const sourceStories = uniqueStoryLabels(rule.sourceStories);
  if (!text) return "";
  if (sourceStories.length === 0) return text;
  return `${text} <!-- source: ${sourceStories.join(", ")} -->`;
}

function mergeLearnedRuleEntries(rules: LearnedRuleEntry[]): LearnedRuleEntry[] {
  const merged: LearnedRuleEntry[] = [];
  const byKey = new Map<string, LearnedRuleEntry>();

  for (const rule of rules) {
    const text = rule.text.trim();
    if (!text) continue;

    const key = normalizeRuleCandidate(text);
    const existing = byKey.get(key);
    if (!existing) {
      const next = { text, sourceStories: uniqueStoryLabels(rule.sourceStories) };
      byKey.set(key, next);
      merged.push(next);
      continue;
    }

    existing.sourceStories = uniqueStoryLabels([...existing.sourceStories, ...rule.sourceStories]);
  }

  return merged;
}

export function learnedRuleLinesFromMd(md: string): string[] {
  return learnedRulesFromMd(md).map(formatLearnedRuleEntry).filter(Boolean);
}

export function learnedRulesFromMd(md: string): LearnedRuleEntry[] {
  const lines = md.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === "## Learned Rules");
  if (headingIndex < 0) return [];

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s/.test(lines[index].trim())) {
      sectionEnd = index;
      break;
    }
  }

  const entries = lines
    .slice(headingIndex + 1, sectionEnd)
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => parseLearnedRuleEntry(line.slice(2)));

  return mergeLearnedRuleEntries(entries);
}

export function dedupeLearnedRules(systemMd: string): string {
  const learnedRules = learnedRulesFromMd(systemMd);
  if (learnedRules.length === 0) return systemMd;
  return replaceLearnedRules(systemMd, learnedRules);
}

export function replaceLearnedRules(systemMd: string, rules: Array<string | LearnedRuleEntry>): string {
  const uniqueRules = mergeLearnedRuleEntries(rules.map(toLearnedRuleEntry));
  const replacement = ["## Learned Rules", ...uniqueRules.map(rule => `- ${formatLearnedRuleEntry(rule)}`)];

  const lines = systemMd.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === "## Learned Rules");
  if (headingIndex < 0) return systemMd;

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s/.test(lines[index].trim())) {
      sectionEnd = index;
      break;
    }
  }

  const nextLines = [
    ...lines.slice(0, headingIndex),
    ...replacement,
    "",
    ...lines.slice(sectionEnd),
  ];

  return nextLines.join("\n").replace(/\n+$/, "\n");
}

export function normalizeRuleCandidate(rule: string): string {
  return parseLearnedRuleEntry(rule).text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function appendLearnedRules(cwd: string, rules: Array<string | LearnedRuleEntry>): string[] {
  const systemMdPath = systemPath(cwd);
  if (!fs.existsSync(systemMdPath) || rules.length === 0) return [];

  const systemMd = readIfExists(systemMdPath);
  const existing = learnedRulesFromMd(systemMd);
  const existingByKey = new Map(existing.map(rule => [normalizeRuleCandidate(rule.text), rule]));
  const additions: string[] = [];
  let changed = false;

  for (const rule of rules) {
    const entry = toLearnedRuleEntry(rule);
    if (!entry.text) continue;

    const key = normalizeRuleCandidate(entry.text);
    const existingEntry = existingByKey.get(key);
    if (!existingEntry) {
      const next = { text: entry.text, sourceStories: uniqueStoryLabels(entry.sourceStories) };
      existing.push(next);
      existingByKey.set(key, next);
      additions.push(entry.text);
      changed = true;
      continue;
    }

    const mergedSources = uniqueStoryLabels([...existingEntry.sourceStories, ...entry.sourceStories]);
    if (mergedSources.join(",") !== existingEntry.sourceStories.join(",")) {
      existingEntry.sourceStories = mergedSources;
      changed = true;
    }
  }

  if (!changed) return [];

  fs.writeFileSync(systemMdPath, replaceLearnedRules(systemMd, [...existing, ...additions]));
  return additions;
}

export interface ReviewAggregate {
  text: string;
  count: number;
  sources: string[];
  storySources: string[];
}

export function reviewDetailFiles(cwd: string): string[] {
  const dir = reviewsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name: string) => name.endsWith(".md") && name !== "summary.md" && name !== "remembered.md")
    .map((name: string) => path.join(dir, name))
    .sort((a: string, b: string) => a.localeCompare(b));
}

export function parseReviewFrontmatter(filePath: string): ReviewFrontmatter | null {
  const content = readIfExists(filePath);
  if (!content) return null;

  const statusMatch = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const createdMatch = content.match(/^\*\*Created:\*\*\s*(.+)$/m);
  if (!statusMatch || !createdMatch) return null;

  const completedMatch = content.match(/^\*\*Completed:\*\*\s*(.+)$/m);
  const scopeMatch = content.match(/^\*\*Scope:\*\*\s*(.+)$/m);
  const storyMatch = content.match(/^\*\*Story:\*\*\s*(.+)$/m);
  const focusMatch = content.match(/^\*\*Focus:\*\*\s*(.+)$/m);
  const triggerMatch = content.match(/^\*\*Trigger:\*\*\s*(.+)$/m);
  const story = storyMatch?.[1]?.trim() ?? "—";

  return {
    status: statusMatch[1].trim(),
    created: createdMatch[1].trim(),
    completed: completedMatch?.[1]?.trim() ?? "—",
    scope: scopeMatch?.[1]?.trim() ?? (story !== "—" ? "story" : "whole-codebase"),
    story,
    focus: focusMatch?.[1]?.trim() ?? "",
    trigger: triggerMatch?.[1]?.trim() ?? "manual",
    file: filePath,
  };
}

export function reviewContributesToSummary(filePath: string): boolean {
  const review = parseReviewFrontmatter(filePath);
  if (!review) return true;
  return review.status === "complete";
}

export function reviewFindingsFromFile(filePath: string): ReviewFindingSummary[] {
  const content = readIfExists(filePath);
  if (!content) return [];

  const lines = content.split("\n");
  const findings: ReviewFindingSummary[] = [];
  let inFindings = false;
  let current: ReviewFindingSummary | null = null;

  function pushCurrentFinding(): void {
    if (!current) return;
    const summary = current.summary.trim();
    if (!summary || /^no findings$/i.test(summary)) return;
    findings.push({
      severity: current.severity.trim(),
      category: current.category.trim(),
      summary,
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inFindings) {
      if (trimmed === "## Findings") inFindings = true;
      continue;
    }

    if (trimmed.startsWith("## ") && trimmed !== "## Findings") {
      pushCurrentFinding();
      break;
    }

    if (trimmed.startsWith("### Finding ")) {
      pushCurrentFinding();
      current = { severity: "", category: "", summary: "" };
      continue;
    }

    if (!current) continue;

    const severity = line.match(/^\- Severity:\s*(.+)$/)?.[1]?.trim();
    if (severity !== undefined) {
      current.severity = severity;
      continue;
    }

    const category = line.match(/^\- Category:\s*(.+)$/)?.[1]?.trim();
    if (category !== undefined) {
      current.category = category;
      continue;
    }

    const summary = line.match(/^\- Summary:\s*(.+)$/)?.[1]?.trim();
    if (summary !== undefined) {
      current.summary = summary;
    }
  }

  pushCurrentFinding();

  return findings;
}

export function formatReviewFindingSummary(finding: ReviewFindingSummary): string {
  const severity = finding.severity.trim() || "unspecified";
  const category = finding.category.trim();
  const summary = finding.summary.trim();
  if (category) return `- ${severity}: ${summary} (${category})`;
  return `- ${severity}: ${summary}`;
}

export function reviewRecommendedFixesFromFile(filePath: string): ReviewRecommendedFix[] {
  const content = readIfExists(filePath);
  if (!content) return [];

  const lines = content.split("\n");
  const fixes: ReviewRecommendedFix[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inSection) {
      if (trimmed === "## Recommended Fixes") inSection = true;
      continue;
    }

    if (trimmed.startsWith("## ") && trimmed !== "## Recommended Fixes") {
      break;
    }

    const match = line.match(/^\- \[( |x)\]\s*(.+)$/i);
    if (!match) continue;

    const checked = match[1].toLowerCase() === "x";
    const raw = match[2].trim();
    if (!raw || /^no follow-up fixes required\.?$/i.test(raw)) continue;

    const severityMatch = raw.match(/^(critical|high|medium|low|unspecified)\s+(?:—|-|:)\s+(.+)$/i);
    fixes.push({
      checked,
      severity: (severityMatch?.[1] ?? "unspecified").trim().toLowerCase(),
      summary: (severityMatch?.[2] ?? raw).trim(),
    });
  }

  return fixes;
}

export function reviewOtherFixesFromFile(filePath: string): ReviewRecommendedFix[] {
  const content = readIfExists(filePath);
  if (!content) return [];

  const lines = content.split("\n");
  const fixes: ReviewRecommendedFix[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inSection) {
      if (trimmed === "## Other Fixes") inSection = true;
      continue;
    }

    if (trimmed.startsWith("## ") && trimmed !== "## Other Fixes") {
      break;
    }

    const match = line.match(/^\- \[( |x)\]\s*(.+)$/i);
    if (!match) continue;

    const checked = match[1].toLowerCase() === "x";
    const raw = match[2].trim();
    if (!raw || /^no follow-up fixes required\.?$/i.test(raw)) continue;

    const severityMatch = raw.match(/^(critical|high|medium|low|unspecified)\s+(?:—|-|:)\s+(.+)$/i);
    fixes.push({
      checked,
      severity: (severityMatch?.[1] ?? "unspecified").trim().toLowerCase(),
      summary: (severityMatch?.[2] ?? raw).trim(),
    });
  }

  return fixes;
}

export function reviewRecommendedFixesFromFindings(findings: ReviewFindingSummary[]): ReviewRecommendedFix[] {
  return findings.map(finding => ({
    checked: false,
    severity: (finding.severity.trim() || "unspecified").toLowerCase(),
    summary: finding.summary.trim(),
  }));
}

export function formatReviewRecommendedFixSummary(fix: ReviewRecommendedFix): string {
  const severity = fix.severity.trim() || "unspecified";
  const summary = fix.summary.trim();
  return `- ${severity}: ${summary}`;
}

export function ruleCandidatesFromMarkdown(content: string): string[] {
  return content
    .split("\n")
    .map(line => line.match(/^\- Rule candidate:\s*(.+)$/)?.[1]?.trim() ?? "")
    .filter(line => line && line !== "—");
}

export function rememberedRuleCandidateEntriesFromMarkdown(content: string): RuleCandidateEntry[] {
  return content
    .split(/^---\s*$/m)
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment => {
      const text = segment.match(/^\- Rule candidate:\s*(.+)$/m)?.[1]?.trim() ?? "";
      const sourceLine = segment.match(/^\*\*Source story:\*\*\s*(.+)$/m)?.[1]?.trim() ?? "";
      return {
        text,
        sourceStories: uniqueStoryLabels(sourceLine.split(",")),
      };
    })
    .filter(entry => entry.text && entry.text !== "—");
}

function ruleCandidateEntriesFromFile(filePath: string): RuleCandidateEntry[] {
  const content = readIfExists(filePath);
  if (!content) return [];

  if (path.basename(filePath) === "remembered.md") {
    return rememberedRuleCandidateEntriesFromMarkdown(content);
  }

  const review = parseReviewFrontmatter(filePath);
  const storySources = review && review.story !== "—" ? uniqueStoryLabels([review.story]) : [];
  return ruleCandidatesFromMarkdown(content).map(text => ({ text, sourceStories: storySources }));
}

export function collectReviewAggregates(cwd: string): ReviewAggregate[] {
  const aggregates = new Map<string, ReviewAggregate>();
  const sources = [
    ...reviewDetailFiles(cwd).filter(filePath => reviewContributesToSummary(filePath)),
    rememberedRulesPath(cwd),
  ].filter(filePath => fs.existsSync(filePath));

  for (const filePath of sources) {
    const sourceName = path.basename(filePath);
    for (const candidate of ruleCandidateEntriesFromFile(filePath)) {
      const key = normalizeRuleCandidate(candidate.text);
      const existing = aggregates.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.sources.includes(sourceName)) existing.sources.push(sourceName);
        existing.storySources = uniqueStoryLabels([...existing.storySources, ...candidate.sourceStories]);
        continue;
      }

      aggregates.set(key, {
        text: candidate.text,
        count: 1,
        sources: [sourceName],
        storySources: uniqueStoryLabels(candidate.sourceStories),
      });
    }
  }

  return [...aggregates.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.text.localeCompare(right.text);
  });
}

export function writeReviewSummary(cwd: string, aggregates: ReviewAggregate[]): void {
  const lines = [
    "# Review Summary",
    "",
    `**Last updated:** ${nowISO()}`,
    "",
    "## Findings",
  ];

  if (aggregates.length === 0) {
    lines.push("- None yet", "");
    fs.writeFileSync(reviewSummaryPath(cwd), lines.join("\n"));
    return;
  }

  for (const aggregate of aggregates) {
    const status = shouldPromoteReviewAggregate(aggregate) ? "promoted" : "tracked";
    const storySuffix = aggregate.storySources.length > 0 ? ` | stories: ${aggregate.storySources.join(", ")}` : "";
    lines.push(`- ${aggregate.text} | count: ${aggregate.count} | status: ${status} | sources: ${aggregate.sources.join(", ")}${storySuffix}`);
  }

  lines.push("");
  fs.writeFileSync(reviewSummaryPath(cwd), lines.join("\n"));
}

export function shouldPromoteReviewAggregate(aggregate: ReviewAggregate): boolean {
  return aggregate.sources.includes("remembered.md") || aggregate.count >= REVIEW_PROMOTION_THRESHOLD;
}

function unlearnedRuleKeys(cwd: string): Set<string> {
  return new Set(
    readIfExists(complaintsLogPath(cwd))
      .split("\n")
      .map(line => line.match(/\|\s*unlearned\s*\|\s*"(.+)"\s*$/)?.[1]?.trim() ?? "")
      .filter(Boolean)
      .map(normalizeRuleCandidate),
  );
}

export function syncReviewSummaryAndPromoteRules(cwd: string): string[] {
  ensureReviewStructure(cwd);
  const aggregates = collectReviewAggregates(cwd);
  writeReviewSummary(cwd, aggregates);
  const suppressedKeys = unlearnedRuleKeys(cwd);
  const promoted = aggregates
    .filter(shouldPromoteReviewAggregate)
    .filter(aggregate => !suppressedKeys.has(normalizeRuleCandidate(aggregate.text)))
    .map(aggregate => ({ text: aggregate.text, sourceStories: aggregate.storySources }));
  const additions = appendLearnedRules(cwd, promoted);
  applyLocalRuleDedupe(cwd);
  return additions;
}

export function clearLegacyPendingLearnings(cwd: string): void {
  const pendingPath = path.join(cwd, ".context", "learnings", "pending.md");
  if (!fs.existsSync(pendingPath)) return;
  fs.writeFileSync(pendingPath, "");
}

export function rememberEntry(rule: string, sourceStory = "—"): string {
  return [
    "---",
    `**Recorded:** ${nowISO()}  `,
    `**Source story:** ${sourceStory}  `,
    `- Rule candidate: ${rule}`,
    "",
  ].join("\n");
}

export function mostRecentStoryForReview(cwd: string): StoryFrontmatter | null {
  const active = findActiveStory(cwd);
  if (active) return active;

  const stories = listStories(cwd).sort(compareStoriesByRecencyDesc);
  return stories[0] ?? null;
}

export function defaultStoryLabelForReview(cwd: string): string {
  const story = mostRecentStoryForReview(cwd);
  return story ? path.basename(story.file, ".md") : "—";
}

export function activeStoryLabelForManualReview(cwd: string): string {
  const active = findActiveStory(cwd);
  return active ? path.basename(active.file, ".md") : "—";
}

export function selectableStoriesForManualReview(cwd: string): StoryFrontmatter[] {
  const stories = listStories(cwd);
  const inProgress = stories
    .filter(story => story.status === "in-progress")
    .sort(compareStoriesByRecencyDesc);
  const completed = stories
    .filter(story => story.status === "complete")
    .sort(compareStoriesByCompletionDesc);
  return [...inProgress, ...completed];
}

export function manualReviewStoryChoiceLabel(story: StoryFrontmatter): string {
  const storyLabel = path.basename(story.file, ".md");
  if (story.status === "in-progress") return `In-progress story — ${storyLabel}`;
  if (story.status === "complete") return `Completed ${story.completed} — ${storyLabel}`;
  return `${story.status} — ${storyLabel}`;
}

function readStorySection(content: string, heading: string): string {
  const lines = content.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (headingIndex < 0) return "";

  const sectionLines: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n").trim();
}

export function assessStoryCompletionReadiness(filePath: string): StoryCompletionReadiness {
  const content = readIfExists(filePath);
  const checklist = readStorySection(content, "Checklist");
  const issues = readStorySection(content, "Issues");
  const completionSummary = readStorySection(content, "Completion Summary");

  const uncheckedChecklistItems = checklist
    .split("\n")
    .map(line => line.match(/^\- \[ \]\s+(.+)$/)?.[1]?.trim() ?? "")
    .filter(Boolean);

  const openIssueStatuses = [...issues.matchAll(/^\- \*\*Status:\*\*\s*(.+?)\s*$/gm)]
    .map(match => match[1].trim().toLowerCase())
    .filter(status => status === "pending" || status === "unresolved" || status === "reopened");

  return {
    uncheckedChecklistItems,
    openIssueStatuses,
    hasCompletionSummary: completionSummary.trim().length > 0,
  };
}

export function storyDependencyLabels(filePath: string): string[] {
  const content = readIfExists(filePath);
  const dependencies = readStorySection(content, "Dependencies");
  return uniqueStoryLabels([...dependencies.matchAll(/\bstory-\d+\b/gi)].map(match => match[0]));
}

function archiveReasonForStory(story: StoryFrontmatter): string {
  const storyLabel = path.basename(story.file, ".md");
  if (story.status === "retired") {
    return `${storyLabel} is retired and has no active dependents`;
  }

  return `${storyLabel} completed ${story.completed || story.lastAccessed || "previously"}, is older than the last 3 completed stories, and has no active dependents`;
}

export function archivedStoryLabels(cwd: string): string[] {
  const dir = archiveStoriesDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .map(name => name.match(/(story-\d+)/i)?.[1]?.toLowerCase() ?? "")
    .filter(Boolean);
}

export function memoryReviewArchiveCandidates(cwd: string): ArchiveCandidate[] {
  const recentCompleted = listStories(cwd)
    .filter(story => story.status === "complete" && story.completed !== "—")
    .sort(compareStoriesByCompletionDesc)
    .slice(0, 3);
  const keepStoryLabels = new Set(recentCompleted.map(story => path.basename(story.file, ".md").toLowerCase()));
  const referencedByActiveStories = new Set(
    nonTerminalStories(cwd).flatMap(story => storyDependencyLabels(story.file)),
  );

  const storyCandidates = listStories(cwd)
    .filter(story => story.status === "complete" || story.status === "retired")
    .filter(story => !keepStoryLabels.has(path.basename(story.file, ".md").toLowerCase()))
    .filter(story => !referencedByActiveStories.has(path.basename(story.file, ".md").toLowerCase()))
    .sort((left, right) => {
      const leftDate = left.completed !== "—" ? left.completed : left.lastAccessed;
      const rightDate = right.completed !== "—" ? right.completed : right.lastAccessed;
      const dateCmp = leftDate.localeCompare(rightDate);
      if (dateCmp !== 0) return dateCmp;
      return left.number - right.number;
    })
    .map(story => ({
      filePath: story.file,
      label: path.basename(story.file),
      reason: archiveReasonForStory(story),
      kind: "story" as const,
    }));

  const archivedLabels = new Set(storyCandidates.map(candidate => path.basename(candidate.filePath, ".md").toLowerCase()));
  const reviewCandidates = reviewDetailFiles(cwd)
    .map(filePath => parseReviewFrontmatter(filePath))
    .filter((review): review is ReviewFrontmatter => review !== null)
    .filter(review => review.status === "complete" && review.story !== "—" && archivedLabels.has(review.story.toLowerCase()))
    .map(review => ({
      filePath: review.file,
      label: path.basename(review.file),
      reason: `${path.basename(review.file)} is a complete review for archived ${review.story}`,
      kind: "review" as const,
    }));

  return [...storyCandidates, ...reviewCandidates];
}

function nextArchivePath(cwd: string, candidate: ArchiveCandidate): string {
  const archiveRoot = candidate.kind === "story" ? archiveStoriesDir(cwd) : archiveReviewsDir(cwd);
  const ext = path.extname(candidate.filePath);
  const base = path.basename(candidate.filePath, ext);
  let targetPath = path.join(archiveRoot, `${base}${ext}`);
  let suffix = 1;

  while (fs.existsSync(targetPath)) {
    targetPath = path.join(archiveRoot, `${base}-${suffix}${ext}`);
    suffix += 1;
  }

  return targetPath;
}

export function archiveMemoryReviewCandidates(cwd: string, candidates: ArchiveCandidate[]): string[] {
  ensureArchiveStructure(cwd);

  const archived: string[] = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.filePath)) continue;
    const targetPath = nextArchivePath(cwd, candidate);
    fs.copyFileSync(candidate.filePath, targetPath);
    fs.rmSync(candidate.filePath, { force: true });
    archived.push(relativeToCwd(cwd, targetPath).replace(/\\/g, "/"));
  }

  return archived;
}

export function staleRuleCandidates(cwd: string): StaleRuleCandidate[] {
  const archivedStories = new Set(archivedStoryLabels(cwd));
  return learnedRulesFromMd(readIfExists(systemPath(cwd)))
    .map((rule, ruleIndex) => {
      if (rule.sourceStories.length === 0) {
        return {
          ruleIndex,
          text: rule.text,
          sourceStories: [],
          reason: "origin unknown — no provenance tag",
        };
      }

      const archivedSources = rule.sourceStories.filter(source => archivedStories.has(source));
      if (archivedSources.length === rule.sourceStories.length) {
        return {
          ruleIndex,
          text: rule.text,
          sourceStories: rule.sourceStories,
          reason: `all source stories are archived (${rule.sourceStories.join(", ")})`,
        };
      }

      return null;
    })
    .filter((candidate): candidate is StaleRuleCandidate => candidate !== null);
}

export function memoryReviewDeleteCandidates(cwd: string): DeleteCandidate[] {
  return listIntakeFiles(cwd)
    .map(relPath => {
      const filePath = path.join(cwd, relPath);
      const size = safeFileSize(filePath) ?? 0;
      const content = size > 0 ? readIfExists(filePath) : "";
      const trimmed = content.trim();

      let reason = "";
      if (size === 0 || (content && !trimmed)) {
        reason = "empty intake file";
      } else if (DELETE_CANDIDATE_NAME_PATTERN.test(path.basename(filePath))) {
        reason = "filename suggests a superseded draft";
      } else if (STUB_CONTENT_PATTERNS.some(pattern => pattern.test(trimmed))) {
        reason = "stub file with no retained context";
      }

      if (!reason) return null;
      return {
        filePath,
        label: relPath.replace(/\\/g, "/"),
        reason,
      };
    })
    .filter((candidate): candidate is DeleteCandidate => candidate !== null);
}

export function defaultReviewFocus(
  cwd: string,
  options: { scope?: ReviewScope; storyLabel?: string } = {},
): string {
  const scope = options.scope ?? "story";
  if (scope === "whole-codebase") return "whole codebase review";

  const storyLabel = options.storyLabel ?? defaultStoryLabelForReview(cwd);
  return storyLabel === "—" ? "recent changes" : `${storyLabel} and recent changes`;
}

export function activeStoryLabelForReview(cwd: string): string {
  const active = findActiveStory(cwd);
  return active ? path.basename(active.file, ".md") : "—";
}

export function buildRememberInstruction(cwd: string): string {
  const activeStory = activeStoryLabelForReview(cwd);
  return [
    "Write one short reusable lesson to .context/reviews/remembered.md based on the recent fix and current story context.",
    "",
    "Requirements:",
    "1. Distill the lesson into one concise rule, not a verbatim complaint or bug report.",
    "2. Prefer a reusable pattern such as 'When X, also do Y'.",
    activeStory !== "—"
      ? `3. Append exactly one entry using the existing remembered.md format with \`**Source story:** ${activeStory}\` and \`- Rule candidate: ...\`.`
      : "3. Append exactly one entry using the existing remembered.md format with `**Source story:** —` and `- Rule candidate: ...`.",
    "4. Avoid duplicates if the same rule already exists in .context/reviews/remembered.md or .context/memory/system.md.",
    "5. Use the active story, recent fix context, and existing remembered rules to choose the best wording.",
    activeStory !== "—" ? `6. Active story: ${activeStory}.` : "6. No active story is available; rely on the recent fix context from the conversation.",
  ].join("\n");
}

export function createReviewDraft(
  cwd: string,
  options: { focus: string; scope?: ReviewScope; storyLabel?: string; trigger?: string },
): ReviewDraft {
  ensureReviewStructure(cwd);

  const created = nowISO();
  const fallbackStoryLabel = options.scope === "story" ? activeStoryLabelForManualReview(cwd) : defaultStoryLabelForReview(cwd);
  const storyLabel = options.storyLabel?.trim() || fallbackStoryLabel;
  const scope = options.scope ?? (storyLabel === "—" ? "whole-codebase" : "story");
  const trigger = options.trigger?.trim() || "manual";
  const reviewBaseName = `review-${compactTimestamp(created)}`;
  let fileName = `${reviewBaseName}.md`;
  let filePath = path.join(reviewsDir(cwd), fileName);
  let suffix = 2;

  while (fs.existsSync(filePath)) {
    fileName = `${reviewBaseName}-${suffix}.md`;
    filePath = path.join(reviewsDir(cwd), fileName);
    suffix += 1;
  }

  fs.writeFileSync(filePath, reviewFileTemplate(created, scope, storyLabel, options.focus, trigger));

  return {
    created,
    focus: options.focus,
    scope,
    storyLabel,
    trigger,
    fileName,
    filePath,
  };
}

export function buildReviewInstruction(review: ReviewDraft): string {
  const reviewScope = review.scope === "whole-codebase"
    ? "whole codebase"
    : review.storyLabel !== "—"
      ? `${review.storyLabel} and its direct integration points`
      : "recent changes";

  return [
    `Run a code review and write the results to .context/reviews/${review.fileName}.`,
    "",
    "Requirements:",
    "1. Treat the review file as the source of truth. Update the checklist as you work.",
    "2. Focus on bugs, regressions, missing tests, dead code, simplification opportunities, scope drift, and workflow violations.",
    "3. Keep findings primary. If there are no findings, replace the placeholder finding with a short 'No findings' note.",
    "4. For every finding, fill in Severity, Category, Summary, Evidence, Recommendation, and Rule candidate. Categories may include bug, regression, test-gap, dead-code, simplification, or workflow.",
    "5. Add or update one checklist item per finding in `## Recommended Fixes` using the format `- [ ] severity — action`. Mark items `[x]` only when the recommended follow-up has actually been completed.",
    "6. If there are no findings, replace the placeholder item in `## Recommended Fixes` with `- [x] No follow-up fixes required.`.",
    "7. Use `- Rule candidate: —` when a finding should not become a reusable rule.",
    "8. Do not change story status as part of the review. A story only becomes complete when the user explicitly says so.",
    "9. Finish by writing the Completion Summary, setting `**Status:** complete`, and setting `**Completed:**` to today's date.",
    "10. Do not update .context/reviews/summary.md or .context/reviews/remembered.md manually; Vazir syncs them automatically.",
    `11. Review scope: ${reviewScope}.`,
    `12. Review focus: ${review.focus}.`,
    review.storyLabel !== "—" ? `13. Story: ${review.storyLabel}.` : "13. No story is attached; keep the review manual and comprehensive within the requested scope.",
    `14. Trigger: ${review.trigger}.`,
  ].join("\n");
}

export function reviewFileTemplate(
  created: string,
  scope: ReviewScope,
  storyLabel: string,
  focus: string,
  trigger: string,
): string {
  return [
    `# Code Review ${created}`,
    "",
    `**Status:** in-progress  `,
    `**Created:** ${created}  `,
    `**Completed:** —  `,
    `**Scope:** ${scope}  `,
    `**Story:** ${storyLabel}  `,
    `**Focus:** ${focus}  `,
    `**Trigger:** ${trigger}`,
    "",
    "---",
    "",
    "## Goal",
    "[Inspect the requested scope for bugs, regressions, missing tests, dead code, simplification opportunities, scope drift, and workflow violations.]",
    "",
    "## Checklist",
    "- [ ] Inspect the relevant diff and touched files",
    "- [ ] Check for bugs, regressions, and edge cases",
    "- [ ] Check tests and verification gaps",
    "- [ ] Check for dead code, duplication, and simplification opportunities",
    "- [ ] Capture reusable rule candidates where warranted",
    "- [ ] Write the completion summary and mark the review complete",
    "",
    "---",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: medium",
    "- Category: bug",
    "- Summary: ",
    "- Evidence: ",
    "- Recommendation: ",
    "- Rule candidate: —",
    "",
    "---",
    "",
    "## Recommended Fixes",
    "[Add one checklist item per finding using `- [ ] severity — action`. Mark items [x] only after the follow-up work is complete. If there are no findings, replace this note with `- [x] No follow-up fixes required.`]",
    "",
    "---",
    "",
    "## Other Fixes",
    "[Add any additional follow-up tasks here using `- [ ] severity — action` or simple `- [ ] description`. Mark items [x] only after the work is complete.]",
    "",
    "---",
    "",
    "## Completion Summary",
    "[Summarize the review outcome. If there are no findings, say so directly and note any residual verification gaps.]",
    "",
  ].join("\n");
}

// ── Consolidation helpers ──────────────────────────────────────────────

export function applyLocalRuleDedupe(cwd: string): boolean {
  const systemMdPath = systemPath(cwd);
  if (!fs.existsSync(systemMdPath)) return false;

  const before = readIfExists(systemMdPath);
  const after = dedupeLearnedRules(before);
  if (after === before) return false;
  fs.writeFileSync(systemMdPath, after);
  return true;
}

export function buildContextMapDraftInstruction(cwd: string): string {
  const projectSettingsPath = path.join(settingsDir(cwd), "project.json");
  const projectSettings = readIfExists(projectSettingsPath);
  return [
    "Complete the Vazir bootstrap context drafting using the currently selected Pi model.",
    "",
    "Tasks:",
    "1. Rewrite .context/memory/context-map.md into a concise project orientation under 150 tokens.",
    "2. Base it on the actual repository structure, AGENTS.md, and key fragile areas you can infer from the codebase.",
    "3. Replace placeholder or generic lines with concrete project-specific content.",
    "4. Replace every `(undescribed)` entry in .context/memory/index.md with a concise useful description.",
    "5. Keep descriptions short and factual. Do not rewrite already useful descriptions unless they are obviously wrong.",
    "",
    `Project settings:\n${projectSettings || "{}"}`,
  ].join("\n");
}

export function buildConsolidationInstruction(cwd: string): string {
  const malformed = malformedStoryFiles(cwd);
  const undescribed = undescribedIndexFiles(cwd);
  return [
    "Run Vazir consolidation using the currently selected Pi model.",
    "",
    "Tasks:",
    "1. Read .context/complaints-log.md and cluster similar complaints.",
    "2. Read .context/reviews/summary.md and any detailed code review files only if the summary needs clarification.",
    "3. Update .context/memory/system.md ## Learned Rules with concise promoted rules for complaint clusters that hit threshold, and promote any reopened issue directly.",
    "4. When you add a learned rule and the source story is knowable, append a best-effort provenance tag like `<!-- source: story-002 -->`. If the origin is unclear, do not invent one.",
    "5. Merge duplicate or overlapping learned rules. Keep the ## Rules section intact.",
    undescribed.length > 0 ? "6. Replace every `(undescribed)` entry in .context/memory/index.md with a concise useful description." : "6. Leave .context/memory/index.md unchanged unless a description is clearly wrong.",
    malformed.length > 0 ? "7. Repair malformed story files so they include the required frontmatter lines and all required template sections." : "7. Leave story files unchanged unless you discover a malformed one while consolidating.",
    "8. Preserve existing user-authored content unless it is clearly placeholder text or malformed structure.",
    "",
    malformed.length > 0 ? `Malformed stories detected: ${malformed.map(filePath => path.basename(filePath)).join(", ")}` : "Malformed stories detected: none",
    undescribed.length > 0 ? `Undescribed index entries: ${undescribed.join(", ")}` : "Undescribed index entries: none",
  ].join("\n");
}

export function buildInitSummary(fileStatuses: InitFileStatus[], jjLine: string, jjDetailLine: string): string {
  return [
    "Vazir init summary",
    jjLine,
    jjDetailLine,
    "☑ Added files:",
    ...fileStatuses.map(file => `    ${file.present ? "☑" : "☒"} ${file.label}`),
  ].join("\n");
}
