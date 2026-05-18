import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
const register = extensionModule.default;
const stubModuleDirs = installCommonPiStubs();

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "git" }, null, 2));
  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-017.md"), [
    "# Story 017: Guardrails",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-05-15  ",
    "**Last accessed:** 2026-05-15  ",
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Guard dangerous VCS actions.",
    "",
    "## Verification",
    "Blocked actions require approval.",
    "",
    "## Scope — files this story may touch",
    "- .pi/extensions/vazir-tracker/index.ts",
    "",
    "## Out of scope — do not touch",
    "- docs/",
    "",
    "## Dependencies",
    "- None",
    "",
    "---",
    "",
    "## Checklist",
    "- [ ] Example task",
    "",
    "---",
    "",
    "## Issues",
    "- None currently.",
    "",
    "## Completion Summary",
    "—",
  ].join("\n"));
  fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
  return cwd;
}

function makeCtx(cwd: string, notifications: Notification[]) {
  return {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      setFooter() {},
      setFooterFactory() {},
      onTerminalInput() { return () => {}; },
    },
  };
}

async function runScenario() {
  const cwd = createProject("vazir-vcs-tool-guard-");
  const notifications: Notification[] = [];
  const harness = createPiHarness([register]);
  const ctx = makeCtx(cwd, notifications);

  await harness.emit("session_start", {}, ctx);

  const blockedResults = await harness.emitResults("tool_call", { toolName: "bash", input: { command: "rm -rf .git" } }, ctx);
  const blocked = blockedResults.find(result => result && typeof result === "object" && "block" in (result as Record<string, unknown>)) as { block: boolean; reason?: string } | undefined;
  assert(blocked?.block === true, "expected destructive bash command to be blocked");
  assert(typeof blocked.reason === "string" && blocked.reason.includes("VCS_APPROVE"), "expected block reason to include approval guidance");
  assert(notifications.some(note => note.level === "warning" && note.message.includes("VCS_APPROVE")), "expected UI warning notification for blocked command");

  const tokenMatch = blocked.reason?.match(/VCS_APPROVE\s+(vcs-[a-z0-9]+)/i);
  assert(Boolean(tokenMatch?.[1]), "expected approval token in block reason");
  await harness.emit("input", { text: `VCS_APPROVE ${tokenMatch![1]}` }, ctx);
  await harness.emit("input", { text: "please retry the same command" }, ctx);

  const approvedResults = await harness.emitResults("tool_call", { toolName: "bash", input: { command: "rm -rf .git" } }, ctx);
  const approvedBlock = approvedResults.find(result => result && typeof result === "object" && "block" in (result as Record<string, unknown>)) as { block: boolean } | undefined;
  assert(approvedBlock === undefined, "expected approved retry to proceed without a block result");

  const writeBlockedResults = await harness.emitResults("tool_call", { toolName: "write", input: { path: ".git/config" } }, ctx);
  const writeBlocked = writeBlockedResults.find(result => result && typeof result === "object" && "block" in (result as Record<string, unknown>)) as { block: boolean; reason?: string } | undefined;
  assert(writeBlocked?.block === true, "expected protected write to be blocked");

  const safeResults = await harness.emitResults("tool_call", { toolName: "bash", input: { command: "echo ok > notes.txt" } }, ctx);
  const safeBlocked = safeResults.find(result => result && typeof result === "object" && "block" in (result as Record<string, unknown>)) as { block: boolean } | undefined;
  assert(safeBlocked === undefined, "expected safe bash command to proceed");

  console.log("validate-vazir-vcs-tool-guard: ok");
}

try {
  await runScenario();
} finally {
  cleanupStubModules(stubModuleDirs);
}
