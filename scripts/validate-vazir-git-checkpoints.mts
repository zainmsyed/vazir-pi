import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const vcsModule = await loadFileModule<{
  sessionCheckpointDir: (cwd: string, id: string) => string;
  gitSnapshotFile: (cwd: string, filePath: string, checkpointDir: string) => void;
  listGitCheckpoints: (cwd: string, sessionId: string) => Array<{ n: number; dir: string; meta: { timestamp: string; prompt: string; files: string[]; newFiles: string[] } }>;
  gitRestoreCheckpoint: (cwd: string, checkpointDir: string) => void;
  findOrphanedGitSessions: (cwd: string, currentId: string) => string[];
  isGitClean: (cwd: string) => boolean;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "vcs.ts"));

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-git-checkpoints-"));
fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export const v1 = 1;\n");

// Two checkpoint generations for one session, mimicking before_agent_start flow.
const sessionId = "sessiontest";
const dir1 = path.join(vcsModule.sessionCheckpointDir(cwd, sessionId), "1");
const dir2 = path.join(vcsModule.sessionCheckpointDir(cwd, sessionId), "2");
fs.mkdirSync(path.join(dir1, "files"), { recursive: true });
fs.mkdirSync(path.join(dir2, "files"), { recursive: true });

fs.writeFileSync(path.join(dir1, "meta.json"), JSON.stringify({ timestamp: new Date().toISOString(), prompt: "first turn", files: [], newFiles: [] }, null, 2));
fs.writeFileSync(path.join(dir2, "meta.json"), JSON.stringify({ timestamp: new Date().toISOString(), prompt: "second turn", files: [], newFiles: [] }, null, 2));

// Snapshot the file at checkpoint 1, then change it. Meta files lists are
// updated by the tracker's tool_call handler in production; mimic that here.
function recordSnapshot(checkpointDir: string, filePath: string): void {
  vcsModule.gitSnapshotFile(cwd, filePath, checkpointDir);
  const metaPath = path.join(checkpointDir, "meta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { files: string[] };
  if (!meta.files.includes(filePath)) meta.files.push(filePath);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
recordSnapshot(dir1, "src/app.ts");
fs.writeFileSync(path.join(cwd, "src", "app.ts"), "export const v2 = 2;\n");
recordSnapshot(dir2, "src/app.ts");

const checkpoints = vcsModule.listGitCheckpoints(cwd, sessionId);
assert(checkpoints.length === 2, `expected 2 checkpoints, got ${checkpoints.length}`);
assert(checkpoints[0].n === 2 && checkpoints[1].n === 1, "checkpoints should list newest first");

// Restore the older checkpoint: content reverts to the snapshot.
vcsModule.gitRestoreCheckpoint(cwd, dir1);
const restored = fs.readFileSync(path.join(cwd, "src", "app.ts"), "utf-8");
assert(restored === "export const v1 = 1;\n", "restore should revert the file to the checkpointed snapshot");

// Orphan session detection: other sessions are orphaned, current one is not.
const otherDir = vcsModule.sessionCheckpointDir(cwd, "other-session");
fs.mkdirSync(otherDir, { recursive: true });
const orphans = vcsModule.findOrphanedGitSessions(cwd, sessionId);
assert(orphans.includes("other-session"), "orphaned session should be detected");
assert(!orphans.includes(sessionId), "current session should not be reported as orphaned");

console.log("Git checkpoint validation");
console.log(`cwd: ${cwd}`);
console.log("  snapshot/restore round-trip, ordering, and orphan detection assertions passed.");
