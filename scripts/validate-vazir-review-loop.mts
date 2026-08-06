import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, loadFileModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const closeoutModule = await loadFileModule<{
  deriveCompleteStoryPhase: (input: { pendingRequest?: any; readinessBlocked?: boolean; reviewStatus?: string | null }) => { phase: string };
  resetReviewFileForRemediation: (reviewFile: string) => void;
}> (path.join(repoRoot, ".pi", "extensions", "vazir-context", "complete-story.ts"));
const helperModule = await loadFileModule<{
  validateReviewDocument: (filePath: string) => { valid: boolean; issues: Array<{ code: string; message: string }> };
  repairReviewDocument: (filePath: string) => { ok: boolean; repaired: boolean; issues: Array<{ code: string; message: string }> };
  reviewFileHash: (filePath: string) => string;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-context", "helpers.ts"));
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

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
  const harness = createPiHarness([register]);
  const review = harness.getCommand("review");
  assert(Boolean(review), "review command was not registered");
  const completeStory = harness.getCommand("complete-story");
  assert(Boolean(completeStory), "complete-story command was not registered");

  return {
    review: review!,
    completeStory: completeStory!,
    sentMessages: harness.sentMessages,
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
  const { hasUI = false, selectResponses = [], selectCalls = [] } = options;
  let selectIndex = 0;

  return {
    cwd,
    hasUI,
    hasPendingMessages() {
      return false;
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
    },
  };
}

function runCloseoutHelperAssertions(): void {
  assert(
    closeoutModule.deriveCompleteStoryPhase({ pendingRequest: { storyFile: "story-001.md", reviewFile: "review.md", reviewCloseoutReady: true }, reviewStatus: "in-progress" }).phase === "review-closeout",
    "closeout helper should let explicit closeout readiness resume even before the review file is re-read as complete",
  );

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-review-helper-"));
  const reviewPath = path.join(cwd, "review.md");
  fs.writeFileSync(reviewPath, "**Status:** complete\n**Completed:** 2026-04-08\n");
  closeoutModule.resetReviewFileForRemediation(reviewPath);
  const review = fs.readFileSync(reviewPath, "utf-8");
  assert(review.includes("**Status:** in-progress"), "closeout helper should reopen review files for remediation");
  assert(review.includes("**Completed:** —"), "closeout helper should clear the completed date when reopening review files");
}

try {
runCloseoutHelperAssertions();
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
assert(createdReview.includes("**Static analysis:** not run (fallow unavailable)"), "new review files should record when Fallow is unavailable");
assert(createdReview.includes("## Checklist"), "new review files should include a checklist section");
assert(createdReview.includes("Check for dead code, duplication, and simplification opportunities"), "new review files should include simplification and dead-code checks");
assert(createdReview.includes("## Recommended Fixes"), "new review files should include a recommended-fixes checklist section");
assert(createdReview.includes("## Completion Summary"), "new review files should include a completion summary section");
assert(
  harness.sentMessages[0].message.includes("Treat the review file as the source of truth"),
  "review follow-up should instruct the agent to keep the review file updated",
);
assert(
  !harness.sentMessages[0].message.includes("## Static Analysis Findings (Fallow)"),
  "review follow-up should stay LLM-only when Fallow is unavailable",
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

await harness.emit("turn_end", {}, ctx);
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

const repeatNotifications: Notification[] = [];
const repeatHarness = makePi();
const repeatCtx = makeCtx(cwd, repeatNotifications);

await repeatHarness.review.handler("", repeatCtx);

const repeatReviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
assert(repeatReviewFiles.length === 2, "running /review twice should create two review files");
assert(repeatReviewFiles[0] !== repeatReviewFiles[1], "running /review twice should not overwrite the first review file");
assert(repeatHarness.sentMessages.length === 1, "running /review twice should send a second review instruction");

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

async function runMalformedReviewScenarios(): Promise<void> {
  // 1. Deterministic validation catches missing frontmatter and sections
  const validationCwd = createProject("vazir-review-validate-");
  const malformedPath = path.join(validationCwd, ".context", "reviews", "review-malformed.md");
  fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
  fs.writeFileSync(
    malformedPath,
    [
      "# Bad Review",
      "",
      "**Status:** in-progress  ",
      "**Scope:** story",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: high",
      "- Category: bug",
      "- Summary: preserved finding",
      "- Evidence: still here",
      "- Recommendation: keep it",
      "- Rule candidate: —",
      "",
      "## Recommended Fixes",
      "- [ ] high — preserved fix item",
      "",
    ].join("\n"),
  );

  const validation = helperModule.validateReviewDocument(malformedPath);
  assert(!validation.valid, "validator should reject malformed review");
  assert(validation.issues.some(i => i.code === "missing-frontmatter-key"), "validator should report missing frontmatter keys");
  assert(validation.issues.some(i => i.code === "missing-section"), "validator should report missing sections");

  // 2. Deterministic repair preserves findings and checklist state
  const repair = helperModule.repairReviewDocument(malformedPath);
  assert(repair.ok, "repair should produce a valid document");
  assert(repair.repaired, "repair should report that it changed the file");

  const repaired = fs.readFileSync(malformedPath, "utf-8");
  assert(repaired.includes("**Status:** in-progress"), "repair should keep status in-progress");
  assert(repaired.includes("**Created:**"), "repair should add Created frontmatter");
  assert(repaired.includes("**Completed:** —"), "repair should add Completed frontmatter");
  assert(repaired.includes("**Story:** —"), "repair should add Story frontmatter");
  assert(repaired.includes("**Focus:**"), "repair should add Focus frontmatter");
  assert(/\*\*Trigger:\*\*/.test(repaired), "repair should add Trigger frontmatter");
  assert(repaired.includes("## Goal"), "repair should add Goal section");
  assert(repaired.includes("## Checklist"), "repair should add Checklist section");
  assert(repaired.includes("## Fallow Findings"), "repair should add Fallow Findings section");
  assert(repaired.includes("## Other Fixes"), "repair should add Other Fixes section");
  assert(repaired.includes("## Completion Summary"), "repair should add Completion Summary section");
  assert(repaired.includes("preserved finding"), "repair should preserve existing findings");
  assert(repaired.includes("preserved fix item"), "repair should preserve existing recommended fixes");

  const revalidation = helperModule.validateReviewDocument(malformedPath);
  assert(revalidation.valid, "repaired document should pass validation");

  // 3. Complete-story closeout with malformed review: repair then suspend on Escape
  const escapeCwd = createProject("vazir-review-escape-");
  writeCompletedStory(escapeCwd, 1, "2026-04-05", "2026-04-05");
  const escapeReviewDir = path.join(escapeCwd, ".context", "reviews");
  const escapeReviewPath = path.join(escapeReviewDir, "review-escape.md");
  fs.mkdirSync(escapeReviewDir, { recursive: true });
  fs.writeFileSync(
    escapeReviewPath,
    [
      "# Escape Review",
      "",
      "**Status:** complete  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: medium",
      "- Category: bug",
      "- Summary: escape test finding",
      "- Evidence: test",
      "- Recommendation: test",
      "- Rule candidate: —",
      "",
      "## Recommended Fixes",
      "- [ ] medium — escape test fix",
      "",
    ].join("\n"),
  );

  const escapeNotifications: Notification[] = [];
  const escapeSelectCalls: SelectCall[] = [];
  const escapeHarness = makePi();
  const escapeCtx = makeCtx(escapeCwd, escapeNotifications, {
    hasUI: true,
    selectResponses: [undefined],
    selectCalls: escapeSelectCalls,
  });

  // Seed the complete-story pending request by directly invoking the controller through a command isn't easy,
  // so we write the persisted closeout state and emit turn_end.
  const closeoutStatePath = path.join(escapeReviewDir, "story-001-complete-story-closeout.json");
  fs.writeFileSync(
    closeoutStatePath,
    JSON.stringify({ storyFile: path.join(escapeCwd, ".context", "stories", "story-001.md"), reviewFile: escapeReviewPath, reviewCloseoutReady: true }, null, 2),
  );

  await escapeHarness.emit("turn_end", {}, escapeCtx);

  assert(helperModule.validateReviewDocument(escapeReviewPath).valid, "turn_end should repair the malformed review before prompting");
  assert(escapeSelectCalls.length > 0, "turn_end should prompt for closeout after repair");
  const escapeWarnings = escapeNotifications.filter(n => n.level === "warning").map(n => n.message);
  assert(
    !escapeWarnings.some(m => m.includes("could not be automatically repaired")),
    `no premature repair-exhaustion warning; got warnings: ${JSON.stringify(escapeWarnings)}`,
  );

  // Second turn_end after Escape must not prompt again because the flow is suspended
  const secondEscapeNotifications: Notification[] = [];
  const secondEscapeSelectCalls: SelectCall[] = [];
  const secondEscapeCtx = makeCtx(escapeCwd, secondEscapeNotifications, {
    hasUI: true,
    selectResponses: [undefined],
    selectCalls: secondEscapeSelectCalls,
  });

  await escapeHarness.emit("turn_end", {}, secondEscapeCtx);
  assert(secondEscapeSelectCalls.length === 0, "subsequent turn_end should not re-prompt after Escape suspension");
  assert(fs.existsSync(closeoutStatePath), "closeout state should persist suspension");
  const suspendedState = JSON.parse(fs.readFileSync(closeoutStatePath, "utf-8"));
  assert(suspendedState.reviewSuspended === true, "persisted closeout state should mark review as suspended");

  // 4. Resume after meaningful file change
  const beforeHash = helperModule.reviewFileHash(escapeReviewPath);
  const currentReview = fs.readFileSync(escapeReviewPath, "utf-8");
  fs.writeFileSync(escapeReviewPath, currentReview + "\n");
  const afterHash = helperModule.reviewFileHash(escapeReviewPath);
  assert(afterHash !== beforeHash, "file change should alter review hash");

  const resumeNotifications: Notification[] = [];
  const resumeSelectCalls: SelectCall[] = [];
  const resumeCtx = makeCtx(escapeCwd, resumeNotifications, {
    hasUI: true,
    selectResponses: [undefined],
    selectCalls: resumeSelectCalls,
  });

  await escapeHarness.emit("turn_end", {}, resumeCtx);
  assert(resumeSelectCalls.length > 0, "turn_end should re-prompt after review file change");

  // 5. Repair exhaustion notifies once and suspends
  const exhaustCwd = createProject("vazir-review-exhaust-");
  writeCompletedStory(exhaustCwd, 1, "2026-04-05", "2026-04-05");
  const exhaustReviewDir = path.join(exhaustCwd, ".context", "reviews");
  const exhaustReviewPath = path.join(exhaustReviewDir, "review-exhaust.md");
  fs.mkdirSync(exhaustReviewDir, { recursive: true });
  fs.writeFileSync(exhaustReviewPath, "# Unrepairable\n\n**Status:** complete\n");

  const exhaustNotifications: Notification[] = [];
  const exhaustSelectCalls: SelectCall[] = [];
  const exhaustHarness = makePi();
  const exhaustCtx = makeCtx(exhaustCwd, exhaustNotifications, {
    hasUI: true,
    selectResponses: [undefined],
    selectCalls: exhaustSelectCalls,
  });

  const exhaustStatePath = path.join(exhaustReviewDir, "story-001-complete-story-closeout.json");
  fs.writeFileSync(
    exhaustStatePath,
    JSON.stringify({
      storyFile: path.join(exhaustCwd, ".context", "stories", "story-001.md"),
      reviewFile: exhaustReviewPath,
      reviewCloseoutReady: true,
      reviewRepairAttempts: 2,
    }, null, 2),
  );

  await exhaustHarness.emit("turn_end", {}, exhaustCtx);
  assert(exhaustNotifications.some(n => n.level === "warning" && n.message.includes("could not be automatically repaired")), "exhausted repair should warn once");
  assert(exhaustSelectCalls.length === 0, "exhausted repair should not prompt");
  const exhaustedState = JSON.parse(fs.readFileSync(exhaustStatePath, "utf-8"));
  assert(exhaustedState.reviewSuspended === true, "exhausted repair should persist suspension");

  // 6. Manual /review restart-resume: a fresh Pi instance should load persisted suspension and skip prompting
  const restartCwd = createProject("vazir-review-restart-");
  const restartReviewDir = path.join(restartCwd, ".context", "reviews");
  fs.mkdirSync(restartReviewDir, { recursive: true });
  const restartReviewPath = path.join(restartReviewDir, "review-restart.md");
  fs.writeFileSync(
    restartReviewPath,
    [
      "# Restart Review",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-04-05T00:00:00Z  ",
      "**Completed:** 2026-04-06  ",
      "**Scope:** whole-codebase  ",
      "**Story:** —  ",
      "**Focus:** restart test  ",
      "**Trigger:** manual",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: low",
      "- Category: simplification",
      "- Summary: restart finding",
      "- Evidence: test",
      "- Recommendation: test",
      "- Rule candidate: —",
      "",
      "## Recommended Fixes",
      "- [x] low — restart fix",
      "",
    ].join("\n"),
  );

  fs.mkdirSync(path.join(restartCwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(
    path.join(restartCwd, ".context", "settings", "manual-review-closeout.json"),
    JSON.stringify({ reviewFile: restartReviewPath, reviewCloseoutReady: false, suspended: true, repairAttempts: 0, reviewFileHash: helperModule.reviewFileHash(restartReviewPath) }, null, 2),
  );

  const restartNotifications: Notification[] = [];
  const restartSelectCalls: SelectCall[] = [];
  const restartHarness = makePi();
  const restartCtx = makeCtx(restartCwd, restartNotifications, {
    hasUI: true,
    selectResponses: [undefined],
    selectCalls: restartSelectCalls,
  });

  await restartHarness.emit("turn_end", {}, restartCtx);
  assert(restartSelectCalls.length === 0, "fresh Pi session should not prompt a suspended manual review");

  // 7. /complete-story handleCommand resumption repairs a malformed persisted review
  const cmdCwd = createProject("vazir-review-cmd-");
  const cmdStoryPath = path.join(cmdCwd, ".context", "stories", "story-001.md");
  fs.writeFileSync(
    cmdStoryPath,
    [
      "# Story 001: Example",
      "",
      "**Status:** in-progress  ",
      "**Created:** 2026-04-01  ",
      "**Last accessed:** 2026-04-05  ",
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
  const cmdReviewDir = path.join(cmdCwd, ".context", "reviews");
  const cmdReviewPath = path.join(cmdReviewDir, "review-cmd.md");
  fs.mkdirSync(cmdReviewDir, { recursive: true });
  fs.writeFileSync(
    cmdReviewPath,
    [
      "# Command Review",
      "",
      "**Status:** complete  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: medium",
      "- Category: bug",
      "- Summary: cmd test finding",
      "- Evidence: test",
      "- Recommendation: test",
      "- Rule candidate: —",
      "",
      "## Recommended Fixes",
      "- [ ] medium — cmd test fix",
      "",
    ].join("\n"),
  );

  const cmdStatePath = path.join(cmdReviewDir, "story-001-complete-story-closeout.json");
  fs.writeFileSync(
    cmdStatePath,
    JSON.stringify({
      storyFile: cmdStoryPath,
      reviewFile: cmdReviewPath,
      reviewCloseoutReady: true,
    }, null, 2),
  );

  const cmdNotifications: Notification[] = [];
  const cmdSelectCalls: SelectCall[] = [];
  const cmdHarness = makePi();
  const cmdCtx = makeCtx(cmdCwd, cmdNotifications, {
    hasUI: true,
    selectResponses: ["close"],
    selectCalls: cmdSelectCalls,
  });

  await cmdHarness.completeStory.handler("", cmdCtx);
  assert(helperModule.validateReviewDocument(cmdReviewPath).valid, "/complete-story handleCommand should repair the malformed review before prompting");
  assert(cmdSelectCalls.length > 0, "/complete-story handleCommand should prompt for closeout after repair");
  const cmdRepaired = fs.readFileSync(cmdReviewPath, "utf-8");
  assert(cmdRepaired.includes("cmd test finding"), "handleCommand repair should preserve existing findings");
  assert(cmdRepaired.includes("cmd test fix"), "handleCommand repair should preserve existing fixes");
}

await runMalformedReviewScenarios();

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
} finally {
  cleanupStubModules(stubModuleDirs);
}