/// <reference path="../../types/node-runtime-ambient.d.ts" />

import * as childProcess from "child_process";
import * as fs from "fs";
import * as net from "node:net";
import * as path from "path";

import { portSettings, readPortOverride, writeProjectSettings } from "./vazir-helpers.ts";

export const PORT_HOST = "127.0.0.1";
export const PORT_RANGE_START = 3100;
export const PORT_RANGE_END = 3199;

export interface PortLease {
  port: number;
  server: any;
  close: () => Promise<void>;
}

export interface PortAssignment {
  serviceKey: string;
  port: number;
  pid: number;
  baseUrl: string;
  live_instance: boolean;
  server: any | null;
  close: () => Promise<void>;
  notice: string | null;
}

export class PortAssignmentError extends Error {
  readonly code = "PORT_RANGE_EXHAUSTED";
  readonly serviceKey: string;

  constructor(serviceKey: string) {
    super(`No free port found for '${serviceKey}' in range ${PORT_RANGE_START}–${PORT_RANGE_END}.`);
    this.name = "PortAssignmentError";
    this.serviceKey = serviceKey;
  }
}

function validateServiceKey(serviceKey: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(serviceKey)) {
    throw new TypeError(`Invalid service key '${serviceKey}'. Use only letters, numbers, '_' or '-'.`);
  }
}

export function portPidFilePath(cwd: string, serviceKey: string): string {
  validateServiceKey(serviceKey);
  return path.join(cwd, ".context", `.vazir-server-${serviceKey}.pid`);
}

function processId(): number {
  return Number((process as any).pid);
}

function readPid(pidPath: string): number | null {
  try {
    const pid = Number.parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    (process as any).kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function procSocketInodes(port: number): Set<string> | null {
  if (!fs.existsSync("/proc/net/tcp") || !fs.existsSync("/proc/net/tcp6")) return null;
  const inodes = new Set<string>();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const lines = fs.readFileSync(table, "utf-8").split("\n");
      for (const line of lines.slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10) continue;
        const local = fields[1]?.split(":");
        if (!local || local.length !== 2) continue;
        if (Number.parseInt(local[1], 16) === port && fields[3] === "0A") {
          inodes.add(fields[9]);
        }
      }
    } catch {
      // /proc is unavailable on some supported platforms.
    }
  }
  return inodes;
}

