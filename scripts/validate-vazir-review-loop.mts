import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-context/index.ts";
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System Rules",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(cwd, ".context", "stories", "story-001.md"),
    [
      "# Story 001: Example",
      "",
      "**Status:** in-progress  ",
      "**Created:** 2026-04-01  ",
      "**Last accessed:** 2026-04-01  ",
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
    ].join("\n"),
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
  const review = commands.get("review");
  assert(Boolean(review), "review command was not registered");

  return {
    review: review!,
    sentMessages,
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
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
        return "Cancel";
      },
    },
  };
}

const cwd = createProject("vazir-review-loop-");
const notifications: Notification[] = [];
const harness = makePi();
const ctx = makeCtx(cwd, notifications);

await harness.review.handler("auth flow and recent changes", ctx);

const reviewDir = path.join(cwd, ".context", "reviews");
const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
assert(reviewFiles.length === 1, "review command did not create a detailed review file");
assert(harness.sentMessages.length === 1, "review command did not send a follow-up review instruction");

fs.writeFileSync(
  path.join(reviewDir, reviewFiles[0]),
  [
    "# Code Review A",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: medium",
    "- Category: bug",
    "- Summary: auth helper rename broke imports",
    "- Evidence: call sites still used the old name",
    "- Recommendation: update imports when renaming helpers",
    "- Rule candidate: do not rename auth helpers during refactors without updating call sites",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(reviewDir, "review-manual-second.md"),
  [
    "# Code Review B",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: high",
    "- Category: regression",
    "- Summary: auth helper rename regressed login",
    "- Evidence: login still imported the old helper name",
    "- Recommendation: include import updates in helper renames",
    "- Rule candidate: do not rename auth helpers during refactors without updating call sites",
    "",
  ].join("\n"),
);

await harness.emit("agent_end", {}, ctx);

const summary = fs.readFileSync(path.join(reviewDir, "summary.md"), "utf-8");
const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");

assert(summary.includes("do not rename auth helpers during refactors without updating call sites | count: 2 | status: promoted"), "summary did not promote the repeated review finding");
assert(systemMd.includes("- do not rename auth helpers during refactors without updating call sites"), "system.md did not receive the promoted review rule");
assert(notifications.some(note => note.message.includes("Promoted review rule")), "agent_end did not notify about promoted review rules");

console.log("Review loop validation");
console.log(`cwd: ${cwd}`);
console.log("reviewFiles:");
for (const file of reviewFiles) {
  console.log(`  - ${file}`);
}
console.log("notifications:");
for (const note of notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("summary:");
for (const line of summary.trim().split("\n")) {
  console.log(`  ${line}`);
}