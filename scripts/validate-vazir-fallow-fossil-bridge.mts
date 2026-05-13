import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function fossilAvailable(): boolean {
  try {
    childProcess.execSync("fossil version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function createFossilProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoPath = path.join(root, "repo.fossil");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  childProcess.execSync(`fossil init ${JSON.stringify(repoPath)}`, { cwd: root, stdio: "pipe" });
  childProcess.execSync(`fossil open ${JSON.stringify(repoPath)}`, { cwd, stdio: "pipe" });

  fs.writeFileSync(path.join(cwd, "index.ts"), "const x = 1;\n");
  childProcess.execSync("fossil add index.ts", { cwd, stdio: "pipe" });
  childProcess.execSync("fossil commit -m initial --user-override vazir-test", { cwd, stdio: "pipe" });

  return cwd;
}

function getFossilParentHash(cwd: string): string | null {
  try {
    const info = childProcess.execSync("fossil info", { cwd, encoding: "utf-8", stdio: "pipe" });
    const match = info.match(/^parent:\s+([a-f0-9]+)/im);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function runFallowFossilBridge(cwd: string, binaryPath: string): { ok: true; result: { summaryLine: string; promptPrefix: string } } | { ok: false; error: string } {
  try {
    childProcess.execSync("git --version", { stdio: "pipe" });
  } catch {
    return { ok: false, error: "git not installed" };
  }

  const parentHash = getFossilParentHash(cwd);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-fallow-fossil-"));

  try {
    const repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    if (parentHash) {
      const tarball = path.join(tmpDir, "parent.tar.gz");
      childProcess.execFileSync("fossil", ["tarball", parentHash, tarball, "--name", "repo"], { cwd, encoding: "utf-8", stdio: "pipe" });
      childProcess.execFileSync("tar", ["xzf", tarball, "-C", tmpDir], { encoding: "utf-8", stdio: "pipe" });
    }

    if (fs.readdirSync(repoDir).length === 0) {
      fs.writeFileSync(path.join(repoDir, ".vazir-fallow-base"), "");
    }

    childProcess.execSync("git init && git add -A && git commit -m base", {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const exclude = new Set([".git", "node_modules", ".jj", ".fslckout", "_FOSSIL_", "dist", "build", "out"]);
    function copyContents(src: string, dest: string): void {
      for (const entry of fs.readdirSync(src)) {
        if (exclude.has(entry)) continue;
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
          copyContents(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    for (const entry of fs.readdirSync(repoDir)) {
      if (entry === ".git") continue;
      fs.rmSync(path.join(repoDir, entry), { recursive: true, force: true });
    }
    copyContents(cwd, repoDir);

    childProcess.execSync("git add -A && git commit -m head", {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const args = parentHash
      ? ["audit", "--base", "HEAD~1", "--format", "json"]
      : ["audit", "--format", "json"];
    const stdout = childProcess.execFileSync(binaryPath, args, {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (!trimmed) return { ok: false, error: "empty output" };

    const parsed = JSON.parse(trimmed);
    const verdict = parsed.verdict ?? parsed.summary?.verdict ?? "unknown";
    return {
      ok: true,
      result: {
        summaryLine: `fallow audit — ${verdict} (bridge test)`,
        promptPrefix: "",
      },
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

if (!fossilAvailable()) {
  console.log("Fallow Fossil bridge validation skipped — fossil binary not installed");
  process.exit(0);
}

const binaryPath = path.join(process.cwd(), "node_modules", ".bin", "fallow");
if (!fs.existsSync(binaryPath)) {
  console.log("Fallow Fossil bridge validation skipped — fallow not installed");
  process.exit(0);
}

const cwd = createFossilProject("vazir-fallow-bridge-");
fs.appendFileSync(path.join(cwd, "index.ts"), "const unused = 2;\n");

const result = runFallowFossilBridge(cwd, binaryPath);
assert(result.ok, `bridge failed: ${(result as any).error}`);
assert(typeof (result as any).result.summaryLine === "string" && (result as any).result.summaryLine.includes("fallow"), "bridge did not return a usable summary line");

const errorResult = runFallowFossilBridge(cwd, path.join(cwd, "missing-fallow-binary"));
assert(!errorResult.ok, "bridge should surface an execution error for an invalid fallow binary");
assert((errorResult as any).error.toLowerCase().includes("missing-fallow-binary") || (errorResult as any).error.toLowerCase().includes("enoent"), "bridge error path should preserve a diagnostic message");

console.log("Fallow Fossil bridge validation passed");
console.log(`summaryLine: ${(result as any).result.summaryLine}`);
console.log(`error: ${(errorResult as any).error}`);
