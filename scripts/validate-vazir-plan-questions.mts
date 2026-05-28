import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;
const stubModuleDirs = installCommonPiStubs();

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "intake"), { recursive: true });
  return cwd;
}

function makePi() {
  const harness = createPiHarness([register]);
  const planCommand = harness.getCommand("plan");
  assert(Boolean(planCommand), "plan command was not registered");

  return {
    planCommand: planCommand!,
    sentMessages: harness.sentMessages,
    async emitResult(name: string, event: any, ctx: any) {
      const results = await harness.emitResults(name, event, ctx);
      return results[0];
    },
  };
}

function makeCtx(cwd: string, notifications: Notification[] = [], selectChoice: string | undefined = undefined) {
  return {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      async input() {
        return undefined;
      },
      async select() {
        return selectChoice;
      },
    },
  };
}

async function runInstructionIsConciseScenario() {
  const cwd = createProject("vazir-plan-concise-");
  const harness = makePi();
  const ctx = makeCtx(cwd);

  fs.mkdirSync(path.join(cwd, ".context", "intake", "prd"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "intake", "prd", "test.md"), "# PRD\n");

  await harness.planCommand.handler("", ctx);

  const instruction = harness.sentMessages[0]?.message ?? "";
  const lineCount = instruction.split("\n").length;

  assert(instruction.includes("ONE clarifying question at a time"), "instruction must enforce one question per turn");
  assert(instruction.includes("Do NOT ask multiple questions in one turn"), "instruction must explicitly forbid multiple questions");
  assert(instruction.includes("Do not list, number, or categorize questions"), "instruction must forbid question grouping");
  assert(!instruction.includes("plan-pending.json"), "instruction must NOT mention the removed plan-pending.json mechanism");
  assert(!instruction.includes("ONE-AT-A-TIME PROTOCOL"), "instruction must NOT mention the old protocol block");
  assert(lineCount < 40, `instruction is too long (${lineCount} lines); should be concise`);

  return { cwd, lineCount };
}

async function runNoSourcesPathScenario() {
  const cwd = createProject("vazir-plan-no-sources-");
  const harness = makePi();
  const ctx = makeCtx(cwd);

  await harness.planCommand.handler("", ctx);

  const instruction = harness.sentMessages[0]?.message ?? "";
  assert(instruction.includes("ONE clarifying question at a time"), "no-sources path must also enforce one question per turn");
  assert(instruction.includes("Who are the users?"), "no-sources path must include default question list");
  assert(!instruction.includes("plan-pending.json"), "no-sources path must NOT mention plan-pending.json");

  return { cwd };
}

async function runInputPassthroughScenario() {
  const cwd = createProject("vazir-plan-passthrough-");
  const harness = makePi();
  const ctx = makeCtx(cwd);

  const result = await harness.emitResult("input", { text: "some normal user message", source: "interactive" }, ctx);

  assert(result?.action === "continue", "input handler should pass through normal user messages unchanged");

  return { cwd, result };
}

async function runReplanInstructionScenario() {
  const cwd = createProject("vazir-plan-replan-");
  const harness = makePi();
  const ctx = makeCtx(cwd, [], "Replan — update scope and stories");
  fs.writeFileSync(path.join(cwd, ".context", "stories", "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "# Story 001\n**Status:** not-started\n");

  await harness.planCommand.handler("", ctx);

  const instruction = harness.sentMessages[0]?.message ?? "";
  assert(instruction.includes("Preserve existing story files"), "replan must preserve existing stories");
  assert(instruction.includes("addendum"), "replan must mention addendum for plan.md");

  return { cwd };
}

function printScenario(title: string, details: Record<string, unknown>) {
  console.log(title);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.log(`${key}:`);
      for (const item of value) {
        console.log(`  - ${typeof item === "string" ? item : JSON.stringify(item)}`);
      }
      continue;
    }
    console.log(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  console.log("");
}

try {
  const concise = await runInstructionIsConciseScenario();
  const noSources = await runNoSourcesPathScenario();
  const passthrough = await runInputPassthroughScenario();
  const replan = await runReplanInstructionScenario();

  printScenario("Instruction Is Concise", concise);
  printScenario("No-Sources Path", noSources);
  printScenario("Input Passthrough", passthrough);
  printScenario("Replan Instruction", replan);

  console.log("All plan-question validation scenarios passed.");
} finally {
  cleanupStubModules(stubModuleDirs);
}
