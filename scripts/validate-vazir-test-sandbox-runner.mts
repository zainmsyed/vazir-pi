import path from "node:path";
import * as fs from "node:fs";

import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";
import { assertProjectUnchanged, createTemporaryProject, writeSandboxSettings } from "./lib/test-sandbox-fixtures.mts";
import { createSandboxWorkspace } from "../.pi/lib/vazir-sandbox-workspace.ts";

type RunnerModule = {
  runTestSandbox: (options: { cwd: string; signal?: any; workspaceFactory?: any }) => Promise<any>;
};

const runner = await loadFileModule<RunnerModule>(path.join(repoRoot, ".pi", "lib", "vazir-test-sandbox.ts"), `${Date.now()}-test-sandbox-runner`);
const projects: Array<{ root: string; snapshot: string; cleanup: () => void }> = [];

function project() {
  const fixture = createTemporaryProject();
  projects.push(fixture);
  return fixture;
}

function nodeCommand(source: string, ...args: string[]): string[] {
  return [process.execPath, "-e", source, ...args];
}

function baseSettings(test: string[]): Record<string, unknown> {
  return {
    setup: nodeCommand("require('fs').writeFileSync('setup.txt', 'ready')"),
    start: nodeCommand("const http=require('http'); const s=http.createServer((q,r)=>r.end('ok')); s.listen(Number(process.env.PORT), '127.0.0.1'); setInterval(()=>{}, 10000)"),
    readiness: nodeCommand("require('http').get('http://127.0.0.1:'+process.env.PORT, r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"),
    test,
    timeout_ms: 5_000,
    port_role: "e2e",
    preserve_on_failure: true,
  };
}

function assertLogPaths(result: any): void {
  assert(result.workspacePath && result.artifactPaths.length > 0, "preserved result should expose workspace and artifact paths");
  for (const logPath of result.artifactPaths) assert(fs.existsSync(logPath), `phase log should remain inspectable: ${logPath}`);
}

async function assertProcessDead(pid: number): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`process ${pid} remained alive after sandbox cleanup`);
}

