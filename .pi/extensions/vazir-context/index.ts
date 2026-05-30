/// <reference path="../../../types/pi-runtime-ambient.d.ts" />
/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildDefaultSystemRulesMarkdown,
  buildVcsSafetyGuidanceText,
  compareStoriesByRecencyDesc,
  complaintsLogPath,
  detectFossil,
  detectJJ,
  findActiveStory,
  hasVcsSafetyPolicyText,
  listStories,
  nowISO,
  readActiveVcsMode,
  readIfExists,
  storiesDir,
  todayDate,
  writeProjectSettings,
  updateStoryFrontmatter,
} from "../../lib/vazir-helpers.ts";
import {
  buildReviewRemediationInstruction,
  clearCompleteStoryCloseout,
  completeStoryAndCommitNow,
  completeStoryNow,
  createCompleteStoryController,
  isHighPrioritySeverity,
  promptReviewFindingsCloseout,
  recordCompletedReviewFallowFindings,
  resetReviewFileForRemediation,
  resolveContextPersistenceChoice,
  type PendingCompleteStoryRequest,
} from "./complete-story.ts";
import { showScrollableText } from "../vazir-tracker/chrome.ts";
import { refreshVcsState } from "../vazir-tracker/index.ts";
import { showMarkdownViewer } from "../../lib/vazir-ui.ts";
import {
  appendFallowToComplaintsLog,
  archiveDir,
  archiveMemoryReviewCandidates,
  appendLearnedRules,
  applyLocalRuleDedupe,
  assessStoryCompletionReadiness,
  brandPath,
  buildConsolidationInstruction,
  buildContextMapDraftInstruction,
  buildInitSummary,
  buildIntakeBrief,
  buildRememberInstruction,
  buildReviewInstruction,
  clearLegacyPendingLearnings,
  componentsPath,
  commitStoryCloseChanges,
  contextMapPath,
  contextPersistenceStatus,
  createReviewDraft,
  designDir,
  designSystemPath,
  hasUiTypeOverride,
  isUiStory,
  prepareLearnedRulesForConsolidation,
  parseReviewFrontmatter,
  reviewFallowFindingsFromFile,
  reviewFindingsFromFile,
  reviewRecommendedFixesFromFile,
  reviewOtherFixesFromFile,
  reviewRecommendedFixesFromFindings,
  reviewDetailFiles,
  activeStoryLabelForManualReview,
  defaultReviewFocus,
  defaultStoryLabelForReview,
  detectGitRepo,
  draftContextMap,
  ensureArchiveStructure,
  ensureDir,
  ensureIntakeStructure,
  ensureReviewStructure,
  findWorkableStory,
  indexPath,
  INTAKE_README_TEMPLATE,
  intakeBriefPath,
  intakeDir,
  intakeReadmePath,
  learnedRulesFromMd,
  listIntakeFiles,
  listPlanIntakeFiles,
  manualReviewStoryChoiceLabel,
  malformedStoryFiles,
  memoryDir,
  memoryReviewArchiveCandidates,
  memoryReviewDeleteCandidates,
  nextStoryNumber,
  normalizeProjectBrief,
  planTemplate,
  promoteRulesToSystemMd,
  replaceLearnedRules,
  rememberEntry,
  rememberedRulesPath,
  restoreStoryFrontmatter,
  reviewsDir,
  reviewSummaryPath,
  REMEMBERED_RULES_TEMPLATE,
  REVIEW_SUMMARY_TEMPLATE,
  seedDesignFromIntake,
  DESIGN_SYSTEM_TEMPLATE,
  BRAND_TEMPLATE,
  COMPONENTS_TEMPLATE,
  buildDesignSummary,
  warnIfDesignSystemOverCap,
  selectableStoriesForManualReview,
  settingsDir,
  snapshotStoryFrontmatter,
  staleRuleCandidates,
  shouldEnforceContextCommit,
  storyFileName,
  strip,
  syncReviewSummaryAndPromoteRules,
  systemPath,
  type ArchiveCandidate,
  undescribedIndexFiles,
  userExplicitlyApprovedStatusChange,
  walkSourceFiles,
  type FallowAuditIssue,
  writeIndex,
} from "./helpers.ts";

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

const SYSTEM_MD_TEMPLATE = buildDefaultSystemRulesMarkdown();

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

const SETTINGS_README_TEMPLATE = [
  "# Vazir Settings",
  "",
  "This folder contains per-project configuration for Vazir.",
  "",
  "## Tunables",
  "",
  "- `active_vcs_mode` — Current active version control system: `git`, `fossil`, or `none`. Set by `/vazir-init` or `/vcs-settings`.",
  "- `vcs_preference` — Explicit VCS override: `auto`, `git`, `jj`, or `fossil`. Use `/vcs-settings` to change without hand-editing.",
  "- `project_name` — Display name used in plan scaffolding.",
  "- `model_tier` — Default model tier: `fast`, `balanced`, or `quality`.",
  "",
  "## Changing settings",
  "",
  "Run `/vcs-settings` to open a picker, or `/vcs-settings <auto|git|jj|fossil>` to set the preference directly.",
  "If you choose Git/JJ or Fossil and the required tool is missing, Vazir will prompt before helping you install it.",
  "",
].join("\n");

const JJ_DOCS_URL = "https://www.jj-vcs.dev/latest/install-and-setup/";
const JJ_OVERVIEW_URL = "https://www.jj-vcs.dev/latest/";
const FALLOW_INSTALL_COMMAND = "npm install -D fallow";
const FALLOW_MAX_PROMPT_ISSUES = 12;

type FallowAuditVerdict = "pass" | "warn" | "fail";
type FallowAuditResult = { summaryLine: string; promptPrefix: string; findings: FallowAuditIssue[] };
type GitAuditScope =
  | { mode: "base"; files: string[] }
  | { mode: "initial"; files: string[] }
  | { mode: "unavailable" };

