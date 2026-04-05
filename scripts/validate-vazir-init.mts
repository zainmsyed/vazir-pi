import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionPath = "/home/zain/Documents/coding/vazir-pi/.pi/extensions/vazir-context/index.ts";
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(cwd, "src.ts"), "export const value = 1;\n");
  fs.writeFileSync(path.join(cwd, "lib.js"), "module.exports = { ok: true };\n");
  return cwd;
}

function createPathWithGitOnly(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-git-only-bin-"));
  const gitPath = childProcess.execFileSync("which", ["git"], { encoding: "utf-8" }).trim();
  fs.symlinkSync(gitPath, path.join(binDir, "git"));
  return binDir;
}

function makePi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const sentMessages: string[] = [];
  const pi = {
    on() {},
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: string) {
      sentMessages.push(message);
    },
  };

  register(pi as any);
  const command = commands.get("vazir-init");
  assert(Boolean(command), "vazir-init command was not registered");
  return { command: command!, sentMessages };
}

function makeCtx(cwd: string, choice: string, notifications: Notification[]) {
  return {
    cwd,
    model: null,
    modelRegistry: {
      async getApiKey() {
        return null;
      },
    },
    ui: {
      async select() {
        return choice;
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

function getSummary(notifications: Notification[]): string {
  const summary = notifications.find(entry => entry.message.startsWith("Vazir init summary"));
  assert(Boolean(summary), "init summary notification was not emitted");
  return summary!.message;
}

async function runMissingJjScenario() {
  const cwd = createProject("vazir-init-missing-jj-");
  const { command, sentMessages } = makePi();
  const notifications: Notification[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createPathWithGitOnly();

  try {
    await command.handler("", makeCtx(cwd, "Yes — initialise git", notifications));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  assert(summary.includes("☒ JJ (Jujutsu): Not started"), "missing-JJ summary did not show the not-started message");
  assert(summary.includes("↳ Go here to install directions https://www.jj-vcs.dev/latest/install-and-setup/"), "missing-JJ summary did not include the install directions line");
  assert(fs.existsSync(path.join(cwd, ".context/memory/system.md")), "system.md was not created");
  assert(fs.existsSync(path.join(cwd, ".context/memory/index.md")), "index.md was not created");
  assert(fs.existsSync(path.join(cwd, ".context/memory/context-map.md")), "context-map.md was not created");
  assert(fs.existsSync(path.join(cwd, ".context/intake")), "intake/ was not created");
  assert(fs.existsSync(path.join(cwd, ".context/intake/README.md")), "intake README was not created");
  assert(fs.existsSync(path.join(cwd, ".context/settings/project.json")), "project.json was not created");
  assert(fs.existsSync(path.join(cwd, "AGENTS.md")), "AGENTS.md was not created");
  assert(
    sentMessages.every(message => !message.includes("JJ is not installed")),
    "missing-JJ scenario should not send the JJ install notice as a follow-up message",
  );

  return { cwd, summary, notifications };
}

async function runMissingFileScenario() {
  const cwd = createProject("vazir-init-missing-file-");
  const { command } = makePi();
  const notifications: Notification[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-empty-bin-"));

  try {
    await command.handler("", makeCtx(cwd, "Skip JJ — use git fallback", notifications));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  assert(summary.includes("☑ AGENTS.md"), "live file install summary did not show AGENTS.md as present");
  assert(summary.includes("☑ .context/memory/system.md"), "summary did not include system.md as present");
  assert(summary.includes("☑ .context/memory/index.md"), "summary did not include index.md as present");
  assert(summary.includes("☑ .context/memory/context-map.md"), "summary did not include context-map.md as present");
  assert(summary.includes("☑ .context/intake/"), "summary did not include intake as present");
  assert(summary.includes("☑ .context/settings/project.json"), "summary did not include project.json as present");
  assert(fs.existsSync(path.join(cwd, "AGENTS.md")), "AGENTS.md should have been created live in the file scenario");

  return { cwd, summary, notifications };
}

const missingJj = await runMissingJjScenario();
const missingFile = await runMissingFileScenario();

function printScenario(title: string, result: { cwd: string; summary: string; notifications: Notification[] }) {
  console.log(title);
  console.log(`cwd: ${result.cwd}`);
  console.log("summary:");
  for (const line of result.summary.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log("notifications:");
  for (const note of result.notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }
  console.log("");
}

printScenario("Missing JJ", missingJj);
printScenario("Missing file", missingFile);