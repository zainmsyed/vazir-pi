import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, loadFileModule, makePi, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const contextModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context", String(Date.now()));
const trackerModule = await loadExtensionModule<{
  refreshVcsState: (cwd: string) => void;
  getResolvedVcsKind: () => "none" | "git" | "jj" | "fossil";
}>("vazir-tracker", String(Date.now()));
const trackerVcsModule = await loadFileModule<{
  syncChanges: (cwd: string, kind: "none" | "git" | "jj" | "fossil") => { mirrorLabel: string; syncLabel: string; workingLabel: string; refLabel: string };
}>(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"), String(Date.now()));
const helperModule = await loadFileModule<{
  readVcsMirrorSettings: (cwd: string) => { mode: string; path: string; remoteName: string; branch: string };
}>(path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts"), String(Date.now()));

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({
    active_vcs_mode: "none",
    vcs_preference: "auto",
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" },
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

function markFakeFossilCheckout(cwd: string): void {
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake fossil checkout\n");
}

function writeProjectSettings(cwd: string, updates: Record<string, unknown>): void {
  const settingsPath = path.join(cwd, ".context", "settings", "project.json");
  const current = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  fs.writeFileSync(settingsPath, JSON.stringify({ ...current, ...updates }, null, 2));
}

function readProjectSettings(cwd: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(cwd, ".context", "settings", "project.json"), "utf-8")) as Record<string, any>;
}

function makeCtx(cwd: string, notifications: Array<{ message: string; level: string }>) {
  return {
    cwd,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async select() {
        return undefined;
      },
    },
  };
}

async function runMirrorCommandScenario() {
  const cwd = createProject("vazir-mirror-command-");
  initGitRepo(cwd);
  markFakeFossilCheckout(cwd);
  writeProjectSettings(cwd, { active_vcs_mode: "fossil", vcs_preference: "fossil" });

  const pi = makePi([contextModule.default]);
  const command = pi.getCommand("vcs-settings");
  assert(command, "vcs-settings command should be registered");

  const notifications: Array<{ message: string; level: string }> = [];
  await command!.handler("mirror git", makeCtx(cwd, notifications));

  const settings = readProjectSettings(cwd);
  assert(settings.active_vcs_mode === "fossil", "mirror command should not change the active VCS mode");
  assert(settings.vcs_mirror?.mode === "git-mirror-of-fossil", "mirror command should persist git-mirror-of-fossil mode");
  assert(notifications.some(entry => entry.message.includes("Fossil active, Git mirror configured.")), "mirror command should announce configured Fossil→Git mirror guidance");

  await command!.handler("mirror none", makeCtx(cwd, notifications));
  const disabled = readProjectSettings(cwd);
  assert(disabled.vcs_mirror?.mode === "none", "mirror none should disable mirror guidance");

  return { cwd, notifications };
}

function runMirrorDisplayScenario() {
  const cwd = createProject("vazir-mirror-display-");
  initGitRepo(cwd);
  markFakeFossilCheckout(cwd);
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: "", remoteName: "origin", branch: "main" },
  });

  trackerModule.refreshVcsState(cwd);
  const kind = trackerModule.getResolvedVcsKind();
  const display = trackerVcsModule.syncChanges(cwd, "fossil");
  assert(kind === "fossil", `mixed repo with Fossil active should resolve to fossil, got ${kind}`);
  assert(display.mirrorLabel === "fossil active, git mirror configured", `expected mirror-aware status label, got ${display.mirrorLabel}`);

  writeProjectSettings(cwd, { vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" } });
  const disabledDisplay = trackerVcsModule.syncChanges(cwd, "fossil");
  assert(disabledDisplay.mirrorLabel === "", "dual-detected repo without mirror mode should not show mirror guidance");

  return { cwd, display, disabledDisplay };
}

async function runMissingGitScenario() {
  const cwd = createProject("vazir-mirror-missing-git-");
  markFakeFossilCheckout(cwd);
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: "", remoteName: "origin", branch: "main" },
  });

  const display = trackerVcsModule.syncChanges(cwd, "fossil");
  assert(display.mirrorLabel.includes("git metadata missing"), `missing-git mirror warning should mention git metadata, got ${display.mirrorLabel}`);

  const pi = makePi([contextModule.default]);
  const command = pi.getCommand("vcs-settings");
  assert(command, "vcs-settings command should be registered for missing-git scenario");
  const notifications: Array<{ message: string; level: string }> = [];
  await command!.handler("mirror git", makeCtx(cwd, notifications));
  assert(notifications.some(entry => entry.level === "warning" && entry.message.includes("does not fully match yet")), "mirror command should warn when configured metadata is missing");

  return { cwd, display, notifications };
}

