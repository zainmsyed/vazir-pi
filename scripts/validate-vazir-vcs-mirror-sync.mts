import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const contextModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context", String(Date.now()));

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, "src.ts"), "export const value = 1;\n");
  return cwd;
}

function initGitRepo(cwd: string): void {
  childProcess.execFileSync("git", ["init"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["config", "user.name", "Vazir Test"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["config", "user.email", "vazir@example.com"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["add", "src.ts"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "pipe" });
}

function addFakeGitRemote(cwd: string, remoteCwd: string): void {
  childProcess.execFileSync("git", ["init", "--bare", remoteCwd], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["remote", "add", "origin", remoteCwd], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["config", "push.autoSetupRemote", "true"], { cwd, stdio: "pipe" });
}

function writeProjectSettings(cwd: string, settings: Record<string, unknown>): void {
  const settingsPath = path.join(cwd, ".context", "settings", "project.json");
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function createToolPath(options: { repoFile: string; exportLog: string; failExport?: boolean }): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-mirror-sync-bin-"));
  const gitPath = childProcess.execFileSync("which", ["git"], { encoding: "utf-8" }).trim();
  fs.symlinkSync(gitPath, path.join(binDir, "git"));

  const fossilPath = path.join(binDir, "fossil");
  fs.writeFileSync(
    fossilPath,
    [
      "#!/bin/sh",
      `repo_file=\"${options.repoFile}\"`,
      `export_log=\"${options.exportLog}\"`,
      `fail_export=\"${options.failExport ? "1" : "0"}\"`,
      'cmd="$1"',
      'shift || true',
      'case "$cmd" in',
      '  version)',
      '    echo "fossil 2.0"',
      '    ;;',
      '  info)',
      '    if [ "$1" = "--json" ]; then',
      '      printf "{\\"checkout\\":{\\"root\\":\\"%s\\"}}\\n" "$PWD"',
      '    else',
      '      printf "repository: %s\\nlocal-root: %s\\ncheckout: abcdef1234567890\\n" "$repo_file" "$PWD"',
      '    fi',
      '    ;;',
      '  git)',
      '    if [ "$1" != "export" ]; then',
      '      echo "unsupported fossil git subcommand" >&2',
      '      exit 1',
      '    fi',
      '    shift || true',
      '    printf "%s\n" "$@" > "$export_log"',
      '    if [ "$fail_export" = "1" ]; then',
      '      echo "autopush failed" >&2',
      '      exit 1',
      '    fi',
      '    ;;',
      '  *)',
      '    exit 0',
      '    ;;',
      'esac',
      '',
    ].join("\n"),
    { mode: 0o755 },
  );

  return `${binDir}:/usr/bin:/bin`;
}

function makeCtx(cwd: string, notifications: Array<{ message: string; level: string }>, selectResponses: string[]) {
  return {
    cwd,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async select() {
        return selectResponses.shift();
      },
    },
  };
}

async function runConfirmedSyncScenario() {
  const cwd = createProject("vazir-mirror-sync-confirm-");
  const mirrorCwd = createProject("vazir-mirror-sync-target-");
  initGitRepo(mirrorCwd);
  addFakeGitRemote(mirrorCwd, path.join(cwd, "fake-remote.git"));
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
  const repoFile = path.join(cwd, "project.fossil");
  const exportLog = path.join(cwd, "mirror-export.log");
  fs.writeFileSync(repoFile, "fake repo\n");
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, remoteName: "origin", branch: "main" },
  });

  const harness = makePi([contextModule.default]);
  const command = harness.getCommand("vcs-mirror-sync");
  assert(command, "vcs-mirror-sync command should be registered");
  const notifications: Array<{ message: string; level: string }> = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ repoFile, exportLog });

  try {
    await command!.handler("", makeCtx(cwd, notifications, ["Yes — run mirror sync"]));
  } finally {
    process.env.PATH = originalPath;
  }

  assert(fs.existsSync(exportLog), "confirmed sync should execute fossil git export");
  const exportArgs = fs.readFileSync(exportLog, "utf-8").trim().split("\n");
  assert(exportArgs[0] === mirrorCwd, `expected export to target mirror path ${mirrorCwd}, got ${exportArgs[0]}`);
  assert(notifications.some(entry => entry.message.includes("Mirror sync complete")), "confirmed sync should report success");

  return { cwd, mirrorCwd, notifications, exportArgs };
}

