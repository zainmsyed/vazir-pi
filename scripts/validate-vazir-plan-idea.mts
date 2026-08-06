import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, loadFileModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const helpers = await loadFileModule<{
  parseIdeaFrontmatter: (filePath: string) => any;
}>(path.join(".pi", "extensions", "vazir-context", "helpers.ts"));

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-plan-idea-"));
const ideasDir = path.join(cwd, ".context", "ideas");
const storiesDir = path.join(cwd, ".context", "stories");
fs.mkdirSync(ideasDir, { recursive: true });
fs.mkdirSync(storiesDir, { recursive: true });

const openIdea = [
  "# Idea 001: Open idea to plan",
  "",
  "**Status:** open",
  "**Captured:** 2026-08-06",
  "**Promoted to:** —",
  "",
  "This is the seeded idea body.",
  "",
].join("\n");

const promotedIdea = [
  "# Idea 002: Already promoted",
  "",
  "**Status:** promoted",
  "**Captured:** 2026-08-06",
  "**Promoted to:** story-099",
  "",
  "Already done.",
  "",
].join("\n");

fs.writeFileSync(path.join(ideasDir, "idea-001.md"), openIdea);
fs.writeFileSync(path.join(ideasDir, "idea-002.md"), promotedIdea);

const harness = createPiHarness([extensionModule.default]);
const plan = harness.getCommand("plan");
assert(Boolean(plan), "plan command was not registered");

