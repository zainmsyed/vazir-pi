import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const childProcess = require("node:child_process") as typeof import("node:child_process");

const stubModuleDirs = installCommonPiStubs();

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createJjRepo(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  childProcess.execSync("jj git init --colocate", { cwd, stdio: "pipe" });
  childProcess.execSync("jj bookmark create main", { cwd, stdio: "pipe" });
  return cwd;
}

function currentJjOpId(cwd: string): string {
  return childProcess
    .execSync("jj op log --no-graph --limit 1 --template 'id.short(8)'", { cwd, encoding: "utf-8", stdio: "pipe" })
    .trim();
}

function readFile(cwd: string, file: string): string {
  try {
    return fs.readFileSync(path.join(cwd, file), "utf-8");
  } catch {
    return "(missing)";
  }
}

async function runExactRestoreScenario() {
  const cwd = createJjRepo("vazir-jj-exact-restore-");

  // Set up pre-run state
  fs.writeFileSync(path.join(cwd, "existing.txt"), "original existing\n");
  childProcess.execSync("jj describe -m 'before run'", { cwd, stdio: "pipe" });
  const preRunOpId = currentJjOpId(cwd);

  // Simulate agent run: modify existing file and create new file
  fs.writeFileSync(path.join(cwd, "existing.txt"), "modified existing\n");
  fs.writeFileSync(path.join(cwd, "newfile.txt"), "new content\n");
  childProcess.execSync("jj describe -m 'after run'", { cwd, stdio: "pipe" });

  // Verify post-run state
  assert(readFile(cwd, "existing.txt") === "modified existing\n", "post-run existing.txt mismatch");
  assert(readFile(cwd, "newfile.txt") === "new content\n", "post-run newfile.txt should exist");

  // Import and call the real restore helper
  const vcsModule = await import(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"));
  vcsModule.jjRestoreCheckpoint(cwd, preRunOpId);

  // Verify exact pre-run state
  const restoredExisting = readFile(cwd, "existing.txt");
  const restoredNewfile = readFile(cwd, "newfile.txt");
  assert(restoredExisting === "original existing\n", `restored existing.txt mismatch: got "${restoredExisting}"`);
  assert(restoredNewfile === "(missing)", `restored newfile.txt should be gone: got "${restoredNewfile}"`);

  // Verify the diff only shows the pre-run working-copy change (existing.txt),
  // not the newfile.txt that was created during the run.
  const diffStat = childProcess.execSync("jj diff --stat", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  assert(diffStat.includes("existing.txt"), `restore should show existing.txt in working copy, got: ${diffStat}`);
  assert(!diffStat.includes("newfile.txt"), `restore should not show newfile.txt, got: ${diffStat}`);

  return { cwd };
}

async function runDeleteFileRestoreScenario() {
  const cwd = createJjRepo("vazir-jj-delete-restore-");

  // Set up pre-run state with a file that will be deleted
  fs.writeFileSync(path.join(cwd, "todelete.txt"), "will be deleted\n");
  childProcess.execSync("jj describe -m 'before delete'", { cwd, stdio: "pipe" });
  const preRunOpId = currentJjOpId(cwd);

  // Simulate agent run: delete the file
  fs.rmSync(path.join(cwd, "todelete.txt"));
  childProcess.execSync("jj describe -m 'after delete'", { cwd, stdio: "pipe" });

  // Verify post-run state
  assert(readFile(cwd, "todelete.txt") === "(missing)", "post-run todelete.txt should be missing");

  // Restore
  const vcsModule = await import(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"));
  vcsModule.jjRestoreCheckpoint(cwd, preRunOpId);

  // Verify exact pre-run state
  assert(readFile(cwd, "todelete.txt") === "will be deleted\n", "restored todelete.txt mismatch");

  return { cwd };
}

async function runRenameFileRestoreScenario() {
  const cwd = createJjRepo("vazir-jj-rename-restore-");

  // Set up pre-run state
  fs.writeFileSync(path.join(cwd, "oldname.txt"), "original content\n");
  childProcess.execSync("jj describe -m 'before rename'", { cwd, stdio: "pipe" });
  const preRunOpId = currentJjOpId(cwd);

  // Simulate agent run: rename the file
  fs.renameSync(path.join(cwd, "oldname.txt"), path.join(cwd, "newname.txt"));
  childProcess.execSync("jj describe -m 'after rename'", { cwd, stdio: "pipe" });

  // Verify post-run state
  assert(readFile(cwd, "oldname.txt") === "(missing)", "post-run oldname.txt should be missing");
  assert(readFile(cwd, "newname.txt") === "original content\n", "post-run newname.txt mismatch");

  // Restore
  const vcsModule = await import(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"));
  vcsModule.jjRestoreCheckpoint(cwd, preRunOpId);

  // Verify exact pre-run state
  assert(readFile(cwd, "oldname.txt") === "original content\n", "restored oldname.txt mismatch");
  assert(readFile(cwd, "newname.txt") === "(missing)", "restored newname.txt should be missing");

  return { cwd };
}

async function runInvalidOpIdScenario() {
  const cwd = createJjRepo("vazir-jj-invalid-opid-");

  const vcsModule = await import(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"));

  // Capture pre-call state
  const preOpId = currentJjOpId(cwd);

  let threw = false;
  let errorMessage = "";
  try {
    vcsModule.jjRestoreCheckpoint(cwd, "ffffffff");
  } catch (e: any) {
    threw = true;
    errorMessage = e.message;
  }

  // JJ may throw (exit != 0) or may return a warning on stdout/stderr with exit 0.
  // The important behaviour is that the repo is not corrupted.
  const postOpId = currentJjOpId(cwd);
  assert(postOpId === preOpId, `invalid opId should not change repo state: pre=${preOpId} post=${postOpId}`);

  // If JJ did not throw, that's acceptable as long as state is stable.
  // We still log whether it threw so test output shows the backend behaviour.
  if (!threw) {
    console.log(`  note: invalid opId '00000000' did not throw (JJ returned exit 0)`);
  } else {
    console.log(`  note: invalid opId threw: ${errorMessage.slice(0, 120)}`);
  }

  return { cwd };
}

try {
  const exact = await runExactRestoreScenario();
  const del = await runDeleteFileRestoreScenario();
  const rename = await runRenameFileRestoreScenario();
  const invalid = await runInvalidOpIdScenario();

  console.log("Exact restore (modify + create)");
  console.log(`cwd: ${exact.cwd}`);
  console.log("");

  console.log("Delete restore");
  console.log(`cwd: ${del.cwd}`);
  console.log("");

  console.log("Rename restore");
  console.log(`cwd: ${rename.cwd}`);
  console.log("");

  console.log("Invalid opId rejected");
  console.log(`cwd: ${invalid.cwd}`);
  console.log("");

  console.log("All exact-restore validations passed");
} catch (e: any) {
  console.error(`Validation failed: ${e.message}`);
  process.exit(1);
} finally {
  cleanupStubModules(stubModuleDirs);
}
