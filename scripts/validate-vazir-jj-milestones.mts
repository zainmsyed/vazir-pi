import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const originalExecSync = childProcess.execSync;
const originalExecFileSync = childProcess.execFileSync;
let importNonce = 0;

const stubModuleDirs = installCommonPiStubs();

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  return cwd;
}

function installJjStub(
  logLines: string[],
  currentOpId: string,
  repoRoot: string,
) {
  let currentOp = currentOpId;

  childProcess.execSync = ((command: string, options?: { encoding?: BufferEncoding }) => {
    if (command.startsWith("git rev-parse --git-dir")) {
      return options?.encoding ? ".git\n" : Buffer.from(".git\n");
    }

    if (command.startsWith("git rev-parse --show-toplevel")) {
      return options?.encoding ? `${repoRoot}\n` : Buffer.from(`${repoRoot}\n`);
    }

    if (command.startsWith("jj root")) {
      return options?.encoding ? `${repoRoot}\n` : Buffer.from(`${repoRoot}\n`);
    }

    if (command.includes("jj op log --no-graph --limit 1 --template 'id.short(8)'")) {
      return options?.encoding ? `${currentOp}\n` : Buffer.from(`${currentOp}\n`);
    }

    if (command.includes("jj op log --no-graph --limit")) {
      const output = `${logLines.join("\n")}\n`;
      return options?.encoding ? output : Buffer.from(output);
    }

    if (command.startsWith("jj describe -m ")) {
      currentOp = "cccccccc";
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command.startsWith("jj op restore ")) {
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command.startsWith("jj restore --from @-")) {
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command.startsWith("jj diff --stat")) {
      return options?.encoding ? "" : Buffer.from("");
    }

    throw new Error(`Unexpected command: ${command}`);
  }) as typeof childProcess.execSync;

  childProcess.execFileSync = ((command: string, args?: string[], options?: { encoding?: BufferEncoding }) => {
    const argList = args ?? [];

    if (command === "jj" && argList[0] === "describe" && argList[1] === "-m") {
      currentOp = "cccccccc";
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command === "jj" && argList[0] === "op" && argList[1] === "restore") {
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command === "jj" && argList[0] === "restore" && argList[1] === "--from" && argList[2] === "@-") {
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command === "jj" && argList[0] === "diff" && argList[1] === "--no-color") {
      return options?.encoding ? "" : Buffer.from("");
    }

    throw new Error(`Unexpected execFileSync: ${command} ${argList.join(" ")}`);
  }) as typeof childProcess.execFileSync;

  return {
    advanceOp(nextOpId: string) {
      currentOp = nextOpId;
    },
  };
}

function restoreExecSync() {
  childProcess.execSync = originalExecSync;
  childProcess.execFileSync = originalExecFileSync;
}

