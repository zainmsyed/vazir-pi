import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";

export interface TemporaryProject {
  root: string;
  snapshot: string;
  cleanup: () => void;
}

function snapshotEntry(filePath: string): string {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) return `link:${fs.readlinkSync(filePath)}`;
  if (stat.isDirectory()) {
    return `dir:[${fs.readdirSync(filePath).sort().map(name => `${name}=${snapshotEntry(path.join(filePath, name))}`).join("|")}]`;
  }
  return `file:${fs.readFileSync(filePath).toString("base64")}`;
}

export function createTemporaryProject(options: { escapingSymlink?: boolean } = {}): TemporaryProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-sandbox-fixture-"));
  fs.mkdirSync(path.join(root, "src", "nested"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.mkdirSync(path.join(root, "nested", ".context"), { recursive: true });
  fs.mkdirSync(path.join(root, "nested", ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "fixture project\n");
  fs.writeFileSync(path.join(root, "src", "nested", "app.txt"), "nested content\n");
  fs.writeFileSync(path.join(root, "assets", "image.txt"), "asset\n");
  for (const excluded of [".context", ".git", ".jj", ".fslckout", ".fossil-settings"]) {
    const excludedPath = path.join(root, excluded);
    if (excluded.endsWith("/")) fs.mkdirSync(excludedPath, { recursive: true });
    else if (excluded.startsWith(".")) {
      if (excluded.includes("settings")) fs.mkdirSync(excludedPath, { recursive: true });
      else if (excluded === ".fslckout") fs.writeFileSync(excludedPath, "fossil checkout\n");
      else fs.mkdirSync(excludedPath, { recursive: true });
    }
  }
  fs.writeFileSync(path.join(root, "nested", ".context", "secret.txt"), "brain\n");
  fs.writeFileSync(path.join(root, "nested", ".git", "config"), "metadata\n");
  fs.symlinkSync(path.join("src", "nested", "app.txt"), path.join(root, "safe-link.txt"));
  if (options.escapingSymlink) fs.symlinkSync(path.join(os.tmpdir(), "outside-vazir-sandbox.txt"), path.join(root, "escape-link.txt"));

  return {
    root,
    snapshot: snapshotEntry(root),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function assertProjectUnchanged(project: TemporaryProject): void {
  if (snapshotEntry(project.root) !== project.snapshot) {
    throw new Error("Source project changed during sandbox validation");
  }
}
