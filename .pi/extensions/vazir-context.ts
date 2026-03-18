import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = () => process.cwd();
const contextMapPath = () => join(rootDir(), ".context", "memory", "context-map.md");
const agentsPath = () => join(rootDir(), "AGENTS.md");
const baseSkillPath = () => join(rootDir(), ".pi", "skills", "vazir-base.md");

function readOptional(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath, "utf-8");
}

function stripHtmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function joinPromptSections(parts: Array<string | undefined>): string | undefined {
  const sections = parts.map((part) => part?.trim()).filter(Boolean) as string[];
  if (sections.length === 0) return undefined;
  return sections.join("\n\n---\n\n");
}

export default function vazirContext(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const projectContext = readOptional(contextMapPath()) ?? readOptional(agentsPath());
    const baseSkill = readOptional(baseSkillPath());

    const systemPrompt = joinPromptSections([
      projectContext ? stripHtmlComments(projectContext) : undefined,
      baseSkill ? stripFrontmatter(baseSkill) : undefined,
      event.systemPrompt || "",
    ]);

    if (!systemPrompt) return;
    return { systemPrompt };
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const completedTasks: string[] = [];
    let rejectedCount = 0;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "vsandbox_complete") {
          const currentPlan = readOptional(join(rootDir(), ".context", "memory", "active-plan.md"));
          const taskMatch = currentPlan?.match(/^task:\s*"?(.+?)"?\s*$/m);
          if (taskMatch?.[1]) completedTasks.push(taskMatch[1]);
        }
      }

      if (entry.type === "custom" && entry.customType === "vazir-task") {
        const status = (entry.data as { status?: string } | undefined)?.status;
        if (status === "rejected") rejectedCount += 1;
      }
    }

    if (completedTasks.length === 0 && rejectedCount === 0) return;

    const summaryLines = [
      "Vazir session summary:",
      completedTasks.length > 0 ? `Completed: ${completedTasks.join(", ")}` : undefined,
      rejectedCount > 0 ? `Rejected sandboxes: ${rejectedCount}` : undefined,
    ].filter(Boolean) as string[];

    return {
      compaction: {
        summary: summaryLines.join("\n"),
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });
}