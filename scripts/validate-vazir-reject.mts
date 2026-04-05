import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-tracker/index.ts";
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };
type ConfirmCall = { prompt: string; detail?: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "learnings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, "sample.ts"), "export const value = 'current';\n");
  childProcess.execSync("git init", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("git add .", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit -m 'initial fixture'", { cwd, stdio: "pipe" });
  return cwd;
}

function writeCheckpoint(cwd: string, sessionId: string, index: number, prompt: string, fileContent: string): void {
  const checkpointDir = path.join(cwd, ".context", "checkpoints", sessionId, String(index));
  const filesDir = path.join(checkpointDir, "files");
  fs.mkdirSync(filesDir, { recursive: true });
  fs.writeFileSync(path.join(filesDir, "sample.ts"), fileContent);
  fs.writeFileSync(
    path.join(checkpointDir, "meta.json"),
    JSON.stringify(
      {
        timestamp: new Date(Date.UTC(2026, 2, 22, 12, index, 0)).toISOString(),
        prompt,
        files: ["sample.ts"],
        newFiles: [],
      },
      null,
      2,
    ),
  );
}

function makePi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const sentMessages: string[] = [];

  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: string) {
      sentMessages.push(message);
    },
  };

  register(pi as any);

  const rejectCommand = commands.get("reject");
  assert(Boolean(rejectCommand), "reject command was not registered");

  return {
    rejectCommand: rejectCommand!,
    sentMessages,
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeBaseCtx(cwd: string, notifications: Notification[]) {
  return {
    cwd,
    hasUI: false,
    sessionManager: {
      getSessionFile() {
        return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
      },
    },
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      input: async () => undefined,
      select: async () => undefined,
      confirm: async () => false,
    },
  };
}

async function primeGitFallback(harness: ReturnType<typeof makePi>, cwd: string, notifications: Notification[]) {
  const ctx = makeBaseCtx(cwd, notifications);
  await harness.emit("session_start", {}, ctx);
  await harness.emit("input", { text: "Fix the broken auth flow" }, ctx);
}

async function runChooseCheckpointNoRetryScenario() {
  const cwd = createProject("vazir-reject-choose-no-retry-");
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const confirmCalls: ConfirmCall[] = [];
  const interactionOrder: string[] = [];
  const harness = makePi();

  writeCheckpoint(cwd, "deadbeef", 1, "First prompt", "export const value = 'checkpoint-1';\n");
  writeCheckpoint(cwd, "deadbeef", 2, "Second prompt", "export const value = 'checkpoint-2';\n");

  await primeGitFallback(harness, cwd, notifications);

  const ctx = makeBaseCtx(cwd, notifications);
  ctx.ui.input = async () => {
    interactionOrder.push("input");
    return "do not change sample.ts behavior";
  };
  ctx.ui.confirm = async (prompt: string, detail?: string) => {
    interactionOrder.push(`confirm:${prompt}`);
    confirmCalls.push({ prompt, detail });
    return false;
  };
  ctx.ui.select = async (prompt: string, options: string[]) => {
    interactionOrder.push(`select:${prompt}`);
    selectCalls.push({ prompt, options });

    if (prompt === "Restore checkpoint?") {
      return "Choose checkpoint — pick from list";
    }

    if (prompt === "Choose checkpoint to restore:") {
      return options[0];
    }

    throw new Error(`Unexpected select prompt: ${prompt}`);
  };

  await harness.rejectCommand.handler("", ctx);

  const content = fs.readFileSync(path.join(cwd, "sample.ts"), "utf-8");
  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  const learnings = fs.readFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "utf-8");

  assert(selectCalls.length === 2, "expected restore selection and checkpoint picker after retry was declined");
  assert(confirmCalls.length === 1, "expected a single retry confirmation");
  assert(interactionOrder.indexOf("confirm:Retry?") < interactionOrder.indexOf("select:Restore checkpoint?"), "retry confirmation should happen before restore choice");
  assert(interactionOrder.indexOf("select:Restore checkpoint?") < interactionOrder.indexOf("select:Choose checkpoint to restore:"), "restore choice should happen before checkpoint picker");
  assert(content.includes("checkpoint-2"), "selected checkpoint content was not restored");
  assert(systemMd.includes("- do not change sample.ts behavior"), "system.md did not record the rejection rule");
  assert(learnings.includes("do not change sample.ts behavior"), "learnings log did not record the rejection reason");
  assert(harness.sentMessages.length === 0, "retry declined should not resend the prompt");

  return {
    cwd,
    notifications,
    interactionOrder,
    restoredContent: content.trim(),
  };
}

