import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

function createProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vazir-design-flow-"));
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

function replaceSection(content: string, heading: string, bodyLines: string[]): string {
  const lines = content.split("\n");
  const start = lines.findIndex(line => line.trim() === heading);
  assert(start >= 0, `missing section ${heading}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const replacement = [heading, ...bodyLines, ""];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function simulateDesignAgentTurn(cwd: string, prompt: string): void {
  assert(prompt.includes("Read the current contents of all three files before editing anything."), "prompt should instruct the downstream consumer to read current files");
  assert(prompt.includes("Refine existing decisions instead of clobbering them"), "prompt should instruct refinement");

  const brandPath = path.join(cwd, ".context", "design", "brand.md");
  const systemPath = path.join(cwd, ".context", "design", "design-system.md");
  const componentsPath = path.join(cwd, ".context", "design", "components.md");

  let brand = fs.readFileSync(brandPath, "utf-8");
  let system = fs.readFileSync(systemPath, "utf-8");
  let components = fs.readFileSync(componentsPath, "utf-8");

  if (prompt.includes("DeepWiki-inspired dark Fossil docs theme")) {
    brand = replaceSection(brand, "## Theme direction", [
      "- Product feel: DeepWiki-inspired docs shell for Fossil-backed project pages",
      "- Primary references: calm dark documentation UI, minimal chrome, restrained utility styling",
      "- Non-goals: do not promise custom structure for native Fossil timeline, diff, or admin HTML",
    ]);
    brand = replaceSection(brand, "## Tone", [
      "- Quiet, technical, and trustworthy",
      "- More documentation product than marketing site",
    ]);
    brand = replaceSection(brand, "## Constraints", [
      "- CSS/header/footer only; no React runtime",
      "- Native Fossil timeline and diff remain structurally constrained",
    ]);

    system = replaceSection(system, "## Theme direction", [
      "- Visual style: dark docs shell with strong reading contrast and restrained chrome",
      "- Interaction tone: modern and polished without hiding Fossil's native structure",
    ]);
    system = replaceSection(system, "## Colours", [
      "- Background: charcoal / near-black",
      "- Surface: elevated dark panel",
      "- Border: muted gray rule",
      "- Text: soft off-white with muted secondary copy",
      "- Accent: mint/teal for active states, links, and pills",
    ]);
    system = replaceSection(system, "## Component conventions", [
      "- Top nav: simple horizontal app bar with subtle active underline",
      "- Sidebar: docs-only left rail with grouped links",
      "- Content container: roomy reading column with light separators instead of heavy cards",
    ]);
    system = replaceSection(system, "## Page treatment boundaries", [
      "- Full treatment pages: wiki, FAQ, getting started, reference, curated changelog",
      "- Cosmetic-only pages: native timeline, diff, ticket, forum, and admin views",
    ]);

    components = replaceSection(components, "## Global shell", [
      "- Top navigation: dark app bar with Vazir/repo identity and understated active state",
      "- Page frame: centered content with restrained borders and generous whitespace",
    ]);
    components = replaceSection(components, "## Docs/wiki layer", [
      "- Sidebar: curated left nav for docs pages grouped by section",
      "- Content header: large title, muted subtitle, optional breadcrumb/subnav",
      "- Changelog entry block: title, date, tag pills, hash badge, and bullet changes",
    ]);
    components = replaceSection(components, "## Shared content styling", [
      "- Tag pill: soft rounded pill with pale accent fill and compact label",
      "- Hash/code badge: monospace inset badge for hashes, paths, and inline commands",
      "- Code block / inline code: dark inset treatment with subtle border",
    ]);
    components = replaceSection(components, "## Constrained Fossil-native pages", [
      "- Timeline: typography, spacing, graph color, and hash polish only",
      "- Diff and admin views: low-risk utility styling only",
    ]);
  } else if (prompt.includes("Tighten the pills")) {
    const shared = fs.readFileSync(componentsPath, "utf-8");
    assert(shared.includes("Tag pill: soft rounded pill with pale accent fill and compact label"), "repeat-run refinement should start from the prior pill decision");
    components = replaceSection(shared, "## Shared content styling", [
      "- Tag pill: compact high-contrast pill with 8px vertical rhythm, rounder corners, and category-based pale fills",
      "- Hash/code badge: monospace inset badge for hashes, paths, and inline commands",
      "- Code block / inline code: dark inset treatment with subtle border",
    ]);
    system = replaceSection(system, "## Colours", [
      "- Background: charcoal / near-black",
      "- Surface: elevated dark panel",
      "- Border: muted gray rule",
      "- Text: soft off-white with muted secondary copy",
      "- Accent: mint/teal for active states, links, and higher-contrast pills",
    ]);
  } else {
    throw new Error("unexpected design prompt in validation harness");
  }

  fs.writeFileSync(brandPath, brand);
  fs.writeFileSync(systemPath, system);
  fs.writeFileSync(componentsPath, components);
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
  assert(harness.sentMessages.length === 1, "first design run should send one follow-up message");
  simulateDesignAgentTurn(cwd, String(harness.sentMessages[0]?.message ?? ""));

  const brandAfterFirstRun = fs.readFileSync(path.join(cwd, ".context", "design", "brand.md"), "utf-8");
  const systemAfterFirstRun = fs.readFileSync(path.join(cwd, ".context", "design", "design-system.md"), "utf-8");
  const componentsAfterFirstRun = fs.readFileSync(path.join(cwd, ".context", "design", "components.md"), "utf-8");

  assert(brandAfterFirstRun.includes("Product feel: DeepWiki-inspired docs shell for Fossil-backed project pages"), "first run should write concrete theme direction to brand.md");
  assert(systemAfterFirstRun.includes("Accent: mint/teal for active states, links, and pills"), "first run should write concrete colour tokens to design-system.md");
  assert(systemAfterFirstRun.includes("Full treatment pages: wiki, FAQ, getting started, reference, curated changelog"), "first run should write page boundaries to design-system.md");
  assert(componentsAfterFirstRun.includes("Changelog entry block: title, date, tag pills, hash badge, and bullet changes"), "first run should write concrete component vocabulary to components.md");

  await command!.handler("Tighten the pills for better dark-mode contrast, but preserve the existing docs-first theme decisions.", ctx);
  assert(harness.sentMessages.length === 2, "second design run should send a second follow-up message");
  simulateDesignAgentTurn(cwd, String(harness.sentMessages[1]?.message ?? ""));

  const brandAfterSecondRun = fs.readFileSync(path.join(cwd, ".context", "design", "brand.md"), "utf-8");
  const systemAfterSecondRun = fs.readFileSync(path.join(cwd, ".context", "design", "design-system.md"), "utf-8");
  const componentsAfterSecondRun = fs.readFileSync(path.join(cwd, ".context", "design", "components.md"), "utf-8");

  assert(brandAfterSecondRun.includes("Product feel: DeepWiki-inspired docs shell for Fossil-backed project pages"), "repeat run should preserve prior brand direction");
  assert(systemAfterSecondRun.includes("Top nav: simple horizontal app bar with subtle active underline"), "repeat run should preserve prior component convention decisions in design-system.md");
  assert(systemAfterSecondRun.includes("Accent: mint/teal for active states, links, and higher-contrast pills"), "repeat run should refine the requested token in design-system.md");
  assert(componentsAfterSecondRun.includes("Tag pill: compact high-contrast pill with 8px vertical rhythm, rounder corners, and category-based pale fills"), "repeat run should refine the pill component in components.md");
  assert(componentsAfterSecondRun.includes("Changelog entry block: title, date, tag pills, hash badge, and bullet changes"), "repeat run should preserve unrelated component decisions");

  console.log("validate-vazir-design-flow");
  console.log(`cwd: ${cwd}`);
  console.log("All /design downstream flow assertions passed.");
} finally {
  cleanupStubModules(stubModuleDirs);
}
