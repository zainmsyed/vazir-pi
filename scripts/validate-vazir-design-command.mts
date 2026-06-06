import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

function createProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vazir-design-command-"));
}

function makeCtx(cwd: string, notifications: Array<{ message: string; level: string }>) {
  return {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

try {
  const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
  const harness = createPiHarness([extensionModule.default]);
  const command = harness.getCommand("design");
  assert(Boolean(command), "design command was not registered");

  const cwd = createProject();
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = makeCtx(cwd, notifications);

  await command!.handler("Create a DeepWiki-inspired dark Fossil docs theme with a docs sidebar, tag pills, and explicit boundaries for timeline vs wiki treatment.", ctx);

  assert(harness.sentMessages.length === 1, `design command should send one follow-up message, got ${harness.sentMessages.length}`);
  const message = String(harness.sentMessages[0]?.message ?? "");

  assert(message.includes("Update the design artifacts in .context/design/"), "design instruction should target the design artifacts");
  assert(message.includes(".context/design/brand.md"), "design instruction should mention brand.md");
  assert(message.includes(".context/design/design-system.md"), "design instruction should mention design-system.md");
  assert(message.includes(".context/design/components.md"), "design instruction should mention components.md");
  assert(message.includes("Refine existing decisions instead of clobbering them"), "design instruction should preserve useful prior decisions");
  assert(message.includes("page-treatment boundaries"), "design instruction should require page-treatment boundaries");
  assert(message.includes("constraints, and non-goals"), "design instruction should require constraints and non-goals");
  assert(message.includes("Keep design-system.md under ~300 tokens"), "design instruction should enforce the design-system size cap");
  assert(message.includes("Current design summary:"), "design instruction should include the current design summary");
  assert(
    notifications.some(note => note.message.includes("Design update handed to the current Pi model")),
    "design command should notify that the update was handed to the model",
  );

  const designSystem = fs.readFileSync(path.join(cwd, ".context", "design", "design-system.md"), "utf-8");
  const brand = fs.readFileSync(path.join(cwd, ".context", "design", "brand.md"), "utf-8");
  const components = fs.readFileSync(path.join(cwd, ".context", "design", "components.md"), "utf-8");

  assert(designSystem.includes("## Theme direction"), "design-system template should include theme direction");
  assert(designSystem.includes("## Page treatment boundaries"), "design-system template should include page treatment boundaries");
  assert(brand.includes("## Theme direction"), "brand template should include theme direction");
  assert(brand.includes("Non-goals"), "brand template should include non-goals");
  assert(components.includes("## Global shell"), "components template should include global shell");
  assert(components.includes("## Constrained Fossil-native pages"), "components template should include constrained Fossil-native pages");

  console.log("validate-vazir-design-command");
  console.log(`cwd: ${cwd}`);
  console.log("All /design assertions passed.");
} finally {
  cleanupStubModules(stubModuleDirs);
}