function runInactiveMirrorScenario() {
  const cwd = createProject("vazir-mirror-inactive-");
  initGitRepo(cwd);
  writeProjectSettings(cwd, {
    active_vcs_mode: "git",
    vcs_preference: "git",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: "", remoteName: "origin", branch: "main" },
  });

  trackerModule.refreshVcsState(cwd);
  const kind = trackerModule.getResolvedVcsKind();
  const display = trackerVcsModule.syncChanges(cwd, "git");
  assert(kind === "git", `git-active mirror mismatch should stay on git, got ${kind}`);
  assert(display.mirrorLabel === "mirror inactive, git active", `expected inactive mirror label, got ${display.mirrorLabel}`);

  return { cwd, display };
}

function runMissingFossilScenario() {
  const cwd = createProject("vazir-mirror-missing-fossil-");
  initGitRepo(cwd);
  writeProjectSettings(cwd, {
    active_vcs_mode: "fossil",
    vcs_preference: "fossil",
    vcs_mirror: { mode: "git-mirror-of-fossil", path: "", remoteName: "origin", branch: "main" },
  });

  const display = trackerVcsModule.syncChanges(cwd, "fossil");
  assert(display.mirrorLabel === "git mirror configured, fossil metadata missing", `missing-fossil mirror warning should mention fossil metadata, got ${display.mirrorLabel}`);

  return { cwd, display };
}

function runMirrorNormalizationScenario() {
  const cwd = createProject("vazir-mirror-normalize-");
  writeProjectSettings(cwd, {
    vcs_mirror: { mode: "unexpected-value", remoteName: "", branch: "" },
  });

  const mirror = helperModule.readVcsMirrorSettings(cwd);
  assert(mirror.mode === "none", `invalid mirror mode should normalize to none, got ${mirror.mode}`);
  assert(mirror.remoteName === "origin", `default mirror remote should be origin, got ${mirror.remoteName}`);
  assert(mirror.branch === "main", `default mirror branch should be main, got ${mirror.branch}`);

  return { cwd, mirror };
}

try {
  const commandScenario = await runMirrorCommandScenario();
  const displayScenario = runMirrorDisplayScenario();
  const missingGitScenario = await runMissingGitScenario();
  const inactiveMirrorScenario = runInactiveMirrorScenario();
  const missingFossilScenario = runMissingFossilScenario();
  const normalizationScenario = runMirrorNormalizationScenario();

  console.log("VCS mirror settings validation");
  console.log(`command cwd: ${commandScenario.cwd}`);
  console.log(`display cwd: ${displayScenario.cwd}`);
  console.log(`missing-git cwd: ${missingGitScenario.cwd}`);
  console.log(`inactive-mirror cwd: ${inactiveMirrorScenario.cwd}`);
  console.log(`missing-fossil cwd: ${missingFossilScenario.cwd}`);
  console.log(`normalization cwd: ${normalizationScenario.cwd}`);
  console.log("  Mirror settings persistence, mixed-VCS resolution, and status guidance assertions passed.");
  console.log("");
} finally {
  cleanupStubModules(stubModuleDirs);
}
