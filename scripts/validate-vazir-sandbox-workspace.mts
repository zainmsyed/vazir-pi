import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";

import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";
import { assertProjectUnchanged, createTemporaryProject } from "./lib/test-sandbox-fixtures.mts";

type WorkspaceModule = {
  SANDBOX_EXCLUDED_NAMES: Set<string>;
  SandboxWorkspaceError: new (message: string) => Error;
  createSandboxWorkspace: (sourcePath: string, options?: { tempRoot?: string; preserveOnFailure?: boolean }) => {
    sourceRoot: string;
    workspaceRoot: string;
    preserveOnFailure: boolean;
    cleanup: (options?: { failed?: boolean; preserve?: boolean }) => { preserved: boolean; removed: boolean; path: string | null };
  };
};

const workspace = await loadFileModule<WorkspaceModule>(path.join(repoRoot, ".pi", "lib", "vazir-sandbox-workspace.ts"), `${Date.now()}-sandbox-workspace`);
const projects: Array<{ cleanup: () => void }> = [];
const preserved: string[] = [];

function project(options: { escapingSymlink?: boolean } = {}) {
  const fixture = createTemporaryProject(options);
  projects.push(fixture);
  return fixture;
}

function exists(filePath: string): boolean {
  return fs.existsSync(filePath) || fs.lstatSync(filePath, { throwIfNoEntry: false } as any) !== undefined;
}

try {
  const source = project();
  const staged = workspace.createSandboxWorkspace(source.root, { preserveOnFailure: false });
  assert(staged.sourceRoot === fs.realpathSync(source.root), "workspace should expose the canonical source boundary");
  assert(staged.workspaceRoot !== source.root && !staged.workspaceRoot.startsWith(`${source.root}${path.sep}`), "workspace should be outside the source boundary");
  assert(fs.readFileSync(path.join(staged.workspaceRoot, "README.md"), "utf8") === "fixture project\n", "ordinary files should be copied");
  assert(fs.readFileSync(path.join(staged.workspaceRoot, "src", "nested", "app.txt"), "utf8") === "nested content\n", "nested files should be copied");
  assert(fs.readlinkSync(path.join(staged.workspaceRoot, "safe-link.txt")) === path.join("src", "nested", "app.txt"), "safe symlinks should remain inside the staged workspace");
  for (const excluded of [".context", ".git", ".jj", ".fslckout", ".fossil-settings"]) {
    assert(!exists(path.join(staged.workspaceRoot, excluded)), `${excluded} should be excluded at the workspace root`);
    assert(!exists(path.join(staged.workspaceRoot, "nested", excluded)), `${excluded} should be excluded at nested paths`);
  }
  fs.writeFileSync(path.join(staged.workspaceRoot, "sandbox-only.txt"), "not source\n");
  assert(!fs.existsSync(path.join(source.root, "sandbox-only.txt")), "sandbox changes must never copy back to the source");
  const cleaned = staged.cleanup();
  assert(cleaned.removed && !cleaned.preserved && cleaned.path === null, "successful cleanup should remove the workspace");
  assert(!fs.existsSync(staged.workspaceRoot), "cleaned workspace should no longer exist");
  assertProjectUnchanged(source);

  const first = workspace.createSandboxWorkspace(source.root, { preserveOnFailure: false });
  const second = workspace.createSandboxWorkspace(source.root, { preserveOnFailure: false });
  assert(first.workspaceRoot !== second.workspaceRoot, "concurrent workspace allocations must not collide");
  const firstCleanup = first.cleanup();
  const repeatedFirstCleanup = first.cleanup({ preserve: true });
  assert(firstCleanup.removed && repeatedFirstCleanup.removed && !repeatedFirstCleanup.preserved && repeatedFirstCleanup.path === null, "repeated cleanup should report the already-removed workspace accurately");
  second.cleanup();
  assertProjectUnchanged(source);

  const preservedRun = workspace.createSandboxWorkspace(source.root, { preserveOnFailure: true });
  const preservedResult = preservedRun.cleanup({ failed: true });
  assert(preservedResult.preserved && !preservedResult.removed && preservedResult.path === preservedRun.workspaceRoot, "failed runs should preserve the workspace when configured");
  preserved.push(preservedRun.workspaceRoot);
  const forcedCleanup = preservedRun.cleanup({ preserve: false });
  assert(forcedCleanup.removed && !fs.existsSync(preservedRun.workspaceRoot), "preserved workspaces should support deterministic forced cleanup");
  const postRemovalPreserve = preservedRun.cleanup({ preserve: true });
  assert(postRemovalPreserve.removed && !postRemovalPreserve.preserved && postRemovalPreserve.path === null, "preservation requested after removal should still report the workspace as removed");
  preserved.pop();

  const noPreserveRun = workspace.createSandboxWorkspace(source.root, { preserveOnFailure: false });
  const noPreserveResult = noPreserveRun.cleanup({ failed: true });
  assert(noPreserveResult.removed && !noPreserveResult.preserved, "failed runs should clean up when preservation is disabled");

  const escaping = project({ escapingSymlink: true });
  let rejected = false;
  try {
    workspace.createSandboxWorkspace(escaping.root, { preserveOnFailure: false });
  } catch (error) {
    rejected = true;
    assert(error instanceof workspace.SandboxWorkspaceError, "escaping symlink rejection should use the workspace error type");
    assert(String(error).includes("outside sandbox source boundary"), "escaping symlink errors should explain the boundary violation");
  }
  assert(rejected, "symlinks escaping the source boundary must be rejected");
  assertProjectUnchanged(escaping);

  const boundary = project();
  let boundaryRejected = false;
  try {
    workspace.createSandboxWorkspace(boundary.root, { tempRoot: path.join(boundary.root, "temp") });
  } catch (error) {
    boundaryRejected = true;
    assert(String(error).includes("inside its source boundary"), "destination boundary errors should be actionable");
  }
  assert(boundaryRejected, "a destination nested in the source must be rejected");
  assertProjectUnchanged(boundary);

  console.log("Sandbox workspace validation passed");
} finally {
  for (const workspacePath of preserved) fs.rmSync(workspacePath, { recursive: true, force: true });
  for (const fixture of projects) fixture.cleanup();
}
