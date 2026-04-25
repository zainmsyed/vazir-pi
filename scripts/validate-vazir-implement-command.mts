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
type SelectCall = { prompt: string; choices: string[] };

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

function makeCtx(
  cwd: string,
  notifications: Notification[],
  selectImpl?: (prompt: string, choices: string[]) => string | undefined,
) {
  return {
    cwd,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async input() {
        return undefined;
      },
      async select(prompt: string, choices: string[]) {
        return selectImpl?.(prompt, choices);
      },
    },
  };
}

async function runStartNextStoryScenario() {
  const cwd = createProject("vazir-implement-start-next-story-");
  writeStory(cwd, 1, "not-started", "2026-04-20");
  writeStory(cwd, 2, "not-started", "2026-04-20");
  writeStory(cwd, 3, "not-started", "2026-04-20");

  const notifications: Notification[] = [];
  const harness = makePi();
  const selectCalls: SelectCall[] = [];
  const ctx = makeCtx(cwd, notifications, (prompt, choices) => {
    selectCalls.push({ prompt, choices });
    return choices[0];
  });

  await harness.implement.handler("", ctx);

  const today = new Date().toISOString().slice(0, 10);
  const storyFourPath = path.join(cwd, ".context", "stories", "story-004.md");
  const storyFour = fs.readFileSync(storyFourPath, "utf-8");

  assert(selectCalls.length === 1, "implement should prompt once when no story is active");
  assert(selectCalls[0].prompt.includes("No in-progress story found. What would you like to do?"), "implement should show the missing-story chooser");
  assert(selectCalls[0].choices.some(choice => choice.includes("Start story 004")), "chooser should offer the next story shortcut");
  assert(selectCalls[0].choices.includes("Pick story — choose an existing story to implement"), "chooser should offer story picking");
  assert(selectCalls[0].choices.includes("Cancel"), "chooser should offer cancel");
  assert(storyFour.includes("# Story 004: Next Story"), "start-story flow should seed the next story file");
  assert(storyFour.includes("**Status:** in-progress"), "start-story flow should mark the new story in-progress");
  assert(storyFour.includes(`**Last accessed:** ${today}`), "start-story flow should update last accessed");
  assert(harness.sentMessages.length === 1, "start-story flow should send one follow-up message");
  assert(harness.sentMessages[0].includes("Implement the in-progress story in .context/stories/story-004.md."), "start-story flow should target story 004");

  return { cwd, notifications };
}

async function runPickStoryScenario() {
  const cwd = createProject("vazir-implement-pick-story-");
  const storyOnePath = writeStory(cwd, 1, "not-started", "2026-04-20");
  const storyTwoPath = writeStory(cwd, 2, "not-started", "2026-04-21");

  const notifications: Notification[] = [];
  const harness = makePi();
  const selectCalls: SelectCall[] = [];
  let pickedChoice = "";
  const ctx = makeCtx(cwd, notifications, (prompt, choices) => {
    selectCalls.push({ prompt, choices });
    if (prompt.includes("What would you like to do?")) {
      return choices[1];
    }
    pickedChoice = choices[1];
    return pickedChoice;
  });

  assert(createNormalizedInput("/impliment") === "/implement", "impliment should normalize to implement");
  await harness.implement.handler("", ctx);

  const today = new Date().toISOString().slice(0, 10);
  const storyOne = fs.readFileSync(storyOnePath, "utf-8");
  const storyTwo = fs.readFileSync(storyTwoPath, "utf-8");
  const selectedStoryFile = `${pickedChoice.split(" — ")[0]}.md`;
  const selectedStoryPath = path.join(cwd, ".context", "stories", selectedStoryFile);
  const selectedStory = fs.readFileSync(selectedStoryPath, "utf-8");
  const touchedStory = selectedStoryPath === storyOnePath ? storyOne : storyTwo;
  const untouchedStory = selectedStoryPath === storyOnePath ? storyTwo : storyOne;

  assert(selectCalls.length === 2, "pick-story flow should prompt twice");
  assert(selectCalls[0].choices.includes("Pick story — choose an existing story to implement"), "first chooser should offer pick story");
  assert(selectCalls[1].choices.some(choice => choice.startsWith("story-")), "second chooser should list existing stories");
  assert(selectedStory.includes(`**Last accessed:** ${today}`), "pick-story flow should update the selected story");
  assert(selectedStory.includes("**Status:** in-progress"), "pick-story flow should promote the selected story to in-progress");
  assert(touchedStory.includes(`**Last accessed:** ${today}`), "pick-story flow should update the chosen story file");
  assert(!untouchedStory.includes(`**Last accessed:** ${today}`), "pick-story flow should not touch the unselected story");
  assert(harness.sentMessages.length === 1, "implement should send one follow-up message");
  assert(harness.sentMessages[0].includes(`Implement the in-progress story in .context/stories/${selectedStoryFile}.`), "implement should target the selected story");

  return { cwd, notifications };
}

async function runActiveStoryScenario() {
  const cwd = createProject("vazir-implement-active-story-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyOnePath = writeStory(cwd, 1, "in-progress", "2026-04-20");
  const storyTwoPath = writeStory(cwd, 2, "in-progress", "2026-04-22");

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

const startNextStory = await runStartNextStoryScenario();
const pickStory = await runPickStoryScenario();
const activeStory = await runActiveStoryScenario();

console.log("Start Next Story Scenario");
console.log(`cwd: ${startNextStory.cwd}`);
for (const note of startNextStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Pick Story Scenario");
console.log(`cwd: ${pickStory.cwd}`);
for (const note of pickStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Active Story Scenario");
console.log(`cwd: ${activeStory.cwd}`);
for (const note of activeStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
