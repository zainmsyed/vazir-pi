import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./lib/validation-harness.mts";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chromePath = path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "chrome.ts");

const source = fs.readFileSync(chromePath, "utf-8");

// Extract command names from VAZIR_COMMAND_HELP
const helpMatches = [...source.matchAll(/\{\s*command:\s*"([^"]+)",\s*description:/g)];
const helpCommands = helpMatches.map(m => m[1]);

// Extract command names from VAZIR_COMMAND_DOCS
const docMatches = [...source.matchAll(/\{\s*command:\s*"([^"]+)",\s*shortDesc:/g)];
const docCommands = docMatches.map(m => m[1]);

assert(helpCommands.length > 0, "Should find commands in VAZIR_COMMAND_HELP");
assert(docCommands.length > 0, "Should find commands in VAZIR_COMMAND_DOCS");

// Every help entry must have a doc
for (const cmd of helpCommands) {
  assert(
    docCommands.includes(cmd),
    `Missing CommandDoc for ${cmd}`,
  );
}

// Every doc must have a help entry
for (const cmd of docCommands) {
  assert(
    helpCommands.includes(cmd),
    `Extra CommandDoc without VAZIR_COMMAND_HELP entry: ${cmd}`,
  );
}

// Check that getCommandDoc and validateCommandDocsComplete are exported
assert(source.includes("export function getCommandDoc"), "getCommandDoc should be exported");
assert(source.includes("export function validateCommandDocsComplete"), "validateCommandDocsComplete should be exported");

// Check that the help overlay uses the registry and detail overlay
assert(source.includes("getCommandDoc(pick)"), "showCommandHelp should use getCommandDoc to look up selected command");
assert(source.includes("showCommandDetailOverlay(ctx, doc)"), "showCommandHelp should open showCommandDetailOverlay for selected command");
assert(source.includes('"Quickstart: "'), "showCommandHelp should include a quickstart banner");
assert(source.includes("new piTui.SelectList"), "showCommandHelp should use piTui.SelectList for the selectable list");
assert(source.includes("while (true)"), "showCommandHelp should loop back to the list after detail closes");

// Check that the README selection path exists and is guarded
assert(source.includes('value: "README"'), "showCommandHelp should include a README entry in the command list");
assert(source.includes('pick === "README"'), "showCommandHelp should handle README selection");
assert(source.includes("fs.readFileSync(readmePath") && source.includes("try {"), "README file read should be guarded by try/catch");
assert(source.includes("README.md not found"), "README missing-file fallback should notify the user");

console.log(`validate-vazir-command-docs: ${helpCommands.length} commands, all matched: ok`);
