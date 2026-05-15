import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };
type CustomCall = { title: string; subtitle: string; body: string };
type InternalMessage = {
  message: { customType: string; content: string; display: boolean; details?: unknown };
  options?: unknown;
};

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n- Follow existing project conventions.\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "index.md"), "# File Index\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "context-map.md"), "# Context Map\n\n- Project: Test\n");
  return cwd;
}

function jjAvailable(): boolean {
  try {
    childProcess.execSync("jj --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function fossilAvailable(): boolean {
  try {
    childProcess.execSync("fossil version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function createGitProject(prefix: string): string {
  const cwd = createProject(prefix);
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "git", vcs_preference: "git" }, null, 2));
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("git add -A", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit --allow-empty -qm init", { cwd, stdio: "pipe" });
  return cwd;
}

function createColocatedGitJjProject(prefix: string, activeMode: "git" | "jj"): string {
  const cwd = createProject(prefix);
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "git", vcs_preference: activeMode }, null, 2));
  childProcess.execFileSync("jj", ["git", "init", "--colocate"], { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("git add -A", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit --allow-empty -qm init", { cwd, stdio: "pipe" });
  return cwd;
}

function createFossilProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoPath = path.join(root, "repo.fossil");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  childProcess.execSync(`fossil init ${JSON.stringify(repoPath)}`, { cwd: root, stdio: "pipe" });
  childProcess.execSync(`fossil open ${JSON.stringify(repoPath)}`, { cwd, stdio: "pipe" });

  fs.writeFileSync(path.join(cwd, "README.md"), "hello\n");
  childProcess.execSync("fossil add README.md", { cwd, stdio: "pipe" });
  childProcess.execSync("fossil commit -m initial --user-override vazir-test", { cwd, stdio: "pipe" });

  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n- Follow existing project conventions.\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "index.md"), "# File Index\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "context-map.md"), "# Context Map\n\n- Project: Test\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "fossil", vcs_preference: "fossil" }, null, 2));
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
  const harness = createPiHarness([register]);
  const completeStory = harness.getCommand("complete-story");
  assert(Boolean(completeStory), "complete-story command was not registered");

  return {
    completeStory: completeStory!,
    sentInternalMessages: harness.sentInternalMessages,
    sentUserMessages: harness.sentMessages.map(entry => String(entry.message)),
    async emit(name: string, event: any, ctx: any) {
      await harness.emit(name, event, ctx);
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
  assert(
    fs.readFileSync(reviewPath, "utf-8").includes("**Static analysis:** not run (fallow unavailable)"),
    "review-gated complete-story should record when Fallow was not available",
  );
  writeCompletedReview(reviewPath);
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "selecting remediation should keep the story open");
  assert(customCalls.length === 1, "review-gated closeout should allow opening the review document and returning to the choices");
  assert(customCalls[0].title.includes(path.basename(reviewPath)), "review document viewer should show the review file title");
  assert((harness.sentInternalMessages.length as number) === 2, "review-gated closeout should queue a remediation turn after the user selects a fix path");
  assert(harness.sentInternalMessages[1].message.content.includes("Only work the unchecked items marked `high` or `critical`"), "review-gated closeout should support high-priority-only remediation");
  assert(harness.sentInternalMessages[1].message.content.includes("high: Add a local error boundary around the login form"), "review-gated closeout should target the high-priority checklist item");

  markReviewFixResolved(reviewPath, "high — Add a local error boundary around the login form");
  setReviewStatus(reviewPath, "in-progress");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "review-gated closeout should keep the story open until mini-consolidate finishes");
  assert((harness.sentInternalMessages.length as number) === 3, "review-gated closeout should queue a mini-consolidate turn after review closeout");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  const story = fs.readFileSync(storyPath, "utf-8");
  assert(story.includes("**Status:** complete"), "review-gated complete-story should close the story after mini-consolidate finishes");
  assert(selectCalls.some(call => call.options.includes("Open review document")), "review-gated complete-story should let the user open the review document from the closeout prompt");
  assert(selectCalls.some(call => call.options.includes("Keep story open and fix high-priority recommended items")), "review-gated complete-story should offer high-priority remediation from the closeout prompt");
  assert(selectCalls.some(call => call.prompt.includes("Pending recommended fixes: 1 high-priority, 1 other.")), "review-gated complete-story should summarize tracked review remediation items");
  assert(selectCalls.some(call => call.prompt.includes("High-priority items are done. Do you want to fix the remaining items before closing?")), "review-gated complete-story should reprompt after high-priority remediation finishes");
  assert(selectCalls.some(call => call.options.includes("Keep story open and fix remaining recommended items")), "review-gated complete-story should offer the remaining-item remediation path after high-priority work is done");
  assert(selectCalls.some(call => call.options.includes("Close story now (remaining items noted)")), "review-gated complete-story should offer a remaining-items-noted close option");
  assert(selectCalls.some(call => call.options.includes("Close story and commit all")), "review-gated complete-story should offer an explicit close-and-commit-all option after review");
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
    selectResponses: ["Start code review before closing"],
    selectCalls: resumedSelectCalls,
    customCalls: resumedCustomCalls,
  });

  await harness.completeStory.handler("", resumedCtx);

  const resumedReviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(resumedReviewFiles.length === 2, "restart scenario should create a fresh review file on rerun");
  assert(resumedReviewFiles[0] !== resumedReviewFiles[1], "restart scenario should not overwrite the earlier review");
  assert(resumedSelectCalls.some(call => call.options.includes("Start code review before closing")), "restart scenario should prompt to start a fresh review on rerun");
  assert(resumedSelectCalls.some(call => call.options.includes("Close story now")), "restart scenario should still offer the close story choice on rerun");
  assert(resumedCustomCalls.length === 0, "restart scenario should not reopen the previous review document automatically");
  assert(harness.sentInternalMessages.length === 2, "restart scenario should dispatch a second review turn on rerun");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "restart scenario should keep the story open until the fresh review finishes");

  return { cwd, notifications, firstSelectCalls, resumedSelectCalls, resumedCustomCalls, reviewFiles, resumedReviewFiles };
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
  assert(selectCalls.some(call => call.options.includes("Close story and commit all")), "ready closeout should offer an explicit close-and-commit-all option");
  assert(selectCalls.some(call => call.options[0] === "Start code review before closing"), "ready closeout should keep review as the first closeout option");
  assert(harness.sentUserMessages.length === 0, "ready closeout without review should not send a visible follow-up user message");
  assert(harness.sentInternalMessages.length === 1, "ready closeout without review should queue a mini-consolidate turn");
  assert(fs.readFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "utf-8").includes("**Status:** in-progress"), "ready closeout should keep the story open until mini-consolidate finishes");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "utf-8").includes("**Status:** complete"), "ready closeout should complete the story after mini-consolidate finishes");

  return { cwd, notifications, selectCalls };
}

