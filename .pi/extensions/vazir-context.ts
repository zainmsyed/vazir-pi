/// <reference path="../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../types/node-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

const SOURCE_FILE_EXTENSIONS = new Set([
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

const SKIP_DIRS = new Set([
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

const CONTEXT_MAP_TEMPLATE = [
  "# Context Map",
  "",
  "<!-- Keep this under 150 tokens. Vazir injects it before every agent turn. -->",
  "<!-- Fill in project name, stack, key directories, and fragile areas. -->",
  "",
  "- Project: ",
  "- Stack: ",
  "- Key dirs: ",
  "- Fragile: ",
  "",
].join("\n");

const SYSTEM_MD_TEMPLATE = [
  "# System Rules",
  "",
  "## Rules",
  "- Follow existing project conventions.",
  "- Write directly to real project files.",
  "- Ask before changing ambiguous areas.",
  "",
  "## Learned Rules",
  "",
].join("\n");

const AGENTS_MD_TEMPLATE = [
  "# AGENTS.md",
  "",
  "## Project",
  "- Name:",
  "- Goal:",
  "- Stack:",
  "",
  "## Important Paths",
  "- ",
  "",
  "## Fragile Areas",
  "- ",
  "",
  "## Working Notes",
  "- ",
  "",
].join("\n");

const JJ_DOCS_URL = "https://www.jj-vcs.dev/latest/install-and-setup/";
const JJ_OVERVIEW_URL = "https://www.jj-vcs.dev/latest/";
const MAX_INTAKE_PREVIEW_BYTES = 4000;
const MAX_INTAKE_PREVIEW_LINES = 12;
const REVIEW_PROMOTION_THRESHOLD = 2;

let lastUserPrompt = "";
let useJJ = false;
let pendingInitSummary: string | null = null;
const storyFrontmatterSnapshots = new Map<string, Map<string, { status: string; completed: string }>>();

type InitFileStatus = {
  label: string;
  present: boolean;
};

interface StoryFrontmatter {
  status: string;
  lastAccessed: string;
  completed: string;
  file: string;
  number: number;
}

interface SeedStorySpec {
  title: string;
  goal: string;
  verification: string;
  scope: string[];
  outOfScope: string[];
  dependencies: string[];
  checklist: string[];
}

// ── Path helpers ───────────────────────────────────────────────────────

function memoryDir(cwd: string) {
  return path.join(cwd, ".context", "memory");
}

function settingsDir(cwd: string) {
  return path.join(cwd, ".context", "settings");
}

function storiesDir(cwd: string) {
  return path.join(cwd, ".context", "stories");
}

function intakeBriefPath(cwd: string) {
  return path.join(storiesDir(cwd), "intake-brief.md");
}

function intakeDir(cwd: string) {
  return path.join(cwd, ".context", "intake");
}

function complaintsLogPath(cwd: string) {
  return path.join(cwd, ".context", "complaints-log.md");
}

function reviewsDir(cwd: string) {
  return path.join(cwd, ".context", "reviews");
}

function reviewSummaryPath(cwd: string) {
  return path.join(reviewsDir(cwd), "summary.md");
}

function rememberedRulesPath(cwd: string) {
  return path.join(reviewsDir(cwd), "remembered.md");
}

function indexPath(cwd: string) {
  return path.join(memoryDir(cwd), "index.md");
}

function systemPath(cwd: string) {
  return path.join(memoryDir(cwd), "system.md");
}

function contextMapPath(cwd: string) {
  return path.join(memoryDir(cwd), "context-map.md");
}

function intakeReadmePath(cwd: string) {
  return path.join(intakeDir(cwd), "README.md");
}

const INTAKE_README_TEMPLATE = [
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

const REVIEW_SUMMARY_TEMPLATE = [
  "# Review Summary",
  "",
  "**Last updated:** —",
  "",
  "## Findings",
  "- None yet",
  "",
].join("\n");

const REMEMBERED_RULES_TEMPLATE = [
  "# Remembered Rules",
  "",
  "Manual rules captured via /remember.",
  "",
].join("\n");

// ── Generic helpers ────────────────────────────────────────────────────

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureIntakeStructure(cwd: string): void {
  ensureDir(intakeDir(cwd));
  for (const segment of ["prd", "dictionaries", "references", "uploads"]) {
    ensureDir(path.join(intakeDir(cwd), segment));
  }
}

function ensureReviewStructure(cwd: string): void {
  ensureDir(reviewsDir(cwd));
  if (!fs.existsSync(reviewSummaryPath(cwd))) {
    fs.writeFileSync(reviewSummaryPath(cwd), REVIEW_SUMMARY_TEMPLATE);
  }
  if (!fs.existsSync(rememberedRulesPath(cwd))) {
    fs.writeFileSync(rememberedRulesPath(cwd), REMEMBERED_RULES_TEMPLATE);
  }
}

function relativeToCwd(cwd: string, fullPath: string): string {
  if (fullPath === cwd) return "";
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function compactTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function detectJJ(cwd: string): boolean {
  try {
    childProcess.execSync("jj root", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function detectGitRepo(cwd: string): boolean {
  try {
    childProcess.execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function strip(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function safeFileSize(filePath: string): number | null {
  try {
    return (fs as unknown as { statSync(path: string): { size: number } }).statSync(filePath).size;
  } catch {
    return null;
  }
}

function fileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function isPreviewableTextFile(filePath: string): boolean {
  const ext = fileExtension(filePath);
  return new Set([
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
  ]).has(ext);
}

function clipTextPreview(content: string): string {
  return content
    .split("\n")
    .slice(0, MAX_INTAKE_PREVIEW_LINES)
    .join("\n")
    .trim();
}

function buildIntakeBrief(cwd: string, planningBrief: string, intakeFiles: string[]): string {
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

function listIntakeFiles(cwd: string): string[] {
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

function findWorkableStory(cwd: string): StoryFrontmatter | null {
  const active = findActiveStory(cwd);
  if (active) return active;

  const candidates = listStories(cwd)
    .filter(story => story.status !== "complete" && story.status !== "retired")
    .sort((a, b) => a.number - b.number);

  return candidates[0] ?? null;
}

function snapshotStoryFrontmatter(cwd: string): Map<string, { status: string; completed: string }> {
  return new Map(
    listStories(cwd).map(story => [story.file, { status: story.status, completed: story.completed }]),
  );
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

function userExplicitlyApprovedStatusChange(prompt: string, nextStatus: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  const generalApprovals = new Set(["yes", "y", "done", "approved", "looks good", "ship it"]);
  if (generalApprovals.has(normalized)) return true;

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
    ].some(phrase => normalized.includes(phrase));
  }

  return false;
}

function restoreStoryFrontmatter(filePath: string, previous: { status: string; completed: string }): boolean {
  const content = readIfExists(filePath);
  if (!content) return false;

  let updated = content.replace(/^\*\*Status:\*\*\s*.+$/m, `**Status:** ${previous.status}  `);
  updated = updated.replace(/^\*\*Completed:\*\*\s*.+$/m, `**Completed:** ${previous.completed}`);

  if (updated === content) return false;
  fs.writeFileSync(filePath, updated);
  return true;
}

function enforceUserOnlyStoryStatuses(cwd: string): string[] {
  const snapshot = storyFrontmatterSnapshots.get(cwd);
  if (!snapshot) return [];

  const revertedStories: string[] = [];
  for (const story of listStories(cwd)) {
    const previous = snapshot.get(story.file);
    if (!previous) continue;
    if (story.status !== "complete" && story.status !== "retired") continue;
    if (story.status === previous.status) continue;
    if (userExplicitlyApprovedStatusChange(lastUserPrompt, story.status)) continue;

    if (restoreStoryFrontmatter(story.file, previous)) {
      revertedStories.push(path.basename(story.file));
    }
  }

  storyFrontmatterSnapshots.delete(cwd);
  return revertedStories;
}

function nextStoryNumber(cwd: string): number {
  const stories = listStories(cwd);
  if (stories.length === 0) return 1;
  return Math.max(...stories.map(s => s.number)) + 1;
}

function storyFileName(num: number): string {
  return `story-${String(num).padStart(3, "0")}.md`;
}

function storyTemplate(num: number, title: string): string {
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

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeProjectBrief(input: string, projectName: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed) return trimmed;
  if (projectName.trim()) return `${projectName.trim()} v1`;
  return "the project v1";
}

function deriveStorySubject(brief: string): string {
  const cleaned = brief
    .replace(/^(build|create|make|plan|design|ship)\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  if (!cleaned) return "project";
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
}

function seedStorySpecs(brief: string): SeedStorySpec[] {
  const subject = deriveStorySubject(brief);
  const storySubject = titleCase(subject);

  return [
    {
      title: `Scope and foundation for ${storySubject}`,
      goal: `Capture the v1 shape of ${subject}, confirm the initial constraints, and set up the smallest safe foundation for implementation.`,
      verification: "The user can review the seeded plan and starter stories and confirm the project direction, scope, and first implementation slice.",
      scope: [".context/stories/plan.md", ".context/stories/"],
      outOfScope: ["Unplanned product areas", "Nice-to-have features without user approval"],
      dependencies: ["Requires: none", "Blocks: story-002, story-003"],
      checklist: [
        `Capture the core v1 outcome for ${subject}`,
        "List explicit v1 exclusions and risky assumptions",
        "Confirm the first implementation slice is small enough to verify in one session",
      ],
    },
    {
      title: `Core happy path for ${storySubject}`,
      goal: `Define the smallest end-to-end user-visible slice of ${subject} that proves the product works for its primary user.`,
      verification: "The user can perform one clear happy-path check that demonstrates the main v1 flow works end to end.",
      scope: ["Primary app flow files", "Minimal supporting state or API surface"],
      outOfScope: ["Secondary workflows", "Admin or analytics extras unless required for the happy path"],
      dependencies: ["Requires: story-001", "Blocks: story-003"],
      checklist: [
        "Define the single most important user flow",
        "Identify the files and systems needed for the first shippable slice",
        "Keep the verification step observable and unambiguous",
      ],
    },
    {
      title: `Verification and polish for ${storySubject}`,
      goal: `Tighten the initial slice of ${subject}, verify key behavior, and capture the follow-up work that should happen after the first end-to-end path is stable.`,
      verification: "The user can confirm the initial slice is stable enough to continue and can clearly see what remains for the next stories.",
      scope: ["Files touched by the core happy path", "Verification harnesses or smoke checks needed for confidence"],
      outOfScope: ["Large refactors", "Future roadmap items not needed for initial confidence"],
      dependencies: ["Requires: story-002", "Blocks: later feature stories"],
      checklist: [
        "List the highest-risk edge cases still worth checking in v1",
        "Capture follow-up work that should be split into later stories",
        "Document what the agent can and cannot verify mechanically",
      ],
    },
  ];
}

function fillStoryTemplate(num: number, spec: SeedStorySpec): string {
  return [
    `# Story ${String(num).padStart(3, "0")}: ${spec.title}`,
    "",
    `**Status:** not-started  `,
    `**Created:** ${todayDate()}  `,
    `**Last accessed:** ${todayDate()}  `,
    `**Completed:** —`,
    "",
    "---",
    "",
    "## Goal",
    spec.goal,
    "",
    "## Verification",
    spec.verification,
    "",
    "## Scope — files this story may touch",
    ...spec.scope.map(item => `- ${item}`),
    "",
    "## Out of scope — do not touch",
    ...spec.outOfScope.map(item => `- ${item}`),
    "",
    "## Dependencies",
    ...spec.dependencies.map(item => `- ${item}`),
    "",
    "---",
    "",
    "## Checklist",
    ...spec.checklist.map(item => `- [ ] ${item}`),
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

function planTemplate(projectName: string): string {
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

function seededPlanTemplate(projectName: string, brief: string, firstStoryNumber: number): string {
  const specs = seedStorySpecs(brief);
  const today = todayDate();
  const rows = specs.map((spec, index) => {
    const storyNumber = firstStoryNumber + index;
    const blocks = index === 0 ? `${storyFileName(storyNumber + 1)}, ${storyFileName(storyNumber + 2)}` : index === 1 ? `${storyFileName(storyNumber + 1)}` : "—";
    return `| ${storyFileName(storyNumber)} | ${spec.title} | not-started | ${blocks} |`;
  });

  return [
    `# ${projectName || "Project"} — Plan`,
    "",
    `**Created:** ${today}  `,
    `**Last updated:** ${today}`,
    "",
    "---",
    "",
    "## What we're building",
    `Initial planning seed for ${brief}. This is a deterministic scaffold that the agent should refine with the user before implementation begins.`,
    "",
    "## What we're not building (v1 scope)",
    "- Anything the user has not explicitly prioritized for the first slice",
    "- Nice-to-have extensions that do not help verify the core workflow",
    "",
    "## Features",
    `### Feature 1: ${titleCase(deriveStorySubject(brief))}`,
    "Initial end-to-end slice seeded for planning refinement. Stories below are placeholders that should be tightened with user answers.",
    "",
    "## Story queue",
    "| Story | Title | Status | Blocks |",
    "|---|---|---|---|",
    ...rows,
    "",
    "## Replanning log",
    `- ${today}: Seeded starter plan from the initial project brief. Refine after clarifying questions.`,
    "",
  ].join("\n");
}

function ensureSeedStories(cwd: string, brief: string): { files: string[]; created: boolean } {
  const existingStories = listStories(cwd).sort((a, b) => a.number - b.number);
  if (existingStories.length > 0) {
    return {
      files: existingStories.map(story => path.basename(story.file)),
      created: false,
    };
  }

  const firstStoryNumber = nextStoryNumber(cwd);
  const createdFiles: string[] = [];
  for (const [index, spec] of seedStorySpecs(brief).entries()) {
    const storyNumber = firstStoryNumber + index;
    const fileName = storyFileName(storyNumber);
    fs.writeFileSync(path.join(storiesDir(cwd), fileName), fillStoryTemplate(storyNumber, spec));
    createdFiles.push(fileName);
  }

  return { files: createdFiles, created: true };
}

// ── File index helpers ─────────────────────────────────────────────────

function isIndexableFile(relPath: string): boolean {
  if (!relPath || relPath.startsWith("docs/")) return false;
  if (relPath === "AGENTS.md") return true;
  if (relPath.startsWith(".pi/skills/") && relPath.endsWith(".md")) return true;
  return SOURCE_FILE_EXTENSIONS.has(path.extname(relPath));
}

function walkSourceFiles(cwd: string): string[] {
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

function guessDescriptionFromPath(relPath: string): string | null {
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

function formatIndex(entries: Array<{ file: string; description: string }>): string {
  const lines = ["# File Index", ""];
  for (const entry of entries) {
    lines.push(`${entry.file} — ${entry.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeIndex(cwd: string, sourceFiles: string[]): { total: number; undescribed: number } {
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

function draftContextMap(cwd: string, sourceFiles: string[]): string | null {
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

function hasStoryTemplateShape(content: string): boolean {
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

function malformedStoryFiles(cwd: string): string[] {
  return listStories(cwd)
    .map(story => story.file)
    .filter(filePath => !hasStoryTemplateShape(readIfExists(filePath)));
}

function undescribedIndexFiles(cwd: string): string[] {
  const lines = readIfExists(indexPath(cwd)).split("\n");
  return lines
    .filter(line => line.includes(" — (undescribed)"))
    .map(line => line.split(" — ")[0]?.trim())
    .filter(Boolean) as string[];
}

// ── Learned rules helpers ──────────────────────────────────────────────

function learnedRuleLinesFromMd(md: string): string[] {
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

  return lines
    .slice(headingIndex + 1, sectionEnd)
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2));
}

function dedupeLearnedRules(systemMd: string): string {
  const learnedLines = learnedRuleLinesFromMd(systemMd);
  if (learnedLines.length === 0) return systemMd;
  const uniqueLines = [...new Set(learnedLines)];
  return replaceLearnedRules(systemMd, uniqueLines);
}

function replaceLearnedRules(systemMd: string, rules: string[]): string {
  const uniqueLines = [...new Set(rules.map(rule => rule.trim()).filter(Boolean))];
  const replacement = ["## Learned Rules", ...uniqueLines.map(r => `- ${r}`)];

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

function normalizeRuleCandidate(rule: string): string {
  return rule.trim().replace(/\s+/g, " ").toLowerCase();
}

function appendLearnedRules(cwd: string, rules: string[]): string[] {
  const systemMdPath = systemPath(cwd);
  if (!fs.existsSync(systemMdPath) || rules.length === 0) return [];

  const systemMd = readIfExists(systemMdPath);
  const existing = learnedRuleLinesFromMd(systemMd);
  const existingKeys = new Set(existing.map(normalizeRuleCandidate));
  const additions: string[] = [];

  for (const rule of rules) {
    const trimmed = rule.trim();
    if (!trimmed) continue;
    const key = normalizeRuleCandidate(trimmed);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    additions.push(trimmed);
  }

  if (additions.length === 0) return [];

  fs.writeFileSync(systemMdPath, replaceLearnedRules(systemMd, [...existing, ...additions]));
  return additions;
}

interface ReviewAggregate {
  text: string;
  count: number;
  sources: string[];
}

function reviewDetailFiles(cwd: string): string[] {
  const dir = reviewsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name: string) => name.endsWith(".md") && name !== "summary.md" && name !== "remembered.md")
    .map((name: string) => path.join(dir, name))
    .sort((a: string, b: string) => a.localeCompare(b));
}

function ruleCandidatesFromMarkdown(content: string): string[] {
  return content
    .split("\n")
    .map(line => line.match(/^\- Rule candidate:\s*(.+)$/)?.[1]?.trim() ?? "")
    .filter(line => line && line !== "—");
}

function collectReviewAggregates(cwd: string): ReviewAggregate[] {
  const aggregates = new Map<string, ReviewAggregate>();
  const sources = [...reviewDetailFiles(cwd), rememberedRulesPath(cwd)].filter(filePath => fs.existsSync(filePath));

  for (const filePath of sources) {
    const sourceName = path.basename(filePath);
    for (const candidate of ruleCandidatesFromMarkdown(readIfExists(filePath))) {
      const key = normalizeRuleCandidate(candidate);
      const existing = aggregates.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.sources.includes(sourceName)) existing.sources.push(sourceName);
        continue;
      }

      aggregates.set(key, {
        text: candidate,
        count: 1,
        sources: [sourceName],
      });
    }
  }

  return [...aggregates.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.text.localeCompare(right.text);
  });
}

function writeReviewSummary(cwd: string, aggregates: ReviewAggregate[]): void {
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
    lines.push(`- ${aggregate.text} | count: ${aggregate.count} | status: ${status} | sources: ${aggregate.sources.join(", ")}`);
  }

  lines.push("");
  fs.writeFileSync(reviewSummaryPath(cwd), lines.join("\n"));
}

function shouldPromoteReviewAggregate(aggregate: ReviewAggregate): boolean {
  return aggregate.sources.includes("remembered.md") || aggregate.count >= REVIEW_PROMOTION_THRESHOLD;
}

function syncReviewSummaryAndPromoteRules(cwd: string): string[] {
  ensureReviewStructure(cwd);
  const aggregates = collectReviewAggregates(cwd);
  writeReviewSummary(cwd, aggregates);
  const promoted = aggregates
    .filter(shouldPromoteReviewAggregate)
    .map(aggregate => aggregate.text);
  const additions = appendLearnedRules(cwd, promoted);
  applyLocalRuleDedupe(cwd);
  return additions;
}

function clearLegacyPendingLearnings(cwd: string): void {
  const pendingPath = path.join(cwd, ".context", "learnings", "pending.md");
  if (!fs.existsSync(pendingPath)) return;
  fs.writeFileSync(pendingPath, "");
}

function rememberEntry(rule: string): string {
  return [
    "---",
    `**Recorded:** ${nowISO()}  `,
    `- Rule candidate: ${rule}`,
    "",
  ].join("\n");
}

function activeStoryLabelForReview(cwd: string): string {
  const active = findActiveStory(cwd);
  return active ? path.basename(active.file, ".md") : "—";
}

function buildRememberInstruction(cwd: string): string {
  const activeStory = activeStoryLabelForReview(cwd);
  return [
    "Write one short reusable lesson to .context/reviews/remembered.md based on the recent fix and current story context.",
    "",
    "Requirements:",
    "1. Distill the lesson into one concise rule, not a verbatim complaint or bug report.",
    "2. Prefer a reusable pattern such as 'When X, also do Y'.",
    "3. Append exactly one entry using the existing remembered.md format with `- Rule candidate: ...`.",
    "4. Avoid duplicates if the same rule already exists in .context/reviews/remembered.md or .context/memory/system.md.",
    "5. Use the active story, recent fix context, and existing remembered rules to choose the best wording.",
    activeStory !== "—" ? `6. Active story: ${activeStory}.` : "6. No active story is available; rely on the recent fix context from the conversation.",
  ].join("\n");
}

function reviewFileTemplate(cwd: string, focus: string): string {
  const created = nowISO();
  return [
    `# Code Review ${created}`,
    "",
    `**Created:** ${created}  `,
    `**Story:** ${activeStoryLabelForReview(cwd)}  `,
    `**Focus:** ${focus}`,
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
    "## Reviewer Notes",
    "- Keep findings focused on bugs, regressions, missing tests, scope drift, or workflow violations.",
    "",
  ].join("\n");
}

// ── Consolidation helpers ──────────────────────────────────────────────

function applyLocalRuleDedupe(cwd: string): boolean {
  const systemMdPath = systemPath(cwd);
  if (!fs.existsSync(systemMdPath)) return false;

  const before = readIfExists(systemMdPath);
  const after = dedupeLearnedRules(before);
  if (after === before) return false;
  fs.writeFileSync(systemMdPath, after);
  return true;
}

function buildContextMapDraftInstruction(cwd: string): string {
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

function buildConsolidationInstruction(cwd: string): string {
  const malformed = malformedStoryFiles(cwd);
  const undescribed = undescribedIndexFiles(cwd);
  return [
    "Run Vazir consolidation using the currently selected Pi model.",
    "",
    "Tasks:",
    "1. Read .context/complaints-log.md and cluster similar complaints.",
    "2. Read .context/reviews/summary.md and any detailed code review files only if the summary needs clarification.",
    "3. Update .context/memory/system.md ## Learned Rules with concise promoted rules for complaint clusters that hit threshold, and promote any reopened issue directly.",
    "4. Merge duplicate or overlapping learned rules. Keep the ## Rules section intact.",
    undescribed.length > 0 ? "5. Replace every `(undescribed)` entry in .context/memory/index.md with a concise useful description." : "5. Leave .context/memory/index.md unchanged unless a description is clearly wrong.",
    malformed.length > 0 ? "6. Repair malformed story files so they include the required frontmatter lines and all required template sections." : "6. Leave story files unchanged unless you discover a malformed one while consolidating.",
    "7. Preserve existing user-authored content unless it is clearly placeholder text or malformed structure.",
    "",
    malformed.length > 0 ? `Malformed stories detected: ${malformed.map(filePath => path.basename(filePath)).join(", ")}` : "Malformed stories detected: none",
    undescribed.length > 0 ? `Undescribed index entries: ${undescribed.join(", ")}` : "Undescribed index entries: none",
  ].join("\n");
}

function buildInitSummary(fileStatuses: InitFileStatus[], jjLine: string, jjDetailLine: string): string {
  return [
    "Vazir init summary",
    jjLine,
    jjDetailLine,
    "☑ Added files:",
    ...fileStatuses.map(file => `    ${file.present ? "☑" : "☒"} ${file.label}`),
  ].join("\n");
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event: any) => {
    if (event.text?.trim() && !event.text.startsWith("/")) {
      lastUserPrompt = event.text.trim();
    }
    return { action: "continue" as const };
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    useJJ = detectJJ(ctx.cwd);
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    storyFrontmatterSnapshots.set(ctx.cwd, snapshotStoryFrontmatter(ctx.cwd));

    const workable = findWorkableStory(ctx.cwd);
    if (workable && workable.status === "not-started") {
      updateStoryFrontmatter(workable.file, { status: "in-progress", lastAccessed: todayDate() });
    }

    const parts: string[] = [];
    if (pendingInitSummary) {
      parts.push(pendingInitSummary);
      pendingInitSummary = null;
    }
    const contextMap = strip(readIfExists(contextMapPath(ctx.cwd)));
    const agents = strip(readIfExists(path.join(ctx.cwd, "AGENTS.md")));
    const systemMd = strip(readIfExists(systemPath(ctx.cwd)));
    const indexMd = strip(readIfExists(indexPath(ctx.cwd)));

    if (contextMap) parts.push(contextMap);
    else if (agents) parts.push(agents);
    if (systemMd) parts.push(systemMd);
    if (indexMd) parts.push(indexMd);

    // Inject active story
    const active = findActiveStory(ctx.cwd);
    if (active) {
      const storyContent = strip(readIfExists(active.file));
      if (storyContent) {
        parts.push(`[Active Story]\n${storyContent}`);
      }
    }

    if (parts.length === 0) return;

    return {
      systemPrompt: `${parts.join("\n\n---\n\n")}\n\n---\n\n${event.systemPrompt || ""}`,
    };
  });

  pi.on("session_before_compact", async (_event: any, ctx: any) => {
    syncReviewSummaryAndPromoteRules(ctx.cwd);
    clearLegacyPendingLearnings(ctx.cwd);
    applyLocalRuleDedupe(ctx.cwd);
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    syncReviewSummaryAndPromoteRules(ctx.cwd);
    clearLegacyPendingLearnings(ctx.cwd);
    applyLocalRuleDedupe(ctx.cwd);
  });

  // ── agent_end: zero-token index.md structural updates ─────────────────

  pi.on("agent_end", async (_event: any, ctx: any) => {
    const cwd = ctx.cwd;
    const promotedReviewRules = syncReviewSummaryAndPromoteRules(cwd);
    if (promotedReviewRules.length > 0) {
      ctx.ui.notify(
        `Promoted review rule${promotedReviewRules.length === 1 ? "" : "s"} to system.md: ${promotedReviewRules.join(", ")}`,
        "info",
      );
    }
    const revertedStories = enforceUserOnlyStoryStatuses(cwd);
    if (revertedStories.length > 0) {
      ctx.ui.notify(
        `Blocked unauthorized story status change. Only the user may mark stories complete or retired: ${revertedStories.join(", ")}`,
        "warning",
      );
    }

    const idxPath = indexPath(cwd);
    if (!fs.existsSync(idxPath)) return;

    const existing = readIfExists(idxPath);
    const lines = existing.split("\n");
    const currentFiles = new Set(walkSourceFiles(cwd));
    const updated: string[] = [];
    const indexedFiles = new Set<string>();

    for (const line of lines) {
      // Lines like: path/to/file.ts — description
      const match = line.match(/^(.+?)\s+—\s+(.+)$/);
      if (match) {
        const filePath = match[1].trim();
        if (currentFiles.has(filePath)) {
          updated.push(line);
          indexedFiles.add(filePath);
        }
        // Else: file was deleted/renamed — skip it
      } else {
        updated.push(line);
      }
    }

    // Add new files as (undescribed)
    for (const file of currentFiles) {
      if (!indexedFiles.has(file)) {
        updated.push(`${file} — (undescribed)`);
      }
    }

    const newContent = updated.join("\n");
    if (newContent !== existing) {
      fs.writeFileSync(idxPath, newContent);
    }
  });

  // ── /vazir-init ──────────────────────────────────────────────────────

  pi.registerCommand("vazir-init", {
    description: "Bootstrap Vazir context files, then set up git and JJ when available",
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx.cwd;

      ensureDir(memoryDir(cwd));
      ensureDir(storiesDir(cwd));
      ensureDir(settingsDir(cwd));
      ensureIntakeStructure(cwd);
      ensureReviewStructure(cwd);
      ensureDir(path.join(cwd, ".context", "checkpoints"));

      if (!fs.existsSync(intakeReadmePath(cwd))) {
        fs.writeFileSync(intakeReadmePath(cwd), INTAKE_README_TEMPLATE);
        ctx.ui.notify("intake README created", "info");
      }

      if (!fs.existsSync(systemPath(cwd))) {
        fs.writeFileSync(systemPath(cwd), SYSTEM_MD_TEMPLATE);
        ctx.ui.notify("system.md created", "info");
      }

      // complaints-log.md
      if (!fs.existsSync(complaintsLogPath(cwd))) {
        fs.writeFileSync(complaintsLogPath(cwd), "# Complaints Log\n\n");
        ctx.ui.notify("complaints-log.md created", "info");
      }

      if (!fs.existsSync(reviewSummaryPath(cwd))) {
        fs.writeFileSync(reviewSummaryPath(cwd), REVIEW_SUMMARY_TEMPLATE);
        ctx.ui.notify("review summary created", "info");
      }

      if (!fs.existsSync(rememberedRulesPath(cwd))) {
        fs.writeFileSync(rememberedRulesPath(cwd), REMEMBERED_RULES_TEMPLATE);
        ctx.ui.notify("remembered rules log created", "info");
      }

      const projectSettingsPath = path.join(settingsDir(cwd), "project.json");
      if (!fs.existsSync(projectSettingsPath)) {
        fs.writeFileSync(projectSettingsPath, JSON.stringify({ project_name: "", model_tier: "balanced" }, null, 2));
        ctx.ui.notify("project.json created", "info");
      }

      const agentsPath = path.join(cwd, "AGENTS.md");
      if (!fs.existsSync(agentsPath)) {
        fs.writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
        ctx.ui.notify("AGENTS.md created", "info");
      }

      const sourceFiles = walkSourceFiles(cwd);
      const indexSummary = writeIndex(cwd, sourceFiles);
      ctx.ui.notify("index.md generated", "info");

      let contextMapStatus = "existing";
      const contextMapExisted = fs.existsSync(contextMapPath(cwd));
      let shouldRequestModelDraft = false;
      if (!contextMapExisted) {
        fs.writeFileSync(contextMapPath(cwd), CONTEXT_MAP_TEMPLATE);
        contextMapStatus = "fill in manually";
        const draftedContextMap = draftContextMap(cwd, sourceFiles);
        if (draftedContextMap) {
          fs.writeFileSync(contextMapPath(cwd), draftedContextMap);
          contextMapStatus = "seeded";
          shouldRequestModelDraft = true;
          ctx.ui.notify("context-map.md seeded — Pi will refine it using the current model", "info");
        }
      }

      ctx.ui.notify(
        `Vazir bootstrap complete • context-map.md: ${contextMapStatus} • index.md: ${indexSummary.total} files indexed • Git check runs now`,
        "info",
      );

      let jjLine = "☒ JJ (Jujutsu): Not started";
      let jjDetailLine = `  ↳ Go here to install directions ${JJ_DOCS_URL}`;
      let gitReady = detectGitRepo(cwd);

      if (!gitReady) {
        const choice = await ctx.ui.select(
          "This folder has no git repo. Git is required for version control and JJ checkpoint support. Initialise git here?",
          [
            "Yes — initialise git",
            "No — I understand, skip git and JJ",
          ],
        );

        if (choice === "Yes — initialise git") {
          try {
            childProcess.execSync("git init", { cwd, stdio: "pipe" });
            gitReady = true;
            ctx.ui.notify("✓ git initialised\nRemember to add a remote:\ngit remote add origin <url>", "info");
          } catch (error: any) {
            ctx.ui.notify(`Git init failed: ${error?.message || String(error)} — JJ skipped`, "warning");
            jjDetailLine = "  ↳ Git initialisation failed, so JJ was skipped";
          }
        } else {
          ctx.ui.notify("No git — JJ skipped, checkpoints unavailable", "warning");
          jjDetailLine = "  ↳ Git is not initialised here, so JJ was skipped";
        }
      }

      let jjAvailable = false;
      if (gitReady) {
        try {
          childProcess.execSync("jj --version", { cwd, stdio: "pipe" });
          jjAvailable = true;
        } catch {
          ctx.ui.notify(
            "JJ is not installed. It gives Vazir a full checkpoint history of every agent turn.\n\nTo install:  brew install jj  (macOS)\n             cargo install jj-cli  (Linux)\n\nAfter installing, run:  jj git init --colocate\nOr just re-run /vazir-init — files are already set up.",
            "info",
          );
        }
      }

      try {
        if (jjAvailable) {
          try {
            childProcess.execSync("jj root", { cwd, stdio: "pipe" });
            ctx.ui.notify("JJ already initialised", "info");
            jjLine = "☑ JJ (Jujutsu): active";
            jjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
          } catch {
            childProcess.execSync("jj git init --colocate", { cwd, stdio: "pipe" });
            for (const branch of ["main", "master"]) {
              try {
                childProcess.execSync(`jj bookmark track ${branch}@origin`, { cwd, stdio: "pipe" });
                break;
              } catch {
                // Try the next common default branch.
              }
            }
            ctx.ui.notify("JJ initialised", "info");
            jjLine = "☑ JJ (Jujutsu): active";
            jjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
          }

          const gitignorePath = path.join(cwd, ".gitignore");
          const gitignore = readIfExists(gitignorePath);
          if (!gitignore.includes(".jj/")) {
            const nextGitignore = `${gitignore.trimEnd()}${gitignore.trim() ? "\n" : ""}.jj/\n`;
            fs.writeFileSync(gitignorePath, nextGitignore);
            ctx.ui.notify("Added .jj/ to .gitignore", "info");
          }
        }
      } catch (error: any) {
        ctx.ui.notify(`JJ setup failed: ${error?.message || String(error)} — continuing with git fallback`, "warning");
      }

      useJJ = jjAvailable && detectJJ(cwd);
      const initSummary = buildInitSummary([
        { label: ".context/memory/system.md", present: fs.existsSync(systemPath(cwd)) },
        { label: ".context/memory/index.md", present: fs.existsSync(indexPath(cwd)) },
        { label: ".context/memory/context-map.md", present: fs.existsSync(contextMapPath(cwd)) },
        { label: ".context/stories/", present: fs.existsSync(storiesDir(cwd)) },
        { label: ".context/intake/", present: fs.existsSync(intakeDir(cwd)) },
        { label: ".context/reviews/", present: fs.existsSync(reviewsDir(cwd)) },
        { label: ".context/complaints-log.md", present: fs.existsSync(complaintsLogPath(cwd)) },
        { label: "AGENTS.md", present: fs.existsSync(agentsPath) },
        { label: ".context/settings/project.json", present: fs.existsSync(projectSettingsPath) },
      ], useJJ ? "☑ JJ (Jujutsu): active" : jjLine, useJJ ? `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}` : jjDetailLine);
      pendingInitSummary = initSummary;
      ctx.ui.notify(initSummary, "info");

      if (shouldRequestModelDraft || indexSummary.undescribed > 0) {
        await pi.sendUserMessage(buildContextMapDraftInstruction(cwd), { deliverAs: "followUp" });
      }
    },
  });

  // ── /plan ────────────────────────────────────────────────────────────

  pi.registerCommand("plan", {
    description: "Start a planning conversation — generates plan.md and story files",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureDir(storiesDir(cwd));
      ensureIntakeStructure(cwd);

      const planPath = path.join(storiesDir(cwd), "plan.md");
      const planExists = fs.existsSync(planPath);
      const intakeFiles = listIntakeFiles(cwd);

      if (planExists && !args.trim()) {
        const choice = await ctx.ui.select(
          "A plan already exists. What would you like to do?",
          [
            "View current plan",
            "Replan — update scope and stories",
            "Cancel",
          ],
        );

        if (choice === "Cancel" || choice == null) return;

        if (choice === "View current plan") {
          const plan = readIfExists(planPath);
          const stories = listStories(cwd);
          const storyList = stories
            .sort((a, b) => a.number - b.number)
            .map(s => `  ${storyFileName(s.number)} — ${s.status}`)
            .join("\n");
          ctx.ui.notify(`${plan}\n\nStory files:\n${storyList}`, "info");
          return;
        }
      }

      // Read project settings for name
      let projectName = "";
      try {
        const settings = JSON.parse(readIfExists(path.join(settingsDir(cwd), "project.json")));
        projectName = settings.project_name || "";
      } catch { /* ignore */ }

      let planningBrief = args.trim();
      if (!planningBrief) {
        planningBrief = (await ctx.ui.input?.(
          "What are we planning?",
          intakeFiles.length > 0
            ? "Keep it short if needed — /plan will review .context/intake first"
            : "e.g. a SaaS dashboard for tracking team OKRs",
        ))?.trim() ?? "";
      }
      planningBrief = normalizeProjectBrief(planningBrief, projectName);

      fs.writeFileSync(intakeBriefPath(cwd), buildIntakeBrief(cwd, planningBrief, intakeFiles));

      if (intakeFiles.length > 0) {
        ctx.ui.notify(`Found ${intakeFiles.length} intake file${intakeFiles.length === 1 ? "" : "s"} in .context/intake/`, "info");
      } else {
        ctx.ui.notify("No intake files found in .context/intake/ — /plan will rely on the conversation", "info");
      }
      ctx.ui.notify("intake-brief.md refreshed in .context/stories/", "info");

      // Generate or update plan.md
      if (!planExists) {
        fs.writeFileSync(planPath, seededPlanTemplate(projectName, planningBrief, nextStoryNumber(cwd)));
        ctx.ui.notify("plan.md created in .context/stories/", "info");
      }

      const storySeed = ensureSeedStories(cwd, planningBrief);
      const storyFiles = storySeed.files;
      if (storyFiles.length > 0) {
        ctx.ui.notify(
          storySeed.created ? `Seeded starter stories: ${storyFiles.join(", ")}` : `Using existing stories: ${storyFiles.join(", ")}`,
          "info",
        );
      }

      // Instruct the agent to run the planning conversation
      const instruction = [
        "The user wants to plan their project. A seeded plan.md and starter story files already exist in .context/stories/.",
        "",
        "Your job:",
        `1. Read .context/stories/intake-brief.md before asking any questions.${intakeFiles.length > 0 ? ` Intake files referenced there: ${intakeFiles.join(", ")}` : ""}`,
        intakeFiles.length > 0 ? "2. Use the raw files in .context/intake/ only when the intake brief is ambiguous, incomplete, or conflicting. Treat them as planning inputs, not permanent system rules." : "2. No intake files were provided. Start from the conversation alone.",
        "3. Ask exactly one clarifying question at a time.",
        intakeFiles.length > 0 ? "   Ask only for missing, ambiguous, or conflicting information after reviewing the intake brief and any raw files you actually need." : "   Wait for the user's answer before asking the next question.",
        "   Default question areas if still unresolved after review:",
        "   - Who are the users?",
        "   - What's the most important thing to get right in v1?",
        "   - What are we explicitly NOT building in v1?",
        "   - What stack are we using / what already exists?",
        `4. Update .context/stories/intake-brief.md if the user's answers materially change the distilled understanding. Current brief: ${planningBrief}`,
        `5. Refine .context/stories/plan.md based on the intake materials and the user's answers.`,
        `6. Refine the existing story files in place first: ${storyFiles.join(", ") || "existing story files"}. Create additional story-NNN.md files only if the seeded three stories are clearly insufficient.`,
        '7. Every story file must use the exact template structure (Status, Created, Last accessed, Completed, Goal, Verification, Scope, Out of scope, Dependencies, Checklist, Issues, Completion Summary).',
        `8. If you create additional stories, continue numbering from ${nextStoryNumber(cwd)}.`,
        "9. Each story should be completable in a single focused session with one clear verification step.",
        "10. Before finishing, validate that intake-brief.md exists, plan.md exists, and at least one story-NNN.md file exists. If the seeded stories need retitling or rewriting, edit them instead of leaving placeholders.",
        "11. After generating or refining the stories, present the list to the user and ask if anything needs adjusting.",
        "",
        planExists ? "NOTE: Plan already exists — this is a replan. Update affected sections and stories. Append to the replanning log. Do not touch unaffected stories." : "",
      ].filter(Boolean).join("\n");

      await pi.sendUserMessage(instruction);
    },
  });

  // ── /unlearn ─────────────────────────────────────────────────────────

  pi.registerCommand("remember", {
    description: "Promote a confirmed lesson into memory; if no rule is provided, draft one from the recent fix context",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureReviewStructure(cwd);

      const rule = args.trim();
      if (!rule) {
        ctx.ui.notify("Drafting a remembered rule from the recent fix context", "info");
        await pi.sendUserMessage(buildRememberInstruction(cwd), { deliverAs: "followUp" });
        return;
      }

      const rememberLog = readIfExists(rememberedRulesPath(cwd));
      fs.writeFileSync(rememberedRulesPath(cwd), `${rememberLog.trimEnd()}\n${rememberEntry(rule)}`.trimStart());
      appendLearnedRules(cwd, [rule]);
      syncReviewSummaryAndPromoteRules(cwd);
      ctx.ui.notify(`Remembered: ${rule}`, "info");
    },
  });

  // ── /review ─────────────────────────────────────────────────────────

  pi.registerCommand("review", {
    description: "Create a detailed code review file and sync recurring findings into summary memory",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureReviewStructure(cwd);

      const created = nowISO();
      const focus = args.trim() || `active story ${activeStoryLabelForReview(cwd)} and recent changes`;
      const reviewFileName = `review-${compactTimestamp(created)}.md`;
      const reviewFilePath = path.join(reviewsDir(cwd), reviewFileName);
      fs.writeFileSync(reviewFilePath, reviewFileTemplate(cwd, focus));

      syncReviewSummaryAndPromoteRules(cwd);
      ctx.ui.notify(`Created ${reviewFileName} in .context/reviews/`, "info");

      const instruction = [
        `Run a code review and write the findings to .context/reviews/${reviewFileName}.`,
        "",
        "Requirements:",
        "1. Focus on bugs, regressions, missing tests, scope drift, and workflow violations.",
        "2. Keep findings primary. If there are no findings, replace the placeholder finding with a short 'No findings' note.",
        "3. For every finding, fill in Severity, Category, Summary, Evidence, Recommendation, and Rule candidate.",
        "4. Use `- Rule candidate: —` when a finding should not become a reusable rule.",
        "5. Do not update .context/reviews/summary.md manually unless you need to add a short note outside the generated sync format — Vazir rebuilds it automatically.",
        `6. Review focus: ${focus}.`,
      ].join("\n");

      await pi.sendUserMessage(instruction, { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("unlearn", {
    description: "Remove a promoted rule from system.md",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      const systemMdPath = systemPath(cwd);

      if (!fs.existsSync(systemMdPath)) {
        ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
        return;
      }

      const systemMd = readIfExists(systemMdPath);
      const rules = learnedRuleLinesFromMd(systemMd);

      if (rules.length === 0) {
        ctx.ui.notify("No learned rules to remove", "info");
        return;
      }

      // Direct number argument: /unlearn 2
      let ruleIndex = -1;
      const directNum = parseInt(args.trim(), 10);

      if (!isNaN(directNum) && directNum >= 1 && directNum <= rules.length) {
        ruleIndex = directNum - 1;
      } else {
        // Show numbered list and let user pick
        const labels = rules.map((rule, i) => `${i + 1}. ${rule}`);
        const pick = await ctx.ui.select(
          "Learned rules in system.md — select one to remove:",
          [...labels, "Cancel"],
        );

        if (pick == null || pick === "Cancel") return;

        const pickIndex = labels.indexOf(pick);
        if (pickIndex < 0) return;
        ruleIndex = pickIndex;
      }

      const ruleText = rules[ruleIndex];
      const confirm = await ctx.ui.confirm(
        `Remove rule ${ruleIndex + 1}: "${ruleText}"?`,
        "This rule will no longer constrain the agent.",
      );

      if (!confirm) {
        ctx.ui.notify("Unlearn cancelled", "info");
        return;
      }

      // Remove the rule from system.md
      const bullet = `- ${ruleText}`;
      const updatedSystemMd = systemMd
        .split("\n")
        .filter(line => line.trim() !== bullet)
        .join("\n");
      fs.writeFileSync(systemMdPath, updatedSystemMd);

      // Mark in complaints-log if present
      const clPath = complaintsLogPath(cwd);
      if (fs.existsSync(clPath)) {
        const log = readIfExists(clPath);
        // Append unlearned marker
        const marker = `${nowISO()} | unlearned | "${ruleText}"\n`;
        fs.writeFileSync(clPath, log.trimEnd() + "\n" + marker);
      }

      ctx.ui.notify(`Rule removed: "${ruleText}"\nIt will no longer constrain the agent.`, "info");
    },
  });

  // ── /consolidate ─────────────────────────────────────────────────────

  pi.registerCommand("consolidate", {
    description: "Cluster complaints-log, promote threshold hits, consolidate learned rules",
    handler: async (_args: string, ctx: any) => {
      const systemMdPath = systemPath(ctx.cwd);
      if (!fs.existsSync(systemMdPath)) {
        ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
        return;
      }

      const undescribed = undescribedIndexFiles(ctx.cwd);
      const malformed = malformedStoryFiles(ctx.cwd);
      const complaints = readIfExists(complaintsLogPath(ctx.cwd))
        .split("\n")
        .filter(line => line.trim() && !line.startsWith("#"))
        .length;

      const preview = [
        `Complaints entries: ${complaints}`,
        `Undescribed index entries: ${undescribed.length}`,
        `Malformed story files: ${malformed.length}`,
        "Local learned-rule dedupe applied after confirmation only",
      ].join("\n");

      ctx.ui.notify(preview, "info");
      const apply = await ctx.ui.select("Apply these consolidation changes?", ["Apply", "Discard"]);
      if (apply !== "Apply") {
        ctx.ui.notify("Consolidation discarded", "info");
        return;
      }

      applyLocalRuleDedupe(ctx.cwd);
      await pi.sendUserMessage(buildConsolidationInstruction(ctx.cwd), { deliverAs: "followUp" });
      ctx.ui.notify("Consolidation handed to the current Pi model", "info");
    },
  });
}
