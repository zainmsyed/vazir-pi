import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, loadFileModule, makePi as createPiHarness } from "./lib/validation-harness.mts";
import { showSelectionList } from "../.pi/lib/vazir-ui.ts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const helpers = await loadFileModule<{
  listIdeas: (cwd: string) => Array<{ file: string; number: number; title: string; status: string }>;
  formatIdeaListItem: (idea: { file: string; number: number; title: string; status: string }) => string;
}>(path.join(".pi", "extensions", "vazir-context", "helpers.ts"));

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-idea-browse-"));
const ideasDir = path.join(cwd, ".context", "ideas");
fs.mkdirSync(ideasDir, { recursive: true });

const firstIdea = [
  "# Idea 001: Batch lazy index descriptions",
  "",
  "**Status:** open",
  "**Captured:** 2026-08-01",
  "**Promoted to:** —",
  "",
  "Initial body.",
  "",
].join("\n");
const secondIdea = [
  "# Idea 002: Reconsider port range",
  "",
  "**Status:** discarded",
  "**Captured:** 2026-08-02",
  "**Promoted to:** —",
  "",
  "Maybe later.",
  "",
].join("\n");

fs.writeFileSync(path.join(ideasDir, "idea-001.md"), firstIdea);
fs.writeFileSync(path.join(ideasDir, "idea-002.md"), secondIdea);

const harness = createPiHarness([extensionModule.default]);
const idea = harness.getCommand("idea");
assert(Boolean(idea), "idea command was not registered");

const notifications: Array<{ message: string; level: string }> = [];
const customSelectionCalls: Array<{ title: string; lines: string[] }> = [];
const viewerCalls: Array<{ title: string; markdown: string }> = [];
const inputValues: Array<string | undefined> = [];

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function detectTitle(lines: string[]): string {
  for (const line of lines) {
    const stripped = stripAnsi(line);
    if (stripped.includes("Idea tracker")) return "Idea tracker";
    if (stripped.includes("Open ideas")) return "Open ideas";
    const match = stripped.match(/idea-\d+\.md/);
    if (match) return match[0];
  }
  return "";
}

