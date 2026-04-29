import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
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

const extensionPath = path.join(
  repoRoot,
  ".pi",
  "extensions",
  "vazir-context",
  "index.ts",
);
const extensionModule = await import(pathToFileURL(extensionPath).href);
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

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

function createPathWithGitAndFakeNpm(cwd: string): string {
  const binDir = createPathWithGitOnly();
  const npmPath = path.join(binDir, "npm");
  const fallowBinPath = path.join(cwd, "node_modules", ".bin", "fallow");
  const argsLogPath = path.join(cwd, "npm-install-args.txt");

  fs.writeFileSync(
    npmPath,
    [
      "#!/bin/sh",
      `printf '%s\n' \"$@\" > \"${argsLogPath}\"`,
      `mkdir -p \"${path.dirname(fallowBinPath)}\"`,
      `touch \"${fallowBinPath}\"`,
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

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

function makeCtx(cwd: string, choices: string[], notifications: Notification[], selectCalls: SelectCall[] = []) {
  let selectIndex = 0;

  return {
    cwd,
    model: null,
    modelRegistry: {
      async getApiKey() {
        return null;
      },
    },
    ui: {
      async select(prompt: string, options: string[]) {
        selectCalls.push({ prompt, options });
        const response = choices[Math.min(selectIndex, choices.length - 1)];
        selectIndex += 1;
        return response;
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

function assertCommonGitignoreBoilerplate(cwd: string): void {
  const gitignore = fs.readFileSync(path.join(cwd, ".gitignore"), "utf-8");
  for (const entry of [
    "node_modules/",
    ".fallow/",
    ".local/",
    ".env",
    ".env.local",
    ".env.*.local",
    "*.local",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
    "*.tmp",
    "*.temp",
    "*.swp",
  ]) {
    assert(gitignore.includes(entry), `.gitignore did not include ${entry}`);
  }
}

async function runMissingJjScenario() {
  const cwd = createProject("vazir-init-missing-jj-");
  const { command, sentMessages } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createPathWithGitOnly();

  try {
    await command.handler("", makeCtx(cwd, ["No — skip Fallow", "Yes — initialise git"], notifications, selectCalls));
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
  assert(fs.existsSync(path.join(cwd, ".context/archive/stories")), "archive/stories was not created");
  assert(fs.existsSync(path.join(cwd, ".context/archive/reviews")), "archive/reviews was not created");
  assert(fs.existsSync(path.join(cwd, ".context/intake/README.md")), "intake README was not created");
  assert(fs.existsSync(path.join(cwd, ".context/settings/project.json")), "project.json was not created");
  assert(fs.existsSync(path.join(cwd, "AGENTS.md")), "AGENTS.md was not created");
  assert(selectCalls.some(call => call.prompt.includes("Install Fallow")), "vazir-init did not prompt for optional Fallow installation");
  assertCommonGitignoreBoilerplate(cwd);
  assert(sentMessages.every(message => !message.includes("JJ is not installed")), "missing-JJ scenario should not send the JJ install notice as a follow-up message");

  return { cwd, summary, notifications };
}

async function runMissingFileScenario() {
  const cwd = createProject("vazir-init-missing-file-");
  const { command } = makePi();
  const notifications: Notification[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-empty-bin-"));

  try {
    await command.handler("", makeCtx(cwd, ["No — skip Fallow", "Skip JJ — use git fallback"], notifications));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  assert(summary.includes("☑ AGENTS.md"), "live file install summary did not show AGENTS.md as present");
  assert(summary.includes("☑ .context/memory/system.md"), "summary did not include system.md as present");
  assert(summary.includes("☑ .context/memory/index.md"), "summary did not include index.md as present");
  assert(summary.includes("☑ .context/memory/context-map.md"), "summary did not include context-map.md as present");
  assert(summary.includes("☑ .context/intake/"), "summary did not include intake as present");
  assert(summary.includes("☑ .context/archive/"), "summary did not include archive as present");
  assert(summary.includes("☑ .context/settings/project.json"), "summary did not include project.json as present");
  assert(fs.existsSync(path.join(cwd, "AGENTS.md")), "AGENTS.md should have been created live in the file scenario");
  assertCommonGitignoreBoilerplate(cwd);

  return { cwd, summary, notifications };
}

async function runFallowInstallScenario() {
  const cwd = createProject("vazir-init-fallow-install-");
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createPathWithGitAndFakeNpm(cwd);

  try {
    await command.handler("", makeCtx(cwd, ["Yes — install Fallow", "Yes — initialise git"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  assert(selectCalls.some(call => call.prompt.includes("Install Fallow")), "fallow install scenario did not show the install prompt");
  const npmArgs = fs.readFileSync(path.join(cwd, "npm-install-args.txt"), "utf-8");
  assert(npmArgs.includes("install"), "fallow install scenario did not invoke npm install");
  assert(npmArgs.includes("-D"), "fallow install scenario did not request a devDependency install");
  assert(npmArgs.includes("fallow"), "fallow install scenario did not invoke npm with the fallow package");
  assert(
    notifications.some(note => note.message.includes("Fallow installed for /review static analysis")),
    "fallow install scenario did not report a successful install",
  );

  return { cwd, summary: getSummary(notifications), notifications };
}

try {
  const missingJj = await runMissingJjScenario();
  const missingFile = await runMissingFileScenario();
  const fallowInstall = await runFallowInstallScenario();

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
  printScenario("Fallow install", fallowInstall);
} finally {
  for (const moduleDir of stubModuleDirs.reverse()) {
    fs.rmSync(moduleDir, { recursive: true, force: true });
  }
}