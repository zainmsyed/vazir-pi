/// <reference path="../../types/node-runtime-ambient.d.ts" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const SANDBOX_EXCLUDED_NAMES = new Set([
  ".context",
  ".git",
  ".jj",
  ".fslckout",
  ".fossil-settings",
]);

export interface SandboxWorkspaceOptions {
  tempRoot?: string;
  preserveOnFailure?: boolean;
}

export interface SandboxCleanupResult {
  preserved: boolean;
  removed: boolean;
  path: string | null;
}

export interface SandboxWorkspace {
  sourceRoot: string;
  workspaceRoot: string;
  preserveOnFailure: boolean;
  cleanup: (options?: { failed?: boolean; preserve?: boolean }) => SandboxCleanupResult;
}

export class SandboxWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxWorkspaceError";
  }
}

function realPath(filePath: string): string {
  return fs.realpathSync(filePath);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function excluded(name: string): boolean {
  return SANDBOX_EXCLUDED_NAMES.has(name);
}

function assertSourceDirectory(sourcePath: string): string {
  const sourceRoot = realPath(sourcePath);
  if (!fs.statSync(sourceRoot).isDirectory()) {
    throw new SandboxWorkspaceError(`Sandbox source must be a directory: ${sourcePath}`);
  }
  return sourceRoot;
}

function translatedSymlinkTarget(sourceRoot: string, workspaceRoot: string, sourceLinkPath: string, destinationLinkPath: string): string | null {
  const rawTarget = fs.readlinkSync(sourceLinkPath);
  const lexicalTarget = path.resolve(path.dirname(sourceLinkPath), rawTarget);
  if (!isWithin(sourceRoot, lexicalTarget)) {
    throw new SandboxWorkspaceError(`Refusing symlink outside sandbox source boundary: ${sourceLinkPath}`);
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = realPath(lexicalTarget);
  } catch {
    // Preserve dangling links only after their lexical target has passed the boundary check.
    resolvedTarget = lexicalTarget;
  }

  if (!isWithin(sourceRoot, resolvedTarget)) {
    throw new SandboxWorkspaceError(`Refusing symlink outside sandbox source boundary: ${sourceLinkPath}`);
  }

  const relativeTarget = path.relative(sourceRoot, resolvedTarget);
  if (relativeTarget === "") {
    throw new SandboxWorkspaceError(`Refusing symlink to the sandbox source root: ${sourceLinkPath}`);
  }

  const destinationTarget = path.join(workspaceRoot, relativeTarget);
  return path.relative(path.dirname(destinationLinkPath), destinationTarget) || ".";
}

function copyEntry(sourceRoot: string, workspaceRoot: string, sourcePath: string, destinationPath: string): void {
  const entry = path.basename(sourcePath);
  if (excluded(entry)) return;

  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    const target = translatedSymlinkTarget(sourceRoot, workspaceRoot, sourcePath, destinationPath);
    if (target !== null) fs.symlinkSync(target, destinationPath, "file");
    return;
  }

  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const child of fs.readdirSync(sourcePath)) {
      copyEntry(sourceRoot, workspaceRoot, path.join(sourcePath, child), path.join(destinationPath, child));
    }
    return;
  }

  if (stat.isFile()) {
    fs.copyFileSync(sourcePath, destinationPath);
    return;
  }

  throw new SandboxWorkspaceError(`Unsupported filesystem entry in sandbox source: ${sourcePath}`);
}

function removeWorkspace(workspaceRoot: string): void {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
}

export function createSandboxWorkspace(sourcePath: string, options: SandboxWorkspaceOptions = {}): SandboxWorkspace {
  const sourceRoot = assertSourceDirectory(sourcePath);
  const tempRoot = path.resolve(options.tempRoot ?? os.tmpdir());
  if (isWithin(sourceRoot, tempRoot)) {
    throw new SandboxWorkspaceError("Sandbox destination must not be inside its source boundary");
  }
  fs.mkdirSync(tempRoot, { recursive: true });
  if (isWithin(sourceRoot, realPath(tempRoot))) {
    throw new SandboxWorkspaceError("Sandbox destination must not be inside its source boundary");
  }
  const workspaceRoot = fs.mkdtempSync(path.join(tempRoot, "vazir-e2e-sandbox-"));

  try {
    if (isWithin(sourceRoot, realPath(workspaceRoot))) {
      throw new SandboxWorkspaceError("Sandbox destination must not be inside its source boundary");
    }
    for (const entry of fs.readdirSync(sourceRoot)) {
      copyEntry(sourceRoot, workspaceRoot, path.join(sourceRoot, entry), path.join(workspaceRoot, entry));
    }
  } catch (error) {
    removeWorkspace(workspaceRoot);
    throw error;
  }

  const preserveOnFailure = options.preserveOnFailure ?? true;
  let cleaned = false;
  const cleanup = (cleanupOptions: { failed?: boolean; preserve?: boolean } = {}): SandboxCleanupResult => {
    if (cleaned) return { preserved: false, removed: true, path: null };

    const failed = cleanupOptions.failed ?? false;
    const preserve = cleanupOptions.preserve ?? (failed && preserveOnFailure);
    if (preserve) {
      return { preserved: true, removed: false, path: workspaceRoot };
    }
    removeWorkspace(workspaceRoot);
    cleaned = true;
    return { preserved: false, removed: true, path: null };
  };

  return { sourceRoot, workspaceRoot, preserveOnFailure, cleanup };
}
