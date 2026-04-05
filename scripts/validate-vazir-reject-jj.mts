import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-tracker/index.ts";
const extensionModule = await import(`${pathToFileURL(extensionPath).href}?t=${Date.now()}`);
const register = extensionModule.default;

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  childProcess.execSync("git init", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("jj git init --colocate", { cwd, stdio: "pipe" });

  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "learnings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n\n## Learned Rules\n");
  fs.writeFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "");
  fs.writeFileSync(path.join(cwd, ".context", "learnings", "pending.md"), "");

  childProcess.execSync("git add .", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit -m 'initial fixture'", { cwd, stdio: "pipe" });

  return cwd;
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

function makeCtx(cwd: string, notifications: Notification[]) {
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

async function runRealJjRetryRestoreScenario() {
  const cwd = createProject("vazir-reject-jj-");
  const notifications: Notification[] = [];
  const interactionOrder: string[] = [];
  const harness = makePi();

  const ctx = makeCtx(cwd, notifications);
  await harness.emit("session_start", {}, ctx);
  await harness.emit("input", { text: "create a test file describing the learning loop of vazir" }, ctx);

  const createdFile = path.join(cwd, "LEARNING_LOOP.md");
  fs.writeFileSync(createdFile, "learning loop contents\n");
  await harness.emit("tool_result", { toolName: "write" }, ctx);
  await harness.emit("agent_end", {}, ctx);

  assert(fs.existsSync(createdFile), "fixture setup failed: LEARNING_LOOP.md was not created");

  ctx.ui.input = async () => {
    interactionOrder.push("input");
    return "put it in the root dir";
  };
  ctx.ui.confirm = async (prompt: string) => {
    interactionOrder.push(`confirm:${prompt}`);
    return true;
  };
  ctx.ui.select = async (prompt: string) => {
    interactionOrder.push(`select:${prompt}`);
    throw new Error(`Retry flow should not prompt for checkpoint selection, got: ${prompt}`);
  };

  await harness.rejectCommand.handler("", ctx);

  const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
  const learnings = fs.readFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "utf-8");
  const pending = fs.readFileSync(path.join(cwd, ".context", "learnings", "pending.md"), "utf-8");
  const opLog = childProcess.execSync(
    "jj op log --no-graph --limit 6 --template 'id.short(8) ++ \"||\" ++ description ++ \"||\" ++ time.start().ago() ++ \"\\n\"'",
    { cwd, encoding: "utf-8" },
  ).trim();

  assert(interactionOrder.join(",") === "input,confirm:Retry?", "retry flow should only ask for the reason and retry confirmation");
  assert(!fs.existsSync(createdFile), "LEARNING_LOOP.md still existed after JJ retry restore");
  assert(systemMd.includes("- put it in the root dir"), "system.md did not keep the rejection reason after restore");
  assert(learnings.includes("put it in the root dir"), "code-review.md did not keep the rejection reason after restore");
  assert(pending.includes("put it in the root dir"), "pending.md did not keep the rejection reason after restore");
  assert(harness.sentMessages.length === 1, "retry flow should resend exactly one prompt");
  assert(
    harness.sentMessages[0] === 'Previous attempt was rejected: "put it in the root dir"\n\ncreate a test file describing the learning loop of vazir',
    "retry flow resent the wrong prompt",
  );

  return {
    cwd,
    notifications,
    interactionOrder,
    fileExistsAfterReject: fs.existsSync(createdFile),
    resentPrompt: harness.sentMessages[0],
    opLog,
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
}

const result = await runRealJjRetryRestoreScenario();
printScenario("Real JJ Retry Restore", result);