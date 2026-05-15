import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };
type SelectCall = { prompt: string; options: string[] };

type ToolPathOptions = {
  git?: boolean;
  fakeFossil?: boolean;
  fakeNpmInstallForCwd?: string;
};

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(cwd, "src.ts"), "export const value = 1;\n");
  fs.writeFileSync(path.join(cwd, "lib.js"), "module.exports = { ok: true };\n");
  return cwd;
}

function actualGitPath(): string {
  return childProcess.execFileSync("which", ["git"], { encoding: "utf-8" }).trim();
}

function createToolPath(options: ToolPathOptions): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-init-bin-"));

  if (options.git) {
    fs.symlinkSync(actualGitPath(), path.join(binDir, "git"));
  }

  if (options.fakeFossil) {
    const fossilPath = path.join(binDir, "fossil");
    fs.writeFileSync(
      fossilPath,
      [
        "#!/bin/sh",
        'cmd="$1"',
        'shift || true',
        'marker="$PWD/.fslckout"',
        'case "$cmd" in',
        '  version)',
        '    echo "fossil 2.0"',
        '    ;;',
        '  init)',
        '    touch "$PWD/$1"',
        '    ;;',
        '  open)',
        '    touch "$marker"',
        '    ;;',
        '  info)',
        '    if [ ! -f "$marker" ]; then exit 1; fi',
        '    if [ "$1" = "--json" ]; then',
        '      printf "{\"checkout\":{\"root\":\"%s\"}}\\n" "$PWD"',
        '    else',
        '      printf "local-root: %s\\ncheckout: abcdef1234567890\\n" "$PWD"',
        '    fi',
        '    ;;',
        '  status)',
        '    [ -f "$marker" ] || exit 1',
        '    echo "repository: fake"',
        '    ;;',
        '  setting)',
        '    if [ "$1" = "autosync" ]; then echo "on"; else echo "on"; fi',
        '    ;;',
        '  branch)',
        '    if [ "$1" = "current" ]; then echo "trunk"; else echo "trunk"; fi',
        '    ;;',
        '  changes|extras)',
        '    exit 0',
        '    ;;',
        '  diff)',
        '    exit 0',
        '    ;;',
        '  *)',
        '    exit 0',
        '    ;;',
        'esac',
        '',
      ].join("\n"),
      { mode: 0o755 },
    );
  }

  if (options.fakeNpmInstallForCwd) {
    const cwd = options.fakeNpmInstallForCwd;
    const npmPath = path.join(binDir, "npm");
    const fallowBinDir = path.join(cwd, "node_modules", ".bin");
    const fallowBinPath = path.join(fallowBinDir, "fallow");
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
  }

  return `${binDir}:/usr/bin:/bin`;
}

function markFakeFossilCheckout(cwd: string): void {
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake checkout\n");
}

function initGitRepo(cwd: string): void {
  childProcess.execFileSync("git", ["init"], { cwd, stdio: "pipe" });
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
    },
  };
}

function getSummary(notifications: Notification[]): string {
  const summary = notifications.find(entry => entry.message.startsWith("Vazir init summary"));
  assert(Boolean(summary), "init summary notification was not emitted");
  return summary!.message;
}

function readProjectSettings(cwd: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(cwd, ".context", "settings", "project.json"), "utf-8")) as Record<string, unknown>;
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

function assertFossilIgnoreDefaults(cwd: string): void {
  const ignoreGlob = fs.readFileSync(path.join(cwd, ".fossil-settings", "ignore-glob"), "utf-8");
  for (const entry of [
    ".context/",
    "node_modules/",
    ".git/",
    ".jj/",
    ".fallow/",
    ".env",
    ".env.*",
    "*.local",
    ".local/",
    "*.log",
    "*.tmp",
    "*.temp",
    "*.swp",
    ".DS_Store",
    "Thumbs.db",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.crt",
  ]) {
    assert(ignoreGlob.includes(entry), `.fossil-settings/ignore-glob did not include ${entry}`);
  }
}

function assertPromptShown(selectCalls: SelectCall[], snippet: string): void {
  assert(selectCalls.some(call => call.prompt.includes(snippet)), `expected prompt containing: ${snippet}`);
}

function assertPromptNotShown(selectCalls: SelectCall[], snippet: string): void {
  assert(!selectCalls.some(call => call.prompt.includes(snippet)), `unexpected prompt containing: ${snippet}`);
}