async function runNoCheckpointScenario() {
  const cwd = createProject("vazir-reject-no-checkpoints-");
  const notifications: Notification[] = [];
  const interactionOrder: string[] = [];
  const harness = makePi();

  await primeGitFallback(harness, cwd, notifications);

  const ctx = makeBaseCtx(cwd, notifications);
  ctx.ui.input = async () => {
    interactionOrder.push("input");
    return "avoid changing sample.ts";
  };
  ctx.ui.confirm = async (prompt: string) => {
    interactionOrder.push(`confirm:${prompt}`);
    return false;
  };
  ctx.ui.select = async () => {
    interactionOrder.push("select");
    throw new Error("select should not be called when no checkpoints exist");
  };

  await harness.rejectCommand.handler("", ctx);

  assert(notifications.some(note => note.message === "No checkpoints available to restore"), "missing notification for empty checkpoint history");
  assert(harness.sentMessages.length === 0, "no-checkpoint flow should not resend the prompt when retry is declined");

  return {
    cwd,
    notifications,
    interactionOrder,
  };
}

async function runRetryRestoresPreviousCheckpointScenario() {
  const cwd = createProject("vazir-reject-retry-restores-");
  const notifications: Notification[] = [];
  const confirmCalls: ConfirmCall[] = [];
  const interactionOrder: string[] = [];
  const harness = makePi();

  writeCheckpoint(cwd, "deadbeef", 1, "First prompt", "export const value = 'checkpoint-1';\n");
  writeCheckpoint(cwd, "deadbeef", 2, "Second prompt", "export const value = 'checkpoint-2';\n");
  fs.writeFileSync(path.join(cwd, "sample.ts"), "export const value = 'broken';\n");

  await primeGitFallback(harness, cwd, notifications);

  const ctx = makeBaseCtx(cwd, notifications);
  ctx.ui.input = async () => {
    interactionOrder.push("input");
    return "do not change sample.ts behavior";
  };
  ctx.ui.confirm = async (prompt: string, detail?: string) => {
    interactionOrder.push(`confirm:${prompt}`);
    confirmCalls.push({ prompt, detail });
    return true;
  };
  ctx.ui.select = async (prompt: string) => {
    interactionOrder.push(`select:${prompt}`);
    throw new Error("select should not be called when retry auto-restores the previous checkpoint");
  };

  await harness.rejectCommand.handler("", ctx);

  const content = fs.readFileSync(path.join(cwd, "sample.ts"), "utf-8");
  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  const learnings = fs.readFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "utf-8");
  const pending = fs.readFileSync(path.join(cwd, ".context", "learnings", "pending.md"), "utf-8");

  assert(confirmCalls.length === 1, "expected a single retry confirmation in retry flow");
  assert(!interactionOrder.some(item => item.startsWith("select:")), "retry flow should not show restore pickers");
  assert(content.includes("checkpoint-2"), "retry should restore the previous checkpoint before resending");
  assert(systemMd.includes("- do not change sample.ts behavior"), "system.md did not preserve the rejection rule after retry restore");
  assert(learnings.includes("do not change sample.ts behavior"), "learnings log did not preserve the rejection reason after retry restore");
  assert(pending.includes("do not change sample.ts behavior"), "pending learnings did not preserve the rejection reason after retry restore");
  assert(harness.sentMessages.length === 1, "retry flow should resend exactly one prompt");
  assert(harness.sentMessages[0] === 'Previous attempt was rejected: "do not change sample.ts behavior"\n\nFix the broken auth flow', "retry flow resent the wrong prompt");

  return {
    cwd,
    notifications,
    interactionOrder,
    restoredContent: content.trim(),
    resentPrompt: harness.sentMessages[0],
  };
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

const chooseCheckpointNoRetry = await runChooseCheckpointNoRetryScenario();
const noCheckpoint = await runNoCheckpointScenario();
const retryRestoresPrevious = await runRetryRestoresPreviousCheckpointScenario();

printScenario("Choose Checkpoint, Then Decline Retry", chooseCheckpointNoRetry);
printScenario("No Checkpoints Available", noCheckpoint);
printScenario("Retry Restores Previous Checkpoint", retryRestoresPrevious);