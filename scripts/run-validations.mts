import childProcess from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupStubModules, installCommonPiStubs } from "./lib/validation-harness.mts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const validations = [
  "validate-vazir-checkpoint-labels.mts",
  "validate-vazir-complete-story.mts",
  "validate-vazir-edits-stream.mts",
  "validate-vazir-implement-command.mts",
  "validate-vazir-fix-routing.mts",
  "validate-vazir-init.mts",
  "validate-vazir-learning-loop.mts",
  "validate-vazir-memory-review.mts",
  "validate-vazir-plan-seeding.mts",
  "validate-vazir-remember.mts",
  "validate-vazir-review-loop.mts",
  "validate-vazir-story-picker-order.mts",
  "validate-vazir-status-chrome.mts",
  "validate-vazir-story-status-guard.mts"
];
const stubModuleDirs = installCommonPiStubs();

try {
  for (const fileName of validations) {
    const scriptPath = path.join(scriptDir, fileName);
    console.log(`Running ${fileName}`);
    try {
      const output = childProcess.execFileSync(process.execPath, ["--experimental-strip-types", scriptPath], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (output.trim()) {
        process.stdout.write(`${output.trimEnd()}\n`);
      }
      console.log(`Passed ${fileName}`);
    } catch (error) {
      const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number; message?: string };
      const stdout = typeof failure.stdout === "string" ? failure.stdout : failure.stdout?.toString("utf-8") ?? "";
      const stderr = typeof failure.stderr === "string" ? failure.stderr : failure.stderr?.toString("utf-8") ?? "";
      if (stdout.trim()) {
        process.stdout.write(`${stdout.trimEnd()}\n`);
      }
      if (stderr.trim()) {
        process.stderr.write(`${stderr.trimEnd()}\n`);
      }
      throw new Error(`Validation failed: ${fileName} (exit ${failure.status ?? "unknown"})${failure.message ? `\n${failure.message}` : ""}`);
    }
  }
} finally {
  cleanupStubModules(stubModuleDirs);
}