import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function ensureStubModule(moduleName: string, content: string): string | null {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  if (fs.existsSync(moduleDir)) {
    return null;
  }

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

const extensionPath = path.join(repoRoot, ".pi", "extensions", "vazir-context", "index.ts");
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };
type CustomCall = { title: string; subtitle: string; body: string };
type InternalMessage = {
  message: { customType: string; content: string; display: boolean; details?: unknown };
  options?: unknown;
};

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
  const sentUserMessages: Array<{ message: string; options?: unknown }> = [];
  const sentInternalMessages: InternalMessage[] = [];

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
      sentUserMessages.push({ message, options });
    },
    sendMessage(message: InternalMessage["message"], options?: unknown) {
      sentInternalMessages.push({ message, options });
    },
  };

  register(pi as any);

  const completeStory = commands.get("complete-story");
  assert(Boolean(completeStory), "complete-story command was not registered");

  return {
    completeStory: completeStory!,
    sentInternalMessages,
    sentUserMessages,
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
  options: { hasUI?: boolean; isIdle?: boolean; selectResponses?: string[]; selectCalls?: SelectCall[]; customCalls?: CustomCall[] } = {},
) {
  const { hasUI = false, isIdle = true, selectResponses = [], selectCalls = [], customCalls = [] } = options;
  let selectIndex = 0;

  return {
    cwd,
    hasUI,
    isIdle() {
      return isIdle;
    },
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
      async custom(factory: (tui: { requestRender(): void }, theme: unknown, kb: unknown, done: () => void) => { render?: (width: number) => string[]; handleInput?: (data: string) => void }) {
        let doneCalled = false;
        const widget = factory({ requestRender() {} }, {}, {}, () => {
          doneCalled = true;
        });
        const rendered = widget.render?.(120) ?? [];
        customCalls.push({
          title: rendered[0] ?? "",
          subtitle: rendered[0] ?? "",
          body: rendered.slice(1).join("\n"),
        });
        widget.handleInput?.("escape");
        if (!doneCalled) {
          throw new Error("custom viewer did not close on escape");
        }
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
      "## Recommended Fixes",
      "- [ ] high — Add a local error boundary around the login form",
      "- [ ] low — Remove the unused import from useSession.ts",
      "",
      "---",
      "",
      "## Completion Summary",
      "Two findings documented.",
      "",
    ].join("\n"),
  );
}

function markReviewFixResolved(reviewPath: string, fixLine: string): void {
  const content = fs.readFileSync(reviewPath, "utf-8");
  fs.writeFileSync(reviewPath, content.replace(`- [ ] ${fixLine}`, `- [x] ${fixLine}`));
}

function setReviewStatus(reviewPath: string, status: "in-progress" | "complete"): void {
  const content = fs.readFileSync(reviewPath, "utf-8");
  fs.writeFileSync(reviewPath, content.replace(/\*\*Status:\*\*\s+(?:in-progress|complete)\s{2}/, `**Status:** ${status}  `));
}

async function runReviewGatedScenario() {
  const cwd = createProject("vazir-complete-story-review-gated-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const customCalls: CustomCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: [
      "Start code review before closing",
      "Open review document",
      "Keep story open and fix high-priority recommended items",
      "Close story now (remaining items noted)",
    ],
    selectCalls,
    customCalls,
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
  assert(harness.sentUserMessages.length === 0, "review-gated complete-story should not inject a visible follow-up user message");
  assert(harness.sentInternalMessages.length === 1, "review-gated complete-story should dispatch one hidden internal review turn");
  assert(harness.sentInternalMessages[0].message.customType === "vazir-internal-request", "review-gated complete-story should use the internal request message type");
  assert(harness.sentInternalMessages[0].message.display === false, "review-gated complete-story should hide the internal review turn from the TUI");

  const reviewPath = path.join(reviewDir, reviewFiles[0]);
  writeCompletedReview(reviewPath);
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "selecting remediation should keep the story open");
  assert(customCalls.length === 1, "review-gated closeout should allow opening the review document and returning to the choices");
  assert(customCalls[0].title.includes(path.basename(reviewPath)), "review document viewer should show the review file title");
  assert(harness.sentInternalMessages.length === 2, "review-gated closeout should queue a remediation turn after the user selects a fix path");
  assert(harness.sentInternalMessages[1].message.content.includes("Only work the unchecked items marked `high` or `critical`"), "review-gated closeout should support high-priority-only remediation");
  assert(harness.sentInternalMessages[1].message.content.includes("high: Add a local error boundary around the login form"), "review-gated closeout should target the high-priority checklist item");

  markReviewFixResolved(reviewPath, "high — Add a local error boundary around the login form");
  setReviewStatus(reviewPath, "in-progress");
  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** complete"), "review-gated complete-story should close the story after review findings are acknowledged");
  assert(selectCalls.some(call => call.options.includes("Open review document")), "review-gated complete-story should let the user open the review document from the closeout prompt");
  assert(selectCalls.some(call => call.options.includes("Keep story open and fix high-priority recommended items")), "review-gated complete-story should offer high-priority remediation from the closeout prompt");
  assert(selectCalls.some(call => call.prompt.includes("Pending recommended fixes: 1 high-priority, 1 other.")), "review-gated complete-story should summarize tracked review remediation items");
  assert(selectCalls.some(call => call.prompt.includes("High-priority items are done. Do you want to fix the remaining items before closing?")), "review-gated complete-story should reprompt after high-priority remediation finishes");
  assert(selectCalls.some(call => call.options.includes("Keep story open and fix remaining recommended items")), "review-gated complete-story should offer the remaining-item remediation path after high-priority work is done");
  assert(selectCalls.some(call => call.options.includes("Close story now (remaining items noted)")), "review-gated complete-story should offer a remaining-items-noted close option");
  assert(selectCalls.some(call => call.options.includes("Not yet, keep working")), "review-gated complete-story should let the user keep working after remediation");

  return { cwd, notifications, selectCalls, customCalls, reviewFiles, story };
}

