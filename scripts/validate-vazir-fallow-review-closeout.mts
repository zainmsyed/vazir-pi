import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "complaints-log.md"), "# Complaints Log\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n- Follow existing project conventions.\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "index.md"), "# File Index\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "context-map.md"), "# Context Map\n\n- Project: Test\n");
  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001.md"), [
    "# Story 001: Example",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-05-16  ",
    "**Last accessed:** 2026-05-16  ",
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
    "- —",
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
  ].join("\n"));
  return cwd;
}

function makePi() {
  const harness = createPiHarness([register]);
  const review = harness.getCommand("review");
  const completeStory = harness.getCommand("complete-story");
  assert(Boolean(review), "review command was not registered");
  assert(Boolean(completeStory), "complete-story command was not registered");

  return {
    review: review!,
    completeStory: completeStory!,
    sentInternalMessages: harness.sentInternalMessages,
    async emit(name: string, event: any, ctx: any) {
      await harness.emit(name, event, ctx);
    },
  };
}

function makeCtx(
  cwd: string,
  notifications: Notification[],
  options: { hasUI?: boolean; selectResponses?: string[]; selectCalls?: SelectCall[] } = {},
) {
  const { hasUI = true, selectResponses = [], selectCalls = [] } = options;
  let selectIndex = 0;

  return {
    cwd,
    hasUI,
    isIdle() {
      return true;
    },
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async input() {
        return undefined;
      },
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        const response = selectResponses[selectIndex];
        selectIndex += 1;
        return response;
      },
      async custom() {
        throw new Error("custom viewer should not be needed in fallow wiring validation");
      },
    },
  };
}

function writeCompletedReview(reviewPath: string, trigger: "manual" | "complete-story", finding: string): void {
  fs.writeFileSync(reviewPath, [
    "# Code Review",
    "",
    "**Status:** complete  ",
    "**Created:** 2026-05-16T12:30:00Z  ",
    "**Completed:** 2026-05-16  ",
    "**Scope:** story  ",
    "**Story:** story-001  ",
    "**Focus:** story-001 closeout validation  ",
    `**Trigger:** ${trigger}`,
    "",
    "---",
    "",
    "## Goal",
    "Validate fallow review closeout wiring.",
    "",
    "## Checklist",
    "- [x] Inspect fallow closeout wiring",
    "- [x] Write completion summary and mark review complete",
    "",
    "---",
    "",
    "## Findings",
    "No findings.",
    "",
    "## Fallow Findings",
    `- ${finding}`,
    "",
    "## Recommended Fixes",
    "- [x] No follow-up fixes required.",
    "",
    "## Completion Summary",
    "Validated review closeout behavior.",
    "",
  ].join("\n"));
}

function fallowEntryCount(cwd: string, needle: string): number {
  return fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8")
    .split("\n")
    .filter((line: string) => line.includes("[fallow]") && line.includes(needle))
    .length;
}

async function runManualReviewScenario() {
  const cwd = createProject("vazir-fallow-manual-review-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    selectResponses: [
      "Specific story",
      "In-progress story — story-001",
      "Not yet, keep working",
      "Not yet, keep working",
    ],
    selectCalls,
  });
  const finding = "unused-export: src/utils/formatDate.ts:14 | toRelativeTime never imported";

  await harness.review.handler("", ctx);

  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(reviewFiles.length === 1, "manual review scenario should create one review file");

  const reviewPath = path.join(reviewDir, reviewFiles[0]);
  writeCompletedReview(reviewPath, "manual", finding);

  await harness.emit("turn_end", {}, ctx);
  let log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
  assert(log.includes("[fallow] unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported | status: noted"), "manual review closeout should append fallow findings to complaints-log.md");
  assert(fallowEntryCount(cwd, "unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported") === 1, "manual review closeout should only record one fallow entry for the story");

  await harness.emit("turn_end", {}, ctx);
  log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
  assert(fallowEntryCount(cwd, "unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported") === 1, "manual review closeout should not duplicate same-story fallow entries on resume");

  return { cwd, notifications, selectCalls, log };
}

async function runCompleteStoryReviewScenario() {
  const cwd = createProject("vazir-fallow-complete-story-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    selectResponses: [
      "Start code review before closing",
      "Not yet, keep working",
      "Not yet, keep working",
    ],
    selectCalls,
  });
  const finding = "unused-export: src/lib/worker.ts:7 | runTask never imported";

  await harness.completeStory.handler("", ctx);

  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(reviewFiles.length === 1, "complete-story review scenario should create one review file");

  const reviewPath = path.join(reviewDir, reviewFiles[0]);
  writeCompletedReview(reviewPath, "complete-story", finding);

  await harness.emit("turn_end", {}, ctx);
  let log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
  assert(log.includes("[fallow] unused-export: src/lib/worker.ts:7 / runTask never imported | status: noted"), "complete-story review closeout should append fallow findings to complaints-log.md");
  assert(fallowEntryCount(cwd, "unused-export: src/lib/worker.ts:7 / runTask never imported") === 1, "complete-story review closeout should only record one fallow entry for the story");
  assert(fs.readFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "utf-8").includes("**Status:** in-progress"), "complete-story review closeout should keep the story open when user selects not yet");

  await harness.emit("turn_end", {}, ctx);
  log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
  assert(fallowEntryCount(cwd, "unused-export: src/lib/worker.ts:7 / runTask never imported") === 1, "complete-story review closeout should not duplicate same-story fallow entries on resume");

  return { cwd, notifications, selectCalls, log };
}

try {
  const manual = await runManualReviewScenario();
  const completeStory = await runCompleteStoryReviewScenario();

  console.log("Manual Review Fallow Closeout");
  console.log(`cwd: ${manual.cwd}`);
  console.log(manual.log.trim());
  console.log("Complete-Story Review Fallow Closeout");
  console.log(`cwd: ${completeStory.cwd}`);
  console.log(completeStory.log.trim());
} finally {
  cleanupStubModules(stubModuleDirs);
}
