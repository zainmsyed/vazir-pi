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
      "**Type:** —  ",
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
      "---",
      "",
      "## Checklist",
      "- [ ] Task one",
      "",
      "---",
      "",
      "## Issues",
      "- None yet",
      "",
      "---",
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
      "**Type:** bad-type  ",
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
      "---",
      "",
      "## Checklist",
      "- [maybe] Bad task",
      "",
      "---",
      "",
      "## Issues",
      "- None yet",
      "",
      "---",
      "",
      "## Completion Summary",
      "- Pending",
    ].join("\n"),
  );
}

// Note: The `Type:` frontmatter is included in both helpers to match the template,
// but `validateStoryFile` (and therefore the plan guard) does not currently validate
// it. This is an intentional gap documented in the review findings.

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

  // Call /plan command handler to seed the state
  await pi.getCommand("plan")?.handler("example", ctx);
  // /plan handler sends the instruction message
  assert(pi.sentMessages.length === 1, "/plan handler should send one instruction message");
  await pi.emit("turn_end", {}, ctx);

  assert(pi.sentMessages.length === 1, "Valid stories should not trigger a fix message");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 2: malformed stories trigger a single fix message ───────────
{
  const cwd = createProject("vazir-plan-repair-malformed-");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  // Call /plan command handler to seed the state
  await pi.getCommand("plan")?.handler("example", ctx);
  // Clarifying turn: no stories yet
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 1, "Clarifying turn should not trigger fix");

  // Agent writes stories, one malformed
  makeMalformedStory(cwd, "story-001.md");
  makeValidStory(cwd, "story-002.md", "not-started");
  await pi.emit("turn_end", {}, ctx);

  assert(pi.sentMessages.length === 2, "Malformed stories should trigger exactly one fix message");
  const fixMessage = pi.sentMessages[1].message;
  assert(fixMessage.includes("story-001.md"), "Fix message should name the broken file");
  assert(!fixMessage.includes("story-002.md"), "Fix message should not mention valid files");
  assert(fixMessage.includes("invalid status"), "Fix message should mention the invalid status issue");

  // Simulate agent fixing the file
  makeValidStory(cwd, "story-001.md", "not-started");
  await pi.emit("turn_end", {}, ctx);

  assert(pi.sentMessages.length === 2, "After repair, no additional fix messages should be sent");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 3: non-plan prompts do not trigger fix ──────────────────────
{
  const cwd = createProject("vazir-plan-repair-nonplan-");
  makeMalformedStory(cwd, "story-001.md");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  // No /plan command called, so no state is seeded
  await pi.emit("turn_end", {}, ctx);

  assert(pi.sentMessages.length === 0, "Non-plan prompt should not trigger fix");
  assert(notifications.length === 0, "Non-plan prompt should not produce notification");
  fs.rmSync(cwd, { recursive: true });
}

// ── Test 4: multi-turn clarifying-question survival ──────────────────
{
  const cwd = createProject("vazir-plan-repair-clarifying-");
  // No stories exist yet

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  // Call /plan command handler to seed the state
  await pi.getCommand("plan")?.handler("example", ctx);

  // First turn_end simulates a clarifying-question turn (no stories written yet)
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 1, "Clarifying turn should not trigger fix before stories exist");

  // Now agent writes stories, one of them malformed
  makeMalformedStory(cwd, "story-001.md");
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 2, "Repair should trigger after stories are written");
  assert(pi.sentMessages[1].message.includes("story-001.md"), "Repair should name the broken file");

  // Agent fixes the story
  makeValidStory(cwd, "story-001.md", "not-started");
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 2, "After repair, no additional fix messages should be sent");

  fs.rmSync(cwd, { recursive: true });
}

// ── Test 5: replan with existing valid stories + new malformed story ─
{
  const cwd = createProject("vazir-plan-repair-replan-");
  makeValidStory(cwd, "story-001.md", "complete");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);
  const notifications = patchNotify(ctx);

  // Call /plan command handler to seed the state
  await pi.getCommand("plan")?.handler("example", ctx);

  // Clarifying-question turn: existing stories are valid, state should survive
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 1, "Clarifying turn should not trigger fix");

  // Agent writes a new malformed story
  makeMalformedStory(cwd, "story-002.md");
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 2, "Fix should trigger for the new malformed story");
  const fixContent = pi.sentMessages[1].message;
  assert(fixContent.includes("story-002.md"), "Fix should name the new broken file");
  assert(!fixContent.includes("story-001.md"), "Fix should not mention pre-existing valid files");

  // Agent fixes the new story
  makeValidStory(cwd, "story-002.md", "not-started");
  await pi.emit("turn_end", {}, ctx);
  assert(pi.sentMessages.length === 2, "After repair, no additional fix messages should be sent");

  fs.rmSync(cwd, { recursive: true });
}

// ── Test 6: /plan instruction explicitly directs the agent to write files ──
{
  const cwd = createProject("vazir-plan-instruction-");

  const pi = makePi([register]);
  const ctx = createCtx(cwd);

  await pi.getCommand("plan")?.handler("example", ctx);
  assert(pi.sentMessages.length === 1, "/plan handler should send exactly one instruction message");
  const instruction = pi.sentMessages[0].message;

  assert(instruction.includes("I have what I need — writing the plan and stories now."), "Instruction should include the boundary phrase");
  assert(
    /immediately write|write all new story files|write files/i.test(instruction),
    "Instruction must explicitly direct the agent to write story files after the boundary phrase",
  );
  assert(instruction.includes("write tool"), "Instruction must tell the agent to use the write tool");
  assert(instruction.includes(".context/stories/plan.md"), "Instruction must name plan.md as a file to write");
  assert(instruction.includes(".context/stories/intake-brief.md"), "Instruction must name intake-brief.md as a file to write");
  assert(
    /do not wait|without waiting|before asking|without asking/i.test(instruction),
    "Instruction must tell the agent not to wait for confirmation before writing files",
  );
  assert(
    /after all files are written/i.test(instruction),
    "Instruction must defer final presentation until after files are written",
  );
  assert(instruction.includes("exactly two trailing spaces"), "Instruction must preserve the frontmatter trailing-space rule");
  assert(instruction.includes("'# Story NNN: Title'"), "Instruction must preserve the exact heading rule");
  assert(
    instruction.includes("Goal, Verification, Scope, Out of scope, Dependencies, Checklist, Issues, Completion Summary"),
    "Instruction must preserve the required-sections rule",
  );

  fs.rmSync(cwd, { recursive: true });
}

cleanupStubModules(stubModuleDirs);
console.log("validate-vazir-plan-repair: all tests passed");
