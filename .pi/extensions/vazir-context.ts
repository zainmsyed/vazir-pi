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

type InitFileStatus = {
  label: string;
  present: boolean;
};

function memoryDir(cwd: string) {
  return path.join(cwd, ".context", "memory");
}

function learningsDir(cwd: string) {
  return path.join(cwd, ".context", "learnings");
}

function pendingLearningsPath(cwd: string) {
  return path.join(learningsDir(cwd), "pending.md");
}

function settingsDir(cwd: string) {
  return path.join(cwd, ".context", "settings");
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

function guessDescriptionFromPath(relPath: string): string {
  const fileName = baseName(relPath);
  const lowerPath = relPath.toLowerCase();

  if (lowerPath === "agents.md") return "Cross-framework project guidance and working notes";
  if (lowerPath.includes("vazir-context")) return "Context injection, init, and consolidation extension";
  if (lowerPath.includes("vazir-tracker")) return "Change tracker, diff, reject, and reset extension";
  if (lowerPath.endsWith("/skill.md")) return "Vazir baseline skill instructions";
  if (lowerPath.endsWith(".json")) return `${fileName} configuration file`;
  if (lowerPath.endsWith(".md")) return `${fileName} project notes`;
  return `${fileName} source file`;
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
  const entries = sourceFiles.map(file => ({
    file,
    description: guessDescriptionFromPath(file),
  }));
  const indexContent = formatIndex(entries);
  fs.writeFileSync(indexPath(cwd), indexContent);
  return {
    total: entries.length,
    undescribed: 0,
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
  const replacement = ["## Learned Rules", ...uniqueLines];

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

async function prepareLearningConsolidation(cwd: string): Promise<string | null> {
  const systemMdPath = systemPath(cwd);
  const pendingPath = pendingLearningsPath(cwd);
  if (!fs.existsSync(systemMdPath)) return null;

  const systemMd = readIfExists(systemMdPath);
  const learnings = readIfExists(pendingPath).trim();
  if (!systemMd.trim() || !learnings) {
    const deduped = dedupeLearnedRules(systemMd);
    return deduped !== systemMd ? deduped : null;
  }

  const apiKey = (globalThis as { process?: { env?: { ANTHROPIC_API_KEY?: string } } }).process?.env?.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    const deduped = dedupeLearnedRules(systemMd);
    return deduped !== systemMd ? deduped : null;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content:
            "You maintain a rule set for a coding agent.\n\n" +
            `Current system.md:\n<system_md>${systemMd}</system_md>\n\n` +
            `Recent rejection log:\n<learnings>${learnings}</learnings>\n\n` +
            "Return a cleaned ## Learned Rules section only:\n" +
            "- Merge rules that say the same thing differently\n" +
            "- Remove rules contradicted by newer ones\n" +
            "- One concise bullet per rule\n" +
            "- No new rules\n" +
            "- Return ONLY the ## Learned Rules section",
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const cleaned = data.content?.[0]?.text?.trim();
    if (!cleaned || !cleaned.startsWith("## Learned Rules")) return null;

    const updated = systemMd.includes("## Learned Rules")
      ? systemMd.replace(/## Learned Rules[\s\S]*$/, cleaned)
      : systemMd.trimEnd() + `\n\n${cleaned}\n`;
    return updated !== systemMd ? updated : null;
  } catch {
    const deduped = dedupeLearnedRules(systemMd);
    return deduped !== systemMd ? deduped : null;
  }
}

async function runLearningConsolidation(cwd: string): Promise<boolean> {
  const systemMdPath = systemPath(cwd);
  const pendingPath = pendingLearningsPath(cwd);
  const updated = await prepareLearningConsolidation(cwd);
  if (updated == null) return false;

  fs.writeFileSync(systemMdPath, updated);
  fs.writeFileSync(pendingPath, "");
  return true;
}

function applyPreparedLearningConsolidation(cwd: string, updated: string): void {
  const systemMdPath = systemPath(cwd);
  const pendingPath = pendingLearningsPath(cwd);
  fs.writeFileSync(systemMdPath, updated);
  fs.writeFileSync(pendingPath, "");
}

function summarizeLearnedRuleDiff(before: string, after: string): { beforeCount: number; afterCount: number; added: string[]; removed: string[] } {
  const beforeRules = learnedRuleLinesFromMd(before);
  const afterRules = learnedRuleLinesFromMd(after);
  return {
    beforeCount: beforeRules.length,
    afterCount: afterRules.length,
    added: afterRules.filter(rule => !beforeRules.includes(rule)),
    removed: beforeRules.filter(rule => !afterRules.includes(rule)),
  };
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
    if (parts.length === 0) return;

    return {
      systemPrompt: `${parts.join("\n\n---\n\n")}\n\n---\n\n${event.systemPrompt || ""}`,
    };
  });

  pi.on("session_before_compact", async (_event: any, ctx: any) => {
    await runLearningConsolidation(ctx.cwd);
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    await runLearningConsolidation(ctx.cwd);
  });

  pi.registerCommand("vazir-init", {
    description: "Bootstrap Vazir context files, then set up git and JJ when available",
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx.cwd;

      ensureDir(memoryDir(cwd));
      ensureDir(learningsDir(cwd));
      ensureDir(settingsDir(cwd));
      ensureDir(path.join(cwd, ".context", "checkpoints"));

      if (!fs.existsSync(systemPath(cwd))) {
        fs.writeFileSync(systemPath(cwd), SYSTEM_MD_TEMPLATE);
        ctx.ui.notify("system.md created", "info");
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
      if (!contextMapExisted) {
        fs.writeFileSync(contextMapPath(cwd), CONTEXT_MAP_TEMPLATE);
        contextMapStatus = "fill in manually";
        const draftedContextMap = draftContextMap(cwd, sourceFiles);
        if (draftedContextMap) {
          fs.writeFileSync(contextMapPath(cwd), draftedContextMap);
          contextMapStatus = "drafted";
          ctx.ui.notify("context-map.md drafted — review and tighten it", "info");
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
        { label: "AGENTS.md", present: fs.existsSync(agentsPath) },
        { label: ".context/settings/project.json", present: fs.existsSync(projectSettingsPath) },
      ], useJJ ? "☑ JJ (Jujutsu): active" : jjLine, useJJ ? `  ↳ Learn more about JJ ${JJ_OVERVIEW_URL}` : jjDetailLine);
      pendingInitSummary = initSummary;
      ctx.ui.notify(initSummary, "info");
    },
  });

  pi.registerCommand("consolidate", {
    description: "Review and consolidate learned rules in system.md",
    handler: async (_args: string, ctx: any) => {
      const systemMdPath = systemPath(ctx.cwd);
      if (!fs.existsSync(systemMdPath)) {
        ctx.ui.notify("No system.md found — run /vazir-init first", "warning");
        return;
      }

      const before = readIfExists(systemMdPath);
      const proposed = await prepareLearningConsolidation(ctx.cwd);
      if (!proposed || proposed === before) {
        ctx.ui.notify("Nothing to consolidate", "info");
        return;
      }

      const diff = summarizeLearnedRuleDiff(before, proposed);
      const preview = [
        `Learned rules: ${diff.beforeCount} → ${diff.afterCount}`,
        diff.removed.length > 0 ? `Removed: ${diff.removed.map(rule => `- ${rule}`).join("; ")}` : "Removed: none",
        diff.added.length > 0 ? `Added: ${diff.added.map(rule => `+ ${rule}`).join("; ")}` : "Added: none",
      ].join("\n");

      ctx.ui.notify(preview, "info");
      const apply = await ctx.ui.select("Apply these consolidation changes?", ["Apply", "Discard"]);
      if (apply !== "Apply") {
        ctx.ui.notify("Consolidation discarded", "info");
        return;
      }

      applyPreparedLearningConsolidation(ctx.cwd, proposed);
      ctx.ui.notify("system.md consolidated", "info");
    },
  });
}
