import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-context.ts";
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "learnings"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "- avoid renaming auth helpers",
      "- avoid renaming auth helpers",
      "- keep checkpoint labels human readable",
      "- keep checkpoint labels human readable",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(cwd, ".context", "learnings", "code-review.md"),
    "---\n2026-03-22T12:00:00.000Z\navoid renaming auth helpers\n",
  );
  return cwd;
}

function makePi() {
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand() {},
    async sendUserMessage() {},
  };

  register(pi as any);

  return {
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
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
    },
  };
}

function readLearnedRules(cwd: string): string[] {
  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  const match = systemMd.match(/## Learned Rules[\s\S]*$/);
  assert(Boolean(match), "system.md is missing the Learned Rules section");
  return match![0]
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2));
}

async function runScenario(eventName: "session_before_compact" | "session_shutdown") {
  const cwd = createProject(`vazir-learning-loop-${eventName}-`);
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);

  await harness.emit(eventName, {}, ctx);

  const learnedRules = readLearnedRules(cwd);
  const learnings = fs.readFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "utf-8");

  assert(learnedRules.length === 2, `${eventName} did not dedupe learned rules`);
  assert(learnedRules[0] === "avoid renaming auth helpers", `${eventName} changed the first learned rule unexpectedly`);
  assert(learnedRules[1] === "keep checkpoint labels human readable", `${eventName} changed the second learned rule unexpectedly`);
  assert(learnings.includes("avoid renaming auth helpers"), `${eventName} should not modify code-review.md`);
  assert(notifications.length === 0, `${eventName} should not emit UI notifications`);

  return {
    cwd,
    learnedRules,
    learnings,
  };
}

function printScenario(title: string, result: { cwd: string; learnedRules: string[]; learnings: string }) {
  console.log(title);
  console.log(`cwd: ${result.cwd}`);
  console.log("learnedRules:");
  for (const rule of result.learnedRules) {
    console.log(`  - ${rule}`);
  }
  console.log("learnings:");
  for (const line of result.learnings.trim().split("\n")) {
    console.log(`  ${line}`);
  }
  console.log("");
}

const compactResult = await runScenario("session_before_compact");
const shutdownResult = await runScenario("session_shutdown");

printScenario("Session Before Compact", compactResult);
printScenario("Session Shutdown", shutdownResult);