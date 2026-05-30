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

// Check that the help overlay includes the built-in quickstart instead of a file-backed README lookup
assert(source.includes('value: "VAZIR_QUICKSTART"'), "showCommandHelp should include a built-in Vazir quickstart entry");
assert(source.includes('label: "Vazir quickstart"'), "quickstart entry should be clearly labeled");
assert(source.includes('pick === VAZIR_QUICKSTART_ENTRY.value'), "showCommandHelp should handle Vazir quickstart selection");
assert(source.includes('showMarkdownViewer(ctx, VAZIR_QUICKSTART_ENTRY.label, VAZIR_QUICKSTART_MARKDOWN)'), "quickstart selection should open the built-in markdown viewer");
assert(source.includes("## .context folder guide"), "quickstart markdown should include the .context folder guide");
assert(source.includes("## Why .context/intake matters"), "quickstart markdown should explain why .context/intake matters");
assert(!source.includes('value: "README"'), "README picker entry should be removed from Ctrl+? help");
assert(!source.includes('pick === "README"'), "README selection branch should be removed from Ctrl+? help");
assert(!source.includes("README.md not found"), "README missing-file fallback should be removed from Ctrl+? help");

console.log(`validate-vazir-command-docs: ${helpCommands.length} commands plus built-in quickstart: ok`);
