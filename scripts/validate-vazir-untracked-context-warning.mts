import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const trackerExtensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
const registerTracker = trackerExtensionModule.default;

type Notification = { message: string; level: string };

function commandAvailable(command: string, versionArgs: string[] = ["--version"]): boolean {
  try {
    childProcess.execFileSync(command, versionArgs, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function writeBaselineContext(cwd: string, activeVcsMode: "fossil" | "git"): void {
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(
    path.join(cwd, ".context", "settings", "project.json"),
    JSON.stringify({ active_vcs_mode: activeVcsMode }, null, 2),
  );
}

function createFossilProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoPath = path.join(root, "repo.fossil");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  childProcess.execSync(`fossil init ${JSON.stringify(repoPath)}`, { cwd: root, stdio: "pipe" });
  childProcess.execSync(`fossil open ${JSON.stringify(repoPath)}`, { cwd, stdio: "pipe" });
  childProcess.execSync("fossil setting autosync off", { cwd, stdio: "pipe" });

  fs.writeFileSync(path.join(cwd, "README.md"), "hello\n");
  writeBaselineContext(cwd, "fossil");
  childProcess.execSync("fossil add README.md .context", { cwd, stdio: "pipe" });
  childProcess.execSync("fossil commit -m baseline --user-override vazir-test", { cwd, stdio: "pipe" });
  return cwd;
}

function createGitProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  childProcess.execFileSync("git", ["init"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["config", "user.email", "vazir-test@example.com"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["config", "user.name", "vazir-test"], { cwd, stdio: "pipe" });

  fs.writeFileSync(path.join(cwd, "README.md"), "hello\n");
  writeBaselineContext(cwd, "git");
  childProcess.execFileSync("git", ["add", "-A"], { cwd, stdio: "pipe" });
  childProcess.execFileSync("git", ["commit", "-m", "baseline"], { cwd, stdio: "pipe" });
  return cwd;
}

function makeCtx(cwd: string, notifications: Notification[]) {
  return {
    cwd,
    hasUI: true,
    model: { provider: "anthropic", id: "haiku-3.5", reasoning: true },
    sessionManager: {
      getSessionFile() {
        return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
      },
      getBranch() {
        return [];
      },
      getEntries() {
        return [];
      },
    },
    getContextUsage() {
      return { tokens: 1000, contextWindow: 200000, percent: 0.5 };
    },
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget() {},
      setHeader() {},
      setFooter() {},
      setFooterFactory() {},
      setToolOutputExpanded() {},
      async custom() {},
    },
  };
}

function untrackedWarnings(notifications: Notification[]): Notification[] {
  return notifications.filter(note => note.level === "warning" && note.message.includes("Untracked .context files detected"));
}

async function runFossilScenario(): Promise<void> {
  const cwd = createFossilProject("vazir-untracked-context-fossil-");
  const notifications: Notification[] = [];
  const harness = makePi([registerTracker]);
  const ctx = makeCtx(cwd, notifications);

  await harness.emit("session_start", {}, ctx);
  assert(untrackedWarnings(notifications).length === 0, "fossil: clean checkout should not warn about untracked .context files");

  // New untracked .context file → exactly one warning naming the file and the fossil staging command.
  fs.mkdirSync(path.join(cwd, ".context", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "ideas", "idea-001.md"), "# Idea 001\n");
  await harness.emit("agent_end", {}, ctx);
  let warnings = untrackedWarnings(notifications);
  assert(warnings.length === 1, `fossil: expected exactly 1 untracked warning, got ${warnings.length}`);
  assert(warnings[0].message.includes(".context/ideas/idea-001.md"), `fossil: warning did not name the untracked file: ${warnings[0].message}`);
  assert(warnings[0].message.includes("fossil add"), `fossil: warning did not suggest fossil add: ${warnings[0].message}`);

  // Dedup: a second agent_end with no new untracked files must not re-warn.
  await harness.emit("agent_end", {}, ctx);
  warnings = untrackedWarnings(notifications);
  assert(warnings.length === 1, `fossil: dedup failed, got ${warnings.length} warnings after repeat agent_end`);

  // Staging the file clears the warning state without re-warning.
  childProcess.execSync("fossil add .context/ideas/idea-001.md", { cwd, stdio: "pipe" });
  await harness.emit("agent_end", {}, ctx);
  warnings = untrackedWarnings(notifications);
  assert(warnings.length === 1, `fossil: staging the file should not produce a new warning, got ${warnings.length}`);

  // A different untracked file warns again, naming only the new file.
  fs.mkdirSync(path.join(cwd, ".context", "intake", "prd"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "intake", "prd", "spec.md"), "# Spec\n");
  await harness.emit("agent_end", {}, ctx);
  warnings = untrackedWarnings(notifications);
  assert(warnings.length === 2, `fossil: expected a second warning for the new file, got ${warnings.length}`);
  assert(warnings[1].message.includes(".context/intake/prd/spec.md"), `fossil: second warning did not name the new file: ${warnings[1].message}`);
  assert(!warnings[1].message.includes("idea-001.md"), `fossil: second warning should not repeat the staged file: ${warnings[1].message}`);

  // Session restart re-warns about files that are still untracked.
  await harness.emit("session_shutdown", {}, ctx);
  await harness.emit("session_start", {}, ctx);
  warnings = untrackedWarnings(notifications);
  assert(warnings.length === 3, `fossil: session restart should re-warn about still-untracked files, got ${warnings.length}`);
  assert(warnings[2].message.includes(".context/intake/prd/spec.md"), `fossil: restart warning did not name the still-untracked file: ${warnings[2].message}`);

  await harness.emit("session_shutdown", {}, ctx);
  console.log(`fossil scenario cwd: ${cwd}`);
}

async function runInspectionFailureScenario(): Promise<void> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-untracked-context-failure-"));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "fossil" }, null, 2));
  fs.writeFileSync(path.join(cwd, ".fslckout"), "not a real checkout\n");
  const notifications: Notification[] = [];
  const harness = makePi([registerTracker]);
  const ctx = makeCtx(cwd, notifications);

  await harness.emit("session_start", {}, ctx);
  const inspectionWarnings = notifications.filter(note => note.level === "warning" && note.message.includes("Unable to verify untracked .context files"));
  assert(inspectionWarnings.length === 1, `failure: expected one explicit VCS inspection warning, got ${inspectionWarnings.length}`);
  await harness.emit("agent_end", {}, ctx);
  const repeatedWarnings = notifications.filter(note => note.level === "warning" && note.message.includes("Unable to verify untracked .context files"));
  assert(repeatedWarnings.length === 1, `failure: inspection warning should be deduplicated, got ${repeatedWarnings.length}`);
  await harness.emit("session_shutdown", {}, ctx);
  console.log(`inspection failure scenario cwd: ${cwd}`);
}

async function runGitScenario(): Promise<void> {
  const cwd = createGitProject("vazir-untracked-context-git-");
  const notifications: Notification[] = [];
  const harness = makePi([registerTracker]);
  const ctx = makeCtx(cwd, notifications);

  await harness.emit("session_start", {}, ctx);
  assert(untrackedWarnings(notifications).length === 0, "git: clean repo should not warn about untracked .context files");

  fs.mkdirSync(path.join(cwd, ".context", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "ideas", "idea-002.md"), "# Idea 002\n");
  await harness.emit("agent_end", {}, ctx);
  let warnings = untrackedWarnings(notifications);
  assert(warnings.length === 1, `git: expected exactly 1 untracked warning, got ${warnings.length}`);
  assert(warnings[0].message.includes(".context/ideas/idea-002.md"), `git: warning did not name the untracked file: ${warnings[0].message}`);
  assert(warnings[0].message.includes("git add"), `git: warning did not suggest git add: ${warnings[0].message}`);

  childProcess.execFileSync("git", ["add", ".context/ideas/idea-002.md"], { cwd, stdio: "pipe" });
  await harness.emit("agent_end", {}, ctx);
  warnings = untrackedWarnings(notifications);
  assert(warnings.length === 1, `git: staging the file should not produce a new warning, got ${warnings.length}`);

  await harness.emit("session_shutdown", {}, ctx);
  console.log(`git scenario cwd: ${cwd}`);
}

try {
  if (!commandAvailable("fossil", ["version"])) {
    console.log("Skipping fossil untracked-context scenario — fossil is not installed");
  } else {
    await runFossilScenario();
  }

  if (!commandAvailable("git")) {
    console.log("Skipping git untracked-context scenario — git is not installed");
  } else {
    await runGitScenario();
  }

  await runInspectionFailureScenario();
  console.log("All untracked .context warning assertions passed.");
} finally {
  cleanupStubModules(stubModuleDirs);
}
