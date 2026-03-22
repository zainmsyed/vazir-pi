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

let lastUserPrompt = "";
let useJJ = false;

function memoryDir(cwd: string) {
  return path.join(cwd, ".context", "memory");
}

function learningsDir(cwd: string) {
  return path.join(cwd, ".context", "learnings");
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

  return [
    "# Context Map",
    "",
    "- Project: Vazir POC",
    "- Stack: TypeScript / pi-coding-agent",
    "- Key dirs: .pi, .context, AGENTS.md",
    "- Fragile: bootstrap order, JJ fallback",
    "",
    `- Files: ${sourceFiles.length}`,
    "",
  ].join("\n");
}

function dedupeLearnedRules(systemMd: string): string {
  const match = systemMd.match(/## Learned Rules[\s\S]*$/);
  if (!match) return systemMd;

  const lines = match[0]
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("- "));
  const uniqueLines = [...new Set(lines)];
  const learnedSection = ["## Learned Rules", ...uniqueLines, ""].join("\n");
  return systemMd.replace(/## Learned Rules[\s\S]*$/, learnedSection);
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
    const systemMdPath = systemPath(ctx.cwd);
    if (fs.existsSync(systemMdPath)) {
      fs.writeFileSync(systemMdPath, dedupeLearnedRules(readIfExists(systemMdPath)));
    }
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    const systemMdPath = systemPath(ctx.cwd);
    if (fs.existsSync(systemMdPath)) {
      fs.writeFileSync(systemMdPath, dedupeLearnedRules(readIfExists(systemMdPath)));
    }
  });

  pi.registerCommand("vazir-init", {
    description: "Initialise JJ and bootstrap Vazir context files",
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
      if (!fs.existsSync(contextMapPath(cwd))) {
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
        `Vazir bootstrap complete • context-map.md: ${contextMapStatus} • index.md: ${indexSummary.total} files indexed • JJ setup runs now`,
        "info",
      );

      let jjAvailable = false;
      try {
        childProcess.execSync("jj --version", { cwd, stdio: "pipe" });
        jjAvailable = true;
      } catch {
        const choice = await ctx.ui.select(
          "JJ (Jujutsu) is not installed. It powers Vazir checkpoints.",
          [
            "Ask pi to install JJ — continue with git fallback",
            "Show install instructions — continue with git fallback",
            "Skip JJ — use git fallback",
          ],
        );

        if (choice === "Ask pi to install JJ — continue with git fallback") {
          await pi.sendUserMessage(
            "Install Jujutsu and then re-run /vazir-init. Linux options: your distro package if available, or cargo install jj-cli. Docs: https://jj-vcs.dev/latest/install-and-setup",
          );
          ctx.ui.notify("JJ install requested — continuing with git fallback so Vazir files are already in place", "info");
        }

        if (choice === "Show install instructions — continue with git fallback") {
          ctx.ui.notify("https://jj-vcs.dev/latest/install-and-setup", "info");
          ctx.ui.notify("Continuing with git fallback so Vazir files are already in place", "info");
        }

        if (
          choice !== "Ask pi to install JJ — continue with git fallback" &&
          choice !== "Show install instructions — continue with git fallback"
        ) {
          ctx.ui.notify("Continuing without JJ — git fallback active", "info");
        }
      }

      if (jjAvailable) {
        try {
          try {
            childProcess.execSync("jj root", { cwd, stdio: "pipe" });
            ctx.ui.notify("JJ already initialised", "info");
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
          }

          const gitignorePath = path.join(cwd, ".gitignore");
          const gitignore = readIfExists(gitignorePath);
          if (!gitignore.includes(".jj/")) {
            const nextGitignore = `${gitignore.trimEnd()}${gitignore.trim() ? "\n" : ""}.jj/\n`;
            fs.writeFileSync(gitignorePath, nextGitignore);
            ctx.ui.notify("Added .jj/ to .gitignore", "info");
          }
        } catch (error: any) {
          ctx.ui.notify(`JJ setup failed: ${error?.message || String(error)} — continuing with git fallback`, "warning");
        }
      }

      useJJ = jjAvailable && detectJJ(cwd);
      ctx.ui.notify(
        `Vazir initialised • JJ: ${useJJ ? "active" : "git fallback"} • context-map.md: ${contextMapStatus} • index.md: ${indexSummary.total} files indexed`,
        "info",
      );
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
      const after = dedupeLearnedRules(before);
      if (after !== before) {
        fs.writeFileSync(systemMdPath, after);
        ctx.ui.notify("system.md consolidated", "info");
      } else {
        ctx.ui.notify("Nothing to consolidate", "info");
      }
    },
  });
}