function processHoldsPortViaProc(pid: number, port: number): boolean | null {
  const inodes = procSocketInodes(port);
  if (inodes === null || !fs.existsSync(`/proc/${pid}/fd`)) return null;
  if (inodes.size === 0) return false;

  try {
    return fs.readdirSync(`/proc/${pid}/fd`).some((entry: string) => {
      try {
        const target = (fs as any).readlinkSync(`/proc/${pid}/fd/${entry}`) as string;
        return /^socket:\[\d+\]$/.test(target) && inodes.has(target.slice(8, -1));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function processHoldsPortViaSystemTools(pid: number, port: number): boolean {
  try {
    const output = childProcess.execFileSync("lsof", ["-nP", "-a", "-p", String(pid), `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (output) return true;
  } catch {
    // Try netstat below when lsof is unavailable.
  }

  try {
    const output = childProcess.execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return output.split("\n").some((line: string) => {
      const fields = line.trim().split(/\s+/);
      return fields.length > 1 && line.includes(`:${port}`) && /LISTEN(?:ING)?/i.test(line) && fields.at(-1) === String(pid);
    });
  } catch {
    return false;
  }
}

function processHoldsPort(pid: number, port: number): boolean {
  if (!isProcessAlive(pid)) return false;
  return processHoldsPortViaProc(pid, port) ?? processHoldsPortViaSystemTools(pid, port);
}

export function tryBindPort(port: number): Promise<PortLease | null> {
  return new Promise(resolve => {
    const server = net.createServer();
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      server.close(() => resolve(null));
    };

    server.once("error", fail);
    server.listen({ host: PORT_HOST, port }, () => {
      if (settled) return;
      settled = true;
      server.removeListener("error", fail);
      resolve({
        port,
        server,
        close: () => new Promise<void>(closeResolve => server.close(() => closeResolve())),
      });
    });
  });
}

function rangeCandidates(start: number): number[] {
  const rangeSize = PORT_RANGE_END - PORT_RANGE_START + 1;
  const normalizedStart = start >= PORT_RANGE_START && start <= PORT_RANGE_END ? start : PORT_RANGE_START;
  const candidates: number[] = [];
  for (let offset = 0; offset < rangeSize; offset += 1) {
    const offsetFromRangeStart = (normalizedStart - PORT_RANGE_START + offset) % rangeSize;
    candidates.push(PORT_RANGE_START + offsetFromRangeStart);
  }
  return candidates;
}

function persistPort(cwd: string, serviceKey: string, previousPort: number | null, port: number): void {
  const updates: Record<string, unknown> = { ports: { [serviceKey]: port } };
  if (previousPort !== null && previousPort !== port) {
    updates.previous_ports = { [serviceKey]: previousPort };
  }
  writeProjectSettings(cwd, updates);
}

function successfulAssignment(cwd: string, serviceKey: string, lease: PortLease, previousPort: number | null, notice: string | null): PortAssignment {
  persistPort(cwd, serviceKey, previousPort, lease.port);
  const pid = processId();
  const pidPath = portPidFilePath(cwd, serviceKey);
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  fs.writeFileSync(pidPath, `${pid}\n`);

  return {
    serviceKey,
    port: lease.port,
    pid,
    baseUrl: `http://localhost:${lease.port}`,
    live_instance: false,
    server: lease.server,
    close: lease.close,
    notice,
  };
}

export interface PortAssignmentOptions {
  bindPort?: (port: number) => Promise<PortLease | null>;
}

interface PortOverrideResolution {
  present: boolean;
  raw: unknown;
  port: number | null;
  source: "environment" | "file" | null;
}

function parseOverridePort(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && Number.isFinite(raw) && raw >= 1 && raw <= 65535 ? raw : null;
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return null;
  const port = Number(raw.trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function resolvePortOverride(cwd: string, serviceKey: string): PortOverrideResolution {
  const envName = `VAZIR_PORT_${serviceKey.toUpperCase()}`;
  const envValue = (process as any).env?.[envName];
  if (envValue !== undefined) {
    return { present: true, raw: envValue, port: parseOverridePort(envValue), source: "environment" };
  }

  const fileValue = readPortOverride(cwd, serviceKey);
  return { present: fileValue !== undefined, raw: fileValue, port: parseOverridePort(fileValue), source: fileValue === undefined ? null : "file" };
}

function warnInvalidOverride(serviceKey: string, override: PortOverrideResolution): void {
  const raw = typeof override.raw === "string" ? override.raw : JSON.stringify(override.raw);
  (console as any).warn(`Invalid ${override.source} override port '${raw}' for '${serviceKey}' — falling back to auto-assignment`);
}

function overrideFallbackNotice(serviceKey: string, port: number, selectedPort: number): string {
  return `${serviceKey}: override port ${port} was in use, switched to ${selectedPort}`;
}

export async function assignPort(cwd: string, serviceKey = "server", options: PortAssignmentOptions = {}): Promise<PortAssignment> {
  validateServiceKey(serviceKey);
  const bindPort = options.bindPort ?? tryBindPort;
  const override = resolvePortOverride(cwd, serviceKey);
  if (override.present && override.port === null) warnInvalidOverride(serviceKey, override);
  const settings = portSettings(cwd);
  const persistedPort = settings.ports[serviceKey];
  const hasPersistedPort = Number.isInteger(persistedPort) && persistedPort > 0 && persistedPort <= 65535;
  let overrideFailedPort: number | null = null;

  if (override.port !== null) {
    const overrideLease = await bindPort(override.port);
    if (overrideLease) return successfulAssignment(cwd, serviceKey, overrideLease, hasPersistedPort ? persistedPort : null, null);
    overrideFailedPort = override.port;
  }

  if (hasPersistedPort) {
    const directLease = await bindPort(persistedPort);
    if (directLease) return successfulAssignment(
      cwd,
      serviceKey,
      directLease,
      persistedPort,
      overrideFailedPort === null ? null : overrideFallbackNotice(serviceKey, overrideFailedPort, persistedPort),
    );
    const pidPath = portPidFilePath(cwd, serviceKey);
    const recordedPid = readPid(pidPath);
    if (recordedPid !== null && processHoldsPort(recordedPid, persistedPort)) {
      return {
        serviceKey,
        port: persistedPort,
        pid: recordedPid,
        baseUrl: `http://localhost:${persistedPort}`,
        live_instance: true,
        server: null,
        close: async () => undefined,
        notice: null,
      };
    }

    const retryLease = await bindPort(persistedPort);
    if (retryLease) return successfulAssignment(
      cwd,
      serviceKey,
      retryLease,
      persistedPort,
      overrideFailedPort === null ? null : overrideFallbackNotice(serviceKey, overrideFailedPort, persistedPort),
    );
  }

  const scanStart = hasPersistedPort ? persistedPort : PORT_RANGE_START;
  for (const candidate of rangeCandidates(scanStart)) {
    if (hasPersistedPort && candidate === persistedPort) continue;
    const lease = await bindPort(candidate);
    if (lease) {
      const notice = overrideFailedPort !== null
        ? overrideFallbackNotice(serviceKey, overrideFailedPort, candidate)
        : hasPersistedPort
          ? `${serviceKey}: port ${persistedPort} was in use, switched to ${candidate}`
          : null;
      return successfulAssignment(cwd, serviceKey, lease, hasPersistedPort ? persistedPort : null, notice);
    }
  }

  throw new PortAssignmentError(serviceKey);
}

export const assignServicePort = assignPort;
