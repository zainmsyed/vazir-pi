import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker");
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
  const harness = createPiHarness([register]);

  return {
    commands: harness.commands,
    async emit(name: string, event: any, ctx: any) {
      await harness.emit(name, event, ctx);
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

  assert(harness.commands.has("edits"), "edits command was not registered");

  await harness.emit("tool_call", { toolName: "write", input: { path: "src/demo.ts" } }, ctx);
  await harness.emit("tool_result", { toolName: "write" }, ctx);
  await harness.emit("tool_call", { toolName: "edit", input: { path: "src/demo.ts" } }, ctx);
  await harness.emit("tool_result", { toolName: "edit" }, ctx);

  const editsCommand = harness.commands.get("edits");
  assert(editsCommand, "edits command missing");
  await editsCommand!.handler("", ctx);

  const viewerLines = ctx.getCustomRenderLines();
  assert(viewerLines[0]?.includes("Recent edits"), "edits viewer header was not rendered");
  assert(viewerLines.some(line => line.includes("write src/demo.ts")), "edits viewer did not include the write event");
  assert(viewerLines.some(line => line.includes("edit src/demo.ts")), "edits viewer did not include the edit event");

  return { cwd, notifications, viewerLines };
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

try {
  const scenario = await runScenario();
  printScenario("Edits Stream", scenario);
} finally {
  cleanupStubModules(stubModuleDirs);
}