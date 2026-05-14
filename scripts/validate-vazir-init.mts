import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

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
  const fallowBinDir = path.join(cwd, "node_modules", ".bin");
  const fallowBinPath = path.join(cwd, "node_modules", ".bin", "fallow");
  const argsLogPath = path.join(cwd, "npm-install-args.txt");

  fs.writeFileSync(
    npmPath,
    [
      "#!/bin/sh",
      `printf '%s\n' \"$@\" > \"${argsLogPath}\"`,
      `mkdir -p \"${fallowBinDir}\"`,
      `touch \"${fallowBinPath}\"`,
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  return binDir;
}

function makePi() {
  const harness = createPiHarness([register]);
  const command = harness.getCommand("vazir-init");
  assert(Boolean(command), "vazir-init command was not registered");
  return { command: command!, sentMessages: harness.sentMessages.map(entry => String(entry.message)) };
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
      async input(_prompt: string, _placeholder?: string) {
        return "";
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
    await command.handler("", makeCtx(cwd, ["No — skip Fallow", "Git + JJ — initialise git (JJ optional)"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  assert(summary.includes("☑ Git: active"), "missing-JJ summary did not show git active message");
  assert(summary.includes("↳ Learn more about git"), "missing-JJ summary did not include the git detail line");
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
    await command.handler("", makeCtx(cwd, ["No — skip Fallow", "Skip VCS — no version control"], notifications));
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
    await command.handler("", makeCtx(cwd, ["Yes — install Fallow", "Git + JJ — initialise git (JJ optional)"], notifications, selectCalls));
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

async function runFossilBootstrapScenario() {
  const cwd = createProject("vazir-init-fossil-");
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];

  await command.handler("", makeCtx(cwd, ["No — skip Fallow", "Fossil — initialise a fossil repo", "Create a new local repo"], notifications, selectCalls));

  assert(fs.existsSync(path.join(cwd, ".fslckout")), "fossil bootstrap did not create .fslckout");
  assert(fs.existsSync(path.join(cwd, ".fossil-settings/ignore-glob")), "fossil bootstrap did not create .fossil-settings/ignore-glob");

  const fossilIgnore = fs.readFileSync(path.join(cwd, ".fossil-settings/ignore-glob"), "utf-8");
  assert(fossilIgnore.includes("node_modules"), "fossil ignore-glob did not include node_modules");
  assert(fossilIgnore.includes(".git"), "fossil ignore-glob did not include .git");
  assert(fossilIgnore.includes(".jj"), "fossil ignore-glob did not include .jj");
  assert(fossilIgnore.includes(".context"), "fossil ignore-glob did not include .context");

  const projectSettings = JSON.parse(fs.readFileSync(path.join(cwd, ".context/settings/project.json"), "utf-8"));
  assert(projectSettings.vcs_preference === "fossil", "fossil bootstrap did not write vcs_preference to project.json");

  const gitignore = fs.readFileSync(path.join(cwd, ".gitignore"), "utf-8");
  assert(gitignore.includes(".fslckout"), "fossil bootstrap did not add .fslckout to .gitignore");
  assert(gitignore.includes("_FOSSIL_"), "fossil bootstrap did not add _FOSSIL_ to .gitignore");
  assert(gitignore.includes("*.fossil"), "fossil bootstrap did not add *.fossil to .gitignore");

  const summary = getSummary(notifications);
  assert(summary.includes("Fossil"), "fossil bootstrap summary did not mention Fossil");

  return { cwd, summary, notifications };
}

try {
  const missingJj = await runMissingJjScenario();
  const missingFile = await runMissingFileScenario();
  const fallowInstall = await runFallowInstallScenario();
  const fossilBootstrap = await runFossilBootstrapScenario();

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
  printScenario("Fossil bootstrap", fossilBootstrap);
} finally {
  cleanupStubModules(stubModuleDirs);
}