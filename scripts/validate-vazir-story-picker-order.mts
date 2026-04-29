import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const chromePath = path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "chrome.ts");
const chromeModule = await loadFileModule<typeof import("../.pi/extensions/vazir-tracker/chrome.ts")>(chromePath);
const storyPickerChoices = chromeModule.storyPickerChoices as (cwd: string) => Array<{ label: string; file: string; kind: "plan" | "story" }>;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "stories", "plan.md"), "# Plan\n");

  const stories = [
    { number: 1, status: "in-progress", lastAccessed: "2026-04-09", completed: "—", title: "Fix auth refresh flow" },
    { number: 2, status: "not-started", lastAccessed: "2026-04-08", completed: "—", title: "Add billing summary" },
    { number: 3, status: "not-started", lastAccessed: "2026-04-10", completed: "—", title: "Update onboarding copy" },
    { number: 4, status: "complete", lastAccessed: "2026-04-11", completed: "2026-04-11", title: "Archive old reports" },
    { number: 5, status: "complete", lastAccessed: "2026-04-12", completed: "2026-04-12", title: "Polish dashboard cards" },
  ] as const;

  for (const story of stories) {
    const filePath = path.join(cwd, ".context", "stories", `story-${String(story.number).padStart(3, "0")}.md`);
    fs.writeFileSync(
      filePath,
      [
        `# Story ${String(story.number).padStart(3, "0")}: ${story.title}`,
        "",
        `**Status:** ${story.status}  `,
        "**Created:** 2026-04-01  ",
        `**Last accessed:** ${story.lastAccessed}  `,
        `**Completed:** ${story.completed}`,
        "",
        "---",
        "",
        "## Goal",
        "Example goal.",
      ].join("\n"),
    );
  }

  return cwd;
}

const cwd = createProject("vazir-story-picker-order-");
const labels = storyPickerChoices(cwd).map(choice => choice.label);

assert(
  JSON.stringify(labels) === JSON.stringify([
    "plan.md — plan",
    "story-001 — in-progress — Fix auth refresh flow · 2026-04-09",
    "story-002 — not-started — Add billing summary · 2026-04-08",
    "story-003 — not-started — Update onboarding copy · 2026-04-10",
    "story-004 — complete — Archive old reports · 2026-04-11",
    "story-005 — complete — Polish dashboard cards · 2026-04-12",
  ]),
  `story picker order mismatch: ${JSON.stringify(labels)}`,
);

console.log("Passed validate-vazir-story-picker-order.mts");