import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const closeoutModule = await loadFileModule<{
  createCompleteStoryController: (deps: any) => {
    handleCommand: (ctx: any) => Promise<void>;
    handleTurnEnd: (ctx: any) => Promise<boolean>;
    handleAgentEnd: (ctx: any) => Promise<boolean>;
  };
  enterCompleteStoryReview: (pending: Map<string, any>, cwd: string, storyFile: string, reviewFile: string) => any;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-context", "complete-story.ts"));

const helperModule = await loadFileModule<{
  reviewFileHash: (filePath: string) => string;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-context", "helpers.ts"));

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
      "Done.",
      "",
    ].join("\n"),
  );
  return cwd;
}

function writeCompleteReview(reviewPath: string): void {
  fs.writeFileSync(
    reviewPath,
    [
      "# Review 2026-04-01",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-04-01T00:00:00Z  ",
      "**Completed:** 2026-04-01  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "**Focus:** Example review  ",
      "**Trigger:** complete-story",
      "",
      "---",
      "",
      "## Goal",
      "Review story-001 before closeout.",
      "",
      "---",
      "",
      "## Checklist",
      "- [x] Inspect the relevant diff and touched files",
      "- [x] Write the completion summary and mark the review complete",
      "",
      "---",
      "",
      "## Findings",
      "No findings.",
      "",
      "---",
      "",
      "## Fallow Findings",
      "- No Fallow findings.",
      "",
      "---",
      "",
      "## Recommended Fixes",
      "- [x] No follow-up fixes required.",
      "",
      "---",
      "",
      "## Other Fixes",
      "- None.",
      "",
      "---",
      "",
      "## Completion Summary",
      "Review complete.",
      "",
    ].join("\n"),
  );
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
  const selectCalls: SelectCall[] = [];
  const turnEndCtx = makeCtx(cwd, notifications, [], selectCalls);
  const agentEndSelectCalls: SelectCall[] = [];
  const agentEndCtx = makeCtx(cwd, notifications, [], agentEndSelectCalls);

  const controller = closeoutModule.createCompleteStoryController({
    pendingRequests: pending,
    sendInternalAgentMessage() {},
    async startReviewFlow() {
      throw new Error("active-review suppression scenario should not start a new review");
    },
  });

  // 1. First turn boundary: review file exists and is observed for the first time.
  await controller.handleTurnEnd(turnEndCtx);
  await controller.handleAgentEnd(agentEndCtx);
  assert(selectCalls.length === 0, "first turn boundary should not show the in-progress review prompt");
  assert(agentEndSelectCalls.length === 0, "agent_end should not show the in-progress review prompt");

  // 2. Second turn boundary: review file is unchanged. The user should not be interrupted.
  await controller.handleTurnEnd(turnEndCtx);
  await controller.handleAgentEnd(agentEndCtx);
  assert(selectCalls.length === 0, "unchanged in-progress review should not show the in-progress prompt");
  assert(agentEndSelectCalls.length === 0, "agent_end should stay prompt-free for in-progress reviews");

  // 3. Third turn boundary: review file is edited (active progress). No prompt.
  fs.appendFileSync(reviewPath, "\n<!-- agent progress -->\n");
  await controller.handleTurnEnd(turnEndCtx);
  await controller.handleAgentEnd(agentEndCtx);
  assert(selectCalls.length === 0, "active review progress should not show the in-progress prompt");
  assert(agentEndSelectCalls.length === 0, "agent_end should stay prompt-free after active progress");
}

async function runCommandResumeScenario(): Promise<void> {
  const cwd = createProject("vazir-active-review-command-resume-");
  const storyPath = path.join(cwd, ".context", "stories", "story-001.md");
  const reviewPath = path.join(cwd, ".context", "reviews", "review-001.md");
  writeInProgressReview(reviewPath);

  const pending = new Map<string, any>();
  closeoutModule.enterCompleteStoryReview(pending, cwd, storyPath, reviewPath);

  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const ctx = makeCtx(cwd, notifications, [], selectCalls);
  const controller = closeoutModule.createCompleteStoryController({
    pendingRequests: pending,
    sendInternalAgentMessage() {},
    async startReviewFlow() {
      throw new Error("command-resume scenario should not start a new review");
    },
  });

  await controller.handleCommand(ctx);
  assert(selectCalls.length === 0, "explicit /complete-story resume should not show the in-progress prompt");
  assert(
    notifications.some(note => note.message.includes("review is still in progress")),
    "command resume should notify the user that the review is still in progress",
  );
}

async function runCompletedSuspendedReviewResumeScenario(): Promise<void> {
  const cwd = createProject("vazir-active-review-completed-suspended-");
  const storyPath = path.join(cwd, ".context", "stories", "story-001.md");
  const reviewPath = path.join(cwd, ".context", "reviews", "review-001.md");
  writeCompleteReview(reviewPath);

  const closeoutStatePath = path.join(cwd, ".context", "reviews", "story-001-complete-story-closeout.json");
  const currentHash = helperModule.reviewFileHash(reviewPath);

  for (const testHash of ["deadbeef", currentHash]) {
    fs.writeFileSync(
      closeoutStatePath,
      JSON.stringify(
        {
          storyFile: storyPath,
          reviewFile: reviewPath,
          reviewCloseoutReady: false,
          reviewRepairAttempts: 0,
          reviewSuspended: true,
          reviewFileHash: testHash,
        },
        null,
        2,
      ),
    );

    const pending = new Map<string, any>();
    const notifications: Notification[] = [];
    const selectCalls: SelectCall[] = [];
    const ctx = makeCtx(cwd, notifications, [], selectCalls);
    const controller = closeoutModule.createCompleteStoryController({
      pendingRequests: pending,
      sendInternalAgentMessage() {},
      async startReviewFlow() {
        throw new Error("completed-suspended scenario should not start a new review");
      },
    });

    await controller.handleCommand(ctx);
    assert(selectCalls.length === 1, `explicit /complete-story should resume a completed but suspended review (hash=${testHash})`);
    assert(
      selectCalls[0].options.includes("Close story now"),
      `resumed closeout should offer the close-story option (hash=${testHash})`,
    );
  }
}

console.log("Active review suppression validation");
await runScenario();
await runCommandResumeScenario();
await runCompletedSuspendedReviewResumeScenario();
console.log("Active review suppression validation passed");

cleanupStubModules(stubModuleDirs);
