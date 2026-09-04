/// <reference path="../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertValidTestSandboxSettings,
  readRawProjectSettings,
  type TestSandboxCommand,
  type TestSandboxSettings,
} from "./vazir-helpers.ts";
import { assignPort } from "./vazir-ports.ts";
import { createSandboxWorkspace, type SandboxWorkspace } from "./vazir-sandbox-workspace.ts";

export type SandboxPhase = "setup" | "start" | "readiness" | "test";
export type SandboxPhaseStatus = "passed" | "failed" | "timed-out" | "cancelled" | "skipped";

export interface SandboxPhaseResult {
  phase: SandboxPhase;
  status: SandboxPhaseStatus;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  logPath: string | null;
  logExcerpt?: string;
  logTruncated?: boolean;
  attempts?: number;
}

export interface SandboxCleanupReport {
  ok: boolean;
  preserved: boolean;
  workspacePath: string | null;
  error: string | null;
}

export interface TestSandboxResult {
  ok: boolean;
  status: "passed" | "setup-failed" | "startup-failed" | "readiness-timeout" | "test-failed" | "cancelled" | "overall-timeout" | "runner-failed" | "cleanup-failed";
  sourceRoot: string;
  workspacePath: string | null;
  artifactPaths: string[];
  port: { role: string; port: number; baseUrl: string } | null;
  phases: SandboxPhaseResult[];
  durationMs: number;
  error: string | null;
  cleanup: SandboxCleanupReport;
}

export interface TestSandboxRunOptions {
  cwd?: string;
  signal?: any;
  settings?: TestSandboxSettings;
  preserveOnFailure?: boolean;
  workspaceFactory?: typeof createSandboxWorkspace;
}

type Child = any;

function commandText(command: TestSandboxCommand): string {
  return command.map(part => JSON.stringify(part)).join(" ");
}

function now(): number {
  return Date.now();
}

function appendLog(logPath: string, chunk: unknown): void {
  (fs as any).appendFileSync(logPath, Buffer.isBuffer(chunk) ? chunk : String(chunk));
}

async function processGroupAlive(pid: number): Promise<boolean> {
  try {
    (process as any).kill(process.platform === "win32" ? pid : -pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessTreeExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await processGroupAlive(pid))) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return !(await processGroupAlive(pid));
}

async function terminateProcessTree(child: Child): Promise<void> {
  const pid = Number(child?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      childProcess.execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      (process as any).kill(-pid, "SIGTERM");
      if (!(await waitForProcessTreeExit(pid, 750))) {
        try { (process as any).kill(-pid, "SIGKILL"); } catch { /* already exited */ }
      }
    }
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already exited */ }
  }
  await waitForProcessTreeExit(pid, 750);
}

function phaseResult(phase: SandboxPhase, status: SandboxPhaseStatus, started: number, logPath: string | null, exitCode: number | null = null, signal: string | null = null, attempts?: number): SandboxPhaseResult {
  return { phase, status, exitCode, signal, durationMs: Math.max(0, now() - started), logPath, ...(attempts === undefined ? {} : { attempts }) };
}

function spawnCommand(command: TestSandboxCommand, cwd: string, env: Record<string, string>, logPath: string, signal: any): { child: Child; started: Promise<boolean>; done: Promise<{ code: number | null; signal: string | null }>; terminate: () => Promise<void> } {
  const child = (childProcess as any).spawn(command[0], command.slice(1), {
    cwd,
    env,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let termination: Promise<void> | null = null;
  const terminate = () => termination ??= terminateProcessTree(child);
  const started = new Promise<boolean>(resolve => {
    child.once("spawn", () => resolve(true));
    child.once("error", () => resolve(false));
  });
  const done = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    let settled = false;
    let abortAttached = false;
    const abortChild = () => void terminate();
    const detachAbort = () => {
      if (abortAttached) signal.removeEventListener("abort", abortChild);
      abortAttached = false;
    };
    const finish = (code: number | null, childSignal: string | null) => {
      if (settled) return;
      settled = true;
      detachAbort();
      resolve({ code, signal: childSignal });
    };
    child.stdout?.on("data", (chunk: unknown) => appendLog(logPath, chunk));
    child.stderr?.on("data", (chunk: unknown) => appendLog(logPath, chunk));
    child.once("error", (error: Error) => {
      appendLog(logPath, `\n[spawn error] ${error.message}\n`);
      if (!settled) {
        settled = true;
        detachAbort();
        reject(error);
      }
    });
    child.once("close", finish);
    if (signal) {
      if (signal.aborted) void terminate();
      else {
        signal.addEventListener("abort", abortChild, { once: true });
        abortAttached = true;
      }
    }
  });
  return { child, started, done, terminate };
}

