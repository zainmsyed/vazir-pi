import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const trackerExtensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
const registerTracker = trackerExtensionModule.default;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createFakeFossilProject(prefix: string): { cwd: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const cwd = path.join(root, "workspace");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "fossil", vcs_preference: "fossil" }, null, 2));

  const fossilScript = path.join(binDir, "fossil");
  fs.writeFileSync(fossilScript, `#!/usr/bin/env node
const args = process.argv.slice(2);
const cwd = process.cwd();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  if (args[0] === 'info' && args[1] === '--json') {
    process.stdout.write(JSON.stringify({ checkout: { root: cwd } }));
    return;
  }
  if (args[0] === 'info') {
    process.stdout.write('local-root: ' + cwd + '\n');
    return;
  }
  if (
    (args[0] === 'changes') ||
    (args[0] === 'extras') ||
    (args[0] === 'branch' && args[1] === 'current') ||
    (args[0] === 'setting' && args[1] === 'autosync') ||
    (args[0] === 'diff')
  ) {
    await sleep(5000);
    process.stdout.write('');
    return;
  }
  process.exitCode = 1;
})();
`);
  fs.chmodSync(fossilScript, 0o755);

  return { cwd, binDir };
}

function makePi() {
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const pi = {
    getThinkingLevel() {
      return "xhigh";
    },
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand() {},
    async sendUserMessage() {},
  };

  registerTracker(pi as any);

  return {
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(cwd: string) {
  return {
    cwd,
    hasUI: true,
    model: { provider: "anthropic", id: "haiku-3.5", reasoning: true },
    sessionManager: {
      getSessionFile() {
        return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
      },
      getBranch() {
        return [];
      },
      getEntries() {
        return [];
      },
    },
    getContextUsage() {
      return { tokens: 1000, contextWindow: 200000, percent: 0.5 };
    },
    ui: {
      notify() {},
      setWidget() {},
      setHeader() {},
      setFooter() {},
      setFooterFactory() {},
      setToolOutputExpanded() {},
      onTerminalInput() {
        return () => {};
      },
    },
  };
}

try {
  const { cwd, binDir } = createFakeFossilProject("vazir-fossil-timeouts-");
  const harness = makePi();
  const ctx = makeCtx(cwd);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;

  const startedAt = Date.now();
  try {
    await harness.emit("session_start", {}, ctx);
  } finally {
    process.env.PATH = originalPath;
  }
  const elapsedMs = Date.now() - startedAt;
  const helpersSource = fs.readFileSync(path.join(process.cwd(), ".pi", "lib", "vazir-helpers.ts"), "utf-8");
  const vcsSource = fs.readFileSync(path.join(process.cwd(), ".pi", "extensions", "vazir-tracker", "vcs.ts"), "utf-8");
  const trackerIndexSource = fs.readFileSync(path.join(process.cwd(), ".pi", "extensions", "vazir-tracker", "index.ts"), "utf-8");

  assert(elapsedMs < 1000, `session_start should defer slow fossil status refresh instead of blocking resume/new (elapsed ${elapsedMs}ms)`);
  assert(helpersSource.includes("timeout: FOSSIL_DETECT_TIMEOUT_MS"), "detectFossil should pass a timeout to fossil info commands");
  assert(vcsSource.includes("timeout: FOSSIL_STATUS_TIMEOUT_MS"), "tracker fossil status commands should pass a timeout");
  assert(trackerIndexSource.includes("function deferInitialVcsRefresh(cwd: string): void"), "tracker should defer initial VCS refresh off the session_start critical path");

  console.log("validate-vazir-fossil-timeouts: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
