import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const originalExecSync = childProcess.execSync;
const originalExecFileSync = childProcess.execFileSync;
let importNonce = 0;
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function ensureStubModule(moduleName: string, content: string): string | null {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  if (fs.existsSync(moduleDir)) {
    return null;
  }

  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, "package.json"), JSON.stringify({ name: moduleName, type: "commonjs" }, null, 2));
  fs.writeFileSync(path.join(moduleDir, "index.js"), content);
  return moduleDir;
}

const stubModuleDirs = [
  ensureStubModule("@mariozechner/pi-tui", [
    "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape', ctrl: value => value, ctrlShift: value => value, shiftCtrl: value => value };",
    "exports.matchesKey = (data, key) => data === key;",
    "exports.Container = class {};",
    "exports.Text = class {};",
    "",
  ].join("\n")),
  ensureStubModule("@mariozechner/pi-coding-agent", [
    "exports.DynamicBorder = class {};",
    "",
  ].join("\n")),
].filter((dir): dir is string => dir !== null);

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  return cwd;
}

function installJjStub(logLines: string[], currentOpId: string, onDescribe?: (message: string) => void) {
  let currentOp = currentOpId;

  childProcess.execSync = ((command: string, options?: { encoding?: BufferEncoding }) => {
    if (command.startsWith("git rev-parse --git-dir")) {
      return options?.encoding ? ".git\n" : Buffer.from(".git\n");
    }

    if (command.startsWith("jj root")) {
      return options?.encoding ? "/tmp/fake-jj-root\n" : Buffer.from("/tmp/fake-jj-root\n");
    }

    if (command.includes("jj op log --no-graph --limit 1 --template 'id.short(8)'")) {
      return options?.encoding ? `${currentOp}\n` : Buffer.from(`${currentOp}\n`);
    }

    if (command.includes("jj op log --no-graph --limit")) {
      const output = `${logLines.join("\n")}\n`;
      return options?.encoding ? output : Buffer.from(output);
    }

    if (command.startsWith("jj describe -m ")) {
      const message = JSON.parse(command.slice("jj describe -m ".length)) as string;
      onDescribe?.(message);
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
      const message = argList[2] ?? "";
      onDescribe?.(message);
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

  const extensionModule = await import(`${pathToFileURL(tempTrackerPath).href}?t=${Date.now()}-${nonce}`);
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
        notify() {},
        setWidget() {},
        async select(prompt: string, options: string[]) {
          prompts.push({ prompt, options });
          return selectedLabels.shift() ?? null;
        },
      },
    },
    prompts,
  };
}

async function runPersistedLabelScenario() {
  const cwd = createProject("vazir-checkpoint-labels-");
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"),
    JSON.stringify({
      labels: {
        aaaaaaaa: "Fix auth refresh flow",
        cccccccc: "Tighten retry rule handling",
      },
    }, null, 2),
  );

  installJjStub([
    "bbbbbbbb||snapshot working copy||now",
    "aaaaaaaa||snapshot working copy||1 hour ago",
    "dddddddd||import git head||1 hour ago",
    "cccccccc||restore to operation||2 hours ago",
  ], "bbbbbbbb");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "1 hour ago · Fix auth refresh flow",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "checkpoint history prompt was not shown");
    assert(historyPrompt!.options.length === 2, "checkpoint history should only include human-labeled entries");
    assert(historyPrompt!.options[0] === "1 hour ago · Fix auth refresh flow", "first human label did not match persisted prompt");
    assert(historyPrompt!.options[1] === "2 hours ago · Tighten retry rule handling", "second human label did not match persisted prompt");

    return {
      cwd,
      options: historyPrompt!.options,
    };
  } finally {
    restoreExecSync();
  }
}

async function runDescribeBackfillScenario() {
  const cwd = createProject("vazir-checkpoint-describe-backfill-");
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"),
    JSON.stringify({
      labels: {
        cccccccc: "Make retry labels readable",
      },
    }, null, 2),
  );

  installJjStub([
    "dddddddd||snapshot working copy||now",
    "cccccccc||describe commit abcdef12||1 minute ago",
    "bbbbbbbb||snapshot working copy||1 minute ago",
    "aaaaaaaa||snapshot working copy||2 minutes ago",
  ], "dddddddd");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "1 minute ago · Make retry labels readable",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "describe-backfill checkpoint prompt was not shown");
    assert(historyPrompt!.options[0] === "1 minute ago · Make retry labels readable", "snapshot checkpoint did not inherit the adjacent describe label");
    assert(historyPrompt!.options[1] === "2 minutes ago · Checkpoint", "fallback checkpoint order was not preserved after describe backfill");

    return {
      cwd,
      options: historyPrompt!.options,
    };
  } finally {
    restoreExecSync();
  }
}