async function runReadyCloseAndCommitScenario() {
  const cwd = createGitProject("vazir-complete-story-ready-close-commit-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story and commit all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "close-and-commit scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "close-and-commit scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "close-and-commit scenario should mark the story complete after mini-consolidate");
  assert(notifications.some(note => note.message.includes("Committed with Git: complete story-001")), "close-and-commit scenario should report the commit result");
  const status = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(status === "", "close-and-commit scenario should leave the git checkout clean");

  return { cwd, notifications, selectCalls };
}

async function runDirtyContextCommitScenario() {
  const cwd = createGitProject("vazir-complete-story-dirty-context-commit-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story now", "Commit .context changes and close story"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });
  fs.appendFileSync(path.join(cwd, ".context", "memory", "index.md"), "- Added during closeout validation\n");

  await harness.completeStory.handler("", ctx);

  assert(selectCalls.some(call => call.options.includes("Commit .context changes and close story")), "dirty .context closeout should prompt to commit project-brain updates");
  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "dirty .context commit scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "dirty .context commit scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "dirty .context commit scenario should still complete the story after mini-consolidate");
  assert(notifications.some(note => note.message.includes("Committed with Git: complete story-001")), "dirty .context commit scenario should commit after the prompt");
  const status = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(status === "", "dirty .context commit scenario should leave the git checkout clean");

  return { cwd, notifications, selectCalls };
}

async function runDirtyContextDeclineScenario() {
  const cwd = createGitProject("vazir-complete-story-dirty-context-decline-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story now", "Close story without committing .context changes"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });
  fs.appendFileSync(path.join(cwd, ".context", "memory", "index.md"), "- Left dirty on purpose\n");

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "dirty .context decline scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "dirty .context decline scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "dirty .context decline scenario should complete the story after explicit opt-out");
  assert(notifications.some(note => note.message.includes("user explicitly declined the pending .context commit")), "dirty .context decline scenario should log the explicit opt-out");
  const status = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(status.includes(".context/"), "dirty .context decline scenario should leave the project-brain diff uncommitted");

  return { cwd, notifications, selectCalls };
}

