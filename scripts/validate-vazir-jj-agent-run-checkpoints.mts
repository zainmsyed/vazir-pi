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
  let opLog = [...logLines];

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
      const output = `${opLog.join("\n")}\n`;
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

async function runMultiTurnScenario() {
  const cwd = createProject("vazir-jj-agent-run-multi-");
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

    // Turn 1: write a file
    await harness.emit("input", { text: "Turn one prompt" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("bbbbbbbb");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    stub.advanceOp("cccccccc");
    await harness.emit("agent_end", {}, ctx);

    // Turn 2: write another file
    await harness.emit("input", { text: "Turn two prompt" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("dddddddd");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/b.ts" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
    assert(fs.existsSync(storePath), "agent-run checkpoint store should exist after multi-turn session");

    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ preRunOpId: string; prompt: string; files: string[] }> };
    assert(store.checkpoints.length === 2, `expected 2 checkpoints, got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].preRunOpId === "dddddddd", "first checkpoint preRunOpId should be the op before turn 1");
    assert(store.checkpoints[0].prompt === "Turn one prompt", "first checkpoint prompt mismatch");
    assert(store.checkpoints[0].files.includes("src/a.ts"), "first checkpoint should record src/a.ts");
    assert(store.checkpoints[1].preRunOpId === "cccccccc", "second checkpoint preRunOpId should be the op before turn 2");
    assert(store.checkpoints[1].prompt === "Turn two prompt", "second checkpoint prompt mismatch");
    assert(store.checkpoints[1].files.includes("src/b.ts"), "second checkpoint should record src/b.ts");

    // Verify /checkpoint "Undo last agent run" restores the latest preRunOpId
    const { ctx: ctx2, prompts, notifications } = makeCtx(cwd, ["Undo last agent run — Turn two prompt"]);
    await harness.checkpointCommand!.handler("", ctx2);

    const notify = notifications.find(n => n.message.includes("Restored to pre-run state"));
    assert(Boolean(notify), "should notify restore using agent-run checkpoint");

    return { cwd, checkpointCount: store.checkpoints.length };
  } finally {
    restoreExecSync();
  }
}

async function runNoOpScenario() {
  const cwd = createProject("vazir-jj-agent-run-noop-");
  const stub = installJjStub(
    [
      "bbbbbbbb||snapshot working copy||now",
      "aaaaaaaa||snapshot working copy||1 minute ago",
    ],
    "bbbbbbbb",
    cwd,
  );

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);

    // Turn 1: writes a file
    await harness.emit("input", { text: "Write turn" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("aaaaaaaa");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    // Turn 2: no file writes (no-op)
    await harness.emit("input", { text: "No-op turn" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("bbbbbbbb");
    await harness.emit("agent_end", {}, ctx);

    const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ preRunOpId: string; prompt: string }> };
    assert(store.checkpoints.length === 1, `expected 1 checkpoint (no-op skipped), got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].prompt === "Write turn", "only the write turn should be checkpointed");

    // Undo should skip the no-op and restore the write turn's pre-run state
    const { ctx: ctx2, notifications } = makeCtx(cwd, ["Undo last agent run — Write turn"]);
    await harness.checkpointCommand!.handler("", ctx2);

    const notify = notifications.find(n => n.message.includes("Restored to pre-run state"));
    assert(Boolean(notify), "should restore the write turn's pre-run state, skipping no-op");
    assert(notify!.message.includes("Write turn"), "restore message should reference the write turn prompt");

    return { cwd, checkpointCount: store.checkpoints.length };
  } finally {
    restoreExecSync();
  }
}

