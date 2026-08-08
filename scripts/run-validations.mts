import childProcess from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupStubModules, installCommonPiStubs } from "./lib/validation-harness.mts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);

// Environment-dependent validations are skipped only when their required external tool is absent.
const REQUIRED_COMMANDS: Record<string, string> = {
  "validate-vazir-jj-exact-restore.mts": "jj",
};

function commandAvailable(command: string): boolean {
  try {
    childProcess.execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Manual-only validations:
// - validate-vazir-live-reload.mts depends on host fs.watch timing/debounce behavior and is kept
//   as an explicit troubleshooting/manual check instead of part of the deterministic aggregate suite.
const validations = [
  "validate-learned-rule-draft-edge-cases.mts",
  "validate-vazir-checkpoint-labels.mts",
  "validate-vazir-active-review-suppression.mts",
  "validate-vazir-complete-story.mts",
  "validate-vazir-confidence-and-subsections.mts",
  "validate-vazir-consolidate-handler-wiring.mts",
  "validate-vazir-critical-helpers.mts",
  "validate-vazir-design-helpers.mts",
  "validate-vazir-edits-stream.mts",
  "validate-vazir-fallow-fossil-bridge.mts",
  "validate-vazir-fallow-fossil-review.mts",
  "validate-vazir-fallow-recurrence.mts",
  "validate-vazir-fallow-review-closeout.mts",
  "validate-vazir-fallow-signal-sources.mts",
  "validate-vazir-fix-routing.mts",
  "validate-vazir-idea-capture.mts",
  "validate-vazir-idea-browse.mts",
  "validate-vazir-plan-idea.mts",
  "validate-vazir-fossil-footer.mts",
  "validate-vazir-fossil-timeouts.mts",
  "validate-vazir-implement-command.mts",
  "validate-vazir-init.mts",
  "validate-vazir-ports.mts",
  "validate-vazir-jj-agent-run-checkpoints.mts",
  "validate-vazir-jj-exact-restore.mts",
  "validate-vazir-jj-milestones.mts",
  "validate-vazir-learning-loop.mts",
  "validate-vazir-memory-review.mts",
  "validate-vazir-plan-repair.mts",
  "validate-vazir-plan-seeding.mts",
  "validate-vazir-remember.mts",
  "validate-vazir-review-design-compliance.mts",
  "validate-vazir-review-loop.mts",
  "validate-vazir-status-chrome.mts",
  "validate-vazir-story-file-validation.mts",
  "validate-vazir-story-picker-order.mts",
  "validate-vazir-story-status-guard.mts",
  "validate-vazir-tracker-resolution.mts",
  "validate-vazir-vcs-mirror-autosync.mts",
  "validate-vazir-vcs-mirror-settings.mts",
  "validate-vazir-vcs-mirror-sync.mts",
  "validate-vazir-vcs-safety-policy.mts",
  "validate-vazir-vcs-tool-guard.mts",
  "validate-vazir-ui-helpers.mts",
];
const stubModuleDirs = installCommonPiStubs();

try {
  for (const fileName of validations) {
    const requiredCommand = REQUIRED_COMMANDS[fileName];
    if (requiredCommand && !commandAvailable(requiredCommand)) {
      if (process.env.VAZIR_REQUIRE_JJ === "1") {
        throw new Error(`Required validation tool '${requiredCommand}' is not installed for ${fileName}.`);
      }
      console.log(`Skipping ${fileName} — ${requiredCommand} is not installed (set VAZIR_REQUIRE_JJ=1 to enforce this validation)`);
      continue;
    }

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