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

function writeStory(
  cwd: string,
  options: { checklist: string[]; issues: string[]; completionSummary: string },
): string {
  const filePath = path.join(cwd, ".context", "stories", "story-001.md");
  const content = [
    "# Story 001: Example",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-03-25  ",
    "**Last accessed:** 2026-03-25  ",
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
    ...options.checklist,
    "",
    "---",
    "",
    "## Issues",
    ...options.issues,
    "",
    "---",
    "",
    "## Completion Summary",
    options.completionSummary,
    "",
  ].join("\n");
  fs.writeFileSync(filePath, content);
  return filePath;
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

  const completeStory = commands.get("complete-story");
  assert(Boolean(completeStory), "complete-story command was not registered");

  return {
    completeStory: completeStory!,
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
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        const response = selectResponses[selectIndex];
        selectIndex += 1;
        return response;
      },
    },
  };
}

function writeCompletedReview(reviewPath: string): void {
  fs.writeFileSync(
    reviewPath,
    [
      "# Code Review 2026-04-08T14:06:53Z",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-04-08T14:06:53Z  ",
      "**Completed:** 2026-04-08  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "**Focus:** story-001 completion review  ",
      "**Trigger:** complete-story",
      "",
      "---",
      "",
      "## Goal",
      "Review the requested scope for bugs, regressions, missing tests, dead code, simplification opportunities, scope drift, and workflow violations.",
      "",
      "## Checklist",
      "- [x] Inspect the relevant diff and touched files",
      "- [x] Check for bugs, regressions, and edge cases",
      "- [x] Check tests and verification gaps",
      "- [x] Check for dead code, duplication, and simplification opportunities",
      "- [x] Capture reusable rule candidates where warranted",
      "- [x] Write the completion summary and mark the review complete",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: medium",
      "- Category: bug",
      "- Summary: missing error boundary on LoginForm",
      "- Evidence: the login flow can surface an uncaught render failure",
      "- Recommendation: add a local error boundary around the form",
      "- Rule candidate: always wrap login forms with a recovery boundary",
      "",
      "### Finding 2",
      "- Severity: low",
      "- Category: workflow",
      "- Summary: unused import in useSession.ts",
      "- Evidence: the imported helper is never referenced after the refactor",
      "- Recommendation: remove the dead import or use it consistently",
      "- Rule candidate: clean up imports during story review",
      "",
      "---",
      "",
      "## Completion Summary",
      "Two findings documented.",
      "",
    ].join("\n"),
  );
}

async function runReviewGatedScenario() {
  const cwd = createProject("vazir-complete-story-review-gated-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Start code review before closing", "No, close story now (findings noted)"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** confirmed  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(reviewFiles.length === 1, "review-gated complete-story should create a review file before closing");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "review-gated complete-story should keep the story open until review completes");
  assert(harness.sentMessages.length === 1, "review-gated complete-story should send one review follow-up message");

  writeCompletedReview(path.join(reviewDir, reviewFiles[0]));
  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** complete"), "review-gated complete-story should close the story after review findings are acknowledged");
  assert(selectCalls.some(call => call.prompt.includes("Do these require work before closing?")), "review-gated complete-story should surface the review findings before closure");
  assert(selectCalls.some(call => call.options.includes("No, close story now (findings noted)")), "review-gated complete-story should offer a findings-noted close option");

  return { cwd, notifications, selectCalls, reviewFiles, story };
}

async function runReadyCloseScenario() {
  const cwd = createProject("vazir-complete-story-ready-close-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story now"],
    selectCalls,
  });
  writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** confirmed  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(selectCalls.some(call => call.prompt.includes("What would you like to do?")), "ready closeout should prompt for the final action");
  assert(harness.sentMessages.length === 0, "ready closeout without review should not send a review follow-up message");
  assert(fs.readFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "utf-8").includes("**Status:** complete"), "ready closeout should complete the story immediately when the user chooses close now");

  return { cwd, notifications, selectCalls };
}

async function runKeepWorkingScenario() {
  const cwd = createProject("vazir-complete-story-keep-working-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Not yet, keep working"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [ ] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** pending  ",
      "- **Agent note:** —  ",
      "- **Solution:** —",
    ],
    completionSummary: "",
  });

  await harness.completeStory.handler("", ctx);
  assert(notifications.some(note => note.message.includes("not ready to complete yet")), "keep-working scenario should warn about blockers first");
  assert(harness.sentMessages.length === 1, "keep-working scenario should send one blocker follow-up instruction");

  const readyStory = fs.readFileSync(storyPath, "utf-8")
    .replace("- [ ] Example task", "- [x] Example task")
    .replace("- **Status:** pending  ", "- **Status:** confirmed  ")
    .replace("- **Solution:** —", "- **Solution:** Added missing submit handler")
    .replace("## Completion Summary\n", "## Completion Summary\nImplemented the story and verified the expected flow.\n");
  fs.writeFileSync(storyPath, readyStory);

  await harness.emit("agent_end", {}, ctx);

  assert(selectCalls.some(call => call.prompt.includes("What would you like to do?")), "keep-working scenario should prompt for the final action once ready");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "keep-working scenario should leave the story open when the user says not yet");
  assert(harness.sentMessages.length === 1, "keep-working scenario should keep the blocker follow-up as the only follow-up message");

  return { cwd, notifications, selectCalls };
}

const reviewGated = await runReviewGatedScenario();
const readyClose = await runReadyCloseScenario();
const keepWorking = await runKeepWorkingScenario();

console.log("Review Gated Closeout");
console.log(`cwd: ${reviewGated.cwd}`);
console.log("notifications:");
for (const note of reviewGated.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("reviewFiles:");
for (const file of reviewGated.reviewFiles) {
  console.log(`  - ${file}`);
}

console.log("Ready Closeout");
console.log(`cwd: ${readyClose.cwd}`);
console.log("notifications:");
for (const note of readyClose.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}

console.log("Keep Working Closeout");
console.log(`cwd: ${keepWorking.cwd}`);
console.log("notifications:");
for (const note of keepWorking.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}