async function runCommand(command: TestSandboxCommand, phase: SandboxPhase, cwd: string, env: Record<string, string>, logPath: string, timeoutMs: number, signal: any): Promise<SandboxPhaseResult> {
  const started = now();
  const commandHeader = `[$ ${commandText(command)}]\n`;
  if (fs.existsSync(logPath)) (fs as any).appendFileSync(logPath, commandHeader);
  else fs.writeFileSync(logPath, commandHeader);
  const controller = new (globalThis as any).AbortController();
  const abortFromParent = () => controller.abort();
  let parentAbortAttached = false;
  if (signal) {
    if (signal.aborted) controller.abort();
    else {
      signal.addEventListener("abort", abortFromParent, { once: true });
      parentAbortAttached = true;
    }
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let childResult: { code: number | null; signal: string | null };
  let spawned: { child: Child; started: Promise<boolean>; done: Promise<{ code: number | null; signal: string | null }>; terminate: () => Promise<void> } | null = null;
  try {
    spawned = spawnCommand(command, cwd, env, logPath, controller.signal);
    await spawned.started;
    childResult = await spawned.done;
    if (controller.signal.aborted) await spawned.terminate();
    if (controller.signal.aborted) {
      const timedOut = now() - started >= timeoutMs;
      return phaseResult(phase, timedOut ? "timed-out" : "cancelled", started, logPath, childResult.code, childResult.signal);
    }
    return phaseResult(phase, childResult.code === 0 ? "passed" : "failed", started, logPath, childResult.code, childResult.signal);
  } catch {
    return phaseResult(phase, "failed", started, logPath, null, null);
  } finally {
    clearTimeout(timer);
    if (parentAbortAttached) signal.removeEventListener("abort", abortFromParent);
  }
}

async function runReadiness(command: TestSandboxCommand, cwd: string, env: Record<string, string>, logPath: string, timeoutMs: number, signal: any, startChild: Child | null): Promise<SandboxPhaseResult> {
  const started = now();
  const deadline = started + timeoutMs;
  let attempts = 0;
  (fs as any).appendFileSync(logPath, `Polling readiness: ${commandText(command)}\n`);
  while (now() < deadline) {
    if (signal?.aborted || startChild?.exitCode !== null && startChild?.exitCode !== undefined) {
      return phaseResult("readiness", signal?.aborted ? "cancelled" : "failed", started, logPath, startChild?.exitCode ?? null, null, attempts);
    }
    attempts += 1;
    const attempt = await runCommand(command, "readiness", cwd, env, logPath, Math.min(5_000, Math.max(1, deadline - now())), signal);
    if (attempt.status === "passed") return phaseResult("readiness", "passed", started, logPath, 0, null, attempts);
    if (attempt.status === "cancelled" || attempt.status === "timed-out" && signal?.aborted) return phaseResult("readiness", attempt.status, started, logPath, attempt.exitCode, attempt.signal, attempts);
    await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(0, deadline - now()))));
  }
  return phaseResult("readiness", signal?.aborted ? "cancelled" : "timed-out", started, logPath, null, null, attempts);
}

function skipPhase(phase: SandboxPhase): SandboxPhaseResult {
  return { phase, status: "skipped", exitCode: null, signal: null, durationMs: 0, logPath: null };
}

const PHASE_LOG_EXCERPT_BYTES = 6_000;

function capturePhaseLogEvidence(phases: SandboxPhaseResult[]): void {
  for (const phase of phases) {
    if (!phase.logPath || !fs.existsSync(phase.logPath)) continue;
    try {
      const size = fs.statSync(phase.logPath).size;
      const bytes = Math.min(size, PHASE_LOG_EXCERPT_BYTES);
      const buffer = Buffer.alloc(bytes);
      const fd = (fs as any).openSync(phase.logPath, "r");
      try {
        (fs as any).readSync(fd, buffer, 0, bytes, Math.max(0, size - bytes));
      } finally {
        (fs as any).closeSync(fd);
      }
      phase.logExcerpt = buffer.toString("utf-8");
      phase.logTruncated = size > bytes;
    } catch (error) {
      phase.logExcerpt = `[Unable to read phase log: ${error instanceof Error ? error.message : String(error)}]`;
      phase.logTruncated = false;
    }
  }
}