let lastUserPrompt = "";
let useJJ = false;
let pendingInitSummary: string | null = null;
const storyFrontmatterSnapshots = new Map<string, Map<string, { status: string; completed: string }>>();
type PendingManualReviewRequest = { reviewFile: string; reviewCloseoutReady?: boolean };
const pendingCompleteStoryRequests = new Map<string, PendingCompleteStoryRequest>();
const pendingManualReviewRequests = new Map<string, PendingManualReviewRequest>();
const approvedStoryCloseouts = new Map<string, Set<string>>();
const missingFallowNoticeShown = new Set<string>();
type ManualReviewScope = "story" | "whole-codebase";
type ReviewCloseoutTarget = "story" | "review";
const INTERNAL_AGENT_MESSAGE_TYPE = "vazir-internal-request";

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

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function fallowBinaryPath(cwd: string): string {
    return path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "fallow.cmd" : "fallow");
  }

  function fallowNotRun(reason: string): FallowAuditResult {
    return {
      summaryLine: `not run (${reason})`,
      promptPrefix: "",
      findings: [],
    };
  }

  function pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  }

  function pickNumber(...values: unknown[]): number | null {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }

  function maybeNotifyMissingFallow(ctx: any, cwd: string): void {
    if (missingFallowNoticeShown.has(cwd)) return;
    missingFallowNoticeShown.add(cwd);
    ctx.ui.notify(`Fallow not found — running LLM-only review. Install with: ${FALLOW_INSTALL_COMMAND}`, "info");
  }

  async function maybePromptForFallowInstall(ctx: any, cwd: string): Promise<void> {
    if (fs.existsSync(fallowBinaryPath(cwd)) || typeof ctx.ui?.select !== "function") return;

    const choice = await ctx.ui.select(
      "Install Fallow for Vazir's optional /review static-analysis pre-pass?",
      [
        "Yes — install Fallow",
        "No — skip Fallow",
      ],
    );

    if (choice !== "Yes — install Fallow") return;

    try {
      childProcess.execFileSync("npm", ["install", "-D", "fallow"], { cwd, stdio: "pipe" });
      missingFallowNoticeShown.delete(cwd);
      ctx.ui.notify("Fallow installed for /review static analysis. For manual CLI use, run: npx fallow", "info");
    } catch (error: any) {
      ctx.ui.notify(`Fallow install failed: ${error?.message || String(error)}. /review will continue without it.`, "warning");
    }
  }

  function commandExists(command: string, args: string[] = ["--version"]): boolean {
    try {
      childProcess.execFileSync(command, args, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  function ensureFossilIgnoreGlob(cwd: string): boolean {
    const ignorePath = path.join(cwd, ".fossil-settings", "ignore-glob");
    const required = [
      ".context/",
      "node_modules/",
      ".git/",
      ".jj/",
      ".fallow/",
      ".env",
      ".env.*",
      "*.local",
      ".local/",
      "*.log",
      "*.tmp",
      "*.temp",
      "*.swp",
      ".DS_Store",
      "Thumbs.db",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
      "*.crt",
    ];
    const existing = readIfExists(ignorePath)
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
    const next = [...existing];
    let changed = !fs.existsSync(ignorePath);

    for (const entry of required) {
      if (next.includes(entry)) continue;
      next.push(entry);
      changed = true;
    }

    if (!changed) return false;
    fs.mkdirSync(path.dirname(ignorePath), { recursive: true });
    fs.writeFileSync(ignorePath, `${next.join("\n")}\n`);
    return true;
  }

  function buildVcsSettingsGuidance(cwd: string): string {
    const activeMode = readActiveVcsMode(cwd);
    return [
      "[Version Control System (VCS) Mode]",
      `- Active mode from settings: ${activeMode}`,
      "- Check project settings for the current active version control system (VCS) before doing VCS-specific work.",
      "- The active mode can change over time, so do not assume the /vazir-init choice is still current.",
      "- If repository guidance depends on version control, double-check settings instead of assuming Git/JJ or Fossil.",
    ].join("\n");
  }

  function listGitVisibleFiles(cwd: string): string[] {
    try {
      const output = childProcess.execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
        cwd,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return Array.from(new Set(
        output
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean)
          .filter(file => fs.existsSync(path.join(cwd, file))),
      ));
    } catch {
      return [];
    }
  }

  function collectGitAuditScope(cwd: string): GitAuditScope {
    try {
      const output = childProcess.execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "HEAD~1"], {
        cwd,
        encoding: "utf-8",
        stdio: "pipe",
      });
      const files = Array.from(new Set(
        output
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean)
          .filter(file => fs.existsSync(path.join(cwd, file))),
      ));
      return { mode: "base", files };
    } catch {
      const initialFiles = listGitVisibleFiles(cwd);
      if (initialFiles.length > 0) return { mode: "initial", files: initialFiles };
      return { mode: "unavailable" };
    }
  }

  function collectJjAuditFiles(cwd: string): string[] | null {
    try {
      const output = childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8", stdio: "pipe" });
      const files = output
        .split("\n")
        .map(line => line.match(/^\s*(.+?)\s+\|/)?.[1]?.trim() ?? "")
        .filter(Boolean)
        .filter(file => fs.existsSync(path.join(cwd, file)));
      return Array.from(new Set(files));
    } catch {
      return null;
    }
  }

  function parseFossilStatusPaths(output: string): string[] {
    return output
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^[A-Z?]+\s+/, "").trim())
      .filter(Boolean);
  }

  function collectFossilAuditFiles(cwd: string): string[] | null {
    try {
      const files = new Set<string>();
      for (const command of ["changes", "extras"] as const) {
        const output = childProcess.execFileSync("fossil", [command], {
          cwd,
          encoding: "utf-8",
          stdio: "pipe",
        });
        for (const file of parseFossilStatusPaths(output)) {
          if (fs.existsSync(path.join(cwd, file))) files.add(file);
        }
      }
      return Array.from(files);
    } catch {
      return null;
    }
  }

  function fossilParentHash(cwd: string): string | null {
    try {
      const info = childProcess.execFileSync("fossil", ["info"], { cwd, encoding: "utf-8", stdio: "pipe" });
      return info.match(/^parent:\s+([a-f0-9]+)/im)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function runFallowAuditViaFossilBridge(cwd: string, binaryPath: string, fileCount: number | null): FallowAuditResult | null {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-fallow-fossil-"));
    const parentHash = fossilParentHash(cwd);

    try {
      const repoDir = path.join(tmpDir, "repo");
      fs.mkdirSync(repoDir, { recursive: true });

      if (parentHash) {
        const tarball = path.join(tmpDir, "parent.tar.gz");
        childProcess.execFileSync("fossil", ["tarball", parentHash, tarball, "--name", "repo"], { cwd, stdio: "pipe" });
        childProcess.execFileSync("tar", ["xzf", tarball, "-C", tmpDir], { stdio: "pipe" });
      }

      if (fs.readdirSync(repoDir).length === 0) {
        fs.writeFileSync(path.join(repoDir, ".vazir-fallow-base"), "");
      }

      // VCS safety policy blocks `git init`, so create the minimal repo structure manually.
      const gitDir = path.join(repoDir, ".git");
      fs.mkdirSync(path.join(gitDir, "objects"), { recursive: true });
      fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
      fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      fs.writeFileSync(path.join(gitDir, "config"), "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n");
      childProcess.execFileSync("git", ["add", "-A"], { cwd: repoDir, stdio: "pipe" });
      childProcess.execFileSync("git", ["-c", "user.name=Vazir", "-c", "user.email=vazir@example.invalid", "commit", "-m", "base"], { cwd: repoDir, stdio: "pipe" });

      const excluded = new Set([".git", "node_modules", ".jj", ".fslckout", "_FOSSIL_", ".context", "dist", "build", "out"]);
      const copyContents = (src: string, dest: string): void => {
        for (const entry of fs.readdirSync(src)) {
          if (excluded.has(entry)) continue;
          const srcPath = path.join(src, entry);
          const destPath = path.join(dest, entry);
          const stat = fs.statSync(srcPath);
          if (stat.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyContents(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      for (const entry of fs.readdirSync(repoDir)) {
        if (entry === ".git") continue;
        fs.rmSync(path.join(repoDir, entry), { recursive: true, force: true });
      }
      copyContents(cwd, repoDir);

      childProcess.execFileSync("git", ["add", "-A"], { cwd: repoDir, stdio: "pipe" });
      childProcess.execFileSync("git", ["-c", "user.name=Vazir", "-c", "user.email=vazir@example.invalid", "commit", "-m", "head"], { cwd: repoDir, stdio: "pipe" });

      const args = parentHash
        ? ["audit", "--base", "HEAD~1", "--format", "json"]
        : ["audit", "--format", "json"];
      try {
        const stdout = childProcess.execFileSync(binaryPath, args, {
          cwd: repoDir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32",
        });

        const parsed = parseFallowAuditOutput(stdout, fileCount);
        if (!parsed) return null;
        if (!parentHash) {
          return formatFallowInitialScanResult(parsed);
        }
        return parsed;
      } catch (error: any) {
        const stdout = typeof error?.stdout === "string" ? error.stdout : error?.stdout?.toString("utf-8") ?? "";
        const parsed = parseFallowAuditOutput(stdout, fileCount);
        if (!parsed) throw error;
        if (!parentHash) {
          return formatFallowInitialScanResult(parsed);
        }
        return parsed;
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  function normalizeFallowRule(sectionName: string, key: string): string {
    if (sectionName === "duplication") return "duplication";
    if (sectionName === "complexity") return "complexity";
    return key.replace(/_/g, "-");
  }

  function formatLocation(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (!value || typeof value !== "object") return null;

    const entry = value as Record<string, unknown>;
    const file = pickString(
      entry.file,
      entry.path,
      entry.relative_path,
      entry.relativePath,
      entry.module,
      entry.source_path,
      entry.sourcePath,
    );
    const line = pickNumber(entry.line, entry.start_line, entry.startLine, entry.line_number, entry.lineNumber);
    const column = pickNumber(entry.column, entry.start_column, entry.startColumn, entry.column_number, entry.columnNumber);

    if (file) return line == null ? file : `${file}:${line}${column == null ? "" : `:${column}`}`;

    const locations = [entry.files, entry.paths, entry.locations, entry.occurrences]
      .filter(Array.isArray)
      .flatMap(group => (group as unknown[]).map(item => formatLocation(item)).filter(Boolean) as string[]);
    if (locations.length > 0) return locations.slice(0, 2).join(" ↔ ");

    return pickString(entry.name, entry.symbol, entry.export, entry.id);
  }

  function formatIssueSummary(rule: string, entry: Record<string, unknown>): string {
    const direct = pickString(entry.message, entry.summary, entry.reason, entry.description, entry.details, entry.title);
    if (direct) return direct;

    const symbol = pickString(entry.symbol, entry.name, entry.export, entry.function, entry.function_name, entry.functionName);
    const score = pickNumber(entry.score, entry.cyclomatic, entry.cyclomatic_score, entry.cyclomaticScore, entry.complexity);

    if (rule === "complexity") {
      if (symbol && score != null) return `function ${symbol} exceeds complexity threshold (score: ${score})`;
      if (symbol) return `function ${symbol} exceeds complexity threshold`;
      if (score != null) return `complexity exceeds threshold (score: ${score})`;
      return "complexity exceeds threshold";
    }

    if (rule === "duplication") {
      const locationCount = Array.isArray(entry.occurrences)
        ? entry.occurrences.length
        : Array.isArray(entry.locations)
          ? entry.locations.length
          : 0;
      return locationCount > 0 ? `duplicate code across ${locationCount} locations` : "duplicate code detected";
    }

    if (symbol) return `${symbol} triggered ${rule}`;
    return rule.replace(/-/g, " ");
  }

  function collectFallowIssues(parsed: Record<string, unknown>): FallowAuditIssue[] {
    const issues: FallowAuditIssue[] = [];
    const seen = new Set<string>();

    const pushIssue = (rule: string, value: unknown): void => {
      const entry = value && typeof value === "object" ? value as Record<string, unknown> : { value };
      const location = formatLocation(entry) ?? pickString(entry.value) ?? "location unavailable";
      const summary = formatIssueSummary(rule, entry);
      const key = `${rule}|${location}|${summary}`;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ rule, location, summary });
    };

    if (Array.isArray(parsed.issues)) {
      for (const entry of parsed.issues) {
        const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : { value: entry };
        const rule = pickString(record.code, record.kind, record.rule, record.type) ?? "issue";
        pushIssue(rule.replace(/_/g, "-"), record);
      }
    }

    for (const [sectionName, sectionValue] of [
      ["dead-code", parsed.dead_code ?? parsed.deadCode],
      ["duplication", parsed.duplication ?? parsed.dupes],
      ["complexity", parsed.complexity ?? parsed.health],
    ] as const) {
      if (!sectionValue || typeof sectionValue !== "object") continue;
      for (const [key, value] of Object.entries(sectionValue as Record<string, unknown>)) {
        if (!Array.isArray(value)) continue;
        const rule = normalizeFallowRule(sectionName, key);
        for (const entry of value) pushIssue(rule, entry);
      }
    }

    return issues;
  }

  function parseFallowAuditOutput(raw: string, fileCount: number | null): FallowAuditResult | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }

    const issues = collectFallowIssues(parsed);
    const verdictValue = pickString(parsed.verdict, (parsed.summary as Record<string, unknown> | undefined)?.verdict)?.toLowerCase();
    const verdict: FallowAuditVerdict = verdictValue === "warn" || verdictValue === "fail" || verdictValue === "pass"
      ? verdictValue
      : issues.length > 0
        ? "warn"
        : "pass";

    const summaryLine = issues.length === 0
      ? fileCount == null
        ? `fallow audit — ${verdict} (no issues found)`
        : `fallow audit — ${verdict} (${fileCount} file${fileCount === 1 ? "" : "s"} scanned, no issues found)`
      : fileCount == null
        ? `fallow audit — ${verdict}`
        : `fallow audit — ${verdict} (${fileCount} file${fileCount === 1 ? "" : "s"} scanned)`;

    if (issues.length === 0) return { summaryLine, promptPrefix: "", findings: [] };

    const visibleIssues = issues.slice(0, FALLOW_MAX_PROMPT_ISSUES);
    const scopeLine = fileCount == null ? "changed files" : `${fileCount} changed file${fileCount === 1 ? "" : "s"}`;
    const extraIssues = issues.length - visibleIssues.length;
    return {
      summaryLine,
      promptPrefix: [
        "## Static Analysis Findings (Fallow)",
        `Verdict: ${verdict}`,
        `Scope: ${scopeLine}`,
        "",
        "Issues:",
        ...visibleIssues.map(issue => `- [${issue.rule}] ${issue.location} — ${issue.summary}`),
        ...(extraIssues > 0 ? [`- [summary] ${extraIssues} additional finding${extraIssues === 1 ? "" : "s"} omitted from this prompt block`] : []),
        "",
        "Treat these as verified findings. Do not re-derive them. Synthesise with your own inspection where relevant.",
      ].join("\n"),
      findings: issues,
    };
  }

  function formatFallowInitialScanResult(parsed: FallowAuditResult): FallowAuditResult {
    return {
      summaryLine: parsed.summaryLine.replace(/^fallow audit/, "fallow scan").replace(/ \([^)]*files scanned\)/, "") + " (initial repo scan)",
      promptPrefix: parsed.promptPrefix.replace(/^## Static Analysis Findings \(Fallow\)/, "## Static Analysis Findings (Fallow initial scan)"),
      findings: parsed.findings,
    };
  }

  function runFallowAudit(ctx: any, cwd: string): FallowAuditResult {
    const binaryPath = fallowBinaryPath(cwd);
    if (!fs.existsSync(binaryPath)) {
      maybeNotifyMissingFallow(ctx, cwd);
      return fallowNotRun("fallow unavailable");
    }

    const activeVcsMode = readActiveVcsMode(cwd);
    if (activeVcsMode === "fossil" && detectFossil(cwd)) {
      const changedFiles = collectFossilAuditFiles(cwd);
      if (changedFiles == null) {
        ctx.ui.notify("Fallow audit scope could not be resolved for this Fossil checkout — running LLM-only review.", "warning");
        return fallowNotRun("audit scope unavailable");
      }
      if (changedFiles.length === 0) return fallowNotRun("no changed files");

      if (!commandExists("git", ["--version"]) || !commandExists("tar", ["--version"])) {
        ctx.ui.notify("Fallow audit in Fossil mode requires git and tar binaries, which are not available on this system — running LLM-only review.", "warning");
        return fallowNotRun("git or tar unavailable for fossil bridge");
      }

      try {
        const parsed = runFallowAuditViaFossilBridge(cwd, binaryPath, changedFiles.length);
        if (parsed) return parsed;
      } catch (error: any) {
        ctx.ui.notify(`Fallow audit bridge failed — running LLM-only review. ${error?.message || String(error)}`, "warning");
        return fallowNotRun("fallow audit failed");
      }

      ctx.ui.notify("Fallow audit bridge returned unusable output — running LLM-only review.", "warning");
      return fallowNotRun("fallow audit failed");
    }

    const gitScope = collectGitAuditScope(cwd);
    const changedFiles = gitScope.mode !== "unavailable"
      ? gitScope.files
      : detectJJ(cwd)
        ? collectJjAuditFiles(cwd)
        : null;

    if (changedFiles == null) {
      ctx.ui.notify("Fallow audit scope could not be resolved — running LLM-only review.", "warning");
      return fallowNotRun("audit scope unavailable");
    }

    if (changedFiles.length === 0) return fallowNotRun("no changed files");

    if (gitScope.mode === "unavailable") {
      ctx.ui.notify("Fallow audit is unavailable for this JJ-only checkout — running LLM-only review.", "warning");
      return fallowNotRun("audit scope unavailable");
    }

    const args = gitScope.mode === "initial"
      ? ["audit", "--format", "json"]
      : ["audit", "--base", "HEAD~1", "--format", "json"];
    const summaryFileCount = gitScope.mode === "initial" ? null : changedFiles.length;

    try {
      const stdout = childProcess.execFileSync(binaryPath, args, {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
      const parsed = parseFallowAuditOutput(stdout, summaryFileCount);
      if (!parsed) return fallowNotRun("fallow audit failed");
      if (gitScope.mode === "initial") {
        return formatFallowInitialScanResult(parsed);
      }
      return parsed;
    } catch (error: any) {
      const stdout = typeof error?.stdout === "string" ? error.stdout : error?.stdout?.toString("utf-8") ?? "";
      const parsed = parseFallowAuditOutput(stdout, summaryFileCount);
      if (parsed) {
        if (gitScope.mode === "initial") {
          return formatFallowInitialScanResult(parsed);
        }
        return parsed;
      }
      ctx.ui.notify(`Fallow audit failed — running LLM-only review. ${error?.message || String(error)}`, "warning");
      return fallowNotRun("fallow audit failed");
    }
  }

  function matchReviewPrefix(input: string, prefixes: string[]): string | null {
    for (const prefix of prefixes) {
      const match = input.match(new RegExp(`^${escapeRegExp(prefix)}(?:\\s+review)?(?:\\s*:\\s*|\\s+-\\s+|\\s+)?(.*)$`, "i"));
      if (match) return match[1].trim();
    }

    return null;
  }

  function parseManualReviewRequest(args: string): { scope: ManualReviewScope | null; focus: string } {
    const trimmed = args.trim();
    if (!trimmed) return { scope: null, focus: "" };

    const wholeCodebaseFocus = matchReviewPrefix(trimmed, [
      "whole codebase",
      "whole repo",
      "whole repository",
      "whole project",
      "comprehensive",
      "codebase",
      "repo",
      "repository",
      "full",
    ]);
    if (wholeCodebaseFocus != null) return { scope: "whole-codebase", focus: wholeCodebaseFocus };

    const storyFocus = matchReviewPrefix(trimmed, ["in-progress story", "active story", "current story", "story"]);
    if (storyFocus != null) return { scope: "story", focus: storyFocus };

    return { scope: null, focus: trimmed };
  }

  function formatRuleSourceStories(sourceStories: string[]): string {
    return sourceStories.length > 0 ? sourceStories.join(", ") : "origin unknown";
  }

  function archiveKeepMatches(cwd: string, candidate: ArchiveCandidate, rawToken: string): boolean {
    const token = rawToken.trim().toLowerCase();
    if (!token) return false;

    const relPath = path.relative(cwd, candidate.filePath).replace(/\\/g, "/").toLowerCase();
    const label = candidate.label.toLowerCase();
    const stem = path.basename(candidate.label, path.extname(candidate.label)).toLowerCase();
    return token === label || token === relPath || token === stem;
  }

  function applyArchiveKeepExceptions(
    cwd: string,
    candidates: ArchiveCandidate[],
    rawKeepInput: string,
  ): { selected: ArchiveCandidate[]; kept: string[] } {
    const tokens = rawKeepInput.split(",").map(token => token.trim()).filter(Boolean);
    if (tokens.length === 0) return { selected: candidates, kept: [] };

    const kept: string[] = [];
    const selected = candidates.filter(candidate => {
      const shouldKeep = tokens.some(token => archiveKeepMatches(cwd, candidate, token));
      if (shouldKeep) kept.push(candidate.label);
      return !shouldKeep;
    });

    return { selected, kept };
  }

  async function confirmWithFallback(ctx: any, prompt: string, detail: string): Promise<boolean> {
    if (typeof ctx.ui.confirm === "function") {
      return Boolean(await ctx.ui.confirm(prompt, detail));
    }

    const choice = await ctx.ui.select([prompt, detail].filter(Boolean).join("\n\n"), ["yes", "cancel"]);
    return choice === "yes";
  }

  async function runUnlearnFlow(args: string, ctx: any, allowedRuleIndexes?: number[]): Promise<boolean> {
    const cwd = ctx.cwd;
    const systemMdPath = systemPath(cwd);

    if (!fs.existsSync(systemMdPath)) {
      ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
      return false;
    }

    const systemMd = readIfExists(systemMdPath);
    const rules = learnedRulesFromMd(systemMd);
    const candidateIndexes = (allowedRuleIndexes ?? rules.map((_rule, index) => index))
      .filter(index => index >= 0 && index < rules.length);

    if (candidateIndexes.length === 0) {
      ctx.ui.notify("No learned rules to remove", "info");
      return false;
    }

    let ruleIndex = -1;
    const directNum = parseInt(args.trim(), 10);
    if (!Number.isNaN(directNum)) {
      if (allowedRuleIndexes && directNum >= 1 && directNum <= candidateIndexes.length) {
        ruleIndex = candidateIndexes[directNum - 1];
      } else if (!allowedRuleIndexes && directNum >= 1 && directNum <= rules.length) {
        ruleIndex = directNum - 1;
      }
    }

    if (ruleIndex < 0) {
      const labels = candidateIndexes.map((candidateIndex, index) => {
        const rule = rules[candidateIndex];
        return `${index + 1}. ${rule.text} [source: ${formatRuleSourceStories(rule.sourceStories)}]`;
      });
      const pick = await ctx.ui.select(
        allowedRuleIndexes
          ? "Stale learned rules in system.md — select one to remove:"
          : "Learned rules in system.md — select one to remove:",
        [...labels, "Cancel"],
      );

      if (pick == null || pick === "Cancel") return false;

      const pickIndex = labels.indexOf(pick);
      if (pickIndex < 0) return false;
      ruleIndex = candidateIndexes[pickIndex];
    }

    const rule = rules[ruleIndex];
    const confirm = await confirmWithFallback(
      ctx,
      `Remove rule ${ruleIndex + 1}: "${rule.text}"?`,
      `Source: ${formatRuleSourceStories(rule.sourceStories)}\nThis rule will no longer constrain the agent.`,
    );

    if (!confirm) {
      ctx.ui.notify("Unlearn cancelled", "info");
      return false;
    }

    const nextRules = rules.filter((_entry, index) => index !== ruleIndex);
    fs.writeFileSync(systemMdPath, replaceLearnedRules(systemMd, nextRules));

    const clPath = complaintsLogPath(cwd);
    if (fs.existsSync(clPath)) {
      const log = readIfExists(clPath);
      const marker = `${nowISO()} | unlearned | "${rule.text}"`;
      const prefix = log.trimEnd();
      fs.writeFileSync(clPath, `${prefix ? `${prefix}\n` : ""}${marker}\n`);
    }

    ctx.ui.notify(`Rule removed: "${rule.text}"\nSource: ${formatRuleSourceStories(rule.sourceStories)}`, "info");
    return true;
  }

  async function chooseSpecificStoryForReview(ctx: any, cwd: string): Promise<string | null> {
    const stories = selectableStoriesForManualReview(cwd);
    if (stories.length === 0) {
      ctx.ui.notify("No in-progress or completed stories are available for review yet.", "info");
      return null;
    }

    const labels = stories.map(manualReviewStoryChoiceLabel);
    const choice = await ctx.ui.select("Which story should this review cover?", [...labels, "Cancel"]);
    if (choice == null || choice === "Cancel") return null;

    const selected = stories[labels.indexOf(choice)];
    return selected ? path.basename(selected.file, ".md") : null;
  }

  async function chooseManualReviewScope(
    ctx: any,
    cwd: string,
  ): Promise<{ scope: ManualReviewScope; storyLabel: string } | null> {
    const storyOption = "Specific story";
    const wholeCodebaseOption = "Whole codebase";
    const options = [storyOption, wholeCodebaseOption, "Cancel"];
    const choice = await ctx.ui.select("What scope should this review cover?", options);

    if (choice == null || choice === "Cancel") return null;
    if (choice === wholeCodebaseOption) return { scope: "whole-codebase", storyLabel: "—" };
    if (choice === storyOption) {
      const storyLabel = await chooseSpecificStoryForReview(ctx, cwd);
      if (!storyLabel) return null;
      return { scope: "story", storyLabel };
    }
    return null;
  }

  function shouldHideReviewTurn(trigger?: string): boolean {
    return trigger === "complete-story" || trigger === "post-story-completion";
  }

  function sendInternalAgentMessage(
    _ctx: any,
    content: string,
    details: Record<string, unknown>,
  ): void {
    pi.sendMessage(
      {
        customType: INTERNAL_AGENT_MESSAGE_TYPE,
        content,
        display: false,
        details,
      },
      { deliverAs: "steer", triggerTurn: true },
    );
  }

  function markStoryCloseoutApproved(ctx: any, storyPath: string): void {
    const cwd = ctx.cwd;
    const approved = approvedStoryCloseouts.get(cwd) ?? new Set<string>();
    approved.add(path.basename(storyPath));
    approvedStoryCloseouts.set(cwd, approved);
  }

  function consumeApprovedStoryCloseout(cwd: string, storyPath: string): boolean {
    const approved = approvedStoryCloseouts.get(cwd);
    const key = path.basename(storyPath);
    if (!approved?.has(key)) return false;
    approved.delete(key);
    if (approved.size === 0) approvedStoryCloseouts.delete(cwd);
    return true;
  }

  function completeApprovedStoryNow(ctx: any, storyPath: string): void {
    markStoryCloseoutApproved(ctx, storyPath);
    completeStoryNow(pendingCompleteStoryRequests, ctx, storyPath);
  }

  function completeApprovedStoryAndCommitNow(ctx: any, storyPath: string): void {
    markStoryCloseoutApproved(ctx, storyPath);
    completeStoryAndCommitNow(pendingCompleteStoryRequests, ctx, storyPath);
  }

  async function startReviewFlow(
    ctx: any,
    options: { focus: string; scope?: ManualReviewScope; storyLabel?: string; trigger?: string },
    beforeDispatch?: (review: ReturnType<typeof createReviewDraft>) => void,
  ): Promise<ReturnType<typeof createReviewDraft>> {
    const fallowAudit = runFallowAudit(ctx, ctx.cwd);
    const review = createReviewDraft(ctx.cwd, { ...options, staticAnalysis: fallowAudit.summaryLine, fallowFindings: fallowAudit.findings });
    syncReviewSummaryAndPromoteRules(ctx.cwd);
    ctx.ui.notify(`Created ${review.fileName} in .context/reviews/`, "info");
    const instruction = buildReviewInstruction(review, fallowAudit.promptPrefix, ctx.cwd);

    if (beforeDispatch) {
      beforeDispatch(review);
    }

    if (shouldHideReviewTurn(review.trigger)) {
      sendInternalAgentMessage(ctx, instruction, {
        purpose: "review",
        reviewFile: review.fileName,
        reviewScope: review.scope,
        story: review.storyLabel,
        trigger: review.trigger,
      });
      return review;
    }

    await pi.sendUserMessage(instruction, { deliverAs: "followUp" });
    return review;
  }

  const completeStoryController = createCompleteStoryController({
    pendingRequests: pendingCompleteStoryRequests,
    sendInternalAgentMessage,
    startReviewFlow: (ctx, options) => startReviewFlow(ctx, options),
    markStoryCloseoutApproved,
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    storyFrontmatterSnapshots.set(ctx.cwd, snapshotStoryFrontmatter(ctx.cwd));

    const workable = findWorkableStory(ctx.cwd);
    if (workable && workable.status === "not-started" && userExplicitlyApprovedStatusChange(event.prompt ?? "", "in-progress")) {
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
    const active = findActiveStory(ctx.cwd);
    const activeIsUiStory = active ? hasUiTypeOverride(active.file) || isUiStory(active.file) : false;
    const designSystem = activeIsUiStory ? strip(readIfExists(designSystemPath(ctx.cwd))) : "";
    const vcsGuidance = buildVcsSettingsGuidance(ctx.cwd);
    const vcsSafetyGuidance = hasVcsSafetyPolicyText(systemMd) ? "" : buildVcsSafetyGuidanceText();

    if (contextMap) parts.push(contextMap);
    else if (agents) parts.push(agents);
    if (systemMd) parts.push(systemMd);
    if (vcsGuidance) parts.push(vcsGuidance);
    if (vcsSafetyGuidance) parts.push(vcsSafetyGuidance);
    if (designSystem) parts.push(`[Design System]\n${designSystem}`);
    if (indexMd) parts.push(indexMd);

    // Inject active story
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
    storyFrontmatterSnapshots.delete(ctx.cwd);
    clearCompleteStoryCloseout(pendingCompleteStoryRequests, ctx.cwd);
    pendingManualReviewRequests.delete(ctx.cwd);
    approvedStoryCloseouts.delete(ctx.cwd);
    missingFallowNoticeShown.delete(ctx.cwd);
  });

  // ── turn_end: review closeout prompt dispatch while agent is still alive ─

  pi.on("turn_end", async (_event: any, ctx: any) => {
    const cwd = ctx.cwd;

    // Only act if the agent has no more pending messages queued —
    // otherwise we'd fire the closeout prompt mid-stream.
    if (ctx.hasPendingMessages?.()) return;

    // ── Complete-story follow-up orchestration ─────────────────────────
    if (await completeStoryController.handleTurnEnd(ctx)) return;

    // ── Manual review closeout ──────────────────────────────────────────
    const pendingManualReview = pendingManualReviewRequests.get(cwd);
    if (!pendingManualReview) return;

    const reviewFrontmatter = parseReviewFrontmatter(pendingManualReview.reviewFile);
    const canResumeCloseout = pendingManualReview.reviewCloseoutReady === true;
    if (reviewFrontmatter?.status !== "complete" && !canResumeCloseout) return;

    pendingManualReviewRequests.set(cwd, {
      reviewFile: pendingManualReview.reviewFile,
      reviewCloseoutReady: true,
    });

    recordCompletedReviewFallowFindings(cwd, pendingManualReview.reviewFile);
    const findings = reviewFindingsFromFile(pendingManualReview.reviewFile);
    const recommendedFixes = reviewRecommendedFixesFromFile(pendingManualReview.reviewFile);
    const trackedFixes = recommendedFixes.length > 0 ? recommendedFixes : reviewRecommendedFixesFromFindings(findings);
    const attachedStoryPath = reviewFrontmatter?.scope === "story" && reviewFrontmatter.story !== "—"
      ? path.join(storiesDir(cwd), `${reviewFrontmatter.story}.md`)
      : null;
    const targetNoun: ReviewCloseoutTarget = attachedStoryPath && fs.existsSync(attachedStoryPath) ? "story" : "review";
    const decision = await promptReviewFindingsCloseout(ctx, pendingManualReview.reviewFile, findings, targetNoun);
    if (decision == null) return;

    if (decision === "fix-high" || decision === "fix-all") {
      const targetedFixes = trackedFixes.filter(fix => !fix.checked && (decision === "fix-all" || isHighPrioritySeverity(fix.severity)));
      pendingManualReviewRequests.set(cwd, {
        reviewFile: pendingManualReview.reviewFile,
        reviewCloseoutReady: false,
      });
      resetReviewFileForRemediation(pendingManualReview.reviewFile);
      sendInternalAgentMessage(
        ctx,
        buildReviewRemediationInstruction(
          cwd,
          pendingManualReview.reviewFile,
          decision === "fix-high" ? "high" : "all",
          targetedFixes,
          targetNoun,
        ),
        {
          purpose: "review-remediation",
          reviewFile: path.basename(pendingManualReview.reviewFile),
          mode: decision,
          reviewTarget: targetNoun,
        },
      );
      return;
    }

    if (decision === "not-yet") return;

    let closeChoice: "close" | "close-commit" | null = decision === "close" || decision === "close-commit" ? decision : null;
    if (targetNoun === "story" && attachedStoryPath && closeChoice) {
      closeChoice = await resolveContextPersistenceChoice(ctx, attachedStoryPath, closeChoice);
      if (closeChoice == null) return;
    }

    pendingManualReviewRequests.delete(cwd);
    if (closeChoice === "close-commit" && targetNoun === "story" && attachedStoryPath) {
      completeApprovedStoryAndCommitNow(ctx, attachedStoryPath);
    } else if (closeChoice === "close" && targetNoun === "story" && attachedStoryPath) {
      completeApprovedStoryNow(ctx, attachedStoryPath);
    } else if (decision === "close") {
      ctx.ui.notify(`${path.basename(pendingManualReview.reviewFile)} closeout finished`, "info");
    }
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

    const snapshot = storyFrontmatterSnapshots.get(cwd);
    const pendingStatusChanges: Array<{
      storyFile: string;
      basename: string;
      previous: { status: string; completed: string };
      nextStatus: string;
    }> = [];
    const newlyCompletedStories: Array<{ storyFile: string; storyLabel: string }> = [];
    if (snapshot) {
      for (const story of listStories(cwd)) {
        const previous = snapshot.get(story.file);
        if (!previous) continue;
        if (story.status === "complete" && story.status !== previous.status) {
          newlyCompletedStories.push({
            storyFile: story.file,
            storyLabel: path.basename(story.file, ".md"),
          });
        }
        if (story.status !== "complete" && story.status !== "retired") continue;
        if (story.status === previous.status) continue;
        if (consumeApprovedStoryCloseout(cwd, story.file)) continue;
        if (userExplicitlyApprovedStatusChange(lastUserPrompt, story.status)) continue;
        pendingStatusChanges.push({
          storyFile: story.file,
          basename: path.basename(story.file),
          previous,
          nextStatus: story.status,
        });
      }
      storyFrontmatterSnapshots.delete(cwd);
    }

    for (const change of pendingStatusChanges) {
      let shouldRevert: boolean;
      if (ctx.hasUI) {
        const choice = await ctx.ui.select(
          `The agent marked ${change.basename} as "${change.nextStatus}". Did you mean to close this story?`,
          [
            `Yes — keep it as ${change.nextStatus}`,
            `No — revert to ${change.previous.status}`,
          ],
        );
        shouldRevert = choice == null || choice.startsWith("No");
      } else {
        shouldRevert = true;
      }
      if (shouldRevert) {
        restoreStoryFrontmatter(change.storyFile, change.previous);
        ctx.ui.notify(`${change.basename} reverted to "${change.previous.status}"`, "warning");
      }
    }

    // ── Complete-story in-progress review prompt ────────────────────────
    await completeStoryController.handleAgentEnd(ctx);

    // ── Newly completed stories (agent marked complete without /complete-story) ──
    const currentStoryStatuses = new Map(listStories(cwd).map(story => [story.file, story.status]));
    for (const completedStory of newlyCompletedStories) {
      if (currentStoryStatuses.get(completedStory.storyFile) !== "complete") continue;

      if (!ctx.hasUI) {
        ctx.ui.notify(`${completedStory.storyLabel} marked complete. Run /review to create a code review file.`, "info");
        continue;
      }

      const choice = await ctx.ui.select(
        `${completedStory.storyLabel} is complete. Start a code review now?`,
        ["Yes — create a code review file", "No — maybe later"],
      );
      if (choice == null || !choice.startsWith("Yes")) continue;

      await startReviewFlow(ctx, {
        focus: `${completedStory.storyLabel} completion review`,
        scope: "story",
        storyLabel: completedStory.storyLabel,
        trigger: "post-story-completion",
      });
      break;
    }

    // ── index.md structural updates ─────────────────────────────────────
    const idxPath = indexPath(cwd);
    if (!fs.existsSync(idxPath)) return;

    const existing = readIfExists(idxPath);
    const lines = existing.split("\n");
    const currentFiles = new Set(walkSourceFiles(cwd));
    const updated: string[] = [];
    const indexedFiles = new Set<string>();

    for (const line of lines) {
      const match = line.match(/^(.+?)\s+—\s+(.+)$/);
      if (match) {
        const filePath = match[1].trim();
        if (currentFiles.has(filePath)) {
          updated.push(line);
          indexedFiles.add(filePath);
        }
      } else {
        updated.push(line);
      }
    }

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
    description: "Bootstrap Vazir context files, then set up Git/JJ or Fossil", 
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx.cwd;

      const isAlreadyInitialized = fs.existsSync(path.join(cwd, ".context", "settings", "project.json"));
      let reconfigureOnly = false;
      if (isAlreadyInitialized && typeof ctx.ui?.select === "function") {
        const choice = await ctx.ui.select(
          "Vazir is already initialized. What would you like to do?",
          [
            "Reconfigure VCS preference",
            "Full re-bootstrap",
            "Cancel",
          ],
        );
        if (choice === "Cancel" || choice == null) return;
        reconfigureOnly = choice === "Reconfigure VCS preference";
      }

      const projectSettingsPath = path.join(settingsDir(cwd), "project.json");
      const agentsPath = path.join(cwd, "AGENTS.md");
      let indexSummary = { total: 0, undescribed: 0 };
      let shouldRequestModelDraft = false;

      if (!reconfigureOnly) {
        ensureDir(memoryDir(cwd));
        ensureDir(storiesDir(cwd));
        ensureDir(settingsDir(cwd));
        ensureIntakeStructure(cwd);
        ensureReviewStructure(cwd);
        ensureArchiveStructure(cwd);
        ensureDir(path.join(cwd, ".context", "checkpoints"));
  
        // design system stubs
        ensureDir(designDir(cwd));
        if (!fs.existsSync(designSystemPath(cwd))) {
          fs.writeFileSync(designSystemPath(cwd), DESIGN_SYSTEM_TEMPLATE);
        }
        if (!fs.existsSync(brandPath(cwd))) {
          fs.writeFileSync(brandPath(cwd), BRAND_TEMPLATE);
        }
        if (!fs.existsSync(componentsPath(cwd))) {
          fs.writeFileSync(componentsPath(cwd), COMPONENTS_TEMPLATE);
        }
  
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
  
        if (!fs.existsSync(projectSettingsPath)) {
          fs.writeFileSync(projectSettingsPath, JSON.stringify({ project_name: "", model_tier: "balanced", active_vcs_mode: "none" }, null, 2));
          ctx.ui.notify("project.json created", "info");
        }
  
        const settingsReadmePath = path.join(settingsDir(cwd), "README.md");
        if (!fs.existsSync(settingsReadmePath)) {
          fs.writeFileSync(settingsReadmePath, SETTINGS_README_TEMPLATE);
          ctx.ui.notify("settings README created", "info");
        }
  
        if (!fs.existsSync(agentsPath)) {
          fs.writeFileSync(agentsPath, AGENTS_MD_TEMPLATE);
          ctx.ui.notify("AGENTS.md created", "info");
        }
  
        const gitignorePath = path.join(cwd, ".gitignore");
        const ensureGitignoreEntry = (entry: string): boolean => {
          const gitignore = readIfExists(gitignorePath);
          if (new RegExp(`^${escapeRegExp(entry)}$`, "m").test(gitignore)) return false;
  
          const nextGitignore = `${gitignore.trimEnd()}${gitignore.trim() ? "\n" : ""}${entry}\n`;
          fs.writeFileSync(gitignorePath, nextGitignore);
          return true;
        };
  
        const ensureGitignoreEntries = (entries: string[], notification: string): void => {
          let changed = false;
          for (const entry of entries) {
            changed = ensureGitignoreEntry(entry) || changed;
          }
          if (changed) ctx.ui.notify(notification, "info");
        };
  
        ensureGitignoreEntries(
          [
            "node_modules/",
            ".fallow/",
            ".local/",
            ".env",
            ".env.local",
            ".env.*.local",
            "*.local",
            ".DS_Store",
            "Thumbs.db",
            "*.log",
            "*.tmp",
            "*.temp",
            "*.swp",
          ],
          "Added common ignore boilerplate to .gitignore",
        );
  
        const sourceFiles = walkSourceFiles(cwd);
        indexSummary = writeIndex(cwd, sourceFiles);
        ctx.ui.notify("index.md generated", "info");
  
        let contextMapStatus = "existing";
        const contextMapExisted = fs.existsSync(contextMapPath(cwd));
        shouldRequestModelDraft = false;
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
          `Vazir bootstrap complete • context-map.md: ${contextMapStatus} • index.md: ${indexSummary.total} files indexed • version control system (VCS) check runs now`,
          "info",
        );
      } // end if (!reconfigureOnly)

      let vcsLine = "☒ Version control system (VCS): Not configured";
      let vcsDetailLine = "  ↳ The active mode can change later in settings.";
      const initialGitReady = detectGitRepo(cwd);
      const initialFossilReady = detectFossil(cwd);
      let gitReady = initialGitReady;
      let fossilReady = initialFossilReady;
      let selectedMode: "git" | "fossil" | "none" = "none";
      let shouldAttemptJjSetup = false;

      const gitAndJjSetupFlow = async (): Promise<{ jjLine: string; jjDetailLine: string }> => {
        let nextJjLine = "☒ JJ (Jujutsu): Not started";
        let nextJjDetailLine = `  ↳ Install JJ here ${JJ_DOCS_URL}`;
        let jjAvailable = false;

        try {
          childProcess.execFileSync("jj", ["--version"], { cwd, stdio: "pipe" });
          jjAvailable = true;
        } catch {
          ctx.ui.notify(
            "JJ is not installed. It gives Vazir a full checkpoint history of every agent turn.\n\nTo install:  brew install jj  (macOS)\n             cargo install jj-cli  (Linux)\n\nAfter installing, run:  jj git init --colocate\nOr just re-run /vazir-init — files are already set up.",
            "info",
          );
        }

        try {
          if (jjAvailable) {
            try {
              childProcess.execFileSync("jj", ["root"], { cwd, stdio: "pipe" });
              ctx.ui.notify("JJ already initialised", "info");
              nextJjLine = "☑ JJ (Jujutsu): active";
              nextJjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
            } catch {
              childProcess.execFileSync("jj", ["git", "init", "--colocate"], { cwd, stdio: "pipe" });
              for (const branch of ["main", "master"]) {
                try {
                  childProcess.execFileSync("jj", ["bookmark", "track", `${branch}@origin`], { cwd, stdio: "pipe" });
                  break;
                } catch {
                  // Try the next common default branch.
                }
              }
              ctx.ui.notify("JJ initialised", "info");
              nextJjLine = "☑ JJ (Jujutsu): active";
              nextJjDetailLine = `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}`;
            }

            ensureGitignoreEntries([".jj/"], "Added .jj/ to .gitignore");
          }
        } catch (error: any) {
          ctx.ui.notify(`JJ setup failed: ${error?.message || String(error)} — continuing with git fallback`, "warning");
          nextJjDetailLine = "  ↳ JJ setup failed, so Git remains active without JJ checkpoints";
        }

        useJJ = detectJJ(cwd);
        return { jjLine: nextJjLine, jjDetailLine: nextJjDetailLine };
      };

      if (!gitReady && !fossilReady) {
        const choice = await ctx.ui.select(
          "No version control system (VCS) is configured in this repo yet. Which mode should Vazir set up? This choice can be changed later in settings.",
          [
            "Git/JJ",
            "Fossil",
          ],
        );
        selectedMode = choice === "Fossil" ? "fossil" : "git";
      } else if (gitReady && !fossilReady) {
        selectedMode = "git";
      } else if (!gitReady && fossilReady) {
        selectedMode = "fossil";
      } else {
        const choice = await ctx.ui.select(
          "Both Git and Fossil are already present in this repo. Which one should be the active mode in settings?",
          [
            "Git/JJ",
            "Fossil",
          ],
        );
        selectedMode = choice === "Fossil" ? "fossil" : "git";
      }

      if (selectedMode === "git" && !gitReady) {
        try {
          childProcess.execSync("git init", { cwd, stdio: "pipe" });
          gitReady = true;
          ctx.ui.notify("✓ git initialised\nRemember to add a remote:\ngit remote add origin <url>", "info");
        } catch (error: any) {
          ctx.ui.notify(`Git init failed: ${error?.message || String(error)} — JJ skipped`, "warning");
          selectedMode = "none";
          vcsDetailLine = "  ↳ Git initialisation failed.";
        }
      }

      if (selectedMode === "fossil" && !fossilReady) {
        if (!commandExists("fossil", ["version"])) {
          ctx.ui.notify("Fossil is not installed, so Vazir could not configure a Fossil checkout for this repo.", "warning");
          selectedMode = "none";
          vcsDetailLine = "  ↳ Fossil was selected but is not installed.";
        } else {
          try {
            const repoFile = `${path.basename(cwd)}.fossil`;
            childProcess.execFileSync("fossil", ["init", repoFile], { cwd, stdio: "pipe" });
            childProcess.execFileSync("fossil", ["open", "-f", repoFile], { cwd, stdio: "pipe" });
            fossilReady = detectFossil(cwd);
            ctx.ui.notify("✓ fossil repo initialised and opened", "info");
          } catch (error: any) {
            ctx.ui.notify(`Fossil setup failed: ${error?.message || String(error)}`, "warning");
            selectedMode = "none";
            vcsDetailLine = "  ↳ Fossil initialisation failed.";
          }
        }
      }

      const jjAlreadyActive = gitReady && detectJJ(cwd);
      if (selectedMode === "git" && gitReady) {
        if (initialGitReady && !initialFossilReady && !jjAlreadyActive) {
          const jjChoice = await ctx.ui.select(
            "Git is already set up in this repo. Do you want to enable JJ for checkpoints?",
            [
              "Yes — enable JJ checkpoints",
              "No — keep Git only for now",
            ],
          );
          shouldAttemptJjSetup = jjChoice === "Yes — enable JJ checkpoints";
        } else if (initialGitReady && initialFossilReady && selectedMode === "git" && !jjAlreadyActive) {
          const jjChoice = await ctx.ui.select(
            "Git is the active mode for this repo. Do you want to enable JJ for checkpoints too?",
            [
              "Yes — enable JJ checkpoints",
              "No — keep Git only for now",
            ],
          );
          shouldAttemptJjSetup = jjChoice === "Yes — enable JJ checkpoints";
        } else if (!initialGitReady && !initialFossilReady && !jjAlreadyActive) {
          const jjChoice = await ctx.ui.select(
            "Git is active for this new repo. Do you want to enable JJ for checkpoints too?",
            [
              "Yes — enable JJ checkpoints",
              "No — keep Git only for now",
            ],
          );
          shouldAttemptJjSetup = jjChoice === "Yes — enable JJ checkpoints";
        } else {
          shouldAttemptJjSetup = false;
        }
      }

      let jjLine = "☒ JJ (Jujutsu): Not started";
      let jjDetailLine = `  ↳ Install JJ here ${JJ_DOCS_URL}`;
      if (selectedMode === "git" && gitReady) {
        if (shouldAttemptJjSetup || detectJJ(cwd)) {
          const jjStatus = await gitAndJjSetupFlow();
          jjLine = jjStatus.jjLine;
          jjDetailLine = jjStatus.jjDetailLine;
        } else {
          useJJ = detectJJ(cwd);
          jjDetailLine = "  ↳ Git is active. JJ can be enabled later for checkpoints.";
        }
      } else {
        useJJ = false;
      }

      if (selectedMode === "fossil" && fossilReady) {
        if (ensureFossilIgnoreGlob(cwd)) {
          ctx.ui.notify("Added Fossil ignore defaults (.context/, node_modules/, .git/, .jj/)", "info");
        }
      }

      if (selectedMode === "git" && gitReady) {
        writeProjectSettings(cwd, { active_vcs_mode: "git", vcs_preference: useJJ ? "jj" : "git" });
        vcsLine = "☑ Version control system (VCS): Git/JJ active";
        vcsDetailLine = useJJ
          ? `  ↳ JJ checkpoints are active. The active mode can be changed later in settings.`
          : [
              "  ↳ Git is active. JJ remains optional for checkpoints. The active mode can be changed later in settings.",
              jjLine,
              jjDetailLine,
            ].join("\n");
      } else if (selectedMode === "fossil" && fossilReady) {
        writeProjectSettings(cwd, { active_vcs_mode: "fossil", vcs_preference: "fossil" });
        vcsLine = "☑ Version control system (VCS): Fossil active";
        vcsDetailLine = "  ↳ Fossil is active for this repo. The active mode can be changed later in settings.";
      } else {
        writeProjectSettings(cwd, { active_vcs_mode: "none" });
        vcsLine = "☒ Version control system (VCS): Not configured";
      }

      await maybePromptForFallowInstall(ctx, cwd);

      const initSummary = buildInitSummary([
        { label: ".context/memory/system.md", present: fs.existsSync(systemPath(cwd)) },
        { label: ".context/memory/index.md", present: fs.existsSync(indexPath(cwd)) },
        { label: ".context/memory/context-map.md", present: fs.existsSync(contextMapPath(cwd)) },
        { label: ".context/stories/", present: fs.existsSync(storiesDir(cwd)) },
        { label: ".context/intake/", present: fs.existsSync(intakeDir(cwd)) },
        { label: ".context/reviews/", present: fs.existsSync(reviewsDir(cwd)) },
        { label: ".context/archive/", present: fs.existsSync(archiveDir(cwd)) },
        { label: ".context/complaints-log.md", present: fs.existsSync(complaintsLogPath(cwd)) },
        { label: "AGENTS.md", present: fs.existsSync(agentsPath) },
        { label: ".context/settings/project.json", present: fs.existsSync(projectSettingsPath) },
      ], vcsLine, vcsDetailLine);
      pendingInitSummary = initSummary;
      ctx.ui.notify(initSummary, "info");

      if (shouldRequestModelDraft || indexSummary.undescribed > 0) {
        await pi.sendUserMessage(buildContextMapDraftInstruction(cwd), { deliverAs: "followUp" });
      }

      // Refresh the footer immediately so the VCS state (branch, commit counter)
      // reflects the new git/JJ setup without requiring a manual /reload.
      refreshVcsState(cwd);
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
      const planningSources = listPlanIntakeFiles(cwd);
      const existingStoryFiles = listStories(cwd)
        .sort((a, b) => a.number - b.number)
        .map(story => path.basename(story.file));

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
          if (plan) {
            await showMarkdownViewer(ctx, "plan.md", plan);
          } else {
            ctx.ui.notify("Plan file is empty.", "info");
          }
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
          planningSources.length > 0
            ? "Keep it short if needed — /plan will review existing planning material first"
            : "e.g. a SaaS dashboard for tracking team OKRs",
        ))?.trim() ?? "";
      }
      planningBrief = normalizeProjectBrief(planningBrief, projectName);

      fs.writeFileSync(intakeBriefPath(cwd), buildIntakeBrief(cwd, planningBrief, planningSources));

      // Silent design seeding pass
      ensureDir(designDir(cwd));
      const designSeed = seedDesignFromIntake(cwd);
      if (!designSeed.seeded) {
        if (!fs.existsSync(designSystemPath(cwd))) fs.writeFileSync(designSystemPath(cwd), DESIGN_SYSTEM_TEMPLATE);
        if (!fs.existsSync(brandPath(cwd))) fs.writeFileSync(brandPath(cwd), BRAND_TEMPLATE);
        if (!fs.existsSync(componentsPath(cwd))) fs.writeFileSync(componentsPath(cwd), COMPONENTS_TEMPLATE);
      }

      if (planningSources.length > 0) {
        ctx.ui.notify(`Found ${planningSources.length} user-authored planning source file${planningSources.length === 1 ? "" : "s"}`, "info");
      } else {
        ctx.ui.notify("No user-authored planning material found — /plan will rely on the conversation", "info");
      }
      ctx.ui.notify("intake-brief.md refreshed in .context/stories/", "info");
      if (designSeed.note) {
        ctx.ui.notify(designSeed.note, "info");
      }

      // Generate a plan scaffold if needed; the model fills it in after clarifying questions.
      if (!planExists) {
        fs.writeFileSync(planPath, planTemplate(projectName));
        ctx.ui.notify("plan.md created in .context/stories/", "info");
      }

      if (existingStoryFiles.length > 0) {
        ctx.ui.notify(`Existing story files preserved for replanning: ${existingStoryFiles.join(", ")}`, "info");
      } else {
        ctx.ui.notify(
          "No story files are seeded upfront — /plan will create as many story files as needed after the planning questions",
          "info",
        );
      }

      const planModeNote = planExists
        ? existingStoryFiles.length > 0
          ? "NOTE: This is a replan. Preserve every existing story file, keep existing story queue rows in plan.md, append only new stories needed for the added scope, and append a replanning log entry. If older work is invalidated, retire or supersede it without overwriting the original story file."
          : "NOTE: This is a replan with no existing story files yet. Treat the plan update as an addendum and create as many new story files as needed."
        : "NOTE: Create as many story files as needed for the scoped work. Do not stop at an arbitrary count.";
      const planningSourcesList = planningSources.length > 0 ? planningSources.join(", ") : "none";

      // Instruct the agent to run the planning conversation
      const instruction = [
        "The user wants to plan their project.",
        existingStoryFiles.length > 0
          ? `Existing story files already exist in .context/stories/: ${existingStoryFiles.join(", ")}. Treat them as preserved history, not scaffolds.`
          : "No story files are pre-seeded in .context/stories/. Create the final story set after clarifying questions.",
        "",
        "Your job:",
        `1. Read .context/stories/intake-brief.md first.${planningSources.length > 0 ? ` Sources: ${planningSourcesList}.` : ""}`,
        planningSources.length > 0
          ? "   Read intake sources before asking anything. Skim large files selectively."
          : "",
        "2. Ask exactly ONE clarifying question at a time. Wait for the answer before asking the next. Do NOT ask multiple questions in one turn.",
        "   Only ask about genuinely missing or conflicting information. Do not list, number, or categorize questions.",
        "   Default questions if still unclear after review:",
        "   - Who are the users?",
        "   - What's the most important thing to get right in v1?",
        "   - What are we explicitly NOT building in v1?",
        "   - What stack are we using / what already exists?",
        "3. Once you have enough to write stories, say: 'I have what I need — writing the plan and stories now.' Then proceed.",
        `4. Update .context/stories/intake-brief.md with the final distilled answers. Current brief: ${planningBrief}`,
        planExists
          ? "5. Update .context/stories/plan.md as an addendum: keep existing queue rows, append only new rows, and add a replanning log entry."
          : "5. Rewrite .context/stories/plan.md completely — replace all placeholder text with real content.",
        existingStoryFiles.length > 0
          ? `6. Preserve existing story files: ${existingStoryFiles.join(", ")}. Do NOT overwrite or renumber them. Add new story-NNN.md files only for follow-up work.`
          : "6. Create as many story-NNN.md files as needed for the scoped work. There is NO preset cap.",
        "7. Every story must use the exact template: Status, Created, Last accessed, Goal, Verification, Scope, Out of scope, Dependencies, Checklist, Issues, Completion Summary.",
        "   Checklist items must be concrete tasks — not questions. Target 4–7 tasks per story; 7 is a hard cap.",
        `8. Number any new stories from ${nextStoryNumber(cwd)}.`,
        "9. Present the final story list to the user and ask if anything needs adjusting.",
        "",
        planModeNote,
      ].filter(Boolean).join("\n");

      await pi.sendUserMessage(instruction);
    },
  });

  // ── /remember ────────────────────────────────────────────────────────

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
      const activeStory = findActiveStory(cwd);
      const activeStoryLabel = activeStory ? path.basename(activeStory.file, ".md") : "—";
      fs.writeFileSync(rememberedRulesPath(cwd), `${rememberLog.trimEnd()}\n${rememberEntry(rule, activeStoryLabel)}`.trimStart());
      appendLearnedRules(cwd, [{ text: rule, sourceStories: activeStoryLabel === "—" ? [] : [activeStoryLabel] }]);
      syncReviewSummaryAndPromoteRules(cwd);
      ctx.ui.notify(`Remembered: ${rule}`, "info");
    },
  });

  // ── /review ─────────────────────────────────────────────────────────

  pi.registerCommand("review", {
    description: "Create a structured code review file for the current story or a manually triggered whole-codebase review",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureReviewStructure(cwd);

      const parsed = parseManualReviewRequest(args);
      const defaultStoryLabel = activeStoryLabelForManualReview(cwd);
      let scope = parsed.scope;
      let storyLabel = scope === "whole-codebase" ? "—" : defaultStoryLabel;

      if (scope === "story" && ctx.hasUI) {
        const selectedStoryLabel = await chooseSpecificStoryForReview(ctx, cwd);
        if (!selectedStoryLabel) return;
        storyLabel = selectedStoryLabel;
      }

      if (!scope && ctx.hasUI) {
        const selection = await chooseManualReviewScope(ctx, cwd);
        if (!selection) return;
        scope = selection.scope;
        storyLabel = selection.storyLabel;
      }

      if (!scope) {
        scope = defaultStoryLabel === "—" ? "whole-codebase" : "story";
        storyLabel = scope === "story" ? defaultStoryLabel : "—";
      }

      if (scope === "story" && storyLabel === "—") {
        ctx.ui.notify("No active story is available for a story-scoped review; switching to a whole-codebase review.", "warning");
        scope = "whole-codebase";
      }

      const focus = parsed.focus || defaultReviewFocus(cwd, { scope, storyLabel });
      await startReviewFlow(ctx, { focus, scope, storyLabel, trigger: "manual" }, review => {
        pendingManualReviewRequests.set(cwd, { reviewFile: review.filePath, reviewCloseoutReady: false });
      });
    },
  });

  pi.registerCommand("complete-story", {
    description: "Check an in-progress story for completion readiness, then complete it and optionally start a code review",
    handler: async (_args: string, ctx: any) => {
      await completeStoryController.handleCommand(ctx);
    },
  });

  pi.registerCommand("unlearn", {
    description: "Remove a promoted rule from system.md",
    handler: async (args: string, ctx: any) => {
      await runUnlearnFlow(args, ctx);
    },
  });

  pi.registerCommand("memory-review", {
    description: "Review archive, stale-rule, and delete candidates across the Vazir knowledge base",
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx.cwd;
      const contextRoot = path.join(cwd, ".context");
      if (!fs.existsSync(contextRoot) || !fs.existsSync(systemPath(cwd))) {
        ctx.ui.notify("No Vazir knowledge base found — run /vazir-init first", "warning");
        return;
      }

      ensureArchiveStructure(cwd);
      ensureReviewStructure(cwd);

      let archivedCount = 0;
      let deletedCount = 0;

      const archiveCandidates = memoryReviewArchiveCandidates(cwd);
      if (archiveCandidates.length === 0) {
        ctx.ui.notify("Memory review archive pass: no archive candidates", "info");
      } else if (!ctx.hasUI) {
        ctx.ui.notify(`Memory review found ${archiveCandidates.length} archive candidate(s). Re-run /memory-review in an interactive session to archive them.`, "info");
      } else {
        const archivePrompt = [
          `Ready to archive ${archiveCandidates.length} file${archiveCandidates.length === 1 ? "" : "s"}.`,
          "",
          ...archiveCandidates.map(candidate => `  ${candidate.label} — ${candidate.reason}`),
          "",
          "Archive all? Or name any files you want to keep active.",
        ].join("\n");
        const archiveChoice = await ctx.ui.select(archivePrompt, [
          "Archive all",
          "Name files to keep active",
          "Skip this archive pass",
        ]);

        let selectedCandidates = archiveCandidates;
        if (archiveChoice === "Name files to keep active") {
          if (typeof ctx.ui.input === "function") {
            const keepInput = (await ctx.ui.input(
              "Files to keep active",
              "Comma-separated filenames or story labels, e.g. story-003, review-20260401",
            ))?.trim() ?? "";
            const filtered = applyArchiveKeepExceptions(cwd, archiveCandidates, keepInput);
            selectedCandidates = filtered.selected;
            if (filtered.kept.length > 0) {
              ctx.ui.notify(`Keeping active: ${filtered.kept.join(", ")}`, "info");
            }
          } else {
            ctx.ui.notify("This session cannot collect keep exceptions, so the archive pass was skipped.", "warning");
            selectedCandidates = [];
          }
        }

        if (archiveChoice === "Archive all" || archiveChoice === "Name files to keep active") {
          if (selectedCandidates.length > 0) {
            const archivedPaths = archiveMemoryReviewCandidates(cwd, selectedCandidates);
            archivedCount = archivedPaths.length;
            syncReviewSummaryAndPromoteRules(cwd);
            ctx.ui.notify(`Archived ${archivedPaths.length} file(s) into .context/archive/`, "info");
          } else if (archiveChoice === "Name files to keep active") {
            ctx.ui.notify("No files remained in the archive batch after applying keep exceptions.", "info");
          }
        } else {
          ctx.ui.notify("Memory review archive pass skipped", "info");
        }
      }

      const staleCandidates = staleRuleCandidates(cwd);
      if (staleCandidates.length === 0) {
        ctx.ui.notify("Memory review stale-rule pass: no stale learned rules found", "info");
      } else if (!ctx.hasUI) {
        ctx.ui.notify(`Memory review found ${staleCandidates.length} stale learned rule candidate(s). Re-run /memory-review in an interactive session to review them.`, "info");
      } else {
        const stalePrompt = [
          `Stale rule candidates: ${staleCandidates.length}.`,
          "",
          ...staleCandidates.map((candidate, index) => `  ${index + 1}. ${candidate.text} — ${candidate.reason}`),
          "",
          "Keep them, remove one via /unlearn, or update system.md manually later.",
        ].join("\n");
        const staleChoice = await ctx.ui.select(stalePrompt, [
          "Keep these rules for now",
          "Remove one via /unlearn",
          "Review manually later",
        ]);

        if (staleChoice === "Remove one via /unlearn") {
          await runUnlearnFlow("", ctx, staleCandidates.map(candidate => candidate.ruleIndex));
        } else if (staleChoice === "Review manually later") {
          ctx.ui.notify("Review .context/memory/system.md manually and use /unlearn for any removals.", "info");
        }
      }

      const deleteCandidates = memoryReviewDeleteCandidates(cwd);
      if (deleteCandidates.length === 0) {
        ctx.ui.notify("Memory review delete pass: no delete candidates", "info");
      } else if (!ctx.hasUI) {
        ctx.ui.notify(`Memory review found ${deleteCandidates.length} delete candidate(s). Re-run /memory-review in an interactive session to review them.`, "info");
      } else {
        const warningBlock = [
          "WARNING ----------------------------------------",
          "PERMANENT DELETION - this cannot be undone.",
          "",
          `${deleteCandidates.length} file${deleteCandidates.length === 1 ? "" : "s"} identified as obsolete:`,
          ...deleteCandidates.map(candidate => `  ${candidate.label} — ${candidate.reason}`),
          "",
          "Continue to deletion?",
          "WARNING ----------------------------------------",
        ].join("\n");

        if (await confirmWithFallback(ctx, warningBlock, "yes / cancel")) {
          const finalPrompt = [
            "You are about to permanently delete:",
            "",
            ...deleteCandidates.map(candidate => `  ${candidate.label}`),
            "",
            "Confirm deletion?",
          ].join("\n");

          if (await confirmWithFallback(ctx, finalPrompt, "yes / cancel")) {
            for (const candidate of deleteCandidates) {
              if (!fs.existsSync(candidate.filePath)) continue;
              fs.rmSync(candidate.filePath, { force: true });
              deletedCount += 1;
            }
            ctx.ui.notify(`Deleted ${deletedCount} obsolete file(s) from .context/intake/`, "warning");
          } else {
            ctx.ui.notify("Memory review delete pass cancelled", "info");
          }
        } else {
          ctx.ui.notify("Memory review delete pass cancelled", "info");
        }
      }

      ctx.ui.notify(
        `Memory review complete: archived ${archivedCount} file(s), flagged ${staleCandidates.length} stale rule candidate(s), deleted ${deletedCount} file(s).`,
        "info",
      );
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
        "Applying local learned-rule dedupe before handing consolidation to Pi",
      ].join("\n");

      ctx.ui.notify(preview, "info");
      prepareLearnedRulesForConsolidation(ctx.cwd);
      await pi.sendUserMessage(buildConsolidationInstruction(ctx.cwd), { deliverAs: "followUp" });
      ctx.ui.notify("Consolidation handed to the current Pi model", "info");
    },
  });

  // ── /design ─────────────────────────────────────────────────────────

  pi.registerCommand("design", {
    description: "Review and update design-system, brand, and components files",
    handler: async (args: string, ctx: any) => {
      const cwd = ctx.cwd;
      ensureDir(designDir(cwd));
      const dsPath = designSystemPath(cwd);
      const brandP = brandPath(cwd);
      const compsP = componentsPath(cwd);

      // Ensure stubs exist
      if (!fs.existsSync(dsPath)) fs.writeFileSync(dsPath, DESIGN_SYSTEM_TEMPLATE);
      if (!fs.existsSync(brandP)) fs.writeFileSync(brandP, BRAND_TEMPLATE);
      if (!fs.existsSync(compsP)) fs.writeFileSync(compsP, COMPONENTS_TEMPLATE);

      const applyInstruction = async (instruction: string) => {
        const inst = instruction.trim();
        if (!inst) return;

        const activeStory = findActiveStory(cwd);
        const storyLabel = activeStory ? path.basename(activeStory.file, ".md") : "—";

        // switch primary colour to slate-900
        const mPrimary = inst.match(/(?:switch|set)\s+primary\s+(?:colour|color)\s+to\s+(.+)$/i);
        if (mPrimary) {
          const value = mPrimary[1].trim();
          const ds = readIfExists(dsPath) || DESIGN_SYSTEM_TEMPLATE;
          const lines = ds.split("\n");
          let inColours = false;
          let replaced = false;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^##\s+Colours/.test(line)) { inColours = true; continue; }
            if (inColours) {
              if (/^##\s+/.test(line)) break;
              if (/^-\s*Primary:/i.test(line)) {
                lines[i] = `- Primary: ${value} <!-- source: ${storyLabel} -->`;
                replaced = true;
                break;
              }
            }
          }
          if (!replaced) {
            // inject under Colours
            for (let i = 0; i < lines.length; i++) {
              if (/^##\s+Colours/.test(lines[i])) {
                lines.splice(i+1, 0, `- Primary: ${value} <!-- source: ${storyLabel} -->`);
                replaced = true;
                break;
              }
            }
          }
          fs.writeFileSync(dsPath, lines.join("\n"));
          ctx.ui.notify(`Updated Primary colour to ${value} in ${path.relative(cwd, dsPath)}`, "info");
          return;
        }

        // move component conventions to components.md
        if (/move\s+component\s+conventions/i.test(inst) || (/move\s+components?/i.test(inst) && /components?\.md/i.test(inst))) {
          const ds = readIfExists(dsPath);
          const compSecMatch = ds.match(/## Component conventions[\s\S]*?(?=\n## |$)/i);
          const compSec = compSecMatch ? compSecMatch[0] : "";
          if (!compSec) {
            ctx.ui.notify("No component conventions section found in design-system.md", "info");
            return;
          }
          const comps = readIfExists(compsP).trim();
          const appended = `${comps}\n\n${compSec}\n`;
          fs.writeFileSync(compsP, appended.trim() + "\n");
          // remove section from design-system
          const newDs = ds.replace(/\n## Component conventions[\s\S]*?(?=\n## |$)/i, `\n## Component conventions\n- See components.md <!-- source: ${storyLabel} -->\n`);
          fs.writeFileSync(dsPath, newDs);
          ctx.ui.notify(`Moved component conventions to ${path.relative(cwd, compsP)}`, "info");
          return;
        }

        ctx.ui.notify("Instruction not understood. Try: 'switch primary colour to slate-900' or 'move component conventions to components.md'", "info");
      };

      const direct = args.trim();
      if (!direct) {
        const summary = buildDesignSummary(cwd);
        const warn = warnIfDesignSystemOverCap(cwd);
        let body = summary;
        if (warn.overCap && warn.message) {
          body = `${warn.message}\n\n${body}`;
        }

        if (ctx.hasUI) {
          await showScrollableText(ctx, "Design summary", "Esc to return", body);
          const instruction = (await ctx.ui.input("What would you like to update?", "e.g. switch primary colour to slate-900"))?.trim() ?? "";
          if (!instruction) return;
          await applyInstruction(instruction);
          return;
        }

        // non-UI: send summary and await follow-up
        await pi.sendUserMessage(body);
        return;
      }

      // direct invocation
      await applyInstruction(direct);

    },
  });

  // ── /vcs-settings ────────────────────────────────────────────────────

  function resolveAutoVcsModeForSettings(cwd: string): "git" | "fossil" | "none" {
    const hasGit = detectGitRepo(cwd);
    const hasJJ = hasGit ? detectJJ(cwd) : false;
    const hasFossil = detectFossil(cwd);
    if (hasJJ || hasGit) return "git";
    if (hasFossil) return "fossil";
    return "none";
  }

  function persistVcsSettings(cwd: string, preference: "auto" | "git" | "jj" | "fossil", activeMode: "git" | "fossil" | "none") {
    writeProjectSettings(cwd, {
      vcs_preference: preference,
      active_vcs_mode: activeMode,
    });
    refreshVcsState(cwd);
  }

  function ensureGitignoreEntriesForVcsCommand(cwd: string, entries: string[], ctx: any, notification: string): void {
    const gitignorePath = path.join(cwd, ".gitignore");
    let current = readIfExists(gitignorePath);
    let changed = false;
    for (const entry of entries) {
      if (new RegExp(`^${escapeRegExp(entry)}$`, "m").test(current)) continue;
      current = `${current.trimEnd()}${current.trim() ? "\n" : ""}${entry}\n`;
      changed = true;
    }
    if (!changed) return;
    fs.writeFileSync(gitignorePath, current);
    ctx.ui.notify(notification, "info");
  }

  async function promptInstallIfMissing(ctx: any, label: "Git" | "JJ" | "Fossil", message: string): Promise<boolean> {
    if (typeof ctx.ui?.select !== "function") {
      ctx.ui.notify(message, "info");
      return false;
    }

    const choice = await ctx.ui.select(
      `${label} is not installed. Would you like to install it?`,
      ["Yes", "No"],
    );
    if (choice === "Yes") {
      ctx.ui.notify(message, "info");
      return true;
    }
    return false;
  }

  async function promptInitializeMode(ctx: any, label: string): Promise<boolean> {
    if (typeof ctx.ui?.select !== "function") return true;
    const choice = await ctx.ui.select(
      `${label} is not initialized in this repo yet. Would you like Vazir to initialize it now?`,
      ["Yes", "No"],
    );
    return choice === "Yes";
  }

  async function activateGitOrJjMode(ctx: any, cwd: string, requestedPreference: "git" | "jj"): Promise<void> {
    const preferJj = requestedPreference === "jj";
    if (!commandExists("git", ["--version"])) {
      await promptInstallIfMissing(
        ctx,
        "Git",
        "Git is not installed. Install it first, then re-run /vcs-settings.\n\nExamples:\n  macOS: brew install git\n  Ubuntu/Debian: sudo apt install git\n  Fedora: sudo dnf install git",
      );
      return;
    }

    let gitReady = detectGitRepo(cwd);
    if (!gitReady) {
      const shouldInitializeGit = await promptInitializeMode(ctx, "Git");
      if (!shouldInitializeGit) {
        ctx.ui.notify("Git setup skipped.", "info");
        return;
      }
      try {
        childProcess.execSync("git init", { cwd, stdio: "pipe" });
        gitReady = true;
        ctx.ui.notify("✓ git initialised\nRemember to add a remote:\ngit remote add origin <url>", "info");
      } catch (error: any) {
        ctx.ui.notify(`Git init failed: ${error?.message || String(error)}`, "warning");
        return;
      }
    }

    let jjActive = gitReady ? detectJJ(cwd) : false;
    if (preferJj && gitReady && !jjActive) {
      if (!commandExists("jj", ["--version"])) {
        const wantsInstallHelp = await promptInstallIfMissing(
          ctx,
          "JJ",
          "JJ is not installed. It gives Vazir a full checkpoint history of every agent turn.\n\nTo install:\n  macOS: brew install jj\n  Linux: cargo install jj-cli\n\nAfter installing, re-run /vcs-settings and choose Git/JJ.",
        );
        ctx.ui.notify(
          wantsInstallHelp
            ? "Continuing with Git only for now. Re-run /vcs-settings after installing JJ to enable checkpoints."
            : "JJ setup skipped. Continuing with Git only for now.",
          "info",
        );
      } else {
        const shouldInitializeJj = await promptInitializeMode(ctx, "JJ");
        if (!shouldInitializeJj) {
          ctx.ui.notify("JJ setup skipped. Continuing with Git only for now.", "info");
        } else {
          try {
            childProcess.execFileSync("jj", ["git", "init", "--colocate"], { cwd, stdio: "pipe" });
            for (const branch of ["main", "master"]) {
              try {
                childProcess.execFileSync("jj", ["bookmark", "track", `${branch}@origin`], { cwd, stdio: "pipe" });
                break;
              } catch {
                // Try the next common default branch.
              }
            }
            ensureGitignoreEntriesForVcsCommand(cwd, [".jj/"], ctx, "Added .jj/ to .gitignore");
            ctx.ui.notify("JJ initialised", "info");
          } catch (error: any) {
            ctx.ui.notify(`JJ setup failed: ${error?.message || String(error)} — continuing with Git only`, "warning");
          }
          jjActive = detectJJ(cwd);
        }
      }
    }

    useJJ = jjActive;
    const resolvedPreference = "git";
    persistVcsSettings(cwd, resolvedPreference, "git");
    ctx.ui.notify(`VCS preference set to ${resolvedPreference}`, "info");
  }

  async function activateFossilMode(ctx: any, cwd: string): Promise<void> {
    if (!commandExists("fossil", ["version"])) {
      await promptInstallIfMissing(
        ctx,
        "Fossil",
        "Fossil is not installed. Install it first, then re-run /vcs-settings.\n\nExamples:\n  macOS: brew install fossil\n  Ubuntu/Debian: sudo apt install fossil\n  Fedora: sudo dnf install fossil",
      );
      return;
    }

    let fossilReady = detectFossil(cwd);
    if (!fossilReady) {
      const shouldInitializeFossil = await promptInitializeMode(ctx, "Fossil");
      if (!shouldInitializeFossil) {
        ctx.ui.notify("Fossil setup skipped.", "info");
        return;
      }
      try {
        const repoFile = `${path.basename(cwd)}.fossil`;
        childProcess.execFileSync("fossil", ["init", repoFile], { cwd, stdio: "pipe" });
        childProcess.execFileSync("fossil", ["open", "-f", repoFile], { cwd, stdio: "pipe" });
        fossilReady = detectFossil(cwd);
        ctx.ui.notify("✓ fossil repo initialised and opened", "info");
      } catch (error: any) {
        ctx.ui.notify(`Fossil setup failed: ${error?.message || String(error)}`, "warning");
        return;
      }
    }

    if (ensureFossilIgnoreGlob(cwd)) {
      ctx.ui.notify("Added Fossil ignore defaults (.context/, node_modules/, .git/, .jj/)", "info");
    }

    useJJ = false;
    persistVcsSettings(cwd, "fossil", "fossil");
    ctx.ui.notify("VCS preference set to fossil", "info");
  }

  async function chooseVcsPreferenceFromMenu(ctx: any): Promise<"auto" | "git" | "jj" | "fossil" | null | undefined> {
    if (typeof ctx.ui?.select !== "function") return undefined;
    const choice = await ctx.ui.select(
      "Which VCS mode should Vazir use?",
      ["Auto", "Git/JJ", "Fossil", "Cancel"],
    );
    if (choice === "Auto") return "auto";
    if (choice === "Git/JJ") return "jj";
    if (choice === "Fossil") return "fossil";
    return null;
  }

  async function applyVcsSettingsCommand(rawArgs: string, ctx: any) {
    const cwd = ctx.cwd;
    const normalizedParts = rawArgs.trim().split(/\s+/).filter(Boolean);

    let preference: "auto" | "git" | "jj" | "fossil" | null = null;
    if (normalizedParts.length < 1) {
      preference = await chooseVcsPreferenceFromMenu(ctx);
      if (preference === undefined) {
        ctx.ui.notify("Usage: /vcs-settings <auto|git|jj|fossil>", "info");
        return;
      }
      if (preference === null) return;
    } else {
      const candidate = normalizedParts[0].toLowerCase();
      if (candidate === "auto" || candidate === "git" || candidate === "jj" || candidate === "fossil") {
        preference = candidate;
      }
    }

    if (preference === null) {
      ctx.ui.notify(`Invalid VCS preference: ${normalizedParts[0]}. Use auto, git, jj, or fossil.`, "warning");
      return;
    }

    if (preference === "auto") {
      const activeMode = resolveAutoVcsModeForSettings(cwd);
      persistVcsSettings(cwd, "auto", activeMode);
      ctx.ui.notify(`VCS preference set to auto (resolved to ${activeMode})`, "info");
      return;
    }

    if (preference === "fossil") {
      await activateFossilMode(ctx, cwd);
      return;
    }

    await activateGitOrJjMode(ctx, cwd, preference);
  }

  pi.registerCommand("vcs-settings", {
    description: "Pick or set the preferred VCS mode for Vazir",
    handler: async (args: string, ctx: any) => {
      await applyVcsSettingsCommand(args, ctx);
    },
  });

}
