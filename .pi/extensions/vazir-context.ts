import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export default function vazirContext(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const agentEvent = event as { systemPrompt?: string };
    const contextMapPath = join(process.cwd(), ".context/memory/context-map.md");
    const agentsPath = join(process.cwd(), "AGENTS.md");

    const sourcePath = existsSync(contextMapPath)
      ? contextMapPath
      : existsSync(agentsPath)
        ? agentsPath
        : null;

    if (!sourcePath) return;

    const rawContent = readFileSync(sourcePath, "utf-8");
    const cleanContent = stripHtmlComments(rawContent).trim();

    if (!cleanContent) return;

    const originalPrompt = agentEvent.systemPrompt ?? "";

    return {
      systemPrompt: originalPrompt
        ? `${cleanContent}\n\n---\n\n${originalPrompt}`
        : cleanContent,
    };
  });
}

export function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

export function buildInjectedSystemPrompt(
  sourceContent: string,
  originalPrompt: string | undefined,
): string {
  const cleanContent = stripHtmlComments(sourceContent).trim();

  if (!cleanContent) {
    return originalPrompt ?? "";
  }

  const prompt = originalPrompt ?? "";
  return prompt ? `${cleanContent}\n\n---\n\n${prompt}` : cleanContent;
}