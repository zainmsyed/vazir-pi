import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  ".pi",
  "extensions",
  "vazir-context",
  "index.ts",
);
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "project.json"),
    JSON.stringify({ project_name: "Vazir Test", model_tier: "balanced" }, null, 2),
  );
  return cwd;
}

function makePi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const sentMessages: Array<{ message: string; options?: unknown }> = [];

  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: string, options?: unknown) {
      sentMessages.push({ message, options });
    },
  };

  register(pi as any);
  const command = commands.get("plan");
  assert(Boolean(command), "plan command was not registered");

  return { command: command!, sentMessages };
}

function makeCtx(cwd: string, notifications: Notification[], selectChoice = "Cancel") {
  return {
    cwd,
    ui: {
      async input() {
        return "a SaaS dashboard for tracking team OKRs";
      },
      async select() {
        return selectChoice;
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

async function runFreshPlanScenario() {
  const cwd = createProject("vazir-plan-seed-fresh-");
  const notifications: Notification[] = [];
  const { command, sentMessages } = makePi();
  fs.mkdirSync(path.join(cwd, ".context", "intake", "prd"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "intake", "prd", "product-brief.md"), "# Product Brief\n\nBuild a lean OKR dashboard for team leads.\n");

  await command.handler("", makeCtx(cwd, notifications));

  const storiesDir = path.join(cwd, ".context", "stories");
  const storyFiles = fs.readdirSync(storiesDir).filter((name: string) => /^story-\d+\.md$/.test(name)).sort();
  const intakeBriefPath = path.join(storiesDir, "intake-brief.md");
  const planPath = path.join(storiesDir, "plan.md");

  assert(fs.existsSync(intakeBriefPath), "intake-brief.md was not created");
  assert(fs.existsSync(planPath), "plan.md was not created");
  assert(storyFiles.length === 0, `expected no upfront story files, found ${storyFiles.length}`);
  assert(sentMessages.length === 1, "plan should send one follow-up message to the model");
  assert(sentMessages[0].message.includes("Create as many story-NNN.md files as needed"), "planning instruction did not allow unbounded story creation");
  assert(sentMessages[0].message.includes("There is NO preset cap"), "planning instruction still appears to cap story creation");
  assert(sentMessages[0].message.includes("Read .context/stories/intake-brief.md now."), "planning instruction did not mention intake brief review");
  assert(sentMessages[0].message.includes(".context/intake/prd/product-brief.md"), "planning instruction did not list the intake file");
  assert(
    sentMessages[0].message.includes("ONE AT A TIME"),
    "planning instruction did not request sequential questions",
  );
  const intakeBrief = fs.readFileSync(intakeBriefPath, "utf-8");
  assert(intakeBrief.includes("# Intake Brief"), "intake-brief.md did not use the expected heading");
  assert(intakeBrief.includes(".context/intake/prd/product-brief.md") || intakeBrief.includes(".context/intake/prd/product-brief.md".replace(/^\.context\//, "")) || intakeBrief.includes(".context/intake") || intakeBrief.includes("product-brief.md"), "intake-brief.md did not reference the intake file");
  assert(notifications.some(note => note.message.includes("Found 1 intake file")), "missing intake notification");
  assert(notifications.some(note => note.message.includes("intake-brief.md refreshed")), "missing intake brief refresh notification");
  assert(notifications.some(note => note.message.includes("No story files are seeded upfront")), "missing no-upfront-story notification");

  return { cwd, storyFiles, notifications };
}

async function runReuseScenario() {
  const cwd = createProject("vazir-plan-seed-reuse-");
  const notifications: Notification[] = [];
  const { command, sentMessages } = makePi();
  const storiesDir = path.join(cwd, ".context", "stories");
  fs.mkdirSync(storiesDir, { recursive: true });
  fs.writeFileSync(path.join(storiesDir, "plan.md"), "# Existing Plan\n");
  fs.writeFileSync(
    path.join(storiesDir, "story-001.md"),
    [
      "# Story 001: Existing",
      "",
      "**Status:** not-started  ",
      "**Created:** 2026-03-25  ",
      "**Last accessed:** 2026-03-25  ",
      "**Completed:** —",
      "",
      "---",
      "",
      "## Goal",
      "Existing goal.",
      "",
      "## Verification",
      "Existing verification.",
      "",
      "## Scope — files this story may touch",
      "- src/existing.ts",
      "",
      "## Out of scope — do not touch",
      "- src/other.ts",
      "",
      "## Dependencies",
      "- ",
      "",
      "---",
      "",
      "## Checklist",
      "- [ ] Existing task",
      "",
      "---",
      "",
      "## Issues",
      "",
      "---",
      "",
      "## Completion Summary",
      "",
    ].join("\n"),
  );

  await command.handler("refresh the backlog", makeCtx(cwd, notifications, "Replan — update scope and stories"));

  const storyFiles = fs.readdirSync(storiesDir).filter((name: string) => /^story-\d+\.md$/.test(name)).sort();
  assert(storyFiles.length === 1, "replan should reuse existing stories instead of reseeding duplicates");
  assert(sentMessages.length === 1, "replan should send one follow-up message to the model");
  assert(sentMessages[0].message.includes("Preserve existing story files"), "replan instruction did not preserve existing stories");
  assert(sentMessages[0].message.includes("Do NOT overwrite, repurpose, or renumber them."), "replan instruction did not forbid overwriting preserved stories");
  assert(sentMessages[0].message.includes("append a replanning log entry"), "replan instruction did not require replanning log updates");
  assert(notifications.some(note => note.message.startsWith("Existing story files preserved for replanning:")), "missing preserved-story notification");

  return { cwd, storyFiles, notifications };
}

function printScenario(title: string, details: Record<string, unknown>) {
  console.log(title);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.log(`${key}:`);
      for (const item of value) {
        if (typeof item === "string") {
          console.log(`  - ${item}`);
        } else if (item && typeof item === "object" && "message" in item && "level" in item) {
          const note = item as Notification;
          console.log(`  - [${note.level}] ${note.message}`);
        } else {
          console.log(`  - ${JSON.stringify(item)}`);
        }
      }
      continue;
    }

    console.log(`${key}: ${String(value)}`);
  }
  console.log("");
}

const freshPlan = await runFreshPlanScenario();
const reusePlan = await runReuseScenario();

printScenario("Fresh Plan Kickoff", freshPlan);
printScenario("Preserve Existing Stories On Replan", reusePlan);