async function runRestartedReviewCloseoutScenario() {
  const cwd = createProject("vazir-complete-story-restarted-review-");
  const notifications: Notification[] = [];
  const firstSelectCalls: SelectCall[] = [];
  const firstCustomCalls: CustomCall[] = [];
  const harness = makePi();
  const firstCtx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Start code review before closing"],
    selectCalls: firstSelectCalls,
    customCalls: firstCustomCalls,
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

  await harness.completeStory.handler("", firstCtx);

  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(reviewFiles.length === 1, "restart scenario should create one review file before the session ends");

  const reviewPath = path.join(reviewDir, reviewFiles[0]);
  writeCompletedReview(reviewPath);
  await harness.emit("session_shutdown", {}, firstCtx);

  const resumedSelectCalls: SelectCall[] = [];
  const resumedCustomCalls: CustomCall[] = [];
  const resumedCtx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Open review document", "Close story now (remaining items noted)"],
    selectCalls: resumedSelectCalls,
    customCalls: resumedCustomCalls,
  });

  await harness.completeStory.handler("", resumedCtx);

  assert(resumedSelectCalls.some(call => call.prompt.includes("Pending recommended fixes: 1 high-priority, 1 other.")), "restart scenario should rediscover the completed review and show the remediation prompt");
  assert(resumedSelectCalls.some(call => call.options.includes("Open review document")), "restart scenario should still offer the review document option after a session restart");
  assert(resumedSelectCalls.some(call => call.options.includes("Keep story open and fix high-priority recommended items")), "restart scenario should still offer high-priority remediation after a session restart");
  assert(resumedCustomCalls.length === 1, "restart scenario should allow opening the review document after a session restart");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "restart scenario should close the story after the resumed review closeout");

  return { cwd, notifications, firstSelectCalls, resumedSelectCalls, resumedCustomCalls, reviewFiles };
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
  assert(harness.sentUserMessages.length === 0, "ready closeout without review should not send a visible follow-up user message");
  assert(harness.sentInternalMessages.length === 0, "ready closeout without review should not queue an internal follow-up turn");
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
  assert(harness.sentUserMessages.length === 0, "keep-working scenario should not inject a visible follow-up user message");
  assert(harness.sentInternalMessages.length === 1, "keep-working scenario should dispatch one hidden readiness follow-up turn");
  assert(harness.sentInternalMessages[0].message.content.includes("Review .context/stories/story-001.md for completion readiness."), "keep-working scenario should send the readiness instruction as an internal turn");

  const readyStory = fs.readFileSync(storyPath, "utf-8")
    .replace("- [ ] Example task", "- [x] Example task")
    .replace("- **Status:** pending  ", "- **Status:** confirmed  ")
    .replace("- **Solution:** —", "- **Solution:** Added missing submit handler")
    .replace("## Completion Summary\n", "## Completion Summary\nImplemented the story and verified the expected flow.\n");
  fs.writeFileSync(storyPath, readyStory);

  await harness.emit("agent_end", {}, ctx);

  assert(selectCalls.some(call => call.prompt.includes("What would you like to do?")), "keep-working scenario should prompt for the final action once ready");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "keep-working scenario should leave the story open when the user says not yet");
  assert(harness.sentInternalMessages.length === 1, "keep-working scenario should keep the readiness follow-up as the only internal turn");

  return { cwd, notifications, selectCalls };
}

const reviewGated = await runReviewGatedScenario();
const restartedReviewCloseout = await runRestartedReviewCloseoutScenario();
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

console.log("Restarted Review Closeout");
console.log(`cwd: ${restartedReviewCloseout.cwd}`);
console.log("notifications:");
for (const note of restartedReviewCloseout.notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
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