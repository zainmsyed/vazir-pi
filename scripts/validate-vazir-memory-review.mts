import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };
type ConfirmCall = { prompt: string; detail: string };

function writeStory(
  cwd: string,
  number: number,
  options: {
    status: "complete" | "in-progress" | "retired";
    lastAccessed: string;
    completed: string;
    dependencies?: string[];
  },
): string {
  const fileName = `story-${String(number).padStart(3, "0")}.md`;
  const filePath = path.join(cwd, ".context", "stories", fileName);
  fs.writeFileSync(
    filePath,
    [
      `# Story ${String(number).padStart(3, "0")}: Example ${number}`,
      "",
      `**Status:** ${options.status}  `,
      "**Created:** 2026-04-01  ",
      `**Last accessed:** ${options.lastAccessed}  `,
      `**Completed:** ${options.completed}`,
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
      "- docs/",
      "",
      "## Dependencies",
      ...(options.dependencies && options.dependencies.length > 0 ? options.dependencies.map(dep => `- ${dep}`) : ["- None"]),
      "",
      "---",
      "",
      "## Checklist",
      options.status === "in-progress" ? "- [ ] Finish the in-progress task" : "- [x] Finished task",
      "",
      "---",
      "",
      "## Issues",
      "",
      "---",
      "",
      "## Completion Summary",
      options.status === "in-progress" ? "" : "Done.",
      "",
    ].join("\n"),
  );
  return filePath;
}

function writeReview(cwd: string, fileName: string, storyLabel: string): string {
  const filePath = path.join(cwd, ".context", "reviews", fileName);
  fs.writeFileSync(
    filePath,
    [
      `# Code Review 2026-04-01T12:00:00Z`,
      "",
      "**Status:** complete  ",
      "**Created:** 2026-04-01T12:00:00Z  ",
      "**Completed:** 2026-04-01  ",
      "**Scope:** story  ",
      `**Story:** ${storyLabel}  `,
      "**Focus:** completion review  ",
      "**Trigger:** manual",
      "",
      "---",
      "",
      "## Goal",
      "Archive validation review.",
      "",
      "## Checklist",
      "- [x] Done",
      "",
      "---",
      "",
      "## Findings",
      "- No findings",
      "",
      "---",
      "",
      "## Recommended Fixes",
      "- [x] No follow-up fixes required.",
      "",
      "---",
      "",
      "## Other Fixes",
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

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "intake", "uploads"), { recursive: true });

  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System Rules",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "- Preserve completion review gating <!-- source: story-001 -->",
      "- Keep cleanup user-triggered",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(cwd, ".context", "complaints-log.md"), "# Complaints Log\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "reviews", "summary.md"), "# Review Summary\n\n**Last updated:** —\n\n## Findings\n- None yet\n");
  fs.writeFileSync(path.join(cwd, ".context", "reviews", "remembered.md"), "# Remembered Rules\n\nManual rules captured via /remember.\n\n");

  writeStory(cwd, 1, { status: "complete", lastAccessed: "2026-04-01", completed: "2026-04-01" });
  writeStory(cwd, 2, { status: "complete", lastAccessed: "2026-04-02", completed: "2026-04-02" });
  writeStory(cwd, 3, { status: "complete", lastAccessed: "2026-04-03", completed: "2026-04-03" });
  writeStory(cwd, 4, { status: "complete", lastAccessed: "2026-04-04", completed: "2026-04-04" });
  writeStory(cwd, 5, { status: "in-progress", lastAccessed: "2026-04-05", completed: "—", dependencies: ["None"] });

  writeReview(cwd, "review-20260401-120000.md", "story-001");
  fs.writeFileSync(path.join(cwd, ".context", "intake", "uploads", "old-wireframe-draft.png"), "png placeholder\n");
  fs.writeFileSync(path.join(cwd, ".context", "intake", "uploads", "empty-stub.md"), "TODO\n");

  return cwd;
}

function makePi() {
  const harness = createPiHarness([register]);
  const memoryReview = harness.getCommand("memory-review");
  assert(Boolean(memoryReview), "memory-review command was not registered");

  return { memoryReview: memoryReview! };
}

function makeCtx(
  cwd: string,
  notifications: Notification[],
  selectCalls: SelectCall[],
  confirmCalls: ConfirmCall[],
) {
  const selectResponses = [0, 1, 0];
  const confirmResponses = [true, true, true];

  return {
    cwd,
    hasUI: true,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        const response = selectResponses.shift();
        return typeof response === "number" ? options[response] : response;
      },
      async confirm(prompt: string, detail: string) {
        confirmCalls.push({ prompt, detail });
        return confirmResponses.shift() ?? false;
      },
      async input() {
        return "";
      },
    },
  };
}

const cwd = createProject("vazir-memory-review-");
const notifications: Notification[] = [];
const selectCalls: SelectCall[] = [];
const confirmCalls: ConfirmCall[] = [];
const { memoryReview } = makePi();
const ctx = makeCtx(cwd, notifications, selectCalls, confirmCalls);

await memoryReview.handler("", ctx);

assert(fs.existsSync(path.join(cwd, ".context", "archive", "stories", "story-001.md")), "memory-review did not archive the oldest completed story");
assert(!fs.existsSync(path.join(cwd, ".context", "stories", "story-001.md")), "memory-review did not remove the archived story from active stories");
assert(fs.existsSync(path.join(cwd, ".context", "archive", "reviews", "review-20260401-120000.md")), "memory-review did not archive the completed review for the archived story");
assert(!fs.existsSync(path.join(cwd, ".context", "reviews", "review-20260401-120000.md")), "memory-review did not remove the archived review from active reviews");

const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
assert(!systemMd.includes("Preserve completion review gating"), "memory-review did not remove the selected stale rule via /unlearn");
assert(systemMd.includes("- Keep cleanup user-triggered"), "memory-review should not remove unselected stale rules");

const complaintsLog = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
assert(complaintsLog.includes('| unlearned | "Preserve completion review gating"'), "unlearn marker was not appended to complaints-log.md");

assert(!fs.existsSync(path.join(cwd, ".context", "intake", "uploads", "old-wireframe-draft.png")), "memory-review did not delete the draft intake asset");
assert(!fs.existsSync(path.join(cwd, ".context", "intake", "uploads", "empty-stub.md")), "memory-review did not delete the stub intake file");

assert(confirmCalls[0]?.detail.includes("Source: story-001"), "unlearn confirmation did not show rule provenance");
assert(confirmCalls[1]?.prompt.includes("PERMANENT DELETION - this cannot be undone."), "delete step 1 did not use the warning block prompt");
assert(confirmCalls[2]?.prompt.includes("You are about to permanently delete:"), "delete step 2 did not echo the files being deleted");
assert(notifications.some(note => note.message.includes("Archived 2 file(s) into .context/archive/")), "memory-review did not notify after archiving files");
assert(notifications.some(note => note.message.includes("Memory review complete: archived 2 file(s), flagged 2 stale rule candidate(s), deleted 2 file(s).")), "memory-review did not emit the final summary notification");

console.log("Memory review validation");
console.log(`cwd: ${cwd}`);
console.log("select prompts:");
for (const call of selectCalls) {
  console.log(`  - ${call.prompt.split("\n")[0]}`);
}
console.log("confirm prompts:");
for (const call of confirmCalls) {
  console.log(`  - ${call.prompt.split("\n")[0]}`);
}
console.log("notifications:");
for (const note of notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
