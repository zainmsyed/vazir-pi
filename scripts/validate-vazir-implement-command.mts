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
  "vazir-tracker",
  "index.ts",
);
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;
const { normalizeTrackerInputText } = extensionModule as { normalizeTrackerInputText: (text: string) => string };

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  return cwd;
}

function writeStory(cwd: string, number: number, status: string, lastAccessed: string): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(
    filePath,
    [
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
      "Implement the requested workflow.",
      "",
      "## Verification",
      "Run the corresponding command and confirm the workflow opens.",
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
      "- [ ] Implement the workflow",
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
  return filePath;
}

function makePi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const sentMessages: string[] = [];

  const pi = {
    on() {},
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: string) {
      sentMessages.push(message);
    },
  };

  register(pi as any);

  const implement = commands.get("implement");
  assert(Boolean(implement), "implement command was not registered");

  return {
    implement: implement!,
    sentMessages,
  };
}

function createNormalizedInput(text: string): string {
  return normalizeTrackerInputText(text);
}

function makeCtx(cwd: string, notifications: Notification[]) {
  return {
    cwd,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async input() {
        return undefined;
      },
      async select() {
        return undefined;
      },
    },
  };
}

async function runMissingStoryScenario() {
  const cwd = createProject("vazir-implement-missing-story-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);

  await harness.implement.handler("", ctx);

  assert(notifications.some(note => note.message.includes("No in-progress story is available to implement")), "missing story notice was not shown");
  assert(harness.sentMessages.length === 0, "implement should not send a follow-up when no story exists");

  return { cwd, notifications };
}

async function runActiveStoryScenario() {
  const cwd = createProject("vazir-implement-active-story-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyOnePath = writeStory(cwd, 1, "in-progress", "2026-04-20");
  const storyTwoPath = writeStory(cwd, 2, "in-progress", "2026-04-22");

  assert(createNormalizedInput("/impliment") === "/implement", "impliment should normalize to implement");
  await harness.implement.handler("", ctx);

  const today = new Date().toISOString().slice(0, 10);
  const storyOne = fs.readFileSync(storyOnePath, "utf-8");
  const storyTwo = fs.readFileSync(storyTwoPath, "utf-8");

  assert(storyTwo.includes(`**Last accessed:** ${today}`), "implement should update the most recent in-progress story");
  assert(storyTwo.includes("**Status:** in-progress"), "implement should keep the active story in-progress");
  assert(!storyOne.includes(`**Last accessed:** ${today}`), "implement should not touch older in-progress stories");
  assert(harness.sentMessages.length === 1, "implement should send one follow-up message");
  assert(harness.sentMessages[0].includes("Implement the in-progress story in .context/stories/story-002.md."), "implement should target the most recent in-progress story");

  return { cwd, notifications };
}

const missingStory = await runMissingStoryScenario();
const activeStory = await runActiveStoryScenario();

console.log("Missing Story Scenario");
console.log(`cwd: ${missingStory.cwd}`);
for (const note of missingStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Active Story Scenario");
console.log(`cwd: ${activeStory.cwd}`);
for (const note of activeStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
