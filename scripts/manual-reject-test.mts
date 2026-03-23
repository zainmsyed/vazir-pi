// @ts-nocheck
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const cp = require("node:child_process") as typeof import("node:child_process");

const contextExt = await import(pathToFileURL("/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-context.ts").href + `?t=${Date.now()}`);
const trackerExt = await import(pathToFileURL("/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-tracker.ts").href + `?t=${Date.now()}`);

const registerContext = contextExt.default;
const registerTracker = trackerExt.default;

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => ({
  json: async () => ({
    content: [
      {
        text: [
          "## Learned Rules",
          "- initial rule",
          "- keep checkpoint labels human readable / avoid changing ValidateToken signature",
          "",
        ].join("\n"),
      },
    ],
  }),
})) as unknown as typeof globalThis.fetch;

process.env.ANTHROPIC_API_KEY = "test-key";

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-manual-reject-"));
cp.execSync("git init", { cwd, stdio: "pipe" });
cp.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
cp.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
cp.execSync("git commit --allow-empty -m init", { cwd, stdio: "pipe" });

fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
fs.mkdirSync(path.join(cwd, ".context", "learnings"), { recursive: true });
fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
fs.writeFileSync(
  path.join(cwd, ".context", "memory", "system.md"),
  [
    "# System",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- initial rule",
    "- initial rule",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(cwd, ".context", "learnings", "code-review.md"),
  "",
);
fs.writeFileSync(
  path.join(cwd, ".context", "learnings", "pending.md"),
  "",
);

const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
const sent: string[] = [];

const pi = {
  on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
    const list = handlers.get(name) ?? [];
    list.push(handler);
    handlers.set(name, list);
  },
  registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
    commands.set(name, definition);
  },
  async sendUserMessage(message: string) {
    sent.push(message);
  },
};

registerContext(pi as any);
registerTracker(pi as any);

const ctx = {
  cwd,
  hasUI: true,
  sessionManager: {
    getSessionFile() {
      return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
    },
  },
  ui: {
    notify(message: string, level: string) {
      sent.push(`[${level}] ${message}`);
    },
    setWidget() {},
    async input(prompt: string) {
      if (prompt.includes("What went wrong?")) {
        return sent.filter(line => line.startsWith("[info]")).length === 0
          ? "keep checkpoint labels human readable"
          : "avoid changing ValidateToken signature";
      }
      return "";
    },
    async confirm(prompt: string) {
      if (prompt === "Retry?") return false;
      return false;
    },
    async select(prompt: string, options: string[]) {
      if (prompt === "Restore checkpoint?") return "Keep current files";
      return options[0] ?? null;
    },
    async custom() {},
  },
};

for (const handler of handlers.get("session_start") ?? []) await handler({}, ctx);
for (const handler of handlers.get("input") ?? []) await handler({ text: "Build the checkpoint picker" }, ctx);
await commands.get("reject")!.handler("", ctx);
for (const handler of handlers.get("input") ?? []) await handler({ text: "Fix the JJ labels" }, ctx);
await commands.get("reject")!.handler("", ctx);
for (const handler of handlers.get("session_before_compact") ?? []) await handler({}, ctx);

console.log("---SYSTEM---");
console.log(fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8"));
console.log("---LEARNINGS---");
console.log(fs.readFileSync(path.join(cwd, ".context", "learnings", "code-review.md"), "utf-8"));
console.log("---PENDING---");
console.log(fs.readFileSync(path.join(cwd, ".context", "learnings", "pending.md"), "utf-8"));
console.log("---NOTIFY---");
for (const line of sent) console.log(line);

globalThis.fetch = originalFetch;