async function loadHarness() {
  const extensionPath = path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "index.ts");
  const nonce = ++importNonce;
  const extensionDir = path.dirname(extensionPath);
  const tempTrackerPath = path.join(extensionDir, `.validate-vazir-tracker-${process.pid}-${nonce}.ts`);
  const trackerSource = fs.readFileSync(extensionPath, "utf-8").replace(
    'from "../lib/vazir-helpers.ts";',
    `from "../lib/vazir-helpers.ts?t=${nonce}";`,
  );
  fs.writeFileSync(tempTrackerPath, trackerSource);

  const extensionModule = await loadFileModule<{ default: (pi: any) => void }>(tempTrackerPath, `${Date.now()}-${nonce}`);
  fs.rmSync(tempTrackerPath, { force: true });
  const register = extensionModule.default;

  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();

  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
    async sendUserMessage() {},
  };

  register(pi as any);

  return {
    checkpointCommand: commands.get("checkpoint"),
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(cwd: string, selectedLabels: string[]) {
  const prompts: Array<{ prompt: string; options: string[] }> = [];
  const notifications: Array<{ message: string; type: string }> = [];
  return {
    ctx: {
      cwd,
      hasUI: false,
      sessionManager: {
        getSessionFile() {
          return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
        },
      },
      ui: {
        notify(message: string, type: string) {
          notifications.push({ message, type });
        },
        setWidget() {},
        async select(prompt: string, options: string[]) {
          prompts.push({ prompt, options });
          return selectedLabels.shift() ?? null;
        },
      },
    },
    prompts,
    notifications,
  };
}

// ── Scenarios ──────────────────────────────────────────────────────────

async function runAgentRunMilestoneScenario() {
  const cwd = createProject("vazir-jj-milestone-agent-run-");
  const stub = installJjStub(
    [
      "dddddddd||snapshot working copy||now",
      "cccccccc||describe commit 12345678||1 minute ago",
      "bbbbbbbb||snapshot working copy||1 minute ago",
      "aaaaaaaa||snapshot working copy||2 minutes ago",
    ],
    "dddddddd",
    cwd,
  );

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);

    // Agent run 1
    await harness.emit("input", { text: "First run" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("bbbbbbbb");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    stub.advanceOp("cccccccc");
    await harness.emit("agent_end", {}, ctx);

    // Agent run 2
    await harness.emit("input", { text: "Second run" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("dddddddd");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/b.ts" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const milestonesPath = path.join(cwd, ".context", "settings", "jj-milestones.json");
    assert(fs.existsSync(milestonesPath), "milestone store should exist after agent runs with file changes");

    const store = JSON.parse(fs.readFileSync(milestonesPath, "utf-8")) as { milestones: Array<{ kind: string; label: string }> };
    assert(store.milestones.length === 2, `expected 2 milestones, got ${store.milestones.length}`);
    assert(store.milestones[0].kind === "agent-run", "first milestone should be agent-run");
    assert(store.milestones[0].label === "First run", "first milestone label mismatch");
    assert(store.milestones[1].kind === "agent-run", "second milestone should be agent-run");
    assert(store.milestones[1].label === "Second run", "second milestone label mismatch");

    return { cwd, milestoneCount: store.milestones.length };
  } finally {
    restoreExecSync();
  }
}

async function runMilestonePickerScenario() {
  const cwd = createProject("vazir-jj-milestone-picker-");

  // Pre-seed milestones
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-milestones.json"),
    JSON.stringify({
      milestones: [
        {
          id: "ms-1",
          opId: "aaaaaaaa",
          label: "Initial milestone",
          timestamp: new Date().toISOString(),
          kind: "explicit-save",
        },
      ],
    }, null, 2),
  );

  installJjStub(
    [
      "bbbbbbbb||snapshot working copy||now",
      "aaaaaaaa||snapshot working copy||1 minute ago",
    ],
    "bbbbbbbb",
    cwd,
  );

  try {
    const harness = await loadHarness();

    // Start a fresh session
    const { ctx: ctx1 } = makeCtx(cwd, []);
    await harness.emit("session_start", {}, ctx1);

    // /checkpoint should show milestone options, not raw snapshot spam
    const { ctx: ctx2, prompts } = makeCtx(cwd, [
      "Browse milestones — pick from curated history",
      "Initial milestone",
    ]);
    await harness.checkpointCommand!.handler("", ctx2);

    const firstPrompt = prompts.find(p => p.prompt === "Restore checkpoint?");
    assert(Boolean(firstPrompt), "checkpoint command should show restore prompt");
    assert(
      firstPrompt!.options.includes("Browse milestones — pick from curated history"),
      "primary picker should offer milestone browsing",
    );
    assert(
      !firstPrompt!.options.includes("Choose checkpoint — pick from history"),
      "primary picker should NOT offer raw JJ history",
    );
    assert(
      firstPrompt!.options.includes("Save milestone — mark current state"),
      "primary picker should offer explicit save",
    );

    const secondPrompt = prompts.find(p => p.prompt === "Restore to which milestone?");
    assert(Boolean(secondPrompt), "milestone browser prompt should be shown");
    assert(secondPrompt!.options.length >= 1, "milestone browser should show at least one milestone");
    assert(
      secondPrompt!.options.some((o: string) => o.includes("Initial milestone")),
      "milestone browser should show the seeded milestone",
    );

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runExplicitSaveMilestoneScenario() {
  const cwd = createProject("vazir-jj-milestone-explicit-");
  installJjStub(
    [
      "bbbbbbbb||snapshot working copy||now",
      "aaaaaaaa||snapshot working copy||1 minute ago",
    ],
    "bbbbbbbb",
    cwd,
  );

  try {
    const harness = await loadHarness();

    const { ctx: ctx1 } = makeCtx(cwd, []);
    await harness.emit("session_start", {}, ctx1);

    // Simulate user typing a prompt, then explicitly saving a milestone
    await harness.emit("input", { text: "Important change before release" }, ctx1);

    const { ctx: ctx2, prompts, notifications } = makeCtx(cwd, [
      "Save milestone — mark current state",
    ]);
    await harness.checkpointCommand!.handler("", ctx2);

    const notify = notifications.find(n => n.message === "Current state saved as milestone");
    assert(Boolean(notify), "explicit save should notify success");

    const milestonesPath = path.join(cwd, ".context", "settings", "jj-milestones.json");
    const store = JSON.parse(fs.readFileSync(milestonesPath, "utf-8")) as { milestones: Array<{ kind: string; label: string }> };
    assert(store.milestones.length === 1, `expected 1 explicit milestone, got ${store.milestones.length}`);
    assert(store.milestones[0].kind === "explicit-save", "explicit save should have kind explicit-save");
    assert(
      store.milestones[0].label.includes("Important change before release"),
      "explicit save should include user prompt in label",
    );

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runWorkflowBoundaryMilestoneScenario() {
  const cwd = createProject("vazir-jj-milestone-boundary-");

  // Pre-seed a workflow-boundary milestone as if from a closeout hook
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-milestones.json"),
    JSON.stringify({
      milestones: [
        {
          id: "ms-boundary-1",
          opId: "aaaaaaaa",
          label: "Story closeout — story-028",
          timestamp: new Date().toISOString(),
          kind: "workflow-boundary",
        },
      ],
    }, null, 2),
  );

  installJjStub(
    [
      "bbbbbbbb||snapshot working copy||now",
      "aaaaaaaa||snapshot working copy||1 minute ago",
    ],
    "bbbbbbbb",
    cwd,
  );

  try {
    const harness = await loadHarness();

    const { ctx: ctx1 } = makeCtx(cwd, []);
    await harness.emit("session_start", {}, ctx1);

    const { ctx: ctx2, prompts } = makeCtx(cwd, [
      "Browse milestones — pick from curated history",
      "Story closeout — story-028",
    ]);
    await harness.checkpointCommand!.handler("", ctx2);

    const milestonePrompt = prompts.find(p => p.prompt === "Restore to which milestone?");
    assert(Boolean(milestonePrompt), "milestone browser should be shown");
    assert(
      milestonePrompt!.options.some((o: string) => o.includes("Boundary") && o.includes("story-028")),
      "workflow-boundary milestone should be visible with kind prefix",
    );

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

// ── Runner ─────────────────────────────────────────────────────────────

const scenarioName = process.env.VAZIR_JJ_MILESTONE_SCENARIO;

if (scenarioName) {
  const scenarios: Record<string, () => Promise<unknown>> = {
    agentRun: runAgentRunMilestoneScenario,
    picker: runMilestonePickerScenario,
    explicitSave: runExplicitSaveMilestoneScenario,
    workflowBoundary: runWorkflowBoundaryMilestoneScenario,
  };

  const run = scenarios[scenarioName];
  assert(Boolean(run), `Unknown scenario: ${scenarioName}`);
  const result = await run();
  console.log(JSON.stringify({ scenario: scenarioName, result }));
} else {
  function runScenarioInSubprocess(name: string): unknown {
    const raw = childProcess.execFileSync(process.execPath, ["--experimental-strip-types", process.argv[1]], {
      encoding: "utf-8",
      env: {
        ...process.env,
        VAZIR_JJ_MILESTONE_SCENARIO: name,
      },
    }).trim();
    return JSON.parse(raw).result;
  }

  const agentRun = runScenarioInSubprocess("agentRun") as Awaited<ReturnType<typeof runAgentRunMilestoneScenario>>;
  const picker = runScenarioInSubprocess("picker") as Awaited<ReturnType<typeof runMilestonePickerScenario>>;
  const explicitSave = runScenarioInSubprocess("explicitSave") as Awaited<ReturnType<typeof runExplicitSaveMilestoneScenario>>;
  const workflowBoundary = runScenarioInSubprocess("workflowBoundary") as Awaited<ReturnType<typeof runWorkflowBoundaryMilestoneScenario>>;

  console.log("Agent-run milestones");
  console.log(`cwd: ${agentRun.cwd}`);
  console.log(`milestoneCount: ${agentRun.milestoneCount}`);
  console.log("");

  console.log("Milestone picker UX");
  console.log(`cwd: ${picker.cwd}`);
  console.log("");

  console.log("Explicit save milestone");
  console.log(`cwd: ${explicitSave.cwd}`);
  console.log("");

  console.log("Workflow-boundary milestone visibility");
  console.log(`cwd: ${workflowBoundary.cwd}`);
  console.log("");
}

cleanupStubModules(stubModuleDirs);
