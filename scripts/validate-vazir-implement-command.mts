import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const stubModuleDirs = installCommonPiStubs();
const extensionModule = await loadExtensionModule<{
  default: (pi: any) => void;
  normalizeTrackerInputText: (text: string) => string;
}>("vazir-tracker");
const register = extensionModule.default;
const { normalizeTrackerInputText } = extensionModule;

type Notification = { message: string; level: string };
type CustomCall = { options: unknown };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  return cwd;
}

function writeStory(
  cwd: string,
  number: number,
  status: string,
  lastAccessed: string,
  completed = "—",
  title = "Example",
  options: { scopeFile?: string; type?: "ui" } = {},
): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(
    filePath,
    [
      `# Story ${String(number).padStart(3, "0")}: ${title}`,
      "",
      ...(options.type ? [`**Type:** ${options.type}  `] : []),
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
      `- ${options.scopeFile ?? "src/example.ts"}`,
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

function writeDesignFiles(cwd: string, designSystem: string): void {
  const designDir = path.join(cwd, ".context", "design");
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(path.join(designDir, "design-system.md"), designSystem);
  fs.writeFileSync(path.join(designDir, "brand.md"), "# Brand\n\n- Voice: concise\n");
  fs.writeFileSync(path.join(designDir, "components.md"), "# Components\n\n- Buttons: standard\n");
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
  selectReturns: unknown[] = [],
) {
  let callIndex = 0;
  const customCalls: CustomCall[] = [];
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
        return selectReturns[callIndex++] as string | undefined;
      },
      async custom(_factory: any, options: any) {
        customCalls.push({ options });
        return Promise.resolve(undefined);
      },
      _customCalls: () => customCalls,
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
  const ctx = makeCtx(cwd, notifications, ["Start story 004 — Add billing summary · 2026-04-20"]);

  await harness.implement.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  const today = new Date().toISOString().slice(0, 10);
  const storyFour = fs.readFileSync(storyFourPath, "utf-8");
  const storyFive = fs.readFileSync(storyFivePath, "utf-8");

  assert(customCalls.length === 0, "implement should rely on the standard picker path when no story is active");
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
  const ctx = makeCtx(cwd, notifications, [
    "Pick story — choose an existing story to implement",
    "story-005 — not-started — Update onboarding copy · 2026-04-21",
  ]);

  assert(createNormalizedInput("/impliment") === "/implement", "impliment should normalize to implement");
  await harness.implement.handler("", ctx);

  const customCalls = (ctx.ui as any)._customCalls();
  const today = new Date().toISOString().slice(0, 10);
  const selectedStory = fs.readFileSync(storyFivePath, "utf-8");
  const storyFour = fs.readFileSync(storyFourPath, "utf-8");
  const storyFive = fs.readFileSync(storyFivePath, "utf-8");

  assert(customCalls.length === 0, "pick-story flow should rely on the standard picker path");
  assert(selectedStory.includes(`**Last accessed:** ${today}`), "pick-story flow should update the selected story");
  assert(selectedStory.includes("**Status:** in-progress"), "pick-story flow should promote the selected story to in-progress");
  assert(storyFour.includes("**Status:** not-started"), "pick-story flow should leave story 004 unchanged");
  assert(storyFive.includes("**Status:** in-progress"), "pick-story flow should promote story 005");
  assert(harness.sentMessages.length === 1, "implement should send one follow-up message");
  assert(String(harness.sentMessages[0]?.message).includes("Implement the in-progress story in .context/stories/story-005.md."), "implement should target story 005");

  return { cwd, notifications };
}

async function runUiDesignInstructionScenario() {
  const cwd = createProject("vazir-implement-ui-design-");
  writeDesignFiles(cwd, "# Design System\n\n## Colours\n- Primary: —\n");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  writeStory(cwd, 2, "in-progress", "2026-04-22", "—", "Build dashboard card", { scopeFile: "src/DashboardCard.tsx" });

  await harness.implement.handler("", ctx);

  const message = String(harness.sentMessages[0]?.message ?? "");
  assert(message.includes("`.context/design/brand.md`") && message.includes("`.context/design/components.md`"), "UI implement instruction should require reading brand and components files");
  assert(message.includes("primary colour") && message.includes("font") && message.includes("visual style") && message.includes("hard constraints"), "UI implement instruction should include the four lazy design gap questions when design-system has placeholders");
  assert(message.includes("<!-- source: story-002 -->"), "UI implement instruction should require source markers for filled design fields");

  return { cwd, notifications };
}

async function runMalformedStoryGuardScenario() {
  const cwd = createProject("vazir-implement-malformed-story-");
  const storyPath = writeStory(cwd, 2, "todo", "2026-04-22", "—", "Broken story");
  const malformed = fs.readFileSync(storyPath, "utf-8").replace("- [ ] Implement the workflow", "- [maybe] Implement the workflow");
  fs.writeFileSync(storyPath, malformed);

  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);

  await harness.implement.handler("", ctx);

  assert(harness.sentMessages.length === 0, "implement should not dispatch when malformed story files are present");
  assert(
    notifications.some(note => note.level === "warning" && note.message.includes("Malformed story files detected")),
    "implement should warn when malformed story files block story resolution",
  );
  assert(
    notifications.some(note => note.message.includes("invalid status 'todo'") && !note.message.includes("story-002.md: story-002.md")),
    "implement warning should include actionable story validation details without duplicated basename",
  );

  return { cwd, notifications };
}