function makeCtx() {
  return {
    cwd,
    ui: {
      async input(_prompt: string, _hint?: string) {
        return inputValues.shift();
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async select(_title: string, _labels: string[]) {
        return inputValues.shift() ?? null;
      },
      async custom<T>(builder: (tui: any, theme: any, kb: any, done: (result: T) => void) => any, _options?: unknown) {
        const theme = {
          fg: (_color: string, text: string) => text,
          bold: (text: string) => text,
          bg: (_color: string, text: string) => text,
        };
        let result: T | undefined;
        const done = (value: T) => {
          result = value;
        };
        const widget = builder({ requestRender() {} }, theme, {}, done);
        const lines = widget?.render ? widget.render(200) : [];
        const title = detectTitle(lines);

        if (title === "Idea tracker" || title === "Open ideas") {
          customSelectionCalls.push({ title, lines });
          const next = inputValues.shift();
          const valueByLabel: Record<string, string | null> = {
            "1. Capture a new idea": "capture",
            "2. View existing ideas": "view",
            "Cancel": null,
            "1. idea-001.md — Batch lazy index descriptions (open)": "1",
            "2. idea-002.md — Reconsider port range (discarded)": "2",
          };
          const selected = next != null ? valueByLabel[next] : undefined;
          done(selected as T);
        } else if (title.startsWith("idea-")) {
          const mdLines = lines.map(stripAnsi);
          viewerCalls.push({ title, markdown: mdLines.join("\n") });
          done(undefined as T);
        }

        return result as T;
      },
    },
  };
}

// Direct capture with args should still work and bypass the selector.
await idea!.handler("Direct capture from browse test", makeCtx());
assert(fs.existsSync(path.join(ideasDir, "idea-003.md")), "direct capture with args did not create idea-003.md");

// Bare /idea → cancel at selector.
inputValues.push("Cancel");
await idea!.handler("", makeCtx());
const selectorCall = customSelectionCalls.find(call => call.title === "Idea tracker");
assert(Boolean(selectorCall), "bare /idea did not show Idea tracker selector");
const selectorText = selectorCall!.lines.map(stripAnsi).join("\n");
assert(selectorText.includes("1. Capture a new idea"), "selector missing capture option");
assert(selectorText.includes("2. View existing ideas"), "selector missing view option");
assert(selectorText.includes("Cancel"), "selector missing cancel option");
assert(notifications.some(note => note.message === "Idea tracker closed."), "selector cancel was not reported");

// Bare /idea → capture option → prompt text → creates idea-004.md.
inputValues.push("1. Capture a new idea", "Capture from selector");
await idea!.handler("", makeCtx());
assert(fs.existsSync(path.join(ideasDir, "idea-004.md")), "capture option did not create idea-004.md");
assert(fs.readFileSync(path.join(ideasDir, "idea-004.md"), "utf-8").includes("Capture from selector"), "capture option used wrong text");

// Bare /idea → view option → cancel at list.
inputValues.push("2. View existing ideas", "Cancel");
await idea!.handler("", makeCtx());
const viewCall = customSelectionCalls.find(call => call.title === "Open ideas");
assert(Boolean(viewCall), "view option did not show Open ideas list");
const viewText = viewCall!.lines.map(stripAnsi).join("\n");
assert(viewText.includes("Batch lazy index descriptions") && viewText.includes("(open)"), "list missing first idea with status");
assert(viewText.includes("Reconsider port range") && viewText.includes("(discarded)"), "list missing second idea with status");
assert(notifications.some(note => note.message === "Idea viewer closed."), "viewer cancel was not reported");

// Bare /idea → view option → select first idea → viewer opened.
inputValues.push("2. View existing ideas", "1. idea-001.md — Batch lazy index descriptions (open)");
await idea!.handler("", makeCtx());
assert(viewerCalls.some(call => call.title === "idea-001.md"), "selecting an idea did not open the markdown viewer");
assert(viewerCalls.some(call => call.markdown.includes("Initial body.")), "viewer did not render idea body");

// Empty ideas state: remove all ideas and verify notification.
for (const file of fs.readdirSync(ideasDir)) {
  fs.rmSync(path.join(ideasDir, file));
}
inputValues.push("2. View existing ideas");
await idea!.handler("", makeCtx());
assert(notifications.some(note => note.message === "No ideas have been captured yet."), "empty-ideas state was not reported");

// Helper tests.
const listed = helpers.listIdeas(cwd);
assert(listed.length === 0, "listIdeas should return empty after cleanup");

fs.writeFileSync(path.join(ideasDir, "idea-001.md"), firstIdea);
const listedAfter = helpers.listIdeas(cwd);
assert(listedAfter.length === 1, "listIdeas did not return one idea after restore");
assert(listedAfter[0]!.number === 1, "listIdeas returned wrong idea number");
assert(listedAfter[0]!.status === "open", "listIdeas returned wrong status");
const itemLabel = helpers.formatIdeaListItem(listedAfter[0]!);
assert(itemLabel === "idea-001.md — Batch lazy index descriptions (open)", `formatIdeaListItem returned unexpected label: ${itemLabel}`);

// Fallback path: showSelectionList with only ctx.ui.select (no custom) maps a label to its value.
const fallbackSelectValues = ["1. idea-001.md — Batch lazy index descriptions (open)"];
const fallbackValue = await showSelectionList(
  {
    ui: {
      async select(_title: string, _labels: string[]) {
        return fallbackSelectValues.shift() ?? null;
      },
    },
  },
  "Open ideas",
  [
    { value: "1", label: "1. idea-001.md — Batch lazy index descriptions (open)" },
    { value: "cancel", label: "Cancel" },
  ],
);
assert(fallbackValue === "1", `showSelectionList fallback returned wrong value: ${fallbackValue}`);

console.log("Idea browse validation passed");
