import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const validations = [
  "validate-vazir-checkpoint-labels.mts",
  "validate-vazir-complete-story.mts",
  "validate-vazir-edits-stream.mts",
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

function ensureStubModule(moduleName: string, content: string): string | null {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  if (fs.existsSync(moduleDir)) {
    return null;
  }

  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, "package.json"), JSON.stringify({ name: moduleName, type: "commonjs" }, null, 2));
  fs.writeFileSync(path.join(moduleDir, "index.js"), content);
  return moduleDir;
}

const stubModuleDirs = [
  ensureStubModule("@mariozechner/pi-tui", [
    "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape', ctrl: value => value, ctrlShift: value => value, shiftCtrl: value => value };",
    "exports.matchesKey = (data, key) => data === key;",
    "exports.Container = class {};",
    "exports.Text = class {};",
    "",
  ].join("\n")),
  ensureStubModule("@mariozechner/pi-coding-agent", [
    "exports.DynamicBorder = class {};",
    "",
  ].join("\n")),
].filter((dir): dir is string => dir !== null);

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
  for (const moduleDir of stubModuleDirs.reverse()) {
    fs.rmSync(moduleDir, { recursive: true, force: true });
  }
}