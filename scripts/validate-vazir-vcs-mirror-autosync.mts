import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { assert, cleanupStubModules, installCommonPiStubs, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const stubModuleDirs = installCommonPiStubs();

const helperModule = await loadFileModule<{
  readVcsMirrorSettings: (cwd: string) => { mode: string; path: string; autosync_closeout: boolean };
  runAutoMirrorExportAtCloseout: (cwd: string) => { ran: boolean; ok: boolean; message: string };
  normalizeVcsMirrorSettings: (raw: unknown) => { mode: string; path: string; autosync_closeout: boolean };
}>(path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts"), String(Date.now()));

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main", autosync_closeout: false },
  }, null, 2));
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

function markFakeFossilCheckout(cwd: string): void {
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
}

function writeProjectSettings(cwd: string, updates: Record<string, unknown>): void {
  const settingsPath = path.join(cwd, ".context", "settings", "project.json");
  const current = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  fs.writeFileSync(settingsPath, JSON.stringify({ ...current, ...updates }, null, 2));
}

function createFakeFossilBin(options: { repoFile: string; exportLog: string; failExport?: boolean }): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-mirror-autosync-bin-"));
  const gitPath = childProcess.execFileSync("which", ["git"], { encoding: "utf-8" }).trim();
  fs.symlinkSync(gitPath, path.join(binDir, "git"));

  const fossilPath = path.join(binDir, "fossil");
  fs.writeFileSync(
    fossilPath,
    [
      "#!/bin/sh",
      `repo_file="${options.repoFile}"`,
      `export_log="${options.exportLog}"`,
      `fail_export="${options.failExport ? "1" : "0"}"`,
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
      '      printf "repository: %s\\nlocal-root: %s\\n" "$repo_file" "$PWD"',
      '    fi',
      '    ;;',
      '  git)',
      '    if [ "$1" != "export" ]; then',
      '      echo "unsupported fossil git subcommand" >&2',
      '      exit 1',
      '    fi',
      '    shift || true',
      '    printf "%s\\n" "$@" > "$export_log"',
      '    if [ "$fail_export" = "1" ]; then',
      '      echo "autopush failed" >&2',
      '      exit 1',
      '    fi',
      '    ;;',
      '  *)',
      '    echo "unknown fossil command" >&2',
      '    exit 1',
      '    ;;',
      'esac',
    ].join("\n"),
    { mode: 0o755 },
  );
  return binDir;
}

function runDisabledScenario() {
  const cwd = createProject("vazir-mirror-autosync-disabled-");
  markFakeFossilCheckout(cwd);
  const mirrorCwd = createProject("vazir-mirror-autosync-disabled-target-");
  initGitRepo(mirrorCwd);
  writeProjectSettings(cwd, {
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, autosync_closeout: false },
  });

  const result = helperModule.runAutoMirrorExportAtCloseout(cwd);
  assert(!result.ran, "autosync disabled should skip export");
  assert(result.ok, "autosync disabled should be ok");

  return { cwd };
}

function runEnabledSuccessScenario() {
  const cwd = createProject("vazir-mirror-autosync-enabled-");
  markFakeFossilCheckout(cwd);
  const mirrorCwd = createProject("vazir-mirror-autosync-enabled-target-");
  initGitRepo(mirrorCwd);
  addFakeGitRemote(mirrorCwd, path.join(cwd, "fake-remote.git"));
  const repoFile = path.join(cwd, "project.fossil");
  const exportLog = path.join(cwd, "mirror-export.log");
  fs.writeFileSync(repoFile, "fake repo\n");
  writeProjectSettings(cwd, {
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, autosync_closeout: true },
  });

  const originalPath = process.env.PATH;
  const binDir = createFakeFossilBin({ repoFile, exportLog });
  process.env.PATH = binDir;

  try {
    const result = helperModule.runAutoMirrorExportAtCloseout(cwd);
    assert(result.ran, "autosync enabled should run export");
    assert(result.ok, "autosync enabled should succeed");
    assert(result.message.includes("auto-sync complete"), `expected success message, got ${result.message}`);
    assert(fs.existsSync(exportLog), "export should write log file");
    const exportArgs = fs.readFileSync(exportLog, "utf-8").trim().split("\n");
    assert(exportArgs[0] === mirrorCwd, `expected mirror path ${mirrorCwd}, got ${exportArgs[0]}`);
  } finally {
    process.env.PATH = originalPath;
  }

  return { cwd };
}

function runEnabledFailureScenario() {
  const cwd = createProject("vazir-mirror-autosync-fail-");
  markFakeFossilCheckout(cwd);
  const mirrorCwd = createProject("vazir-mirror-autosync-fail-target-");
  initGitRepo(mirrorCwd);
  const repoFile = path.join(cwd, "project.fossil");
  const exportLog = path.join(cwd, "mirror-export.log");
  fs.writeFileSync(repoFile, "fake repo\n");
  writeProjectSettings(cwd, {
    vcs_mirror: { mode: "git-mirror-of-fossil", path: mirrorCwd, autosync_closeout: true },
  });

  const originalPath = process.env.PATH;
  const binDir = createFakeFossilBin({ repoFile, exportLog, failExport: true });
  process.env.PATH = binDir;

  try {
    const result = helperModule.runAutoMirrorExportAtCloseout(cwd);
    assert(result.ran, "autosync enabled should attempt export even if it fails");
    assert(!result.ok, "failed export should report not ok");
    assert(result.message.includes("auto-sync failed"), `expected failure message, got ${result.message}`);
  } finally {
    process.env.PATH = originalPath;
  }

  return { cwd };
}

function runNormalizationScenario() {
  const normalized = helperModule.normalizeVcsMirrorSettings({ mode: "git-mirror-of-fossil", path: "/mirror", autosync_closeout: true });
  assert(normalized.autosync_closeout === true, "normalize should preserve true autosync_closeout");

  const defaulted = helperModule.normalizeVcsMirrorSettings({ mode: "git-mirror-of-fossil", path: "/mirror" });
  assert(defaulted.autosync_closeout === false, "normalize should default autosync_closeout to false");
}

try {
  const disabledScenario = runDisabledScenario();
  const enabledScenario = runEnabledSuccessScenario();
  const failureScenario = runEnabledFailureScenario();
  runNormalizationScenario();

  console.log("VCS mirror autosync validation");
  console.log(`disabled cwd: ${disabledScenario.cwd}`);
  console.log(`enabled cwd: ${enabledScenario.cwd}`);
  console.log(`failure cwd: ${failureScenario.cwd}`);
  console.log("  Mirror autosync disabled skip, enabled success, failure handling, and normalization assertions passed.");
  console.log("");
} finally {
  cleanupStubModules(stubModuleDirs);
}
