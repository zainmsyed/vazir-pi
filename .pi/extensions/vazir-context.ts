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

function complaintsLogPath(cwd: string) {
  return path.join(cwd, ".context", "complaints-log.md");
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

// ── Generic helpers ────────────────────────────────────────────────────

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
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

function snapshotStoryFrontmatter(cwd: string): Map<string, { status: string; completed: string }> {
  return new Map(
    listStories(cwd).map(story => [story.file, { status: story.status, completed: story.completed }]),
  );
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
    "2. Update .context/memory/system.md ## Learned Rules with concise promoted rules for complaint clusters that hit threshold, and promote any reopened issue directly.",
    "3. Merge duplicate or overlapping learned rules. Keep the ## Rules section intact.",
    undescribed.length > 0 ? "4. Replace every `(undescribed)` entry in .context/memory/index.md with a concise useful description." : "4. Leave .context/memory/index.md unchanged unless a description is clearly wrong.",
    malformed.length > 0 ? "5. Repair malformed story files so they include the required frontmatter lines and all required template sections." : "5. Leave story files unchanged unless you discover a malformed one while consolidating.",
    "6. Preserve existing user-authored content unless it is clearly placeholder text or malformed structure.",
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
    applyLocalRuleDedupe(ctx.cwd);
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    applyLocalRuleDedupe(ctx.cwd);
  });

  // ── agent_end: zero-token index.md structural updates ─────────────────

  pi.on("agent_end", async (_event: any, ctx: any) => {
    const cwd = ctx.cwd;
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
      ensureDir(path.join(cwd, ".context", "checkpoints"));

      if (!fs.existsSync(systemPath(cwd))) {
        fs.writeFileSync(systemPath(cwd), SYSTEM_MD_TEMPLATE);
        ctx.ui.notify("system.md created", "info");
      }

      // complaints-log.md
      if (!fs.existsSync(complaintsLogPath(cwd))) {
        fs.writeFileSync(complaintsLogPath(cwd), "# Complaints Log\n\n");
        ctx.ui.notify("complaints-log.md created", "info");
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

      const planPath = path.join(storiesDir(cwd), "plan.md");
      const planExists = fs.existsSync(planPath);

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
          "e.g. a SaaS dashboard for tracking team OKRs",
        ))?.trim() ?? "";
      }
      planningBrief = normalizeProjectBrief(planningBrief, projectName);

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
        "1. Ask the user clarifying questions:",
        "   - Who are the users?",
        "   - What's the most important thing to get right in v1?",
        "   - What are we explicitly NOT building in v1?",
        "   - What stack are we using / what already exists?",
        `2. Refine .context/stories/plan.md based on the user's answers. Current brief: ${planningBrief}`,
        `3. Refine the existing story files in place first: ${storyFiles.join(", ") || "existing story files"}. Create additional story-NNN.md files only if the seeded three stories are clearly insufficient.`,
        '4. Every story file must use the exact template structure (Status, Created, Last accessed, Completed, Goal, Verification, Scope, Out of scope, Dependencies, Checklist, Issues, Completion Summary).',
        `5. If you create additional stories, continue numbering from ${nextStoryNumber(cwd)}.`,
        "6. Each story should be completable in a single focused session with one clear verification step.",
        "7. Before finishing, validate that plan.md exists and at least one story-NNN.md file exists. If the seeded stories need retitling or rewriting, edit them instead of leaving placeholders.",
        "8. After generating or refining the stories, present the list to the user and ask if anything needs adjusting.",
        "",
        planExists ? "NOTE: Plan already exists — this is a replan. Update affected sections and stories. Append to the replanning log. Do not touch unaffected stories." : "",
      ].filter(Boolean).join("\n");

      await pi.sendUserMessage(instruction);
    },
  });

  // ── /unlearn ─────────────────────────────────────────────────────────

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