try {
  const success = project();
  writeSandboxSettings(success, baseSettings(nodeCommand("const fs=require('fs'); if(fs.readFileSync('setup.txt','utf8')!=='ready' || process.argv[1]!=='value with spaces') process.exit(9); fs.writeFileSync('.vazir-artifacts/test-artifact.txt','passed')", "value with spaces")));
  const successResult = await runner.runTestSandbox({ cwd: success.root });
  assert(successResult.ok && successResult.status === "passed", "successful lifecycle should pass");
  assert(successResult.phases.map((phase: any) => phase.phase).join(",") === "setup,start,readiness,test", "all configured phases should run in order");
  assert(successResult.phases.every((phase: any) => phase.status === "passed"), "all successful phases should be reported as passed");
  assert(successResult.port?.port >= 1 && successResult.port?.baseUrl.includes(String(successResult.port.port)), "allocated port should be reported");
  assert(successResult.workspacePath === null && successResult.cleanup.preserved === false, "successful workspace should be cleaned");
  assertProjectUnchanged(success);

  const setupFailure = project();
  writeSandboxSettings(setupFailure, { ...baseSettings(nodeCommand("process.exit(0)")), setup: nodeCommand("process.exit(3)") });
  const setupResult = await runner.runTestSandbox({ cwd: setupFailure.root });
  assert(!setupResult.ok && setupResult.status === "setup-failed", `setup failure should be distinct: ${JSON.stringify(setupResult)}`);
  assertLogPaths(setupResult);
  fs.rmSync(setupResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(setupFailure);

  const startupFailure = project();
  writeSandboxSettings(startupFailure, { ...baseSettings(nodeCommand("process.exit(0)")), start: nodeCommand("process.exit(4)"), readiness: null });
  const startupResult = await runner.runTestSandbox({ cwd: startupFailure.root });
  assert(!startupResult.ok && startupResult.status === "startup-failed", "startup failure should be distinct");
  assertLogPaths(startupResult);
  fs.rmSync(startupResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(startupFailure);

  const readinessFailure = project();
  writeSandboxSettings(readinessFailure, { ...baseSettings(nodeCommand("process.exit(0)")), readiness: nodeCommand("process.exit(6)"), timeout_ms: 1_000 });
  const readinessResult = await runner.runTestSandbox({ cwd: readinessFailure.root });
  assert(!readinessResult.ok && readinessResult.status === "readiness-timeout", `readiness timeout should be distinct: ${JSON.stringify(readinessResult)}`);
  assert((readinessResult.phases.find((phase: any) => phase.phase === "readiness")?.attempts ?? 0) > 0, "readiness should poll at least once");
  assertLogPaths(readinessResult);
  fs.rmSync(readinessResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(readinessFailure);

  const testFailure = project();
  writeSandboxSettings(testFailure, { ...baseSettings(nodeCommand("process.exit(7)")) });
  const testResult = await runner.runTestSandbox({ cwd: testFailure.root });
  assert(!testResult.ok && testResult.status === "test-failed", "test failure should be distinct from runner failure");
  assertLogPaths(testResult);
  fs.rmSync(testResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(testFailure);

  const cancelled = project();
  const descendantStart = "const fs=require('fs'); const {spawn}=require('child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},10000)']); fs.writeFileSync('child.pid',String(child.pid)); setInterval(()=>{},10000)";
  writeSandboxSettings(cancelled, { ...baseSettings(nodeCommand("setTimeout(()=>{}, 10000)")), start: nodeCommand(descendantStart), timeout_ms: 5_000 });
  const cancelController = new AbortController();
  const cancelPromise = runner.runTestSandbox({ cwd: cancelled.root, signal: cancelController.signal });
  setTimeout(() => cancelController.abort(), 100);
  const cancelResult = await cancelPromise;
  assert(!cancelResult.ok && cancelResult.status === "cancelled", "cancellation should be reported honestly");
  assertLogPaths(cancelResult);
  const descendantPid = Number(fs.readFileSync(path.join(cancelResult.workspacePath, "child.pid"), "utf8"));
  await assertProcessDead(descendantPid);
  fs.rmSync(cancelResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(cancelled);

  const cleanupFailure = project();
  writeSandboxSettings(cleanupFailure, { ...baseSettings(nodeCommand("process.exit(0)")), start: null, readiness: null });
  const cleanupFailureResult = await runner.runTestSandbox({
    cwd: cleanupFailure.root,
    workspaceFactory: (sourcePath: string, options: any) => {
      const staged = createSandboxWorkspace(sourcePath, options);
      return { ...staged, cleanup: () => { throw new Error("injected cleanup failure"); } };
    },
  });
  assert(!cleanupFailureResult.ok && cleanupFailureResult.status === "cleanup-failed", "cleanup failure should have a distinct status");
  assert(cleanupFailureResult.cleanup.ok === false && cleanupFailureResult.cleanup.error.includes("injected cleanup failure"), "cleanup failure details should be preserved");
  fs.rmSync(cleanupFailureResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(cleanupFailure);

  const overallTimeout = project();
  writeSandboxSettings(overallTimeout, { ...baseSettings(nodeCommand("setTimeout(()=>{}, 10000)")), timeout_ms: 1_000 });
  const timeoutResult = await runner.runTestSandbox({ cwd: overallTimeout.root });
  assert(!timeoutResult.ok && timeoutResult.status === "overall-timeout", "overall timeout should be distinct");
  assertLogPaths(timeoutResult);
  fs.rmSync(timeoutResult.workspacePath, { recursive: true, force: true });
  assertProjectUnchanged(overallTimeout);

  console.log("Test-sandbox runner validation passed");
} finally {
  for (const fixture of projects) fixture.cleanup();
}
