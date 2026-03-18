import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { countLineDelta } from "../../src/vazir-review.js";

interface FileDelta {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

interface SandboxDetails extends FileDelta {
  action: "vwrite" | "vedit";
}

const rootDir = () => process.cwd();
const contextDir = () => join(rootDir(), ".context");
const sandboxDir = () => join(contextDir(), "sandbox");

const diffStore = new Map<string, FileDelta>();
let sandboxCompleteCalled = false;
let nudgedThisCycle = false;

function sanitizeRelativePath(inputPath: string): string {
  const trimmed = inputPath.trim().replace(/^@/, "");
  if (!trimmed) throw new Error("Path is required.");

  const normalized = normalize(trimmed).replace(/^\.([/\\]|$)/, "");
  if (!normalized || normalized === ".") throw new Error("Path must point to a file.");
  return normalized.split(sep).join("/");
}

function resolveInside(root: string, inputPath: string): string {
  const absolute = resolve(root, sanitizeRelativePath(inputPath));
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes project root: ${inputPath}`);
  }
  return absolute;
}

function resolveProjectPath(inputPath: string): { absolute: string; relativePath: string } {
  const absolute = resolveInside(rootDir(), inputPath);
  const relativePath = relative(rootDir(), absolute).split(sep).join("/");
  if (!relativePath) throw new Error("Path must point to a file.");
  return { absolute, relativePath };
}

function refreshUI(ctx: ExtensionContext) {
  const fileCount = diffStore.size;

  if (fileCount === 0) {
    ctx.ui.setStatus("vazir-sandbox", undefined);
    ctx.ui.setWidget("vazir-sandbox", undefined);
    return;
  }

  const suffix = sandboxCompleteCalled ? " - review with /approve or /reject" : "";
  ctx.ui.setStatus("vazir-sandbox", `sandbox: ${fileCount} file(s)${suffix}`);

  ctx.ui.setWidget(
    "vazir-sandbox",
    (_tui, theme) => ({
      render(width: number) {
        const files = [...diffStore.values()];
        const rows: string[] = [];
        let totalAdded = 0;
        let totalRemoved = 0;

        for (const file of files) {
          totalAdded += file.linesAdded;
          totalRemoved += file.linesRemoved;

          const label = file.path.length > 40 ? `...${file.path.slice(-37)}` : file.path;
          const deltaText = `+${file.linesAdded}/-${file.linesRemoved}`;
          const padding = " ".repeat(Math.max(1, width - 4 - label.length - deltaText.length));
          rows.push(
            `  ${theme.fg("accent", label)}${padding}${theme.fg("success", `+${file.linesAdded}`)}` +
              `${theme.fg("dim", "/")}${theme.fg("error", `-${file.linesRemoved}`)}`,
          );
        }

        const divider = theme.fg("dim", "-".repeat(Math.max(8, width)));
        const totals =
          `  ${files.length} file(s) ` +
          theme.fg("success", `+${totalAdded}`) +
          theme.fg("dim", "/") +
          theme.fg("error", `-${totalRemoved}`);
        const actionLine = sandboxCompleteCalled
          ? theme.fg("accent", "  /approve   /reject")
          : theme.fg("dim", "  waiting for vsandbox_complete");

        return ["", ...rows, divider, totals, actionLine, ""];
      },
      invalidate() {},
    }),
    { placement: "aboveEditor" },
  );
}

function resetSandboxFlags() {
  sandboxCompleteCalled = false;
  nudgedThisCycle = false;
}

function reconstructState(ctx: ExtensionContext) {
  diffStore.clear();
  resetSandboxFlags();

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult") {
      if (entry.message.toolName === "vwrite" || entry.message.toolName === "vedit") {
        const details = entry.message.details as SandboxDetails | undefined;
        if (details?.path) {
          diffStore.set(details.path, {
            path: details.path,
            linesAdded: details.linesAdded,
            linesRemoved: details.linesRemoved,
          });
        }
      }

      if (entry.message.toolName === "vsandbox_complete") {
        sandboxCompleteCalled = true;
      }
    }

    if (entry.type === "custom" && entry.customType === "vazir-task") {
      const status = (entry.data as { status?: string } | undefined)?.status;
      if (status === "accepted" || status === "rejected") {
        diffStore.clear();
        resetSandboxFlags();
      }
    }
  }

  refreshUI(ctx);
}

function countOccurrences(source: string, target: string): number {
  if (!target) return 0;
  return source.split(target).length - 1;
}

export function resetSandboxState(ctx: ExtensionContext) {
  diffStore.clear();
  resetSandboxFlags();
  refreshUI(ctx);
}

export { diffStore };

export default function vazirSandbox(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.on("input", async () => {
    nudgedThisCycle = false;
    return { action: "continue" as const };
  });

  pi.on("agent_end", async (_event, _ctx) => {
    if (diffStore.size === 0 || sandboxCompleteCalled || nudgedThisCycle) return;

    nudgedThisCycle = true;
    pi.sendMessage(
      {
        customType: "vazir-nudge",
        content:
          "You wrote sandbox files but did not call vsandbox_complete. Call vsandbox_complete now so the user can review the staged changes.",
        display: true,
      },
      { triggerTurn: true },
    );
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("write", event) && !isToolCallEventType("edit", event)) {
      return { block: false };
    }

    try {
      const target = resolveProjectPath(event.input.path);
      const contextRoot = contextDir();

      if (target.absolute.startsWith(contextRoot)) {
        return { block: false };
      }

      ctx.ui.notify(`Blocked direct write to ${target.relativePath}`, "warning");
      ctx.abort();
      return {
        block: true,
        reason:
          "BLOCKED by Vazir Sandbox: direct writes to project files are disabled. Use vwrite for full file writes or vedit for exact-string edits, then call vsandbox_complete when the sandbox is ready for review.",
      };
    } catch (error) {
      ctx.abort();
      return {
        block: true,
        reason: `Invalid file path for write/edit: ${(error as Error).message}`,
      };
    }
  });

  pi.registerTool({
    name: "vwrite",
    label: "Vazir Write",
    description: "Write a project file to the Vazir sandbox instead of the real project tree.",
    promptSnippet: "Stage a full file write in .context/sandbox without touching the real project file.",
    promptGuidelines: [
      "Use vwrite for new files or full replacements instead of the built-in write tool.",
      "Always call vsandbox_complete after finishing all sandbox writes for the current step.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "File path relative to project root" }),
      content: Type.String({ description: "Complete file contents" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const target = resolveProjectPath(params.path);
      const stagedPath = resolveInside(sandboxDir(), target.relativePath);
      const original = existsSync(target.absolute) ? readFileSync(target.absolute, "utf-8") : "";

      mkdirSync(dirname(stagedPath), { recursive: true });
      writeFileSync(stagedPath, params.content, "utf-8");

      const delta = countLineDelta(original, params.content);
      diffStore.set(target.relativePath, { path: target.relativePath, ...delta });
      sandboxCompleteCalled = false;
      refreshUI(ctx);

      const details: SandboxDetails = { action: "vwrite", path: target.relativePath, ...delta };
      return {
        content: [
          {
            type: "text" as const,
            text: `Written to sandbox: ${target.relativePath} (+${delta.linesAdded}/-${delta.linesRemoved})`,
          },
        ],
        details,
      };
    },
  });

  pi.registerTool({
    name: "vedit",
    label: "Vazir Edit",
    description: "Edit a project file in the Vazir sandbox by exact string replacement.",
    promptSnippet: "Stage an exact string replacement in .context/sandbox without touching the real project file.",
    promptGuidelines: [
      "Use vedit for exact replacements instead of the built-in edit tool.",
      "If old_string occurs multiple times, inspect the file and choose a more specific target string.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "File path relative to project root" }),
      old_string: Type.String({ description: "Exact string to replace" }),
      new_string: Type.String({ description: "Replacement string" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const target = resolveProjectPath(params.path);
      const stagedPath = resolveInside(sandboxDir(), target.relativePath);
      const sourcePath = existsSync(stagedPath) ? stagedPath : target.absolute;

      if (!existsSync(sourcePath)) {
        throw new Error(`File not found: ${target.relativePath}`);
      }

      const source = readFileSync(sourcePath, "utf-8");
      const occurrences = countOccurrences(source, params.old_string);
      if (occurrences === 0) {
        throw new Error(`Target string not found in ${target.relativePath}`);
      }
      if (occurrences > 1) {
        throw new Error(`Target string appears ${occurrences} times in ${target.relativePath}; provide a more specific old_string.`);
      }

      const modified = source.replace(params.old_string, params.new_string);
      const original = existsSync(target.absolute) ? readFileSync(target.absolute, "utf-8") : "";

      mkdirSync(dirname(stagedPath), { recursive: true });
      writeFileSync(stagedPath, modified, "utf-8");

      const delta = countLineDelta(original, modified);
      diffStore.set(target.relativePath, { path: target.relativePath, ...delta });
      sandboxCompleteCalled = false;
      refreshUI(ctx);

      const details: SandboxDetails = { action: "vedit", path: target.relativePath, ...delta };
      return {
        content: [
          {
            type: "text" as const,
            text: `Edited in sandbox: ${target.relativePath} (+${delta.linesAdded}/-${delta.linesRemoved})`,
          },
        ],
        details,
      };
    },
  });

  pi.registerTool({
    name: "vsandbox_complete",
    label: "Sandbox Complete",
    description: "Mark the current sandbox batch complete so the user can review it with /approve or /reject.",
    promptSnippet: "Finish the current sandbox batch and hand it to the user for review.",
    promptGuidelines: [
      "Call vsandbox_complete exactly once after finishing the current batch of sandbox edits.",
      "Do not continue editing after vsandbox_complete until the user responds.",
    ],
    parameters: Type.Object({}),
    async execute() {
      sandboxCompleteCalled = true;
      nudgedThisCycle = true;
      return {
        content: [
          {
            type: "text" as const,
            text: `Sandbox complete. ${diffStore.size} file(s) are ready for review.`,
          },
        ],
        details: { ready: true, fileCount: diffStore.size },
      };
    },
  });
}