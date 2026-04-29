import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => ({
  json: async () => ({
    content: [
      {
        text: [
          "## Learned Rules",
          "- avoid renaming auth helpers",
          "- keep checkpoint labels human readable",
          "",
        ].join("\n"),
      },
    ],
  }),
})) as unknown as typeof globalThis.fetch;

process.env.ANTHROPIC_API_KEY = "test-key";

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };

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
      [
        "---",
        "2026-03-22T12:00:00.000Z",
        "avoid renaming auth helpers",
        "---",
        "2026-03-22T12:01:00.000Z",
        "keep checkpoint labels human readable",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(cwd, ".context", "learnings", "pending.md"),
      [
        "---",
        "2026-03-22T12:00:00.000Z",
        "avoid renaming auth helpers",
        "---",
        "2026-03-22T12:01:00.000Z",
        "keep checkpoint labels human readable",
        "",
      ].join("\n"),
    );
  return cwd;
}

function makePi() {
  const harness = createPiHarness([register]);

  return {
    async emit(name: string, event: any, ctx: any) {
      await harness.emit(name, event, ctx);
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
  const lines = systemMd.split("\n");
  const headingIndex = lines.findIndex(line => line.trim() === "## Learned Rules");
  assert(headingIndex >= 0, "system.md is missing the Learned Rules section");

  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s/.test(lines[index].trim())) {
      sectionEnd = index;
      break;
    }
  }

  return lines
    .slice(headingIndex + 1, sectionEnd)
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
  const pending = fs.readFileSync(path.join(cwd, ".context", "learnings", "pending.md"), "utf-8");

  assert(learnedRules.length === 2, `${eventName} did not dedupe learned rules`);
  assert(learnedRules[0] === "avoid renaming auth helpers", `${eventName} changed the first learned rule unexpectedly`);
  assert(learnedRules[1] === "keep checkpoint labels human readable", `${eventName} changed the second learned rule unexpectedly`);
  assert(learnings.includes("avoid renaming auth helpers"), `${eventName} should not modify code-review.md`);
  assert(pending.trim() === "", `${eventName} should clear pending.md after consolidation`);
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

globalThis.fetch = originalFetch;