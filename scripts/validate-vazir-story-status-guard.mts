import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const repoRoot = "/home/zain/Documents/coding/vazir-pi";

function ensureStubModule(moduleName: string, content: string): string {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, "package.json"), JSON.stringify({ name: moduleName, type: "commonjs" }, null, 2));
  fs.writeFileSync(path.join(moduleDir, "index.js"), content);
  return moduleDir;
}

ensureStubModule("@mariozechner/pi-tui", [
  "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape' };",
  "exports.matchesKey = (data, key) => data === key;",
  "exports.Container = class {};",
  "exports.Text = class {};",
  "",
].join("\n"));

ensureStubModule("@mariozechner/pi-coding-agent", [
  "exports.DynamicBorder = class {};",
  "",
].join("\n"));

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-context/index.ts";
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n- Follow existing project conventions.\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "index.md"), "# File Index\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "context-map.md"), "# Context Map\n\n- Project: Test\n");
  return cwd;
}

function writeStory(cwd: string, number: number = 1, status: string = "in-progress", lastAccessed: string = "2026-03-25"): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  const content = [
    `# Story ${String(number).padStart(3, "0")}: Example`,
    "",
    `**Status:** ${status}  `,
    "**Created:** 2026-03-25  ",
    `**Last accessed:** ${lastAccessed}  `,
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Example goal.",
    "",
    "## Verification",
    "Example verification.",
    "",
    "## Scope — files this story may touch",
    "- src/example.ts",
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
    "- [x] Example task",
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
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeNotStartedStory(cwd: string, number: number, lastAccessed: string): string {
  return writeStory(cwd, number, "not-started", lastAccessed);
}

function makePi() {
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const commands = new Map<string, unknown>();
  const sentMessages: Array<{ message: string; options?: unknown }> = [];

  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: unknown) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: string, options?: unknown) {
      sentMessages.push({ message, options });
    },
  };

  register(pi as any);

  return {
    sentMessages,
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(
  cwd: string,
  notifications: Notification[],
  options: { hasUI?: boolean; selectResponses?: string[]; selectCalls?: SelectCall[] } = {},
) {
  const { hasUI = false, selectResponses = [], selectCalls = [] } = options;
  let selectIndex = 0;

  return {
    cwd,
    hasUI,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        const response = selectResponses[selectIndex];
        selectIndex += 1;
        return response;
      },
    },
  };
}

async function runBlockedScenario() {
  const cwd = createProject("vazir-story-guard-blocked-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyPath = writeStory(cwd);

  await harness.emit("input", { text: "please fix the bug" }, ctx);
  await harness.emit("before_agent_start", { systemPrompt: "" }, ctx);

  const completedContent = fs.readFileSync(storyPath, "utf-8")
    .replace("**Status:** in-progress  ", "**Status:** complete  ")
    .replace("**Completed:** —", "**Completed:** 2026-03-25");
  fs.writeFileSync(storyPath, completedContent);

  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** in-progress"), "unauthorized completion should be reverted to in-progress");
  assert(story.includes("**Completed:** —"), "unauthorized completion date should be reverted");
  assert(
    notifications.some(note => note.message.includes("reverted to")),
    "missing revert warning for unauthorized completion",
  );

  return { cwd, notifications, story };
}

async function runAllowedScenario() {
  const cwd = createProject("vazir-story-guard-allowed-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyPath = writeStory(cwd);

  await harness.emit("input", { text: "mark this done" }, ctx);
  await harness.emit("before_agent_start", { systemPrompt: "" }, ctx);

  const completedContent = fs.readFileSync(storyPath, "utf-8")
    .replace("**Status:** in-progress  ", "**Status:** complete  ")
    .replace("**Completed:** —", "**Completed:** 2026-03-25");
  fs.writeFileSync(storyPath, completedContent);

  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** complete"), "explicit user approval should allow completion");
  assert(story.includes("**Completed:** 2026-03-25"), "completion date should remain after explicit approval");

  return { cwd, notifications, story };
}

async function runAutoStartScenario() {
  const cwd = createProject("vazir-story-guard-autostart-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyPath = writeNotStartedStory(cwd, 1, "2026-03-24");

  await harness.emit("before_agent_start", { systemPrompt: "" }, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** in-progress"), "a not-started story should be promoted when work begins");
  assert(!story.includes("**Last accessed:** 2026-03-24"), "auto-start should refresh last accessed");
  assert(/\*\*Last accessed:\*\* \d{4}-\d{2}-\d{2}/.test(story), "auto-start should keep a valid last accessed date");

  return { cwd, notifications, story };
}

async function runCompletionReviewPromptScenario() {
  const cwd = createProject("vazir-story-guard-review-prompt-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Yes — create a code review file"],
    selectCalls,
  });
  const storyPath = writeStory(cwd);

  await harness.emit("input", { text: "mark this done" }, ctx);
  await harness.emit("before_agent_start", { systemPrompt: "" }, ctx);

  const completedContent = fs.readFileSync(storyPath, "utf-8")
    .replace("**Status:** in-progress  ", "**Status:** complete  ")
    .replace("**Completed:** —", "**Completed:** 2026-03-25");
  fs.writeFileSync(storyPath, completedContent);

  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();

  assert(story.includes("**Status:** complete"), "approved completion should leave the story complete");
  assert(selectCalls.some(call => call.prompt.includes("Start a code review now")), "completion prompt did not offer a code review");
  assert(reviewFiles.length === 1, "accepting the completion prompt should create one review file");
  const review = fs.readFileSync(path.join(reviewDir, reviewFiles[0]), "utf-8");
  assert(review.includes("**Status:** in-progress"), "prompt-created review should start in-progress");
  assert(review.includes("**Scope:** story"), "prompt-created review should stay scoped to the completed story");
  assert(review.includes("**Story:** story-001"), "prompt-created review should point at the completed story");
  assert(harness.sentMessages.length === 1, "accepting the completion prompt should send one follow-up message");
  assert(harness.sentMessages[0].message.includes(".context/reviews/"), "review follow-up should mention the review path");

  return {
    cwd,
    notifications,
    selectCalls,
    reviewFiles,
    sentMessages: harness.sentMessages.map(entry => entry.message),
  };
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

const blocked = await runBlockedScenario();
const allowed = await runAllowedScenario();
const autoStart = await runAutoStartScenario();
const reviewPrompt = await runCompletionReviewPromptScenario();

printScenario("Blocked Unauthorized Completion", blocked);
printScenario("Allowed Explicit Completion", allowed);
printScenario("Auto-Start Not-Started Story", autoStart);
printScenario("Completion Review Prompt", reviewPrompt);