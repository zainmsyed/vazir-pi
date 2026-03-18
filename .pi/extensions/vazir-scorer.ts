import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ambiguousWords = ["refactor", "clean up", "improve", "fix", "optimize", "enhance", "rework", "tidy", "simplify"];
const negations = ["don't", "avoid", "without", "instead of"];
const actions = ["add", "implement", "create", "update", "delete", "write", "build", "move", "change", "migrate", "extract", "rename"];
const questionPattern = /^(what|why|how|should|can|does|is|are|when|where)\b/i;

let pendingMode: "one-shot" | "step-by-step" | "interview" | "chat" | null = null;

function skillFilePath(name: string): string {
  return join(process.cwd(), ".pi", "skills", `${name}.md`);
}

function loadSkill(name: string): string | undefined {
  const path = skillFilePath(name);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8").replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

export default function vazirScorer(pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    const text = (event.text || "").trim();
    if (!text || text.startsWith("/")) return { action: "continue" as const };

    const result = score(text, process.cwd());
    ctx.ui.setStatus("vazir-score", `score ${result.score} · ${result.mode}`);

    if ((questionPattern.test(text) || text.endsWith("?")) && result.score < 60) {
      pendingMode = "chat";
      return { action: "continue" as const };
    }

    if (result.score < 40) {
      const choice = await ctx.ui.select(`Underspecified task (score: ${result.score})`, [
        "Help me clarify it (interview mode)",
        "Send as chat question instead",
        "Submit anyway",
      ]);

      if (choice === "Help me clarify it (interview mode)") {
        pendingMode = "interview";
        return { action: "transform" as const, text: `[VAZIR:interview]\n\n${text}` };
      }

      if (choice === "Send as chat question instead") {
        pendingMode = "chat";
        return { action: "continue" as const };
      }

      pendingMode = "interview";
      return {
        action: "transform" as const,
        text: `[task score: ${result.score}, mode: ${result.mode}]\n\n${text}`,
      };
    }

    if (result.score < 76) {
      const proceed = await ctx.ui.confirm(
        `Step-by-step mode (score: ${result.score})`,
        "Vazir will save a plan and wait for /approve before writing files.",
      );

      if (!proceed) {
        ctx.ui.setEditorText(text);
        ctx.ui.setStatus("vazir-score", "refine your task and resubmit");
        return { action: "handled" as const };
      }

      pendingMode = "step-by-step";
      return { action: "transform" as const, text: `[VAZIR:step-by-step]\n\n${text}` };
    }

    pendingMode = "one-shot";
    return { action: "continue" as const };
  });

  pi.on("before_agent_start", async (event) => {
    const mode = pendingMode;
    pendingMode = null;

    if (!mode || mode === "chat") return;

    const skillName =
      mode === "one-shot"
        ? "vazir-one-shot"
        : mode === "step-by-step"
          ? "vazir-step-by-step"
          : "vazir-interview";

    const skill = loadSkill(skillName);
    if (!skill) return;

    return {
      systemPrompt: `${event.systemPrompt || ""}\n\n${skill}`,
    };
  });
}

function score(text: string, cwd: string) {
  let scoreValue = 50;
  const signals: string[] = [];
  let positiveSignalCount = 0;

  const indexPath = join(cwd, ".context", "memory", "index.md");
  const indexContents = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";

  const referencedFiles = (text.match(/\b[\w./-]+\.\w{1,5}\b/g) || []).filter((file) => indexContents.includes(file));
  if (referencedFiles.length > 0) {
    scoreValue += 20;
    signals.push("+20 file reference");
    positiveSignalCount += 1;
  }

  if (/\b(jwt|oauth|redis|postgres|stripe|prisma|express|fastapi|sqlalchemy|gin|gorm)\b/i.test(text)) {
    scoreValue += 15;
    signals.push("+15 dependency");
    positiveSignalCount += 1;
  }

  if (/\b(should return|must output|expected|returns|endpoint)\b/i.test(text)) {
    scoreValue += 10;
    signals.push("+10 output defined");
    positiveSignalCount += 1;
  }

  if (/\b(all|entire|every|throughout|whole codebase)\b/i.test(text)) {
    scoreValue -= 30;
    signals.push("-30 broad scope");
  }

  const hasLeadingNegation = negations.some((negation) => text.toLowerCase().startsWith(negation));
  const isAmbiguous = !hasLeadingNegation && ambiguousWords.some((word) => text.toLowerCase().includes(word));
  if (isAmbiguous) {
    const penalty = positiveSignalCount >= 2 ? -20 : -40;
    scoreValue += penalty;
    signals.push(`${penalty} ambiguous verb`);
  }

  if (!actions.some((action) => text.toLowerCase().includes(action)) && !isAmbiguous) {
    scoreValue -= 20;
    signals.push("-20 no action verb");
  }

  scoreValue = Math.max(0, Math.min(100, scoreValue));
  const mode = scoreValue >= 76 ? "one-shot" : scoreValue >= 40 ? "step-by-step" : "needs-interview";
  return { score: scoreValue, mode, signals };
}