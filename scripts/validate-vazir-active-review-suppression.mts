import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const closeoutModule = await loadFileModule<{
  createCompleteStoryController: (deps: any) => { handleTurnEnd: (ctx: any) => Promise<boolean>; handleAgentEnd: (ctx: any) => Promise<boolean> };
  enterCompleteStoryReview: (pending: Map<string, any>, cwd: string, storyFile: string, reviewFile: string) => any;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-context", "complete-story.ts"));

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    ["# System Rules", "", "## Rules", "- Follow existing project conventions.", "", "## Learned Rules", ""].join("\n"),
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
      "- [x] Example task",
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

function writeInProgressReview(reviewPath: string): void {
  fs.writeFileSync(
    reviewPath,
    [
      "# Review 2026-04-01",
      "",
      "**Status:** in-progress  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "**Focus:** Example review  ",
      "**Trigger:** complete-story",
      "",
      "---",
      "",
      "## Findings",
      "",
      "### Finding 1",
      "- **Severity:** medium  ",
      "- **Category:** bug  ",
      "- **Summary:** Example finding.",
      "",
      "---",
      "",
      "## Recommended Fixes",
      "- [ ] medium — Example fix.",
      "",
      "---",
      "",
      "## Other Fixes",
      "",
      "---",
      "",
      "## Completion Summary",
      "Still in progress.",
      "",
    ].join("\n"),
  );
}

function makeCtx(cwd: string, notifications: Notification[], selectResponses: string[], selectCalls: SelectCall[]) {
  let selectIndex = 0;
  return {
    cwd,
    hasUI: true,
    hasPendingMessages() {
      return false;
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
      async custom() {
        return undefined;
      },
    },
  };
}

async function runScenario(): Promise<void> {
  const cwd = createProject("vazir-active-review-suppression-");
  const storyPath = path.join(cwd, ".context", "stories", "story-001.md");
  const reviewPath = path.join(cwd, ".context", "reviews", "review-001.md");
  writeInProgressReview(reviewPath);

  const pending = new Map<string, any>();
  closeoutModule.enterCompleteStoryReview(pending, cwd, storyPath, reviewPath);

  const notifications: Notification[] = [];
  const selectResponses = ["Keep story open and stay in review", "Keep story open and stay in review"];
  const selectCalls: SelectCall[] = [];
  const ctx = makeCtx(cwd, notifications, selectResponses, selectCalls);

  const controller = closeoutModule.createCompleteStoryController({
    pendingRequests: pending,
    sendInternalAgentMessage() {},
    async startReviewFlow() {
      throw new Error("active-review suppression scenario should not start a new review");
    },
  });

  // 1. First turn boundary: review file exists and is observed for the first time.
  //    The agent is considered active, so no prompt should appear.
  await controller.handleTurnEnd(ctx);
  await controller.handleAgentEnd(ctx);
  assert(selectCalls.length === 0, "first turn boundary should suppress the in-progress review prompt");

  // 2. Second turn boundary: review file is unchanged, so the stalled fallback prompt appears.
  await controller.handleTurnEnd(ctx);
  await controller.handleAgentEnd(ctx);
  assert(selectCalls.length === 1, "stalled review should prompt once");
  assert(selectCalls[0].prompt.includes("still marked in progress"), "stalled review prompt should explain why fix/close choices are unavailable");
  assert(selectCalls[0].options.includes("Keep story open and stay in review"), "stalled review prompt should offer keep-open-and-stay option");

  // 3. Third turn boundary: suspended and still unchanged, so re-prompting stays suppressed.
  selectCalls.length = 0;
  await controller.handleTurnEnd(ctx);
  await controller.handleAgentEnd(ctx);
  assert(selectCalls.length === 0, "suspended review should not re-prompt while the file is unchanged");

  // 4. Agent makes progress: edit the review file, then emit a turn boundary.
  //    Suspension should clear and the prompt should be suppressed again.
  fs.appendFileSync(reviewPath, "\n<!-- agent progress -->\n");
  await controller.handleTurnEnd(ctx);
  await controller.handleAgentEnd(ctx);
  assert(selectCalls.length === 0, "review should stay suppressed after the file changes while active");

  // 5. Fifth turn boundary: file unchanged again, so the stalled fallback prompt reappears.
  await controller.handleTurnEnd(ctx);
  await controller.handleAgentEnd(ctx);
  assert(selectCalls.length === 1, "review should prompt again after stalling following an active change");
}

console.log("Active review suppression validation");
await runScenario();
console.log("Active review suppression validation passed");

cleanupStubModules(stubModuleDirs);