async function runRestartSafeScenario() {
  const cwd = createProject("vazir-jj-agent-run-restart-");

  // Pre-seed a checkpoint store as if from a previous session
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json"),
    JSON.stringify({
      checkpoints: [
        {
          preRunOpId: "aaaaaaaa",
          prompt: "Pre-seeded run",
          files: ["src/x.ts"],
          timestamp: new Date().toISOString(),
          hasChanges: true,
        },
      ],
    }, null, 2),
  );

  installJjStub(
    [
      "cccccccc||snapshot working copy||now",
      "bbbbbbbb||snapshot working copy||1 minute ago",
      "aaaaaaaa||snapshot working copy||2 minutes ago",
    ],
    "cccccccc",
    cwd,
  );

  try {
    const harness = await loadHarness();

    // Start a fresh session (no before_agent_start / agent_end this time)
    const { ctx: ctx1 } = makeCtx(cwd, []);
    await harness.emit("session_start", {}, ctx1);

    // /checkpoint should see the pre-seeded checkpoint
    const { ctx: ctx2, notifications } = makeCtx(cwd, ["Undo last agent run — Pre-seeded run"]);
    await harness.checkpointCommand!.handler("", ctx2);

    const notify = notifications.find(n => n.message.includes("Restored to pre-run state"));
    assert(Boolean(notify), "should restore pre-seeded checkpoint after session restart");
    assert(notify!.message.includes("Pre-seeded run"), "restore message should reference the pre-seeded prompt");

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runEditToolScenario() {
  const cwd = createProject("vazir-jj-agent-run-edit-");
  const stub = installJjStub(
    [
      "bbbbbbbb||snapshot working copy||now",
      "aaaaaaaa||snapshot working copy||1 minute ago",
    ],
    "bbbbbbbb",
    cwd,
  );

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Edit turn" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("aaaaaaaa");
    await harness.emit("tool_call", { toolName: "edit", input: { path: "src/a.ts", oldText: "x", newText: "y" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ prompt: string; files: string[] }> };
    assert(store.checkpoints.length === 1, `expected 1 checkpoint for edit tool, got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].files.includes("src/a.ts"), "edit tool should record the edited file");

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runMultiFileScenario() {
  const cwd = createProject("vazir-jj-agent-run-multi-file-");
  const stub = installJjStub(
    [
      "cccccccc||snapshot working copy||now",
      "bbbbbbbb||snapshot working copy||1 minute ago",
      "aaaaaaaa||snapshot working copy||2 minutes ago",
    ],
    "cccccccc",
    cwd,
  );

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Multi-file turn" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    stub.advanceOp("bbbbbbbb");
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/b.ts" } }, ctx);
    stub.advanceOp("cccccccc");
    await harness.emit("agent_end", {}, ctx);

    const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ files: string[] }> };
    assert(store.checkpoints.length === 1, `expected 1 checkpoint, got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].files.length === 2, `expected 2 files, got ${store.checkpoints[0].files.length}`);
    assert(store.checkpoints[0].files.includes("src/a.ts"), "should record src/a.ts");
    assert(store.checkpoints[0].files.includes("src/b.ts"), "should record src/b.ts");

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runCorruptedStoreScenario() {
  const cwd = createProject("vazir-jj-agent-run-corrupt-");
  const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
  fs.writeFileSync(storePath, "not valid json {{{");

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
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Corrupt store turn" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ prompt: string }> };
    assert(store.checkpoints.length === 1, `expected 1 checkpoint after recovering corrupt store, got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].prompt === "Corrupt store turn", "new checkpoint should be written after ignoring corrupt store");

    return { cwd };
  } finally {
    restoreExecSync();
  }
}

async function runPruneBoundaryScenario() {
  const cwd = createProject("vazir-jj-agent-run-prune-");
  const storePath = path.join(cwd, ".context", "settings", "jj-agent-run-checkpoints.json");
  const existingCheckpoints = [];
  for (let i = 1; i <= 25; i++) {
    existingCheckpoints.push({
      preRunOpId: String(i).padStart(8, "0"),
      prompt: `Turn ${i}`,
      files: [`src/${i}.ts`],
      timestamp: new Date().toISOString(),
      hasChanges: true,
    });
  }
  fs.writeFileSync(storePath, JSON.stringify({ checkpoints: existingCheckpoints }, null, 2));

  installJjStub(
    [
      "zzzzzzzz||snapshot working copy||now",
      "yyyyyyyy||snapshot working copy||1 minute ago",
    ],
    "zzzzzzzz",
    cwd,
  );

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Turn 26" }, ctx);
    await harness.emit("before_agent_start", {}, ctx);
    await harness.emit("tool_call", { toolName: "write", input: { path: "src/26.ts" } }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const store = JSON.parse(fs.readFileSync(storePath, "utf-8")) as { checkpoints: Array<{ prompt: string }> };
    assert(store.checkpoints.length === 20, `expected 20 checkpoints after prune, got ${store.checkpoints.length}`);
    assert(store.checkpoints[0].prompt === "Turn 7", "oldest checkpoint should be Turn 7 (Turns 1-6 pruned)");
    assert(store.checkpoints[19].prompt === "Turn 26", "newest checkpoint should be Turn 26");

    return { cwd, checkpointCount: store.checkpoints.length };
  } finally {
    restoreExecSync();
  }
}

// ── Runner ─────────────────────────────────────────────────────────────

const scenarioName = process.env.VAZIR_JJ_AGENT_RUN_SCENARIO;

if (scenarioName) {
  const scenarios: Record<string, () => Promise<unknown>> = {
    multiTurn: runMultiTurnScenario,
    noOp: runNoOpScenario,
    restartSafe: runRestartSafeScenario,
    editTool: runEditToolScenario,
    multiFile: runMultiFileScenario,
    corruptedStore: runCorruptedStoreScenario,
    pruneBoundary: runPruneBoundaryScenario,
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
        VAZIR_JJ_AGENT_RUN_SCENARIO: name,
      },
    }).trim();
    return JSON.parse(raw).result;
  }

  const multiTurn = runScenarioInSubprocess("multiTurn") as Awaited<ReturnType<typeof runMultiTurnScenario>>;
  const noOp = runScenarioInSubprocess("noOp") as Awaited<ReturnType<typeof runNoOpScenario>>;
  const restartSafe = runScenarioInSubprocess("restartSafe") as Awaited<ReturnType<typeof runRestartSafeScenario>>;
  const editTool = runScenarioInSubprocess("editTool") as Awaited<ReturnType<typeof runEditToolScenario>>;
  const multiFile = runScenarioInSubprocess("multiFile") as Awaited<ReturnType<typeof runMultiFileScenario>>;
  const corruptedStore = runScenarioInSubprocess("corruptedStore") as Awaited<ReturnType<typeof runCorruptedStoreScenario>>;
  const pruneBoundary = runScenarioInSubprocess("pruneBoundary") as Awaited<ReturnType<typeof runPruneBoundaryScenario>>;

  console.log("Multi-turn agent runs");
  console.log(`cwd: ${multiTurn.cwd}`);
  console.log(`checkpointCount: ${multiTurn.checkpointCount}`);
  console.log("");

  console.log("No-op run skipped");
  console.log(`cwd: ${noOp.cwd}`);
  console.log(`checkpointCount: ${noOp.checkpointCount}`);
  console.log("");

  console.log("Restart-safe recovery");
  console.log(`cwd: ${restartSafe.cwd}`);
  console.log("");

  console.log("Edit tool tracked");
  console.log(`cwd: ${editTool.cwd}`);
  console.log("");

  console.log("Multi-file run tracked");
  console.log(`cwd: ${multiFile.cwd}`);
  console.log("");

  console.log("Corrupted store recovered");
  console.log(`cwd: ${corruptedStore.cwd}`);
  console.log("");

  console.log("Prune boundary respected");
  console.log(`cwd: ${pruneBoundary.cwd}`);
  console.log(`checkpointCount: ${pruneBoundary.checkpointCount}`);
  console.log("");
}

cleanupStubModules(stubModuleDirs);
