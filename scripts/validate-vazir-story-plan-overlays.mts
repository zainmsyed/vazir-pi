import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { assert, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const trackerModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker");
const contextModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const registerTracker = trackerModule.default;
const registerContext = contextModule.default;

type Notification = { message: string; level: string };
type CustomCall = { options: unknown };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "intake"), { recursive: true });
  return cwd;
}

function writeStory(
  cwd: string,
  number: number,
  status: string,
  lastAccessed: string,
  title = "Example",
): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(
    filePath,
    [
      `# Story ${String(number).padStart(3, "0")}: ${title}`,
      "",
      `**Status:** ${status}  `,
      "**Created:** 2026-03-25  ",
      `**Last accessed:** ${lastAccessed}  `,
      "**Completed:** —",
      "",
      "---",
      "",
      "## Goal",
      "Test story goal.",
      "",
      "## Verification",
      "Run tests.",
      "",
      "## Scope",
      "- src/example.ts",
      "",
      "## Out of scope",
      "- src/other.ts",
      "",
      "## Dependencies",
      "- ",
      "",
      "---",
      "",
      "## Checklist",
      "- [ ] Task one",
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

function makeCtx(
  cwd: string,
  notifications: Notification[],
  selectReturn: string | undefined = undefined,
) {
  const customCalls: CustomCall[] = [];
  return {
    cwd,
    hasUI: true,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async input() {
        return undefined;
      },
      async select() {
        return selectReturn;
      },
      async custom(_factory: any, options: any) {
        customCalls.push({ options });
        return Promise.resolve();
      },
      _customCalls: () => customCalls,
    },
  };
}

// ── /story tests ───────────────────────────────────────────────────────

async function runStoryPickerWithActiveStoryScenario() {
  const cwd = createProject("vazir-story-active-");
  const storyPath = writeStory(cwd, 2, "in-progress", "2026-04-22", "Active Story");

  const harness = createPiHarness([registerTracker]);
  const storyCommand = harness.getCommand("story");
  assert(Boolean(storyCommand), "story command was not registered");

  const notifications: Notification[] = [];
  const ctx = makeCtx(cwd, notifications, "story-002 — in-progress — Active Story · 2026-04-22");
  await storyCommand!.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  assert(customCalls.length === 1, "story should only open the viewer after the standard picker resolves a choice");
  assert((customCalls[0].options as any)?.overlay === true, "story viewer should use an overlay");
  assert(notifications.length === 0, "story with files should not notify");

  return { cwd, notifications };
}

async function runStoryPickerScenario() {
  const cwd = createProject("vazir-story-picker-");
  const storyPath = writeStory(cwd, 1, "not-started", "2026-04-20", "First Story");
  fs.writeFileSync(path.join(cwd, ".context", "stories", "plan.md"), "# Plan\n\nPlan content.\n");

  const harness = createPiHarness([registerTracker]);
  const storyCommand = harness.getCommand("story");
  assert(Boolean(storyCommand), "story command was not registered");

  const notifications: Notification[] = [];
  const ctx = makeCtx(cwd, notifications, "story-001 — not-started — First Story · 2026-04-20");
  await storyCommand!.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  assert(customCalls.length === 1, "story with no active story should call ui.custom once for the viewer after selection");
  assert((customCalls[0].options as any)?.overlay === true, "story viewer should use an overlay");

  return { cwd, notifications };
}

async function runStoryPickPlanScenario() {
  const cwd = createProject("vazir-story-plan-pick-");
  writeStory(cwd, 1, "not-started", "2026-04-20", "First Story");
  const planPath = path.join(cwd, ".context", "stories", "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\nPlan content.\n");

  const harness = createPiHarness([registerTracker]);
  const storyCommand = harness.getCommand("story");
  assert(Boolean(storyCommand), "story command was not registered");

  const notifications: Notification[] = [];
  const ctx = makeCtx(cwd, notifications, "plan.md — plan");
  await storyCommand!.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  assert(customCalls.length === 1, "story plan-pick should call ui.custom once for the plan viewer after selection");
  assert((customCalls[0].options as any)?.overlay === true, "plan viewer should use an overlay");

  return { cwd, notifications };
}

async function runStoryEmptyScenario() {
  const cwd = createProject("vazir-story-empty-");

  const harness = createPiHarness([registerTracker]);
  const storyCommand = harness.getCommand("story");
  assert(Boolean(storyCommand), "story command was not registered");

  const notifications: Notification[] = [];
  const ctx = makeCtx(cwd, notifications);
  await storyCommand!.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  assert(customCalls.length === 0, "story with no files should not call ui.custom");
  assert(notifications.some(n => n.message.includes("No plan or story files found yet")), "story with no files should notify");

  return { cwd, notifications };
}

// ── /plan tests ────────────────────────────────────────────────────────

async function runPlanViewScenario() {
  const cwd = createProject("vazir-plan-view-");
  fs.writeFileSync(path.join(cwd, ".context", "stories", "plan.md"), "# Plan\n\nTest plan content.\n");

  const harness = createPiHarness([registerContext]);
  const planCommand = harness.getCommand("plan");
  assert(Boolean(planCommand), "plan command was not registered");

  const notifications: Notification[] = [];
  const ctx = makeCtx(cwd, notifications, "View current plan");
  await planCommand!.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  assert(customCalls.length === 1, "plan view should call ui.custom once for the markdown viewer");
  assert((customCalls[0].options as any)?.overlay === true, "plan viewer should use an overlay");

  return { cwd, notifications };
}

// ── Run ────────────────────────────────────────────────────────────────

const storyActive = await runStoryPickerWithActiveStoryScenario();
const storyPicker = await runStoryPickerScenario();
const storyPickPlan = await runStoryPickPlanScenario();
const storyEmpty = await runStoryEmptyScenario();
const planView = await runPlanViewScenario();

console.log("Story Picker With Active Story Scenario");
console.log(`cwd: ${storyActive.cwd}`);
for (const note of storyActive.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");

console.log("Story Picker Scenario");
console.log(`cwd: ${storyPicker.cwd}`);
for (const note of storyPicker.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");

console.log("Story Pick Plan Scenario");
console.log(`cwd: ${storyPickPlan.cwd}`);
for (const note of storyPickPlan.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");

console.log("Story Empty Scenario");
console.log(`cwd: ${storyEmpty.cwd}`);
for (const note of storyEmpty.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");

console.log("Plan View Scenario");
console.log(`cwd: ${planView.cwd}`);
for (const note of planView.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");

console.log("All story-plan-overlay validation scenarios passed.");
