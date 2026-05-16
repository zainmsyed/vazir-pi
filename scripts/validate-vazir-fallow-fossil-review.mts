import childProcess from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

function fossilAvailable(): boolean {
  try {
    childProcess.execFileSync("fossil", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function fallowAvailable(): boolean {
  return fs.existsSync(path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "fallow.cmd" : "fallow"));
}

function createFossilProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoPath = path.join(root, "repo.fossil");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  childProcess.execFileSync("fossil", ["init", repoPath], { cwd: root, stdio: "pipe" });
  childProcess.execFileSync("fossil", ["open", "-f", repoPath], { cwd, stdio: "pipe" });

  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(cwd, "node_modules"), "dir");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "fossil" }, null, 2));
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n- Follow existing project conventions.\n\n## Learned Rules\n\n");
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
  fs.writeFileSync(path.join(cwd, "src", "example.ts"), "export const unusedValue = 1;\n");

  childProcess.execFileSync("fossil", ["add", ".context", "src"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("fossil", ["commit", "-m", "initial", "--user-override", "vazir-test"], { cwd, stdio: "pipe" });
  fs.appendFileSync(path.join(cwd, "src", "example.ts"), "export const anotherUnusedValue = 2;\n");

  return cwd;
}

if (!fossilAvailable()) {
  console.log("Fallow Fossil review validation skipped — fossil binary not installed");
  process.exit(0);
}

if (!fallowAvailable()) {
  console.log("Fallow Fossil review validation skipped — fallow not installed");
  process.exit(0);
}

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

function makeHarness() {
  const harness = createPiHarness([register]);
  const review = harness.getCommand("review");
  assert(Boolean(review), "review command was not registered");
  return { review: review!, sentMessages: harness.sentMessages };
}

function makeCtx(cwd: string, notifications: Notification[], selectCalls: SelectCall[]) {
  let selectIndex = 0;
  const selectResponses = ["Specific story", "In-progress story — story-001"];
  return {
    cwd,
    hasUI: true,
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

try {
  const cwd = createFossilProject("vazir-fallow-fossil-review-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const harness = makeHarness();
  const ctx = makeCtx(cwd, notifications, selectCalls);

  await harness.review.handler("", ctx);

  const reviewDir = path.join(cwd, ".context", "reviews");
  const reviewFiles = fs.readdirSync(reviewDir).filter((name: string) => /^review-.*\.md$/.test(name)).sort();
  assert(reviewFiles.length === 1, "fossil review validation should create one review file");
  const createdReview = fs.readFileSync(path.join(reviewDir, reviewFiles[0]), "utf-8");

  assert(/\*\*Static analysis:\*\* fallow (audit|scan) — /i.test(createdReview), "fossil review should record a Fallow static-analysis result instead of reporting it unavailable");
  assert(!createdReview.includes("not run (fallow unavailable)"), "fossil review should not report Fallow unavailable when it is installed");
  assert(!notifications.some(note => note.message.includes("Fallow not found")), "fossil review should not claim Fallow is missing when it is installed");
  assert(!notifications.some(note => note.message.includes("audit scope could not be resolved")), "fossil review should not fail audit scope resolution in Fossil mode");

  console.log("Fallow Fossil review validation passed");
  console.log(createdReview.match(/\*\*Static analysis:\*\* .*/)?.[0] ?? "no static analysis line found");
} finally {
  cleanupStubModules(stubModuleDirs);
}