function configFromProject(cwd: string): TestSandboxSettings {
  const raw = readRawProjectSettings(cwd).test_sandbox;
  return assertValidTestSandboxSettings(raw);
}

export async function runTestSandbox(options: TestSandboxRunOptions = {}): Promise<TestSandboxResult> {
  const sourceRoot = path.resolve(options.cwd ?? process.cwd());
  const started = now();
  let staged: SandboxWorkspace | null = null;
  let portAssignment: any = null;
  let externalAbortAttached = false;
  let externalAbortForwarder: (() => void) | null = null;
  let overallTimer: ReturnType<typeof setTimeout> | null = null;
  const phases: SandboxPhaseResult[] = [];
  let primaryStatus: TestSandboxResult["status"] = "runner-failed";
  let error: string | null = null;
  let workspacePath: string | null = null;
  try {
    const settings = options.settings ?? configFromProject(sourceRoot);
    if (!settings.test) throw new Error("test_sandbox.test is required before running the test sandbox.");
    const workspaceFactory = options.workspaceFactory ?? createSandboxWorkspace;
    staged = workspaceFactory(sourceRoot, { preserveOnFailure: options.preserveOnFailure ?? settings.preserve_on_failure });
    workspacePath = staged.workspaceRoot;
    const artifactRoot = path.join(staged.workspaceRoot, ".vazir-artifacts");
    fs.mkdirSync(artifactRoot, { recursive: true });
    const env: Record<string, string> = { ...(process as any).env, VAZIR_SANDBOX: "1" };

    portAssignment = await assignPort(staged.workspaceRoot, settings.port_role);
    env.PORT = String(portAssignment.port);
    env.VAZIR_PORT = String(portAssignment.port);
    env[`VAZIR_PORT_${settings.port_role.toUpperCase()}`] = String(portAssignment.port);
    env.VAZIR_PORTS_JSON = JSON.stringify({ [settings.port_role]: portAssignment.port });
    await portAssignment.close();
    const port = { role: settings.port_role, port: portAssignment.port, baseUrl: portAssignment.baseUrl };
    portAssignment = null;

    const controller = new (globalThis as any).AbortController();
    externalAbortForwarder = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else {
        options.signal.addEventListener("abort", externalAbortForwarder, { once: true });
        externalAbortAttached = true;
      }
    }
    const overallTimeoutMs = Math.min(settings.timeout_ms * 4, 3_600_000);
    overallTimer = setTimeout(() => controller.abort(), overallTimeoutMs);
    const phaseLog = (phase: SandboxPhase) => path.join(artifactRoot, `${phase}.log`);
    const runPhase = async (command: TestSandboxCommand | null, phase: SandboxPhase) => command ? runCommand(command, phase, staged!.workspaceRoot, env, phaseLog(phase), settings.timeout_ms, controller.signal) : skipPhase(phase);

    const setup = await runPhase(settings.setup, "setup");
    phases.push(setup);
    if (setup.status === "failed" || setup.status === "timed-out") {
      primaryStatus = "setup-failed";
    } else if (setup.status === "cancelled") {
      primaryStatus = controller.signal.aborted && now() - started >= overallTimeoutMs ? "overall-timeout" : "cancelled";
    } else {
      let startChild: Child | null = null;
      let startDone: Promise<any> | null = null;
      let startSpawnFailed = false;
      if (settings.start) {
        const startStarted = now();
        const startLog = phaseLog("start");
        fs.writeFileSync(startLog, `[$ ${commandText(settings.start)}]\n`);
        const spawned = spawnCommand(settings.start, staged.workspaceRoot, env, startLog, controller.signal);
        startChild = spawned.child;
        (startChild as any).__vazirSandboxHandle = spawned;
        // Attach rejection handling immediately so an asynchronous spawn error
        // cannot become unhandled while readiness or tests are running.
        startDone = spawned.done.catch(() => null);
        if (await spawned.started) {
          phases.push({ phase: "start", status: "passed", exitCode: null, signal: null, durationMs: now() - startStarted, logPath: startLog });
        } else {
          startSpawnFailed = true;
          phases.push(phaseResult("start", "failed", startStarted, startLog));
        }
      } else {
        phases.push(skipPhase("start"));
      }

      if (startSpawnFailed) {
        primaryStatus = "startup-failed";
        phases.push(skipPhase("readiness"), skipPhase("test"));
      } else if (controller.signal.aborted) {
        primaryStatus = now() - started >= overallTimeoutMs ? "overall-timeout" : "cancelled";
      } else {
        const readiness = settings.readiness
          ? await runReadiness(settings.readiness, staged.workspaceRoot, env, phaseLog("readiness"), settings.timeout_ms, controller.signal, startChild)
          : skipPhase("readiness");
        phases.push(readiness);
        if (readiness.status === "failed" || readiness.status === "timed-out") {
          const startExited = startChild?.exitCode !== null && startChild?.exitCode !== undefined;
          primaryStatus = startExited ? "startup-failed" : settings.readiness ? "readiness-timeout" : "startup-failed";
        }
        else if (readiness.status === "cancelled") primaryStatus = now() - started >= overallTimeoutMs ? "overall-timeout" : "cancelled";
        else {
          const test = await runPhase(settings.test, "test");
          phases.push(test);
          primaryStatus = test.status === "passed" ? "passed" : test.status === "failed" ? "test-failed" : test.status === "timed-out" ? "overall-timeout" : "cancelled";
        }
      }
      if (startChild) {
        const startHandle = (startChild as any).__vazirSandboxHandle as { terminate: () => Promise<void> } | undefined;
        if (startHandle) await startHandle.terminate();
        else await terminateProcessTree(startChild);
      }
      if (startDone) {
        try { await startDone; } catch { /* phase log contains spawn error */ }
      }
      const startPhase = phases.find(phase => phase.phase === "start");
      if (startPhase && startChild?.exitCode !== null && startChild?.exitCode !== undefined && startChild.exitCode !== 0) {
        startPhase.status = "failed";
        startPhase.exitCode = startChild.exitCode;
        if (primaryStatus === "passed" || primaryStatus === "test-failed") primaryStatus = "startup-failed";
      }
    }
    clearTimeout(overallTimer);
    overallTimer = null;
    capturePhaseLogEvidence(phases);
    let cleanupResult: { preserved: boolean; removed: boolean; path: string | null };
    let cleanupReport: SandboxCleanupReport;
    try {
      cleanupResult = staged.cleanup({ failed: primaryStatus !== "passed" });
      cleanupReport = { ok: true, preserved: cleanupResult.preserved, workspacePath: cleanupResult.path, error: null };
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      cleanupReport = { ok: false, preserved: false, workspacePath: staged.workspaceRoot, error: cleanupMessage };
      return {
        ok: false,
        status: "cleanup-failed",
        sourceRoot,
        workspacePath: staged.workspaceRoot,
        artifactPaths: phases.map(phase => phase.logPath).filter((value): value is string => Boolean(value)),
        port,
        phases,
        durationMs: now() - started,
        error: `Sandbox cleanup failed: ${cleanupMessage}`,
        cleanup: cleanupReport,
      };
    }
    const artifactPaths = cleanupResult.preserved ? phases.map(phase => phase.logPath).filter((value): value is string => Boolean(value)) : [];
    return {
      ok: primaryStatus === "passed",
      status: primaryStatus,
      sourceRoot,
      workspacePath: cleanupResult.preserved ? cleanupResult.path : null,
      artifactPaths,
      port,
      phases,
      durationMs: now() - started,
      error,
      cleanup: cleanupReport,
    };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    primaryStatus = "runner-failed";
    let cleanup: SandboxCleanupReport = { ok: true, preserved: false, workspacePath: null, error: null };
    if (staged) {
      try {
        const result = staged.cleanup({ failed: true });
        cleanup = { ok: true, preserved: result.preserved, workspacePath: result.path, error: null };
        workspacePath = result.path;
      } catch (cleanupError) {
        cleanup = { ok: false, preserved: false, workspacePath: null, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
      }
    }
    return { ok: false, status: primaryStatus, sourceRoot, workspacePath, artifactPaths: [], port: null, phases, durationMs: now() - started, error, cleanup };
  } finally {
    if (overallTimer) clearTimeout(overallTimer);
    if (externalAbortAttached && options.signal && externalAbortForwarder) {
      options.signal.removeEventListener("abort", externalAbortForwarder);
    }
    if (portAssignment?.server) {
      try { await portAssignment.close(); } catch { /* cleanup report covers workspace; port lease is best-effort */ }
    }
  }
}