async function runNonUiDesignOmissionScenario() {
  const cwd = createProject("vazir-implement-non-ui-design-");
  writeDesignFiles(cwd, "# Design System\n\n## Colours\n- Primary: —\n");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  writeStory(cwd, 2, "in-progress", "2026-04-22", "—", "Add API route", { scopeFile: "src/route.ts" });

  await harness.implement.handler("", ctx);

  const message = String(harness.sentMessages[0]?.message ?? "");
  assert(!message.includes(".context/design/brand.md"), "non-UI implement instruction should not mention brand.md");
  assert(!message.includes("primary colour"), "non-UI implement instruction should not ask lazy design questions");

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

  const customCalls = (ctx.ui as any)._customCalls();
  const today = new Date().toISOString().slice(0, 10);
  const storyOne = fs.readFileSync(storyOnePath, "utf-8");
  const storyTwo = fs.readFileSync(storyTwoPath, "utf-8");

  assert(customCalls.length === 0, "implement should not prompt when an active story exists");
  assert(storyTwo.includes(`**Last accessed:** ${today}`), "implement should update the most recent in-progress story");
  assert(storyTwo.includes("**Status:** in-progress"), "implement should keep the active story in-progress");
  assert(!storyOne.includes(`**Last accessed:** ${today}`), "implement should not touch older in-progress stories");
  assert(harness.sentMessages.length === 1, "implement should send one follow-up message");
  assert(String(harness.sentMessages[0]?.message).includes("Implement the in-progress story in .context/stories/story-002.md."), "implement should target the most recent in-progress story");

  return { cwd, notifications };
}

const startNextStory = await runStartNextStoryScenario();
const pickStory = await runPickStoryScenario();
const uiDesignInstruction = await runUiDesignInstructionScenario();
const malformedStoryGuard = await runMalformedStoryGuardScenario();
const nonUiDesignOmission = await runNonUiDesignOmissionScenario();
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
console.log("UI Design Instruction Scenario");
console.log(`cwd: ${uiDesignInstruction.cwd}`);
for (const note of uiDesignInstruction.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Malformed Story Guard Scenario");
console.log(`cwd: ${malformedStoryGuard.cwd}`);
for (const note of malformedStoryGuard.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Non-UI Design Omission Scenario");
console.log(`cwd: ${nonUiDesignOmission.cwd}`);
for (const note of nonUiDesignOmission.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("");
console.log("Active Story Scenario");
console.log(`cwd: ${activeStory.cwd}`);
for (const note of activeStory.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}

cleanupStubModules(stubModuleDirs);
