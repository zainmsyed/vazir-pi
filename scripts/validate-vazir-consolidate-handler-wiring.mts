import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context", String(Date.now()));
const register = extensionModule.default;

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });

  // system.md with a rule that will be referenced by the review
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System Rules",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "- Always validate user input before processing <!-- source: story-001 -->",
      "",
    ].join("\n"),
  );

  // story-001.md with issues (failure category)
  fs.writeFileSync(
    path.join(cwd, ".context", "stories", "story-001.md"),
    [
      "# Story 001: Example",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-05-13  ",
      "**Last accessed:** 2026-05-13  ",
      "**Completed:** 2026-05-13",
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
      "- ",
      "",
      "---",
      "",
      "## Checklist",
      "- [x] Example task",
      "",
      "---",
      "",
      "## Issues",
      "### /fix — something",
      "- **Status:** resolved",
      "",
      "## Completion Summary",
      "Done.",
      "",
    ].join("\n"),
  );

  // complete review that mentions the rule text
  fs.writeFileSync(
    path.join(cwd, ".context", "reviews", "review-20260513-120000.md"),
    [
      "# Code Review 2026-05-13T12:00:00Z",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-05-13T12:00:00Z  ",
      "**Completed:** 2026-05-13  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "**Focus:** test  ",
      "**Trigger:** manual",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: medium",
      "- Category: bug",
      "- Summary: Always validate user input before processing is mentioned here",
      "- Rule candidate: —",
      "",
      "---",
      "",
      "## Completion Summary",
      "Done.",
      "",
    ].join("\n"),
  );

  return cwd;
}

try {
  const cwd = createProject("vazir-consolidate-handler-");

  const sentMessages: Array<{ message: string; options?: unknown }> = [];
  const sentInternalMessages: Array<{ message: any; options?: unknown }> = [];
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> | void }>();

  const pi = {
    on() {},
    registerCommand(name: string, def: any) {
      commands.set(name, def);
    },
    async sendUserMessage(message: unknown, options?: unknown) {
      sentMessages.push({ message: String(message), options });
    },
    sendMessage(message: any, options?: unknown) {
      sentInternalMessages.push({ message, options });
    },
  };

  register(pi);

  const consolidate = commands.get("consolidate");
  assert(Boolean(consolidate), "consolidate command was not registered");

  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async select(_prompt: string, _options: string[]) {
        return "Apply";
      },
    },
  };

  await consolidate!.handler("", ctx);

  const systemMdPath = path.join(cwd, ".context", "memory", "system.md");
  const systemMd = fs.readFileSync(systemMdPath, "utf-8");

  assert(
    systemMd.includes("<!-- confidence: high -->"),
    "system.md should have high confidence annotation after consolidate handler runs",
  );
  assert(
    systemMd.includes("### From failures"),
    "system.md should have From failures subsection after consolidate handler runs",
  );
  assert(
    sentMessages.length >= 1,
    `consolidate handler should send at least one follow-up user message, got ${sentMessages.length}`,
  );
  assert(
    sentMessages[sentMessages.length - 1].message.includes("story completion summaries"),
    "consolidate follow-up message should include the enriched instruction",
  );

  fs.rmSync(cwd, { recursive: true, force: true });
  console.log("Consolidate handler wiring validation passed");
} finally {
  cleanupStubModules(stubModuleDirs);
}
