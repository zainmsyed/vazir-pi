import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const repoRoot = "/home/zain/Documents/coding/vazir-pi";
const extensionPath = path.join(repoRoot, ".pi", "extensions", "vazir-tracker.ts");

function ensureStubModule(moduleName: string, content: string): string {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  fs.mkdirSync(moduleDir, { recursive: true });
  const indexPath = path.join(moduleDir, "index.js");
  fs.writeFileSync(indexPath, content);
  return moduleDir;
}

const stubModuleDirs = [
  ensureStubModule("@mariozechner/pi-tui", [
    "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape' };",
    "exports.matchesKey = (data, key) => data === key;",
    "exports.Container = class {};",
    "exports.Text = class {};",
    "",
  ].join("\n")),
  ensureStubModule("@mariozechner/pi-coding-agent", [
    "exports.DynamicBorder = class {};",
    "",
  ].join("\n")),
];

const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type WidgetMount = {
  key: string;
  factory: (tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }) => {
    render(width?: number): string[];
    invalidate(): void;
    dispose?(): void;
  };
  options?: unknown;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit --allow-empty -qm init", { cwd, stdio: "pipe" });
  return cwd;
}

function makePi() {
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
    commands,
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(cwd: string, notifications: Notification[]) {
  let widgetMount: WidgetMount | null = null;
  let customRenderLines: string[] = [];

  const ctx = {
    cwd,
    hasUI: true,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget(key: string, factory: WidgetMount["factory"], options?: unknown) {
        widgetMount = { key, factory, options };
      },
      async custom(factory: (tui: { requestRender(): void }, theme: { fg: (label: string, text: string) => string }, kb: unknown, done: () => void) => any) {
        const component = factory({ requestRender() {} }, { fg: (_label: string, text: string) => text }, undefined, () => {});
        customRenderLines = component.render(120);
      },
    },
    getWidgetMount() {
      return widgetMount;
    },
    getCustomRenderLines() {
      return customRenderLines;
    },
  };

  return ctx;
}

async function runScenario() {
  const cwd = createProject("vazir-edits-stream-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);

  await harness.emit("session_start", {}, ctx);

  const widgetMount = ctx.getWidgetMount();
  assert(widgetMount !== null, "tracker widget was not mounted");
  assert(harness.commands.has("edits"), "edits command was not registered");

  await harness.emit("tool_call", { toolName: "write", input: { path: "src/demo.ts" } }, ctx);
  await harness.emit("tool_result", { toolName: "write" }, ctx);
  await harness.emit("tool_call", { toolName: "edit", input: { path: "src/demo.ts" } }, ctx);
  await harness.emit("tool_result", { toolName: "edit" }, ctx);

  const widget = widgetMount!.factory({ requestRender() {} }, { fg: (_label: string, text: string) => text });
  const widgetLines = widget.render(120);
  assert(widgetLines.some(line => line.includes("/edits")), "widget did not advertise the /edits viewer");
  assert(widgetLines.some(line => line.includes("write src/demo.ts")), "widget did not show the write event");
  assert(widgetLines.some(line => line.includes("edit src/demo.ts")), "widget did not show the edit event");

  const editsCommand = harness.commands.get("edits");
  assert(editsCommand, "edits command missing");
  await editsCommand!.handler("", ctx);

  const viewerLines = ctx.getCustomRenderLines();
  assert(viewerLines[0]?.includes("Recent edits"), "edits viewer header was not rendered");
  assert(viewerLines.some(line => line.includes("write src/demo.ts")), "edits viewer did not include the write event");
  assert(viewerLines.some(line => line.includes("edit src/demo.ts")), "edits viewer did not include the edit event");

  return { cwd, notifications, widgetLines, viewerLines };
}

function printScenario(title: string, details: Record<string, unknown>) {
  console.log(title);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.log(`${key}:`);
      for (const item of value) {
        if (typeof item === "string") {
          console.log(`  - ${item}`);
        } else if (item && typeof item === "object" && "message" in item && "level" in item) {
          const note = item as Notification;
          console.log(`  - [${note.level}] ${note.message}`);
        } else {
          console.log(`  - ${JSON.stringify(item)}`);
        }
      }
      continue;
    }

    console.log(`${key}: ${String(value)}`);
  }
  console.log("");
}

const scenario = await runScenario();
printScenario("Edits Stream", scenario);

for (const moduleDir of stubModuleDirs.reverse()) {
  fs.rmSync(moduleDir, { recursive: true, force: true });
}