async function runNoVcsGitChoiceScenario() {
  const cwd = createProject("vazir-init-no-vcs-git-");
  const { command, sentMessages } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ git: true });

  try {
    await command.handler("", makeCtx(cwd, ["Git/JJ", "No — skip Fallow"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  const settings = readProjectSettings(cwd);
  assertPromptShown(selectCalls, "No version control system (VCS) is configured in this repo yet");
  assert(summary.includes("Git/JJ active"), "no-VCS git-choice summary did not show Git/JJ active");
  assert(summary.includes("active mode can be changed later in settings"), "no-VCS git-choice summary did not mention later settings changes");
  assert(settings.active_vcs_mode === "git", "no-VCS git-choice did not write active_vcs_mode=git");
  assert(settings.vcs_preference === "git", "no-VCS git-choice did not write vcs_preference=git");
  assertCommonGitignoreBoilerplate(cwd);
  assert(selectCalls.some(call => call.prompt.includes("Install Fallow")), "no-VCS git-choice did not prompt for optional Fallow install");
  assert(sentMessages.every(message => !message.includes("JJ is not installed")), "missing-JJ guidance should stay in notifications, not follow-up messages");
  return { cwd, summary, notifications, selectCalls };
}

async function runGitOnlyScenario() {
  const cwd = createProject("vazir-init-git-only-");
  initGitRepo(cwd);
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ git: true });

  try {
    await command.handler("", makeCtx(cwd, ["No — keep Git only for now", "No — skip Fallow"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  const settings = readProjectSettings(cwd);
  assertPromptNotShown(selectCalls, "No version control system (VCS) is configured in this repo yet");
  assertPromptShown(selectCalls, "Git is already set up in this repo. Do you want to enable JJ for checkpoints?");
  assert(summary.includes("Git/JJ active"), "git-only summary did not show Git/JJ active");
  assert(summary.includes("JJ remains optional for checkpoints"), "git-only summary did not mention optional JJ checkpoints");
  assert(settings.active_vcs_mode === "git", "git-only flow did not write active_vcs_mode=git");
  assert(settings.vcs_preference === "git", "git-only flow did not keep vcs_preference=git");
  return { cwd, summary, notifications, selectCalls };
}

async function runFossilOnlyScenario() {
  const cwd = createProject("vazir-init-fossil-only-");
  markFakeFossilCheckout(cwd);
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ git: true, fakeFossil: true });

  try {
    await command.handler("", makeCtx(cwd, ["No — skip Fallow"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  const settings = readProjectSettings(cwd);
  assertPromptNotShown(selectCalls, "No version control system (VCS) is configured in this repo yet");
  assertPromptNotShown(selectCalls, "Do you want to enable JJ for checkpoints");
  assert(summary.includes("Fossil active"), "fossil-only summary did not show Fossil active");
  assert(summary.includes("active mode can be changed later in settings"), "fossil-only summary did not mention later settings changes");
  assert(settings.active_vcs_mode === "fossil", "fossil-only flow did not write active_vcs_mode=fossil");
  assert(settings.vcs_preference === "fossil", "fossil-only flow did not write vcs_preference=fossil");
  assertFossilIgnoreDefaults(cwd);
  return { cwd, summary, notifications, selectCalls };
}

async function runBothPresentScenario() {
  const cwd = createProject("vazir-init-both-present-");
  initGitRepo(cwd);
  markFakeFossilCheckout(cwd);
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ git: true, fakeFossil: true });

  try {
    await command.handler("", makeCtx(cwd, ["Fossil", "No — skip Fallow"], notifications, selectCalls));
  } finally {
    process.env.PATH = originalPath;
  }

  const summary = getSummary(notifications);
  const settings = readProjectSettings(cwd);
  assertPromptShown(selectCalls, "Both Git and Fossil are already present in this repo");
  assertPromptNotShown(selectCalls, "Git is the active mode for this repo. Do you want to enable JJ for checkpoints too?");
  assert(summary.includes("Fossil active"), "both-present summary did not show the selected Fossil mode");
  assert(settings.active_vcs_mode === "fossil", "both-present flow did not persist the selected Fossil active mode");
  assert(settings.vcs_preference === "fossil", "both-present flow did not persist vcs_preference=fossil");
  return { cwd, summary, notifications, selectCalls };
}

async function runFallowInstallScenario() {
  const cwd = createProject("vazir-init-fallow-install-");
  const { command } = makePi();
  const notifications: Notification[] = [];
  const selectCalls: SelectCall[] = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ git: true, fakeNpmInstallForCwd: cwd });

  try {
    await command.handler("", makeCtx(cwd, ["Git/JJ", "Yes — install Fallow"], notifications, selectCalls));
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

  return { cwd, summary: getSummary(notifications), notifications, selectCalls };
}

try {
  const noVcsGitChoice = await runNoVcsGitChoiceScenario();
  const gitOnly = await runGitOnlyScenario();
  const fossilOnly = await runFossilOnlyScenario();
  const bothPresent = await runBothPresentScenario();
  const fallowInstall = await runFallowInstallScenario();

  function printScenario(title: string, result: { cwd: string; summary: string; notifications: Notification[]; selectCalls?: SelectCall[] }) {
    console.log(title);
    console.log(`cwd: ${result.cwd}`);
    console.log("summary:");
    for (const line of result.summary.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("prompts:");
    for (const call of result.selectCalls ?? []) {
      console.log(`  - ${call.prompt}`);
    }
    console.log("notifications:");
    for (const note of result.notifications) {
      console.log(`  - [${note.level}] ${note.message}`);
    }
    console.log("");
  }

  printScenario("No VCS → Git/JJ choice", noVcsGitChoice);
  printScenario("Git only", gitOnly);
  printScenario("Fossil only", fossilOnly);
  printScenario("Both present → Fossil active", bothPresent);
  printScenario("Fallow install", fallowInstall);
} finally {
  cleanupStubModules(stubModuleDirs);
}
