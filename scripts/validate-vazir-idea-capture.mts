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

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-idea-"));
const ideasDir = path.join(cwd, ".context", "ideas");
fs.mkdirSync(ideasDir, { recursive: true });

const existing = [
  "# Idea 001: Existing idea",
  "",
  "**Status:** discarded",
  "**Captured:** 2026-08-01",
  "**Promoted to:** —",
  "",
  "Do not overwrite this body.",
  "",
].join("\n");
fs.writeFileSync(path.join(ideasDir, "idea-001.md"), existing);

const harness = createPiHarness([extensionModule.default]);
const idea = harness.getCommand("idea");
assert(Boolean(idea), "idea command was not registered");

const notifications: Array<{ message: string; level: string }> = [];
const inputValues: Array<string | undefined> = [];
const ctx = {
  cwd,
  ui: {
    async input() {
      return inputValues.shift();
    },
    async select(_title: string, _labels: string[]) {
      return inputValues.shift() ?? null;
    },
    notify(message: string, level: string) {
      notifications.push({ message, level });
    },
  },
};

await idea!.handler("Capture the next useful workflow improvement", ctx);
await idea!.handler("Capture a second improvement", ctx);

const first = fs.readFileSync(path.join(ideasDir, "idea-001.md"), "utf-8");
const firstCapturePath = path.join(ideasDir, "idea-002.md");
const secondPath = path.join(ideasDir, "idea-003.md");
const firstCapture = fs.readFileSync(firstCapturePath, "utf-8");
const second = fs.readFileSync(secondPath, "utf-8");
assert(first === existing, "existing idea-001.md was overwritten");
assert(firstCapture.includes("# Idea 002: Capture the next useful workflow improvement"), "first capture did not use the next sequential number");
assert(second === [
  "# Idea 003: Capture a second improvement",
  "",
  "**Status:** open",
  `**Captured:** ${new Date().toISOString().slice(0, 10)}`,
  "**Promoted to:** —",
  "",
  "Capture a second improvement",
  "",
].join("\n"), "idea-002.md did not use the canonical template");
assert(fs.existsSync(firstCapturePath), "first capture did not create idea-002.md");

const parsed = helpers.parseIdeaFrontmatter(path.join(ideasDir, "idea-001.md"));
assert(parsed?.number === 1, "idea parser did not parse the filename number");
assert(parsed?.status === "discarded", "idea parser did not parse the supported discarded status");
assert(parsed?.title === "Existing idea", "idea parser did not parse the title");

// Bare /idea → selector → capture option → empty retry → capture.
inputValues.push("1. Capture a new idea", "", "Capture a third improvement");
await idea!.handler("", ctx);
const thirdPath = path.join(ideasDir, "idea-004.md");
assert(fs.readFileSync(thirdPath, "utf-8").includes("# Idea 004: Capture a third improvement"), "bare idea selector capture did not retry after empty input and capture the entered idea");
assert(notifications.some(note => note.message.includes("Please enter an idea or cancel")), "empty capture prompt did not retry");

// Bare /idea → selector → cancel.
inputValues.push("Cancel");
await idea!.handler("", ctx);
assert(!fs.existsSync(path.join(ideasDir, "idea-005.md")), "cancelled bare idea created a file");
assert(notifications.some(note => note.message === "Idea tracker closed."), "bare idea selector cancel was not reported");
assert(notifications.some(note => note.message.includes("Captured idea-002")), "direct capture did not notify first capture success");
assert(notifications.some(note => note.message.includes("Captured idea-003")), "direct capture did not notify second capture success");

console.log("Idea capture validation passed");
console.log(`created: ${secondPath}, ${thirdPath}`);