async function runUnlabeledFallbackScenario() {
  const cwd = createProject("vazir-checkpoint-fallback-");
  installJjStub([
    "bbbbbbbb||snapshot working copy||now",
    "aaaaaaaa||snapshot working copy||1 hour ago",
    "dddddddd||import git head||90 minutes ago",
    "cccccccc||restore to operation||2 hours ago",
    "eeeeeeee||import git refs||3 hours ago",
  ], "bbbbbbbb");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "1 hour ago · Checkpoint",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "fallback checkpoint history prompt was not shown");
    assert(historyPrompt!.options.length === 2, "fallback checkpoint history should hide JJ internal import operations");
    assert(historyPrompt!.options[0] === "1 hour ago · Checkpoint", "snapshot fallback label was not humanized");
    assert(historyPrompt!.options[1] === "2 hours ago · Restored checkpoint", "restore fallback label was not humanized");

    return {
      cwd,
      options: historyPrompt!.options,
    };
  } finally {
    restoreExecSync();
  }
}

async function runLongHistoryScenario() {
  const cwd = createProject("vazir-checkpoint-long-history-");
  const logLines = ["bbbbbbbb||snapshot working copy||now"];

  for (let index = 1; index <= 20; index++) {
    const opId = `${String(index).padStart(8, "0")}`;
    logLines.push(`${opId}||snapshot working copy||${index} hour${index === 1 ? "" : "s"} ago`);
  }

  installJjStub(logLines, "bbbbbbbb");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "1 hour ago · Checkpoint",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "long-history checkpoint prompt was not shown");
    assert(historyPrompt!.options.length === 12, "checkpoint history should include a longer capped list");
    assert(historyPrompt!.options[0] === "1 hour ago · Checkpoint", "long-history list should stay sorted by recency");
    assert(historyPrompt!.options[11] === "12 hours ago · Checkpoint", "long-history list should be capped after 12 visible checkpoints");

    return {
      cwd,
      optionCount: historyPrompt!.options.length,
      first: historyPrompt!.options[0],
      last: historyPrompt!.options[11],
    };
  } finally {
    restoreExecSync();
  }
}

async function runRecencyOrderingScenario() {
  const cwd = createProject("vazir-checkpoint-recency-order-");
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"),
    JSON.stringify({
      labels: {
        cccccccc: "Older labeled checkpoint",
      },
    }, null, 2),
  );

  installJjStub([
    "ffffffff||snapshot working copy||now",
    "eeeeeeee||snapshot working copy||1 minute ago",
    "cccccccc||describe commit abcdef12||2 minutes ago",
    "dddddddd||snapshot working copy||2 minutes ago",
    "bbbbbbbb||restore to operation||3 minutes ago",
    "aaaaaaaa||snapshot working copy||4 minutes ago",
  ], "ffffffff");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "1 minute ago · Checkpoint",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "recency-order checkpoint prompt was not shown");
    assert(historyPrompt!.options[0] === "1 minute ago · Checkpoint", "most recent visible checkpoint should stay first");
    assert(historyPrompt!.options[1] === "2 minutes ago · Older labeled checkpoint", "labeled checkpoints should remain in recency order");
    assert(historyPrompt!.options[2] === "3 minutes ago · Restored checkpoint", "restore checkpoints should remain in recency order");
    assert(historyPrompt!.options[3] === "4 minutes ago · Checkpoint", "older fallback checkpoints should stay after newer entries");

    return {
      cwd,
      options: historyPrompt!.options,
    };
  } finally {
    restoreExecSync();
  }
}

async function runSkipCurrentSnapshotScenario() {
  const cwd = createProject("vazir-checkpoint-skip-current-snapshot-");
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"),
    JSON.stringify({
      labels: {
        cccccccc: "Bad turn prompt",
        aaaaaaaa: "Good previous checkpoint",
      },
    }, null, 2),
  );

  installJjStub([
    "dddddddd||describe commit deadbeef||now",
    "cccccccc||snapshot working copy||now",
    "bbbbbbbb||restore to operation||2 minutes ago",
    "aaaaaaaa||snapshot working copy||4 minutes ago",
  ], "dddddddd");

  try {
    const harness = await loadHarness();
    assert(Boolean(harness.checkpointCommand), "checkpoint command was not registered");

    const { ctx, prompts } = makeCtx(cwd, [
      "Choose checkpoint — pick from history",
      "2 minutes ago · Restored checkpoint",
    ]);

    await harness.emit("session_start", {}, ctx);
    await harness.checkpointCommand!.handler("", ctx);

    const historyPrompt = prompts.find(entry => entry.prompt === "Restore to which checkpoint?");
    assert(Boolean(historyPrompt), "skip-current-snapshot checkpoint prompt was not shown");
    assert(historyPrompt!.options[0] === "2 minutes ago · Restored checkpoint", "current turn snapshot should not appear as the first restorable checkpoint");
    assert(historyPrompt!.options[1] === "4 minutes ago · Good previous checkpoint", "previous good checkpoint should remain available after skipping current snapshot");

    return {
      cwd,
      options: historyPrompt!.options,
    };
  } finally {
    restoreExecSync();
  }
}

