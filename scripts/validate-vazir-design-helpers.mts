import childProcess from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const testPath = path.join(repoRoot, ".pi", "extensions", "vazir-context", "helpers.design.test.cjs");

const output = childProcess.execFileSync(process.execPath, [testPath], {
  cwd: repoRoot,
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (output.trim()) {
  process.stdout.write(`${output.trimEnd()}\n`);
}
