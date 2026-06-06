import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const stubModuleDirs = installCommonPiStubs();
const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ project_name: "Test" }));
  fs.writeFileSync(path.join(cwd, ".context", "stories", "plan.md"), "# Plan\n\n| # | Story | Status |\n|---|---|---|\n");
  return cwd;
}

function makeValidStory(cwd: string, name: string, status: string): void {
  const filePath = path.join(cwd, ".context", "stories", name);
  const number = name.replace(/story-/, "").replace(/\.md$/, "");
  fs.writeFileSync(
    filePath,
    [
      `# Story ${number}: Example`,
      "",
      `**Status:** ${status}  `,
      "**Created:** 2026-06-06  ",
      "**Last accessed:** 2026-06-06  ",
      "**Completed:** —  ",
      "",
      "---",
      "",
      "## Goal",
      "Do the thing.",
      "",
      "## Verification",
      "Verify the thing.",
      "",
      "## Scope",
      "- src/example.ts",
      "",
      "## Out of scope",
      "- src/other.ts",
      "",
      "## Dependencies",
      "- None",
      "",
      "## Checklist",
      "- [ ] Task one",
      "",
      "## Issues",
      "- None yet",
      "",
      "## Completion Summary",
      "- Pending",
    ].join("\n"),
  );
}

function makeMalformedStory(cwd: string, name: string): void {
  const filePath = path.join(cwd, ".context", "stories", name);
  const number = name.replace(/story-/, "").replace(/\.md$/, "");
  fs.writeFileSync(
    filePath,
    [
      `# Story ${number}: Example`,
      "",
      "**Status:** bad-status  ",
      "**Created:** 2026-06-06  ",
      "**Last accessed:** 2026-06-06  ",
      "**Completed:** —  ",
      "",
      "---",
      "",
      "## Goal",
      "Do the thing.",
      "",
      "## Verification",
      "Verify the thing.",
      "",
      "## Scope",
      "- src/example.ts",
      "",
      "## Out of scope",
      "- src/other.ts",
      "",
      "## Dependencies",
      "- None",
      "",
      "## Checklist",
      "- [maybe] Bad task",
      "",
      "## Issues",
      "- None yet",
      "",
      "## Completion Summary",
      "- Pending",
    ].join("\n"),
  );
}

function createCtx(cwd: string, ui = true): { cwd: string; hasUI: boolean; ui: { notify: (message: string, level: string) => void; select: () => Promise<string | null>; input?: () => Promise<{ trim: () => string } | null> }; hasPendingMessages?: () => boolean } {
  const notifications: Notification[] = [];
  return {
    cwd,
    hasUI: ui,
    hasPendingMessages: () => false,
    ui: {
      notify: (message: string, level: string) => {
        notifications.push({ message, level });
      },
      select: () => Promise.resolve(null),
      input: () => Promise.resolve(null),
    },
  };
}

// Patch notify to expose notifications
function patchNotify(ctx: ReturnType<typeof createCtx>): Notification[] {
  const notifications: Notification[] = [];
  const original = ctx.ui.notify.bind(ctx.ui);
  ctx.ui.notify = (message: string, level: string) => {
    notifications.push({ message, level });
    original(message, level);
  };
  return notifications;
}

