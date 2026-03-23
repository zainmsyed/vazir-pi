import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const originalExecSync = childProcess.execSync;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  return cwd;
}

function installJjStub(logLines: string[], currentOpId: string) {
  childProcess.execSync = ((command: string, options?: { encoding?: BufferEncoding }) => {
    if (command.startsWith("jj root")) {
      return options?.encoding ? "/tmp/fake-jj-root\n" : Buffer.from("/tmp/fake-jj-root\n");
    }

    if (command.includes("jj op log --no-graph --limit 1 --template 'id.short(8)'")) {
      return options?.encoding ? `${currentOpId}\n` : Buffer.from(`${currentOpId}\n`);
    }

    if (command.includes("jj op log --no-graph --limit")) {
      const output = `${logLines.join("\n")}\n`;
      return options?.encoding ? output : Buffer.from(output);
    }

    if (command.startsWith("jj op restore ")) {
      return options?.encoding ? "" : Buffer.from("");
    }

    if (command.startsWith("jj diff --stat")) {
      return options?.encoding ? "" : Buffer.from("");
    }

    throw new Error(`Unexpected command: ${command}`);
  }) as typeof childProcess.execSync;
}

function restoreExecSync() {
  childProcess.execSync = originalExecSync;
}

async function loadHarness() {
  const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-tracker.ts";
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?t=${Date.now()}`);
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

async function runPersistenceScenario() {
  const cwd = createProject("vazir-checkpoint-save-");
  installJjStub(["bbbbbbbb||snapshot working copy||now"], "bbbbbbbb");

  try {
    const harness = await loadHarness();
    const { ctx } = makeCtx(cwd, []);

    await harness.emit("session_start", {}, ctx);
    await harness.emit("input", { text: "Make retry labels readable" }, ctx);
    await harness.emit("tool_result", { toolName: "write" }, ctx);

    const labels = JSON.parse(fs.readFileSync(path.join(cwd, ".context", "settings", "jj-checkpoint-labels.json"), "utf-8")) as { labels: Record<string, string> };
    assert(labels.labels.bbbbbbbb === "Make retry labels readable", "tool_result did not persist the current op label");

    return {
      cwd,
      savedLabel: labels.labels.bbbbbbbb,
    };
  } finally {
    restoreExecSync();
  }
}

const persisted = await runPersistedLabelScenario();
const fallback = await runUnlabeledFallbackScenario();
const saved = await runPersistenceScenario();

console.log("Persisted JJ Labels");
console.log(`cwd: ${persisted.cwd}`);
console.log("options:");
for (const option of persisted.options) {
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

console.log("Saved JJ Label");
console.log(`cwd: ${saved.cwd}`);
console.log(`savedLabel: ${saved.savedLabel}`);