async function runColocatedGitPreferredCommitScenario() {
  if (!jjAvailable()) return null;

  const cwd = createColocatedGitJjProject("vazir-complete-story-colocated-git-", "git");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story and commit all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "colocated git-preferred scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "colocated git-preferred scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "colocated git-preferred scenario should complete the story after mini-consolidate");
  assert(notifications.some(note => note.message.includes("Committed with Git: complete story-001")), "colocated git-preferred scenario should honor Git instead of switching to JJ");
  assert(!notifications.some(note => note.message.includes("Recorded JJ change")), "colocated git-preferred scenario should not describe the change with JJ");
  const status = childProcess.execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(status === "", "colocated git-preferred scenario should leave the Git checkout clean");

  return { cwd, notifications, selectCalls };
}

async function runColocatedJjPreferredCommitScenario() {
  if (!jjAvailable()) return null;

  const cwd = createColocatedGitJjProject("vazir-complete-story-colocated-jj-", "jj");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story and commit all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "colocated JJ-preferred scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "colocated JJ-preferred scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "colocated JJ-preferred scenario should complete the story after mini-consolidate");
  assert(notifications.some(note => note.message.includes("Recorded JJ change: complete story-001")), "colocated JJ-preferred scenario should use JJ when explicitly preferred");
  const describedMessage = childProcess.execSync("jj log -r @ -T description --no-graph", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(describedMessage.includes("complete story-001"), "colocated JJ-preferred scenario should describe the current JJ change");
  const jjStatus = childProcess.execSync("jj status", { cwd, encoding: "utf-8", stdio: "pipe" });
  assert(jjStatus.includes("Working copy  (@)") && jjStatus.includes("complete story-001"), "colocated JJ-preferred scenario should keep the described JJ working copy active");

  return { cwd, notifications, selectCalls };
}

