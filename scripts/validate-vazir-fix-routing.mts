import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker");
const register = extensionModule.default;
const stubModuleDirs = installCommonPiStubs();

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

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
    "- [ ] Example task",
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

function makePi() {
  const harness = createPiHarness([register]);
  const fixCommand = harness.getCommand("fix");
  assert(Boolean(fixCommand), "fix command was not registered");

  return {
    fixCommand: fixCommand!,
    sentMessages: harness.sentMessages,
    async emit(name: string, event: any, ctx: any) {
      await harness.emit(name, event, ctx);
    },
  };
}

function makeCtx(cwd: string, notifications: Notification[], selectCalls: SelectCall[] = []) {
  return {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      async input() {
        return undefined;
      },
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        return undefined;
      },
    },
  };
}

async function runMissingStoryScenario() {
  const cwd = createProject("vazir-fix-missing-story-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);

  await harness.fixCommand.handler('"signup button broken"', ctx);

  const logPath = path.join(cwd, ".context", "complaints-log.md");
  assert(!fs.existsSync(logPath), "complaints log should not be created when no story exists");
  assert(harness.sentMessages.length === 0, "no story should prevent the agent follow-up");
  assert(
    notifications.some(note => note.message.includes("Run /plan first")),
    "missing story warning was not shown",
  );

  return { cwd, notifications };
}

async function runSingleStoryScenario() {
  const cwd = createProject("vazir-fix-single-story-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const storyPath = writeStory(cwd, 1, "not-started", "2026-03-24");

  await harness.fixCommand.handler('signup button broken', ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  const complaints = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");

  assert(story.includes('### /fix — "signup button broken"'), "story issues section did not receive the /fix entry");
  assert(story.includes("**Status:** in-progress"), "single not-started story was not promoted to in-progress");
  assert(story.includes(`**Last accessed:** ${new Date().toISOString().slice(0, 10)}`), "last accessed was not updated");
  assert(complaints.includes('| story-001 | "signup button broken" | status: pending'), "complaints log did not reference story-001");
  assert(harness.sentMessages.length === 1, "agent follow-up was not sent after logging to a story");

  return { cwd, notifications, story, complaints };
}

async function runChooserScenario() {
  const cwd = createProject("vazir-fix-chooser-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, selectCalls);
  const storyOnePath = writeStory(cwd, 1, "not-started", "2026-03-24");
  const storyTwoPath = writeStory(cwd, 2, "not-started", "2026-03-25");
  let selectedOption = "";

  ctx.ui.select = async (prompt: string, options: string[]) => {
    selectCalls.push({ prompt, options });
    selectedOption = options[1];
    return selectedOption;
  };

  await harness.fixCommand.handler('refresh still logs me out', ctx);

  const storyOne = fs.readFileSync(storyOnePath, "utf-8");
  const storyTwo = fs.readFileSync(storyTwoPath, "utf-8");
  const complaints = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
  const selectedStoryNumber = selectedOption.startsWith("story-001") ? "001" : "002";
  const unselectedStoryNumber = selectedStoryNumber === "001" ? "002" : "001";
  const selectedStory = selectedStoryNumber === "001" ? storyOne : storyTwo;
  const unselectedStory = unselectedStoryNumber === "001" ? storyOne : storyTwo;

  assert(selectCalls.length === 1, "story chooser was not shown when multiple candidate stories existed");
  assert(!unselectedStory.includes('### /fix — "refresh still logs me out"'), "unchosen story should not receive the issue entry");
  assert(selectedStory.includes('### /fix — "refresh still logs me out"'), "chosen story did not receive the issue entry");
  assert(complaints.includes(`| story-${selectedStoryNumber} | "refresh still logs me out" | status: pending`), "complaints log did not reference the chosen story");

  return { cwd, notifications, selectCalls };
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

try {
  const missingStory = await runMissingStoryScenario();
  const singleStory = await runSingleStoryScenario();
  const chooserStory = await runChooserScenario();

  printScenario("Missing Story", missingStory);
  printScenario("Single Story", singleStory);
  printScenario("Multiple Story Chooser", chooserStory);
} finally {
  cleanupStubModules(stubModuleDirs);
}