// ── Test 1: valid stories are silently accepted ──────────────────────
{
  const cwd = createProject("vazir-plan-repair-valid-");
  makeValidStory(cwd, "story-001.md", "not-started");
  makeValidStory(cwd, "story-002.md", "in-progress");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/plan example" }, ctx);
  await pi.emit("agent_end", {}, ctx);

  assert(notifications.length === 0, "Valid stories should not produce any notification");
  assert(pi.sentInternalMessages.length === 0, "Valid stories should not trigger repair");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 2: malformed stories trigger repair instruction ─────────────
{
  const cwd = createProject("vazir-plan-repair-malformed-");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/plan example" }, ctx);
  // Clarifying turn: no stories yet
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 0, "Clarifying turn should not trigger repair");

  // Agent writes stories, one malformed
  makeMalformedStory(cwd, "story-001.md");
  makeValidStory(cwd, "story-002.md", "not-started");
  await pi.emit("agent_end", {}, ctx);

  assert(pi.sentInternalMessages.length === 1, "Malformed stories should trigger exactly one repair instruction");
  const repairMessage = pi.sentInternalMessages[0].message;
  assert(repairMessage.content.includes("malformed"), "Repair instruction should mention malformed files");
  assert(repairMessage.content.includes("story-001.md"), "Repair instruction should name the broken file");
  assert(!repairMessage.content.includes("story-002.md"), "Repair instruction should not mention valid files");
  assert(notifications.length === 0, "First repair attempt should be silent");

  // Simulate agent fixing the file
  makeValidStory(cwd, "story-001.md", "not-started");
  await pi.emit("agent_end", {}, ctx);

  assert(pi.sentInternalMessages.length === 1, "After repair, no additional repair messages should be sent");
  assert(notifications.length === 0, "After repair, no notification should be shown");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 3: bounded failure after retries exhaust ────────────────────
{
  const cwd = createProject("vazir-plan-repair-bounded-");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/plan example" }, ctx);
  // Clarifying turn: no stories yet
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 0, "Clarifying turn should not trigger repair");

  // Agent writes a malformed story
  makeMalformedStory(cwd, "story-001.md");

  // First agent_end: retry 1
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 1, "First attempt should trigger repair");

  // Second agent_end: retry 2 (still malformed)
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 2, "Second attempt should trigger another repair");

  // Third agent_end: retries exhausted
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 2, "No more repair messages after retries exhausted");
  assert(notifications.length === 1, "Should show exactly one error notification when retries exhaust");
  assert(notifications[0].level === "error", "Notification should be error level");
  assert(notifications[0].message.includes("Failed to repair"), "Notification should mention failure");
  assert(notifications[0].message.includes("story-001.md"), "Notification should name the broken file");

  fs.rmSync(cwd, { recursive: true });
}

// ── Test 4: non-plan prompts do not trigger repair ───────────────────
{
  const cwd = createProject("vazir-plan-repair-nonplan-");
  makeMalformedStory(cwd, "story-001.md");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/implement story-001" }, ctx);
  await pi.emit("agent_end", {}, ctx);

  assert(pi.sentInternalMessages.length === 0, "Non-plan prompt should not trigger repair");
  assert(notifications.length === 0, "Non-plan prompt should not produce notification");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 5: multi-turn clarifying-question survival ──────────────────
{
  const cwd = createProject("vazir-plan-repair-clarifying-");
  // No stories exist yet

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/plan example" }, ctx);

  // First agent_end simulates a clarifying-question turn (no stories written yet)
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 0, "Clarifying turn should not trigger repair before stories exist");
  assert(notifications.length === 0, "Clarifying turn should be silent");

  // Now agent writes stories, one of them malformed
  makeMalformedStory(cwd, "story-001.md");
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 1, "Repair should trigger after stories are written");
  assert(pi.sentInternalMessages[0].message.content.includes("story-001.md"), "Repair should name the broken file");

  // Agent fixes the story
  makeValidStory(cwd, "story-001.md", "not-started");
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 1, "After repair, no additional repair messages should be sent");
  assert(notifications.length === 0, "After repair, no notification should be shown");

  fs.rmSync(cwd, { recursive: true });
}

// ── Test 6: replan with existing valid stories + new malformed story ─
{
  const cwd = createProject("vazir-plan-repair-replan-");
  makeValidStory(cwd, "story-001.md", "complete");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  await pi.emit("before_agent_start", { prompt: "/plan add new feature" }, ctx);

  // Clarifying-question turn: existing stories are valid, state should survive
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 0, "Clarifying turn should not trigger repair");

  // Agent writes a new malformed story
  makeMalformedStory(cwd, "story-002.md");
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 1, "Repair should trigger for the new malformed story");
  const repairContent = pi.sentInternalMessages[0].message.content;
  assert(repairContent.includes("story-002.md"), "Repair should name the new broken file");
  assert(!repairContent.includes("story-001.md"), "Repair should not mention pre-existing valid files");

  // Agent fixes the new story
  makeValidStory(cwd, "story-002.md", "not-started");
  await pi.emit("agent_end", {}, ctx);
  assert(pi.sentInternalMessages.length === 1, "After repair, no additional repair messages should be sent");
  assert(notifications.length === 0, "After repair, no notification should be shown");

  fs.rmSync(cwd, { recursive: true });
}

cleanupStubModules(stubModuleDirs);
console.log("validate-vazir-plan-repair: all tests passed");