async function runCancelledSyncScenario() {
  const cwd = createProject("vazir-mirror-sync-cancel-");
  const mirrorCwd = createProject("vazir-mirror-sync-cancel-target-");
  initGitRepo(mirrorCwd);
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
  const repoFile = path.join(cwd, "project.fossil");
  const exportLog = path.join(cwd, "mirror-export.log");
  fs.writeFileSync(repoFile, "fake repo\n");
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, remoteName: "origin", branch: "main" },
  });

  const harness = makePi([contextModule.default]);
  const command = harness.getCommand("vcs-mirror-sync");
  assert(command, "vcs-mirror-sync command should be registered");
  const notifications: Array<{ message: string; level: string }> = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ repoFile, exportLog });

  try {
    await command!.handler("", makeCtx(cwd, notifications, ["No — cancel"]));
  } finally {
    process.env.PATH = originalPath;
  }

  assert(!fs.existsSync(exportLog), "cancelled sync should not execute fossil git export");
  assert(notifications.some(entry => entry.message === "Mirror sync cancelled."), "cancelled sync should report cancellation");

  return { cwd, notifications };
}

async function runFailedExportScenario() {
  const cwd = createProject("vazir-mirror-sync-fail-");
  const mirrorCwd = createProject("vazir-mirror-sync-fail-target-");
  initGitRepo(mirrorCwd);
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
  const repoFile = path.join(cwd, "project.fossil");
  const exportLog = path.join(cwd, "mirror-export.log");
  fs.writeFileSync(repoFile, "fake repo\n");
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, remoteName: "origin", branch: "main" },
  });

  const harness = makePi([contextModule.default]);
  const command = harness.getCommand("vcs-mirror-sync");
  assert(command, "vcs-mirror-sync command should be registered");
  const notifications: Array<{ message: string; level: string }> = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ repoFile, exportLog, failExport: true });

  try {
    await command!.handler("", makeCtx(cwd, notifications, ["Yes — run mirror sync"]));
  } finally {
    process.env.PATH = originalPath;
  }

  assert(fs.existsSync(exportLog), "failed export scenario should still reach fossil git export");
  assert(notifications.some(entry => entry.level === "warning" && entry.message.includes("Mirror sync failed: autopush failed")), "failed export should report the surfaced autopush error");

  return { cwd, notifications };
}

async function runInvalidConfigScenario() {
  const cwd = createProject("vazir-mirror-sync-invalid-");
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: "", remoteName: "origin", branch: "main" },
  });

  const harness = makePi([contextModule.default]);
  const command = harness.getCommand("vcs-mirror-sync");
  assert(command, "vcs-mirror-sync command should be registered");
  const notifications: Array<{ message: string; level: string }> = [];
  const originalPath = process.env.PATH;
  process.env.PATH = createToolPath({ repoFile: path.join(cwd, "project.fossil"), exportLog: path.join(cwd, "mirror-export.log") });

  try {
    await command!.handler("", makeCtx(cwd, notifications, []));
  } finally {
    process.env.PATH = originalPath;
  }

  assert(notifications.some(entry => entry.level === "warning" && entry.message.includes("No Git mirror path is configured")), "invalid config should warn about missing mirror path");

  return { cwd, notifications };
}

try {
  const confirmed = await runConfirmedSyncScenario();
  const cancelled = await runCancelledSyncScenario();
  const failed = await runFailedExportScenario();
  const invalid = await runInvalidConfigScenario();

  console.log("VCS mirror sync validation");
  console.log(`confirmed cwd: ${confirmed.cwd}`);
  console.log(`cancelled cwd: ${cancelled.cwd}`);
  console.log(`failed cwd: ${failed.cwd}`);
  console.log(`invalid cwd: ${invalid.cwd}`);
  console.log("  Confirmed, cancelled, export-failure, and invalid mirror sync assertions passed.");
  console.log("");
} finally {
  cleanupStubModules(stubModuleDirs);
}
