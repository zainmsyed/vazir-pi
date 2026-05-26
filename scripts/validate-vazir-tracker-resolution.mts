import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const trackerModule = await loadExtensionModule<{
  default: (pi: any) => void;
  refreshVcsState: (cwd: string) => void;
  getResolvedVcsKind: () => "none" | "git" | "jj" | "fossil";
}>("vazir-tracker");

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(cwd, "src.ts"), "export const value = 1;\n");
  return cwd;
}

function initGitRepo(cwd: string): void {
  childProcess.execFileSync("git", ["init"], { cwd, stdio: "pipe" });
}

function markFakeFossilCheckout(cwd: string): void {
  fs.writeFileSync(path.join(cwd, ".fslckout"), "fake checkout\n");
}

function writeProjectSettings(cwd: string, updates: Record<string, unknown>): void {
  const filePath = path.join(cwd, ".context", "settings", "project.json");
  let current: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    current = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  }
  const next = { ...current, ...updates };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
}

async function runTrackerSettingsDrivenScenario() {
  const cwd = createProject("vazir-tracker-settings-");
  initGitRepo(cwd);
  markFakeFossilCheckout(cwd);

  try {
    // Scenario A: both repos present, settings say "none" → must be "none"
    writeProjectSettings(cwd, { active_vcs_mode: "none" });
    trackerModule.refreshVcsState(cwd);
    const kindA = trackerModule.getResolvedVcsKind();
    assert(kindA === "none", `both-present + active_vcs_mode=none should resolve to none, got ${kindA}`);

    // Scenario B: both repos present, settings say "fossil" → must be "fossil"
    writeProjectSettings(cwd, { active_vcs_mode: "fossil" });
    trackerModule.refreshVcsState(cwd);
    const kindB = trackerModule.getResolvedVcsKind();
    assert(kindB === "fossil", `both-present + active_vcs_mode=fossil should resolve to fossil, got ${kindB}`);

    // Scenario C: git only, settings say "none" → must be "none"
    fs.rmSync(path.join(cwd, ".fslckout"));
    trackerModule.refreshVcsState(cwd);
    writeProjectSettings(cwd, { active_vcs_mode: "none" });
    trackerModule.refreshVcsState(cwd);
    const kindC = trackerModule.getResolvedVcsKind();
    assert(kindC === "none", `git-only + active_vcs_mode=none should resolve to none, got ${kindC}`);

    // Scenario D: fossil only, settings say "git" → must be "none"
    markFakeFossilCheckout(cwd);
    fs.rmSync(path.join(cwd, ".git"), { recursive: true, force: true });
    writeProjectSettings(cwd, { active_vcs_mode: "git" });
    trackerModule.refreshVcsState(cwd);
    const kindD = trackerModule.getResolvedVcsKind();
    assert(kindD === "none", `fossil-only + active_vcs_mode=git should resolve to none, got ${kindD}`);
  } finally {
    /* temp dir cleaned by OS */
  }

  return { cwd };
}

try {
  const trackerSettingsDriven = await runTrackerSettingsDrivenScenario();
  console.log("Tracker settings-driven resolution");
  console.log(`cwd: ${trackerSettingsDriven.cwd}`);
  console.log("  All tracker VCS resolution assertions passed.");
  console.log("");
} finally {
  cleanupStubModules(stubModuleDirs);
}
