import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  ".pi",
  "extensions",
  "vazir-context",
  "index.ts",
);
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

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

function writeCompletedStory(cwd: string, number: number, lastAccessed: string, completed: string): string {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(
    filePath,
    [
      `# Story ${String(number).padStart(3, "0")}: Example`,
      "",
      "**Status:** complete  ",
      "**Created:** 2026-04-01  ",
      `**Last accessed:** ${lastAccessed}  `,
      `**Completed:** ${completed}`,
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
      async input() {
        return undefined;
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

const cwd = createProject("vazir-review-loop-");
writeCompletedStory(cwd, 2, "2026-04-03", "2026-04-04");
writeCompletedStory(cwd, 3, "2026-04-02", "2026-04-05");
const notifications: Notification[] = [];
const selectCalls: SelectCall[] = [];
const harness = makePi();
const ctx = makeCtx(cwd, notifications, {
  hasUI: true,
  selectResponses: ["Specific story", "Completed 2026-04-05 — story-003", "Not yet, keep working"],
  selectCalls,
});

await harness.review.handler("", ctx);

const reviewDir = path.join(cwd, ".context", "reviews");
const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
assert(reviewFiles.length === 1, "review command did not create a detailed review file");
assert(harness.sentMessages.length === 1, "review command did not send a follow-up review instruction");
assert(selectCalls.some(call => call.prompt.includes("What scope should this review cover?")), "review command did not prompt for scope");
assert(selectCalls.some(call => call.prompt.includes("Which story should this review cover?")), "review command did not prompt for a specific story");

const storyPickerCall = selectCalls.find(call => call.prompt.includes("Which story should this review cover?"));
assert(Boolean(storyPickerCall), "story picker call was not captured");
assert(
  JSON.stringify(storyPickerCall?.options ?? []) === JSON.stringify([
    "In-progress story — story-001",
    "Completed 2026-04-05 — story-003",
    "Completed 2026-04-04 — story-002",
    "Cancel",
  ]),
  "story picker did not order in-progress stories first and completed stories by most recent completion date",
);

const createdReviewPath = path.join(reviewDir, reviewFiles[0]);
const createdReview = fs.readFileSync(createdReviewPath, "utf-8");

assert(createdReview.includes("**Status:** in-progress"), "new review files should start in-progress");
assert(createdReview.includes("**Scope:** story"), "story-scoped reviews should record their scope");
assert(createdReview.includes("**Story:** story-003"), "new review files should reference the selected story");
assert(createdReview.includes("## Checklist"), "new review files should include a checklist section");
assert(createdReview.includes("Check for dead code, duplication, and simplification opportunities"), "new review files should include simplification and dead-code checks");
assert(createdReview.includes("## Recommended Fixes"), "new review files should include a recommended-fixes checklist section");
assert(createdReview.includes("## Completion Summary"), "new review files should include a completion summary section");
assert(
  harness.sentMessages[0].message.includes("Treat the review file as the source of truth"),
  "review follow-up should instruct the agent to keep the review file updated",
);

fs.writeFileSync(
  createdReviewPath,
  [
    "# Code Review A",
    "",
    "**Status:** complete  ",
    "**Created:** 2026-04-05T00:00:00Z  ",
    "**Completed:** 2026-04-06  ",
    "**Scope:** story  ",
    "**Story:** story-003  ",
    "**Focus:** story-003 and direct integration points  ",
    "**Trigger:** manual",
    "",
    "---",
    "",
    "## Goal",
    "Review the selected story for regressions.",
    "",
    "## Checklist",
    "- [x] Inspect the relevant diff and touched files",
    "- [x] Check for bugs, regressions, and edge cases",
    "- [x] Check tests and verification gaps",
    "- [x] Capture reusable rule candidates where warranted",
    "- [x] Write the completion summary and mark the review complete",
    "",
    "---",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: critical",
    "- Category: bug",
    "- Summary: manual review found a blocking regression",
    "- Evidence: the selected story still depends on the removed helper",
    "- Recommendation: restore the helper or update the call site",
    "- Rule candidate: do not remove helpers that still have live call sites",
    "",
    "### Finding 2",
    "- Severity: medium",
    "- Category: simplification",
    "- Summary: redundant branching can be collapsed",
    "- Evidence: two branches share the same write path",
    "- Recommendation: extract the shared logic into one helper",
    "- Rule candidate: collapse duplicated write paths during cleanup",
    "",
    "---",
    "",
    "## Recommended Fixes",
    "- [ ] critical — Restore the removed helper or update its call site",
    "- [ ] medium — Collapse the duplicated write path into one helper",
    "",
    "---",
    "",
    "## Completion Summary",
    "Manual review completed.",
    "",
  ].join("\n"),
);

await harness.emit("agent_end", {}, ctx);

assert(selectCalls.some(call => call.options.includes("Open review document")), "manual review should let the user open the review document after completion");
assert(selectCalls.some(call => call.options.includes("Keep story open and fix high-priority recommended items")), "manual review should offer the same high-priority remediation choice after completion");
assert(selectCalls.some(call => call.options.includes("Close story now (remaining items noted)")), "manual review should offer the same close option after completion");
assert(selectCalls.some(call => call.options.includes("Not yet, keep working")), "manual review should let the user keep working after review completion");
assert(selectCalls.some(call => call.prompt.includes("Pending recommended fixes: 1 high-priority, 1 other.")), "manual review should summarize tracked review remediation items");
assert(
  harness.sentMessages[0].message.includes("Do not change story status"),
  "review follow-up should keep story completion user-controlled",
);
assert(
  harness.sentMessages[0].message.includes("Add or update one checklist item per finding in `## Recommended Fixes`"),
  "review follow-up should require checklist tracking for recommended fixes",
);
assert(
  harness.sentMessages[0].message.includes("**Status:** complete"),
  "review follow-up should instruct the agent to complete the review file",
);
assert(
  harness.sentMessages[0].message.includes("Review scope: story-003 and its direct integration points."),
  "review follow-up should describe the selected story scope",
);

const comprehensiveCwd = createProject("vazir-review-codebase-");
const comprehensiveNotifications: Notification[] = [];
const comprehensiveSelectCalls: SelectCall[] = [];
const comprehensiveHarness = makePi();
const comprehensiveCtx = makeCtx(comprehensiveCwd, comprehensiveNotifications, {
  hasUI: true,
  selectResponses: ["Whole codebase"],
  selectCalls: comprehensiveSelectCalls,
});

await comprehensiveHarness.review.handler("", comprehensiveCtx);

const comprehensiveReviewDir = path.join(comprehensiveCwd, ".context", "reviews");
const comprehensiveFiles = fs.readdirSync(comprehensiveReviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
assert(comprehensiveFiles.length === 1, "whole-codebase review did not create a review file");
assert(comprehensiveSelectCalls.some(call => call.prompt.includes("What scope should this review cover?")), "whole-codebase review did not prompt for scope");

const comprehensiveReview = fs.readFileSync(path.join(comprehensiveReviewDir, comprehensiveFiles[0]), "utf-8");
assert(comprehensiveReview.includes("**Scope:** whole-codebase"), "whole-codebase reviews should record their scope");
assert(comprehensiveReview.includes("**Story:** —"), "whole-codebase reviews should not attach to a story");
assert(comprehensiveReview.includes("**Focus:** whole codebase review"), "whole-codebase reviews should default to a comprehensive focus");
assert(
  comprehensiveHarness.sentMessages[0].message.includes("Review scope: whole codebase."),
  "whole-codebase review follow-up should describe the comprehensive scope",
);

const noActiveStoryCwd = createProject("vazir-review-no-active-");
fs.unlinkSync(path.join(noActiveStoryCwd, ".context", "stories", "story-001.md"));
writeCompletedStory(noActiveStoryCwd, 1, "2026-04-05", "2026-04-05");
writeCompletedStory(noActiveStoryCwd, 3, "2026-04-06", "2026-04-06");
const noActiveNotifications: Notification[] = [];
const noActiveSelectCalls: SelectCall[] = [];
const noActiveHarness = makePi();
const noActiveCtx = makeCtx(noActiveStoryCwd, noActiveNotifications, {
  hasUI: true,
  selectResponses: ["Specific story", "Completed 2026-04-06 — story-003"],
  selectCalls: noActiveSelectCalls,
});

await noActiveHarness.review.handler("", noActiveCtx);

const noActiveReviewDir = path.join(noActiveStoryCwd, ".context", "reviews");
const noActiveReviewFiles = fs.readdirSync(noActiveReviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();

assert(
  noActiveSelectCalls.some(call => call.prompt.includes("Which story should this review cover?")),
  "manual review should allow selecting a completed story when no in-progress story exists",
);
assert(noActiveReviewFiles.length === 1, "completed-story selection should still create a review file");
assert(
  fs.readFileSync(path.join(noActiveReviewDir, noActiveReviewFiles[0]), "utf-8").includes("**Story:** story-003"),
  "completed-story selection should attach the selected story to the review file",
);

fs.writeFileSync(
  createdReviewPath,
  [
    "# Code Review A",
    "",
    "**Status:** complete  ",
    "**Created:** 2026-04-05T00:00:00Z  ",
    "**Completed:** 2026-04-05  ",
    "**Scope:** story  ",
    "**Story:** story-001  ",
    "**Focus:** story-001 and recent changes  ",
    "**Trigger:** manual",
    "",
    "---",
    "",
    "## Goal",
    "Review the auth flow for regressions.",
    "",
    "## Checklist",
    "- [x] Inspect the relevant diff and touched files",
    "- [x] Check for bugs, regressions, and edge cases",
    "- [x] Check tests and verification gaps",
    "- [x] Capture reusable rule candidates where warranted",
    "- [x] Write the completion summary and mark the review complete",
    "",
    "---",
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
    "---",
    "",
    "## Recommended Fixes",
    "- [x] medium — Update auth helper imports when renaming helpers",
    "",
    "---",
    "",
    "## Completion Summary",
    "One regression found and documented.",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(reviewDir, "review-manual-second.md"),
  [
    "# Code Review B",
    "",
    "**Status:** complete  ",
    "**Created:** 2026-04-05T00:10:00Z  ",
    "**Completed:** 2026-04-05  ",
    "**Scope:** story  ",
    "**Story:** story-001  ",
    "**Focus:** story-001 and recent changes  ",
    "**Trigger:** manual",
    "",
    "---",
    "",
    "## Goal",
    "Review auth changes a second time.",
    "",
    "## Checklist",
    "- [x] Inspect the relevant diff and touched files",
    "- [x] Check for bugs, regressions, and edge cases",
    "- [x] Check tests and verification gaps",
    "- [x] Capture reusable rule candidates where warranted",
    "- [x] Write the completion summary and mark the review complete",
    "",
    "---",
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
    "---",
    "",
    "## Recommended Fixes",
    "- [x] high — Include import updates in auth helper rename refactors",
    "",
    "---",
    "",
    "## Completion Summary",
    "Second review confirmed the same regression pattern.",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(reviewDir, "review-open.md"),
  [
    "# Code Review C",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-04-05T00:20:00Z  ",
    "**Completed:** —  ",
    "**Scope:** story  ",
    "**Story:** story-001  ",
    "**Focus:** story-001 and recent changes  ",
    "**Trigger:** manual",
    "",
    "---",
    "",
    "## Goal",
    "Draft a review without finishing it.",
    "",
    "## Checklist",
    "- [x] Inspect the relevant diff and touched files",
    "- [ ] Check for bugs, regressions, and edge cases",
    "- [ ] Check tests and verification gaps",
    "- [ ] Capture reusable rule candidates where warranted",
    "- [ ] Write the completion summary and mark the review complete",
    "",
    "---",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: low",
    "- Category: workflow",
    "- Summary: draft finding should not be promoted yet",
    "- Evidence: review still in progress",
    "- Recommendation: only summarize completed reviews",
    "- Rule candidate: draft reviews should not affect learned rules until complete",
    "",
    "---",
    "",
    "## Recommended Fixes",
    "- [ ] low — Delay summary promotion until the review is complete",
    "",
    "---",
    "",
    "## Completion Summary",
    "Pending.",
    "",
  ].join("\n"),
);

await harness.emit("agent_end", {}, ctx);

const summary = fs.readFileSync(path.join(reviewDir, "summary.md"), "utf-8");
const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");

assert(summary.includes("do not rename auth helpers during refactors without updating call sites | count: 2 | status: promoted"), "summary did not promote the repeated review finding");
assert(!summary.includes("draft reviews should not affect learned rules until complete"), "in-progress reviews should not feed the summary");
assert(systemMd.includes("- do not rename auth helpers during refactors without updating call sites"), "system.md did not receive the promoted review rule");
assert(!systemMd.includes("- draft reviews should not affect learned rules until complete"), "in-progress reviews should not promote learned rules");
assert(notifications.some(note => note.message.includes("Promoted review rule")), "agent_end did not notify about promoted review rules");

console.log("Review loop validation");
console.log(`cwd: ${cwd}`);
console.log("reviewFiles:");
for (const file of reviewFiles) {
  console.log(`  - ${file}`);
}
console.log(`wholeCodebaseCwd: ${comprehensiveCwd}`);
console.log("wholeCodebaseReviewFiles:");
for (const file of comprehensiveFiles) {
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