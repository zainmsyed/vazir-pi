import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface ProjectSettings {
  project_name: string;
  model_tier: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function memoryDir(cwd: string) { return path.join(cwd, ".context/memory"); }

function readIfExists(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf-8") : "";
}

function ensureDir(path: string) {
  fs.mkdirSync(path, { recursive: true });
}

function relativeToCwd(cwd: string, fullPath: string): string {
  if (fullPath === cwd) return "";
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

/** Walk source files, skipping common non-source dirs */
function walkSourceFiles(cwd: string): string[] {
  const skip = new Set([
    "node_modules", ".git", ".jj", ".context", ".pi",
    "dist", "build", "out", ".next", ".nuxt", "__pycache__",
    ".venv", "venv", "target", "vendor", "coverage",
  ]);

  const files: string[] = [];

  function walk(dir: string) {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = relativeToCwd(cwd, full);
      const firstSegment = rel.split("/")[0];
      if (skip.has(firstSegment)) continue;

      if (entry.isDirectory()) walk(full);
      else files.push(rel);
    }
  }

  walk(cwd);
  return files.sort();
}

// ── Consolidation ──────────────────────────────────────────────────────

/**
 * Deduplicate and merge the ## Learned Rules section of system.md
 * Uses Anthropic API directly — falls back silently if key is missing.
 */
async function consolidateLearnedRules(cwd: string): Promise<void> {
  const systemPath = path.join(memoryDir(cwd), "system.md");
  if (!fs.existsSync(systemPath)) return;

  const content = fs.readFileSync(systemPath, "utf-8");
  if (!content.includes("## Learned Rules")) return;

  // Extract learned rules section
  const parts = content.split("## Learned Rules");
  if (parts.length < 2) return;

  const rulesSection = parts[1].trim();
  const bullets = rulesSection.split("\n").filter(l => l.startsWith("- "));
  if (bullets.length < 4) return; // not enough to warrant consolidation

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return; // silent fallback

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `Deduplicate and consolidate these learned rules into a clean, non-redundant list. Keep every distinct rule. Merge rules that say the same thing. Output ONLY the bullet list, no preamble.\n\n${bullets.join("\n")}`,
        }],
      }),
    });

    if (!response.ok) return;

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    const consolidated = data.content
      ?.find((c: { type: string }) => c.type === "text")
      ?.text?.trim();

    if (!consolidated) return;

    const newContent = parts[0] + "## Learned Rules\n" + consolidated + "\n";
    fs.writeFileSync(systemPath, newContent);
  } catch {
    // silent — consolidation is best-effort
  }
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // ── Context injection: inject .context files before every agent turn ──
  pi.on("before_agent_start", async (_event, ctx) => {
    const cwd = ctx.cwd;
    const contextMap = readIfExists(path.join(memoryDir(cwd), "context-map.md"));
    const systemMd   = readIfExists(path.join(memoryDir(cwd), "system.md"));
    const indexMd    = readIfExists(path.join(memoryDir(cwd), "index.md"));

    const parts: string[] = [];

    if (contextMap.trim()) {
      parts.push(`<vazir-context-map>\n${contextMap.trim()}\n</vazir-context-map>`);
    }
    if (systemMd.trim()) {
      parts.push(`<vazir-system-rules>\n${systemMd.trim()}\n</vazir-system-rules>`);
    }
    if (indexMd.trim()) {
      parts.push(`<vazir-file-index>\n${indexMd.trim()}\n</vazir-file-index>`);
    }

    if (parts.length === 0) return;

    const injection = parts.join("\n\n");

    return {
      systemPrompt: _event.systemPrompt + "\n\n" + injection,
    };
  });

  // ── Consolidation on compaction ───────────────────────────────────────
  pi.on("session_before_compact", async (_event, ctx) => {
    await consolidateLearnedRules(ctx.cwd);
  });

  // ── Consolidation on shutdown ─────────────────────────────────────────
  pi.on("session_shutdown", async (_event, ctx) => {
    await consolidateLearnedRules(ctx.cwd);
  });

  // ── /vazir-init ───────────────────────────────────────────────────────

  pi.registerCommand("vazir-init", {
    description: "Bootstrap the .context/ folder, AGENTS.md, and index.md",
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd;

      // Create AGENTS.md if missing
      const agentsPath = path.join(cwd, "AGENTS.md");
      if (!fs.existsSync(agentsPath)) {
        fs.writeFileSync(agentsPath, [
          "# AGENTS.md",
          "",
          "## Project",
          "- Vazir POC on @mariozechner/pi-coding-agent",
          "- Follow the spec in docs/Vazir_POC_Spec_v3_4.md",
          "",
          "## Working Rules",
          "- Write directly to real project files",
          "- Keep .context/ as the persistent project brain",
          "- Use /vazir-init, /diff, /reject, and /reset as the core commands",
          "- Avoid introducing routers or APIs; pi handles the connections",
          "",
        ].join("\n"));
        ctx.ui.notify("Created AGENTS.md", "info");
      }

      // Create folder structure
      const dirs = [
        ".context/memory",
        ".context/checkpoints",
        ".context/learnings",
        ".context/settings",
      ];
      for (const d of dirs) {
        ensureDir(path.join(cwd, d));
      }

      // Create system.md if missing
      const systemPath = path.join(memoryDir(cwd), "system.md");
      if (!fs.existsSync(systemPath)) {
        fs.writeFileSync(systemPath, [
          "# System Rules",
          "",
          "## Project Rules",
          "- Follow existing code style and conventions",
          "- Use the built-in write and edit tools — write directly to real project files",
          "- If unsure which files to modify, ask — do not guess",
          "",
          "## Learned Rules",
          "",
        ].join("\n"));
        ctx.ui.notify("Created .context/memory/system.md", "info");
      }

      // Create context-map.md if missing
      const contextMapPath = path.join(memoryDir(cwd), "context-map.md");
      if (!fs.existsSync(contextMapPath)) {
        // Try to read AGENTS.md for hints
        const agentsPath = path.join(cwd, "AGENTS.md");
        const agentsContent = readIfExists(agentsPath);

        if (agentsContent.trim()) {
          // Use the LLM to distill context-map from AGENTS.md
          ctx.ui.notify("Generating context-map.md from AGENTS.md...", "info");
          pi.sendUserMessage(
            `Read AGENTS.md and create a concise context-map at .context/memory/context-map.md. ` +
            `It should be under 150 tokens total. Include: project name, tech stack, key directories, ` +
            `and any fragile areas. Use terse bullet points. Write the file now.`
          );
        } else {
          fs.writeFileSync(contextMapPath, [
            "# Context Map",
            "",
            "<!-- Keep under 150 tokens. Injected every turn. -->",
            "<!-- Fill in: project name, stack, key dirs, fragile areas -->",
            "",
            "- **Project:** (name)",
            "- **Stack:** (languages/frameworks)",
            "- **Key dirs:** (main source directories)",
            "- **Fragile:** (areas to be careful with)",
            "",
          ].join("\n"));
          ctx.ui.notify("Created .context/memory/context-map.md — please fill it in", "info");
        }
      }

      // Create project.json if missing
      const settingsPath = path.join(cwd, ".context/settings/project.json");
      if (!fs.existsSync(settingsPath)) {
        const settings: ProjectSettings = {
          project_name: cwd.split("/").pop() || "project",
          model_tier: "standard",
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        ctx.ui.notify("Created .context/settings/project.json", "info");
      }

      // Create learnings file if missing
      const learningsPath = path.join(cwd, ".context/learnings/code-review.md");
      if (!fs.existsSync(learningsPath)) {
        fs.writeFileSync(learningsPath, "# Code Review Learnings\n\nRejection audit trail — entries appended on /reject.\n");
      }

      // Generate index.md via LLM
      const indexPath = path.join(memoryDir(cwd), "index.md");
      const sourceFiles = walkSourceFiles(cwd);

      if (sourceFiles.length === 0) {
        ctx.ui.notify("No source files found — index.md will be empty", "warning");
        fs.writeFileSync(indexPath, "# File Index\n\n<!-- Auto-generated by /vazir-init. One line per file. -->\n");
      } else {
        ctx.ui.notify(`Generating index.md for ${sourceFiles.length} files...`, "info");

        // Build the file list for the LLM
        const fileList = sourceFiles.slice(0, 200).join("\n"); // cap to avoid huge prompts
        const truncated = sourceFiles.length > 200 ? `\n(... and ${sourceFiles.length - 200} more files)` : "";

        pi.sendUserMessage(
          `Generate a file index at .context/memory/index.md. For each file below, write ONE short line describing its purpose. ` +
          `Format: \`path/to/file.ext — brief description\`. Read key files if needed to understand them. ` +
          `Write the file when done. Start with "# File Index" header.\n\nFiles:\n${fileList}${truncated}`
        );
      }

      ctx.ui.notify("/vazir-init complete — review context-map.md and index.md", "info");
    },
  });
}