async function runFossilCloseAndCommitScenario() {
  if (!fossilAvailable()) return null;

  const cwd = createFossilProject("vazir-complete-story-fossil-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story and commit all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });
  fs.appendFileSync(path.join(cwd, "README.md"), "story closeout change\n");

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "fossil close-and-commit scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "fossil close-and-commit scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "No candidates found.\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "fossil close-and-commit scenario should complete the story after mini-consolidate");
  assert(notifications.some(note => note.message.includes("Committed with Fossil: complete story-001")), "fossil close-and-commit scenario should report the Fossil commit result");
  const changes = childProcess.execSync("fossil changes", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  const extras = childProcess.execSync("fossil extras", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(changes === "" && extras === "", "fossil close-and-commit scenario should leave the checkout clean");

  return { cwd, notifications, selectCalls };
}

async function runCandidatesPromoteScenario() {
  const cwd = createProject("vazir-complete-story-candidates-promote-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story now", "Promote all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "candidates-promote scenario should keep the story open until mini-consolidate finishes");
  assert(harness.sentInternalMessages.length === 1, "candidates-promote scenario should queue a mini-consolidate turn");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "- high: Always validate user input before processing\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "candidates-promote scenario should complete the story after promotion");
  assert(selectCalls.some(call => call.options.includes("Promote all")), "candidates-promote scenario should offer Promote all when multiple candidates exist");
  assert(selectCalls.some(call => call.options.includes("Skip all")), "candidates-promote scenario should offer Skip all");
  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  assert(systemMd.includes("Always validate user input before processing"), "candidates-promote scenario should promote the candidate to system.md");
  assert(systemMd.includes("<!-- source: story-001 -->"), "candidates-promote scenario should add provenance tag");
  assert(notifications.some(note => note.message.includes("Promoted 1 rule(s) to system.md")), "candidates-promote scenario should notify about promotion");

  return { cwd, notifications, selectCalls };
}

async function runCandidatesSkipScenario() {
  const cwd = createProject("vazir-complete-story-candidates-skip-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications, {
    hasUI: true,
    selectResponses: ["Close story now", "Skip all"],
    selectCalls,
  });
  const storyPath = writeStory(cwd, {
    checklist: ["- [x] Example task"],
    issues: [
      "### /fix — \"signup button broken\"",
      "- **Reported:** 2026-03-25  ",
      "- **Status:** resolved  ",
      "- **Agent note:** —  ",
      "- **Solution:** Added missing submit handler",
    ],
    completionSummary: "Implemented the story and verified the expected flow.",
  });

  await harness.completeStory.handler("", ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** in-progress"), "candidates-skip scenario should keep the story open until mini-consolidate finishes");

  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001-candidates.md"), "- medium: Use null-coalescing instead of ternary for defaults\n");
  await harness.emit("agent_end", {}, ctx);

  assert(fs.readFileSync(storyPath, "utf-8").includes("**Status:** complete"), "candidates-skip scenario should complete the story after skipping");
  assert(notifications.some(note => note.message.includes("Mini-consolidate skipped for story-001")), "candidates-skip scenario should notify about skip");
  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  assert(!systemMd.includes("Use null-coalescing instead of ternary for defaults"), "candidates-skip scenario should NOT promote skipped candidates");

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

try {
  const reviewGated = await runReviewGatedScenario();
  const restartedReviewCloseout = await runRestartedReviewCloseoutScenario();
  const readyClose = await runReadyCloseScenario();
  const readyCloseAndCommit = await runReadyCloseAndCommitScenario();
  const dirtyContextCommit = await runDirtyContextCommitScenario();
  const dirtyContextDecline = await runDirtyContextDeclineScenario();
  const colocatedGitPreferred = await runColocatedGitPreferredCommitScenario();
  const colocatedJjPreferred = await runColocatedJjPreferredCommitScenario();
  const fossilCloseAndCommit = await runFossilCloseAndCommitScenario();
  const keepWorking = await runKeepWorkingScenario();
  const candidatesPromote = await runCandidatesPromoteScenario();
  const candidatesSkip = await runCandidatesSkipScenario();

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

  console.log("Ready Closeout And Commit");
  console.log(`cwd: ${readyCloseAndCommit.cwd}`);
  console.log("notifications:");
  for (const note of readyCloseAndCommit.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }

  console.log("Dirty .context Commit Closeout");
  console.log(`cwd: ${dirtyContextCommit.cwd}`);
  console.log("notifications:");
  for (const note of dirtyContextCommit.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }

  console.log("Dirty .context Decline Closeout");
  console.log(`cwd: ${dirtyContextDecline.cwd}`);
  console.log("notifications:");
  for (const note of dirtyContextDecline.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }

  if (colocatedGitPreferred) {
    console.log("Colocated Git/JJ Closeout (Git preferred)");
    console.log(`cwd: ${colocatedGitPreferred.cwd}`);
    console.log("notifications:");
    for (const note of colocatedGitPreferred.notifications) {
      console.log(`  - [${note.level}] ${note.message}`);
    }
  } else {
    console.log("Colocated Git/JJ Closeout (Git preferred) skipped — jj binary not installed");
  }

  if (colocatedJjPreferred) {
    console.log("Colocated Git/JJ Closeout (JJ preferred)");
    console.log(`cwd: ${colocatedJjPreferred.cwd}`);
    console.log("notifications:");
    for (const note of colocatedJjPreferred.notifications) {
      console.log(`  - [${note.level}] ${note.message}`);
    }
  } else {
    console.log("Colocated Git/JJ Closeout (JJ preferred) skipped — jj binary not installed");
  }

  if (fossilCloseAndCommit) {
    console.log("Fossil Closeout And Commit");
    console.log(`cwd: ${fossilCloseAndCommit.cwd}`);
    console.log("notifications:");
    for (const note of fossilCloseAndCommit.notifications) {
      console.log(`  - [${note.level}] ${note.message}`);
    }
  } else {
    console.log("Fossil Closeout And Commit skipped — fossil binary not installed");
  }

  console.log("Keep Working Closeout");
  console.log(`cwd: ${keepWorking.cwd}`);
  console.log("notifications:");
  for (const note of keepWorking.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }

  console.log("Candidates Promote Closeout");
  console.log(`cwd: ${candidatesPromote.cwd}`);
  console.log("notifications:");
  for (const note of candidatesPromote.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }

  console.log("Candidates Skip Closeout");
  console.log(`cwd: ${candidatesSkip.cwd}`);
  console.log("notifications:");
  for (const note of candidatesSkip.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }
} finally {
  cleanupStubModules(stubModuleDirs);
}