const notifications: Array<{ message: string; level: string }> = [];
function makeCtx() {
  return {
    cwd,
    ui: {
      async input() { return null; },
      async select() { return null; },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

// /plan with no reference should not seed an idea and should still proceed.
await plan!.handler("", {
  cwd,
  ui: {
    async input() { return "test brief"; },
    async select() { return null; },
    notify(message: string, level: string) {
      notifications.push({ message, level });
    },
  },
});
const noRefInstruction = harness.sentMessages[0]?.message ?? "";
assert(!noRefInstruction.includes("Seeded idea:"), "/plan with no reference seeded an idea unexpectedly");

// /plan idea-001 seeds the instruction and sets up promotion tracking.
await plan!.handler("idea-001", makeCtx());
const planInstruction = harness.sentMessages[harness.sentMessages.length - 1]?.message ?? "";
assert(planInstruction.includes("Seeded idea: idea-001.md"), "plan instruction did not include the seeded idea header");
assert(planInstruction.includes("This is the seeded idea body."), "plan instruction did not include the idea body");
assert(planInstruction.includes("continue asking clarifying questions"), "plan instruction did not tell the agent to keep asking clarifying questions");

// Simulate planning producing a new story file, then run turn_end to trigger promotion.
const newStoryPath = path.join(storiesDir, "story-007.md");
fs.writeFileSync(newStoryPath, [
  "# Story 007: Planned from idea",
  "",
  "**Status:** not-started  ",
  "**Type:** feature  ",
  "**Created:** 2026-08-06  ",
  "**Last accessed:** 2026-08-06  ",
  "**Completed:** —",
  "",
  "---",
  "",
  "## Goal",
  "Goal here.",
  "",
  "## Verification",
  "Verify here.",
  "",
  "## Scope — files this story may touch",
  "- ",
  "",
  "## Out of scope — do not touch",
  "- ",
  "",
  "## Dependencies",
  "- ",
  "",
  "---",
  "",
  "## Checklist",
  "- [ ] task",
  "",
  "---",
  "",
  "## Issues",
  "",
  "---",
  "",
  "## Completion Summary",
  "",
].join("\n"));

await harness.emit("turn_end", {}, makeCtx());
const promoted = helpers.parseIdeaFrontmatter(path.join(ideasDir, "idea-001.md"));
assert(promoted?.status === "promoted", "idea-001 was not promoted after a new story was written");
assert(promoted?.promotedTo === "story-007", `idea-001 promotedTo was ${promoted?.promotedTo}, expected story-007`);
assert(notifications.some(note => note.message === "Promoted idea-001.md to story-007"), "promotion was not notified");

// A malformed generated story triggers repair, but promotion state survives the repair turn.
fs.writeFileSync(path.join(ideasDir, "idea-001.md"), openIdea);
await plan!.handler("idea-001", makeCtx());
const malformedStoryPath = path.join(storiesDir, "story-008.md");
fs.writeFileSync(malformedStoryPath, "# malformed story\n");
await harness.emit("turn_end", {}, makeCtx());
assert(harness.sentMessages.some(entry => entry.message.includes("Some generated story files have formatting issues")), "malformed generated story did not trigger repair");
fs.writeFileSync(malformedStoryPath, [
  "# Story 008: Repaired from idea",
  "",
  "**Status:** not-started  ",
  "**Type:** feature  ",
  "**Created:** 2026-08-06  ",
  "**Last accessed:** 2026-08-06  ",
  "**Completed:** —",
  "",
  "---",
  "",
  "## Goal",
  "Goal here.",
  "",
  "## Verification",
  "Verify here.",
  "",
  "## Scope — files this story may touch",
  "- ",
  "",
  "## Out of scope — do not touch",
  "- ",
  "",
  "## Dependencies",
  "- ",
  "",
  "---",
  "",
  "## Checklist",
  "- [ ] task",
  "",
  "---",
  "",
  "## Issues",
  "",
  "---",
  "",
  "## Completion Summary",
  "",
].join("\n"));
await harness.emit("turn_end", {}, makeCtx());
const repairedPromotion = helpers.parseIdeaFrontmatter(path.join(ideasDir, "idea-001.md"));
assert(repairedPromotion?.status === "promoted" && repairedPromotion.promotedTo === "story-008", "idea was not promoted after repaired stories validated");

// Abandoned planning: a new /plan idea-001 with no new story files keeps the idea open.
// Reset the idea to open first.
fs.writeFileSync(path.join(ideasDir, "idea-001.md"), openIdea);
await plan!.handler("idea-001", makeCtx());
// Do not write any new story files; emit turn_end.
await harness.emit("turn_end", {}, makeCtx());
const abandoned = helpers.parseIdeaFrontmatter(path.join(ideasDir, "idea-001.md"));
assert(abandoned?.status === "open", "idea-001 status changed even though no new story files were written");
assert(abandoned?.promotedTo === "—", "idea-001 Promoted to changed even though planning was abandoned");

// Missing idea reference.
const missingNotifications: Array<{ message: string; level: string }> = [];
await plan!.handler("idea-999", {
  cwd,
  ui: {
    async input() { return null; },
    async select() { return null; },
    notify(message: string, level: string) {
      missingNotifications.push({ message, level });
    },
  },
});
assert(missingNotifications.some(note => note.message.includes("Idea idea-999 was not found")), "missing idea did not produce a clear warning");

// Non-open idea reference.
const closedNotifications: Array<{ message: string; level: string }> = [];
await plan!.handler("idea-002", {
  cwd,
  ui: {
    async input() { return null; },
    async select() { return null; },
    notify(message: string, level: string) {
      closedNotifications.push({ message, level });
    },
  },
});
assert(closedNotifications.some(note => note.message.includes("Idea idea-002 is promoted") && note.message.includes("story-099")), "non-open idea did not produce a clear warning with promoted target");

// Missing references are rejected before creating planning artifacts.
const missingCwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-plan-missing-"));
const missingArtifactNotifications: Array<{ message: string; level: string }> = [];
await plan!.handler("idea-404", {
  cwd: missingCwd,
  ui: {
    async input() { return null; },
    async select() { return null; },
    notify(message: string, level: string) {
      missingArtifactNotifications.push({ message, level });
    },
  },
});
assert(missingArtifactNotifications.some(note => note.message.includes("Idea idea-404 was not found")), "missing artifact test did not report the missing idea");
assert(!fs.existsSync(path.join(missingCwd, ".context", "stories", "plan.md")),  "missing idea created plan.md before rejecting the reference");
assert(!fs.existsSync(path.join(missingCwd, ".context", "stories", "intake-brief.md")), "missing idea created intake-brief.md before rejecting the reference");

// Conversational "plan this" is translated to the same literal /plan idea-NNN input.
const ideaCommand = harness.getCommand("idea");
assert(Boolean(ideaCommand), "idea command was not registered");
const viewerCtx: any = {
  cwd,
  ui: {
    async select(_title: string, labels: string[]) {
      const choice = labels[0]?.startsWith("1. Capture") ? "2. View existing ideas" : labels.find(label => label.startsWith("1. idea-001.md")) ?? "Cancel";
      if (choice.startsWith("1. idea-")) {
        viewerCtx.ui.custom = async (builder: any) => {
          builder({ requestRender() {} }, { fg: (_c: string, text: string) => text, bold: (text: string) => text, bg: (_c: string, text: string) => text }, {}, () => {});
        };
      }
      return choice;
    },
    notify() {},
  },
};
await ideaCommand!.handler("", viewerCtx);
const shorthandInput: any = { text: "plan this" };
await harness.emit("input", shorthandInput, { cwd });
assert(shorthandInput.text === "/plan idea-001", `plan this was not translated to /plan idea-001: ${shorthandInput.text}`);

console.log("Plan idea validation passed");