async function runPersistenceScenario() {
  const cwd = createProject("vazir-checkpoint-save-");
  const describedMessages: string[] = [];
  installJjStub([
    "cccccccc||describe commit 12345678||now",
    "bbbbbbbb||snapshot working copy||1 minute ago",
  ], "bbbbbbbb", message => {
    describedMessages.push(message);
  });

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Make retry labels readable" }, ctx);
    await harness.emit("agent_end", {}, ctx);

    const labels = JSON.parse(fs.readFileSync(path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"), "utf-8")) as { labels: Record<string, string> };
    assert(describedMessages[0] === "Make retry labels readable", "agent_end did not describe the JJ change with the prompt");
    assert(labels.labels.bbbbbbbb === "Make retry labels readable", "agent_end did not persist the snapshot op label before describe");

    return {
      cwd,
      savedLabel: labels.labels.bbbbbbbb,
    };
  } finally {
    restoreExecSync();
  }
}

const scenarioName = process.env.VAZIR_CHECKPOINT_SCENARIO;

if (scenarioName) {
  const scenarios: Record<string, () => Promise<unknown>> = {
    persisted: runPersistedLabelScenario,
    describeBackfill: runDescribeBackfillScenario,
    fallback: runUnlabeledFallbackScenario,
    longHistory: runLongHistoryScenario,
    recencyOrdering: runRecencyOrderingScenario,
    skipCurrentSnapshot: runSkipCurrentSnapshotScenario,
    saved: runPersistenceScenario,
  };

  const run = scenarios[scenarioName];
  assert(Boolean(run), `Unknown checkpoint scenario: ${scenarioName}`);
  const result = await run();
  console.log(JSON.stringify({ scenario: scenarioName, result }));
} else {
  function runScenarioInSubprocess(name: string): unknown {
    const raw = childProcess.execFileSync(process.execPath, ["--experimental-strip-types", process.argv[1]], {
      encoding: "utf-8",
      env: {
        ...process.env,
        VAZIR_CHECKPOINT_SCENARIO: name,
      },
    }).trim();
    return JSON.parse(raw).result;
  }

  const persisted = runScenarioInSubprocess("persisted") as Awaited<ReturnType<typeof runPersistedLabelScenario>>;
  const describeBackfill = runScenarioInSubprocess("describeBackfill") as Awaited<ReturnType<typeof runDescribeBackfillScenario>>;
  const fallback = runScenarioInSubprocess("fallback") as Awaited<ReturnType<typeof runUnlabeledFallbackScenario>>;
  const longHistory = runScenarioInSubprocess("longHistory") as Awaited<ReturnType<typeof runLongHistoryScenario>>;
  const recencyOrdering = runScenarioInSubprocess("recencyOrdering") as Awaited<ReturnType<typeof runRecencyOrderingScenario>>;
  const skipCurrentSnapshot = runScenarioInSubprocess("skipCurrentSnapshot") as Awaited<ReturnType<typeof runSkipCurrentSnapshotScenario>>;
  const saved = runScenarioInSubprocess("saved") as Awaited<ReturnType<typeof runPersistenceScenario>>;

  console.log("Persisted JJ Labels");
  console.log(`cwd: ${persisted.cwd}`);
  console.log("options:");
  for (const option of persisted.options) {
    console.log(`  - ${option}`);
  }
  console.log("");

  console.log("Describe Label Backfill");
  console.log(`cwd: ${describeBackfill.cwd}`);
  console.log("options:");
  for (const option of describeBackfill.options) {
    console.log(`  - ${option}`);
  }
  console.log("");

  console.log("Unlabeled JJ Fallback");
  console.log(`cwd: ${fallback.cwd}`);
  console.log("options:");
  for (const option of fallback.options) {
    console.log(`  - ${option}`);
  }
  console.log("");

  console.log("Long JJ History");
  console.log(`cwd: ${longHistory.cwd}`);
  console.log(`optionCount: ${longHistory.optionCount}`);
  console.log(`first: ${longHistory.first}`);
  console.log(`last: ${longHistory.last}`);
  console.log("");

  console.log("Recency Ordering");
  console.log(`cwd: ${recencyOrdering.cwd}`);
  console.log("options:");
  for (const option of recencyOrdering.options) {
    console.log(`  - ${option}`);
  }
  console.log("");

  console.log("Skip Current Snapshot");
  console.log(`cwd: ${skipCurrentSnapshot.cwd}`);
  console.log("options:");
  for (const option of skipCurrentSnapshot.options) {
    console.log(`  - ${option}`);
  }
  console.log("");

  console.log("Saved JJ Label");
  console.log(`cwd: ${saved.cwd}`);
  console.log(`savedLabel: ${saved.savedLabel}`);
}

for (const moduleDir of stubModuleDirs.reverse()) {
  fs.rmSync(moduleDir, { recursive: true, force: true });
}