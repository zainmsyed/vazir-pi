import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionModule = await loadExtensionModule<{
  default: (pi: any) => void;
  normalizeTrackerInputText: (text: string) => string;
}>("vazir-tracker");
const register = extensionModule.default;
const { normalizeTrackerInputText } = extensionModule;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; choices: string[] };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  return cwd;
}

function writeStory(cwd: string, number: number, status: string, lastAccessed: string, completed = "—", title = "Example"): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(
    filePath,
    [
      `# Story ${String(number).padStart(3, "0")}: ${title}`,
      "",
      `**Status:** ${status}  `,
      "**Created:** 2026-03-25  ",
      `**Last accessed:** ${lastAccessed}  `,
      `**Completed:** ${completed}`,
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
  const harness = createPiHarness([register]);
  const implement = harness.getCommand("implement");
  assert(Boolean(implement), "implement command was not registered");

  return {
    implement: implement!,
    sentMessages: harness.sentMessages,
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
  writeStory(cwd, 3, "complete", "2026-04-20", "2026-04-21", "Archive old reports");
  const storyFourPath = writeStory(cwd, 4, "not-started", "2026-04-20", "—", "Add billing summary");
  const storyFivePath = writeStory(cwd, 5, "not-started", "2026-04-20", "—", "Update onboarding copy");

  const notifications: Notification[] = [];
  const harness = makePi();
  const selectCalls: SelectCall[] = [];
  const ctx = makeCtx(cwd, notifications, (prompt, choices) => {
    selectCalls.push({ prompt, choices });
    return choices[1];
  });

  await harness.implement.handler("", ctx);

  const today = new Date().toISOString().slice(0, 10);
  const storyFour = fs.readFileSync(storyFourPath, "utf-8");
  const storyFive = fs.readFileSync(storyFivePath, "utf-8");

  assert(selectCalls.length === 1, "implement should prompt once when no story is active");
  assert(selectCalls[0].prompt.includes("No in-progress story found. What would you like to do?"), "implement should show the missing-story chooser");
  assert(selectCalls[0].choices[0] === "Pick story — choose an existing story to implement", "picker should be the first choice");
  assert(selectCalls[0].choices.some(choice => choice.includes("Start story 004")), "chooser should offer the next story shortcut");
  assert(selectCalls[0].choices.some(choice => choice.includes("Add billing summary")), "chooser should show the story name next to the number");
  assert(selectCalls[0].choices.includes("Pick story — choose an existing story to implement"), "chooser should offer story picking");
  assert(selectCalls[0].choices.includes("Cancel"), "chooser should offer cancel");
  assert(storyFour.includes("**Status:** in-progress"), "start-story flow should mark the new story in-progress");
  assert(storyFour.includes(`**Last accessed:** ${today}`), "start-story flow should update last accessed");
  assert(!storyFive.includes(`**Last accessed:** ${today}`), "start-story flow should not touch later stories");
  assert(harness.sentMessages.length === 1, "start-story flow should send one follow-up message");
  assert(String(harness.sentMessages[0]?.message).includes("Implement the in-progress story in .context/stories/story-004.md."), "start-story flow should target story 004");

  return { cwd, notifications };
}

async function runPickStoryScenario() {
  const cwd = createProject("vazir-implement-pick-story-");
  writeStory(cwd, 3, "complete", "2026-04-20", "2026-04-21", "Archive old reports");
  const storyFourPath = writeStory(cwd, 4, "not-started", "2026-04-20", "—", "Add billing summary");
  const storyFivePath = writeStory(cwd, 5, "not-started", "2026-04-21", "—", "Update onboarding copy");

  const notifications: Notification[] = [];
  const harness = makePi();
  const selectCalls: SelectCall[] = [];
  let pickedChoice = "";
  const ctx = makeCtx(cwd, notifications, (prompt, choices) => {
    selectCalls.push({ prompt, choices });
    if (prompt.includes("What would you like to do?")) {
      return choices[0];
    }
    pickedChoice = choices[1];
    return pickedChoice;
  });

  assert(createNormalizedInput("/impliment") === "/implement", "impliment should normalize to implement");
  await harness.implement.handler("", ctx);

  const today = new Date().toISOString().slice(0, 10);
  const selectedStoryFile = `${pickedChoice.split(" — ")[0]}.md`;
  const selectedStoryPath = path.join(cwd, ".context", "stories", selectedStoryFile);
  const selectedStory = fs.readFileSync(selectedStoryPath, "utf-8");
  const storyFour = fs.readFileSync(storyFourPath, "utf-8");
  const storyFive = fs.readFileSync(storyFivePath, "utf-8");

  assert(selectCalls.length === 2, "pick-story flow should prompt twice");
  assert(selectCalls[0].choices.includes("Pick story — choose an existing story to implement"), "first chooser should offer pick story");
  assert(selectCalls[0].choices[0] === "Pick story — choose an existing story to implement", "picker should be first in the missing-story chooser");
  assert(selectCalls[1].choices[0].includes("story-004") && selectCalls[1].choices[0].includes("Add billing summary"), "second chooser should list story 004 with its name");
  assert(selectCalls[1].choices[1].includes("story-005") && selectCalls[1].choices[1].includes("Update onboarding copy"), "second chooser should list story 005 with its name");
  assert(selectCalls[1].choices.every(choice => !choice.startsWith("story-003")), "completed stories should not appear in the picker");
  assert(selectedStory.includes(`**Last accessed:** ${today}`), "pick-story flow should update the selected story");
  assert(selectedStory.includes("**Status:** in-progress"), "pick-story flow should promote the selected story to in-progress");
  assert(storyFour.includes("**Status:** not-started"), "pick-story flow should leave story 004 unchanged");
  assert(storyFive.includes("**Status:** in-progress"), "pick-story flow should promote story 005");
  assert(harness.sentMessages.length === 1, "implement should send one follow-up message");
  assert(String(harness.sentMessages[0]?.message).includes(`Implement the in-progress story in .context/stories/${selectedStoryFile}`), "implement should target the selected story");

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
  assert(String(harness.sentMessages[0]?.message).includes("Implement the in-progress story in .context/stories/story-002.md."), "implement should target the most recent in-progress story");

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
