import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";

import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

type SettingsModule = {
  TEST_SANDBOX_DEFAULT_TIMEOUT_MS: number;
  TEST_SANDBOX_DEFAULT_PORT_ROLE: string;
  readProjectSettings: (cwd: string) => Record<string, any>;
  normalizeTestSandboxSettings: (raw: unknown) => Record<string, any>;
  validateTestSandboxSettings: (raw: unknown) => string[];
  assertValidTestSandboxSettings: (raw: unknown) => Record<string, any>;
  writeProjectSettings: (cwd: string, updates: Record<string, unknown>) => Record<string, any>;
};

const helpers = await loadFileModule<SettingsModule>(path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts"), `${Date.now()}-test-sandbox-settings`);

function createProject(initial: Record<string, unknown> = {}): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-test-sandbox-settings-"));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify(initial, null, 2));
  return cwd;
}

function settingsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "project.json");
}

const projects: string[] = [];
function project(initial: Record<string, unknown> = {}): string {
  const cwd = createProject(initial);
  projects.push(cwd);
  return cwd;
}

try {
  const missingProject = project({ project_name: "legacy", vcs_preference: "auto" });
  const missing = helpers.readProjectSettings(missingProject);
  assert(missing.project_name === "legacy" && missing.vcs_preference === "auto", "legacy settings should survive normalization");
  assert(missing.test_sandbox.setup === null && missing.test_sandbox.start === null && missing.test_sandbox.readiness === null, "missing optional commands should default to null");
  assert(missing.test_sandbox.test === null, "missing required test command should remain unconfigured");
  assert(missing.test_sandbox.timeout_ms === helpers.TEST_SANDBOX_DEFAULT_TIMEOUT_MS, "missing timeout should use the safe default");
  assert(missing.test_sandbox.port_role === helpers.TEST_SANDBOX_DEFAULT_PORT_ROLE, "missing port role should use the safe default");
  assert(missing.test_sandbox.preserve_on_failure === true, "missing preserve-on-failure should default to true");

  const testCommand = ["node", "--test", "test files/e2e.test.mjs"];
  const valid = {
    setup: ["npm", "ci", "--ignore-scripts"],
    start: ["node", "server.mjs", "--port", "${PORT}"],
    readiness: ["node", "scripts/ready.mjs", "--url", ""],
    test: testCommand,
    timeout_ms: 30_000,
    port_role: "web-app",
    preserve_on_failure: false,
    future_option: { keep: true },
  };
  assert(helpers.validateTestSandboxSettings(valid).length === 0, "a valid structured configuration should have no validation issues");
  const normalized = helpers.normalizeTestSandboxSettings(valid);
  assert(JSON.stringify(normalized.test) === JSON.stringify(testCommand), "command argument boundaries should round-trip exactly");
  assert(normalized.start[3] === "${PORT}", "command arguments must remain literal and must not be shell-expanded");
  assert(normalized.future_option.keep === true, "unknown nested settings should be preserved");

  const legacyWriteProject = project({ project_name: "legacy-write", unrelated: { keep: "yes" } });
  helpers.writeProjectSettings(legacyWriteProject, { active_vcs_mode: "none" });
  const legacyAfterUnrelatedWrite = JSON.parse(fs.readFileSync(settingsPath(legacyWriteProject), "utf8")) as Record<string, any>;
  assert(!("test_sandbox" in legacyAfterUnrelatedWrite), "unrelated writes must not add normalized sandbox defaults to legacy settings");

  const malformedSandbox = { test: "npm run e2e", timeout_ms: -1, custom: { preserve: true } };
  const malformedWriteProject = project({ project_name: "malformed-write", test_sandbox: malformedSandbox });
  helpers.writeProjectSettings(malformedWriteProject, { active_vcs_mode: "none" });
  const malformedAfterUnrelatedWrite = JSON.parse(fs.readFileSync(settingsPath(malformedWriteProject), "utf8")) as Record<string, any>;
  assert(JSON.stringify(malformedAfterUnrelatedWrite.test_sandbox) === JSON.stringify(malformedSandbox), "unrelated writes must preserve malformed sandbox data for explicit remediation");

  const roundTripProject = project({ project_name: "round-trip", unrelated: { keep: "yes" } });
  const written = helpers.writeProjectSettings(roundTripProject, { test_sandbox: valid });
  assert(written.unrelated.keep === "yes", "merge-safe writes must preserve unrelated settings");
  const roundTrip = JSON.parse(fs.readFileSync(settingsPath(roundTripProject), "utf8")) as Record<string, any>;
  assert(JSON.stringify(roundTrip.test_sandbox.test) === JSON.stringify(testCommand), "structured command arrays should survive JSON round-trip");
  assert(roundTrip.test_sandbox.future_option.keep === true, "unknown nested settings should survive writes");
  assert(roundTrip.project_name === "round-trip", "legacy project settings should survive writes");

  const malformedCases: Array<[string, unknown, string]> = [
    ["shell test command", { test_sandbox: { test: "npm run e2e" } }, "not a shell string"],
    ["empty executable", { test_sandbox: { test: ["", "--run"] } }, "non-empty executable"],
    ["non-string argument", { test_sandbox: { test: ["npm", 42] } }, "string arguments"],
    ["missing test", { test_sandbox: { start: ["npm", "run", "dev"] } }, "test_sandbox.test is required"],
    ["invalid timeout", { test_sandbox: { test: ["npm", "run", "e2e"], timeout_ms: 999 } }, "timeout_ms"],
    ["invalid port role", { test_sandbox: { test: ["npm", "run", "e2e"], port_role: "web app" } }, "port_role"],
    ["invalid preserve flag", { test_sandbox: { test: ["npm", "run", "e2e"], preserve_on_failure: "yes" } }, "preserve_on_failure"],
  ];
  for (const [label, raw, expected] of malformedCases) {
    const settings = (raw as Record<string, any>).test_sandbox;
    const issues = helpers.validateTestSandboxSettings(settings);
    assert(issues.some(issue => issue.includes(expected)), `${label} should produce an actionable validation message`);
    let threw = false;
    try {
      helpers.assertValidTestSandboxSettings(settings);
    } catch (error) {
      threw = true;
      assert(String(error).includes("Invalid test_sandbox settings"), `${label} should identify the settings section`);
    }
    assert(threw, `${label} should fail validation instead of being accepted`);
  }

  const malformedReadProject = project({ project_name: "safe-default", test_sandbox: { test: "npm run e2e", timeout_ms: -1 } });
  const safelyNormalized = helpers.readProjectSettings(malformedReadProject).test_sandbox;
  assert(safelyNormalized.test === null, "malformed shell commands must not be interpreted during reads");
  assert(safelyNormalized.timeout_ms === helpers.TEST_SANDBOX_DEFAULT_TIMEOUT_MS, "malformed values should normalize to safe defaults on reads");

  console.log("Test-sandbox settings validation passed");
} finally {
  for (const cwd of projects) fs.rmSync(cwd, { recursive: true, force: true });
}
