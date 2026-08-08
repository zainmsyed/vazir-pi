import os from "node:os";
import path from "node:path";
import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const fs = await import("node:fs");
const helpers = await loadFileModule<{
  readProjectSettings: (cwd: string) => { ports: Record<string, number>; previous_ports: Record<string, number>; ports_override: Record<string, number>; [key: string]: unknown };
  writeProjectSettings: (cwd: string, updates: Record<string, unknown>) => Record<string, unknown>;
  portSettings: (cwd: string) => { ports: Record<string, number>; previous_ports: Record<string, number>; ports_override: Record<string, number> };
}>(path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts"), `${Date.now()}-helpers`);
const ports = await loadFileModule<{
  PORT_HOST: string;
  PORT_RANGE_START: number;
  PORT_RANGE_END: number;
  tryBindPort: (port: number) => Promise<{ port: number; server: any; close: () => Promise<void> } | null>;
  assignPort: (cwd: string, serviceKey?: string, options?: { bindPort?: (port: number) => Promise<{ port: number; server: any; close: () => Promise<void> } | null> }) => Promise<{ port: number; pid: number; baseUrl: string; live_instance: boolean; server: any | null; close: () => Promise<void>; notice: string | null }>;
  PortAssignmentError: new (serviceKey: string) => Error;
}>(path.join(repoRoot, ".pi", "lib", "vazir-ports.ts"), `${Date.now()}-ports`);

function createProject(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-ports-"));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({
    project_name: "port-test",
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" },
  }, null, 2));
  return cwd;
}

function settingsPath(cwd: string): string {
  return path.join(cwd, ".context", "settings", "project.json");
}

function writeSettings(cwd: string, settings: Record<string, unknown>): void {
  fs.writeFileSync(settingsPath(cwd), JSON.stringify(settings, null, 2));
}

const projects: string[] = [];
const leases: Array<{ close: () => Promise<void> }> = [];
function project(): string {
  const cwd = createProject();
  projects.push(cwd);
  return cwd;
}

try {
  const schemaProject = project();
  const initial = helpers.readProjectSettings(schemaProject);
  assert(Object.keys(initial.ports).length === 0, "missing ports should normalize to an empty object");
  assert(Object.keys(initial.previous_ports).length === 0, "missing previous_ports should normalize to an empty object");
  assert(Object.keys(initial.ports_override).length === 0, "missing ports_override should normalize to an empty object");

  writeSettings(schemaProject, {
    project_name: "port-test",
    ports: ["malformed"],
    previous_ports: "malformed",
    ports_override: { server: "3100", frontend: 3005 },
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" },
  });
  const malformed = helpers.portSettings(schemaProject);
  assert(Object.keys(malformed.ports).length === 0, "array port maps should normalize to an empty object");
  assert(Object.keys(malformed.previous_ports).length === 0, "scalar port maps should normalize to an empty object");
  assert(JSON.stringify(malformed.ports_override) === JSON.stringify({ frontend: 3005 }), "malformed map entries should be discarded");

  helpers.writeProjectSettings(schemaProject, { ports: { frontend: 3002 }, previous_ports: { server: 3001 } });
  const updated = helpers.writeProjectSettings(schemaProject, { ports: { server: 3103 } });
  assert(updated.project_name === "port-test", "port updates must preserve unrelated settings");
  assert((updated.vcs_mirror as { mode: string }).mode === "none", "port updates must preserve vcs_mirror");
  assert((updated.ports as Record<string, number>).frontend === 3002 && (updated.ports as Record<string, number>).server === 3103, "port updates should merge by key");
  assert(JSON.stringify(updated.previous_ports) === JSON.stringify({ server: 3001 }), "unrelated port maps should remain intact");
  const roundTrip = JSON.parse(fs.readFileSync(settingsPath(schemaProject), "utf-8")) as Record<string, unknown>;
  assert((roundTrip.ports as Record<string, number>).server === 3103, "written port should survive JSON round-trip");

  const firstRunProject = project();
  const firstRun = await ports.assignPort(firstRunProject, "server");
  assert(ports.PORT_HOST === "127.0.0.1", "port assignment must use the loopback interface");
  assert(firstRun.port === ports.PORT_RANGE_START, "first run should allocate the first range port");
  assert(firstRun.live_instance === false && firstRun.baseUrl === `http://localhost:${firstRun.port}`, "first run should return a live lease and base URL");
  assert(fs.readFileSync(path.join(firstRunProject, ".context", ".vazir-server-server.pid"), "utf-8").trim() === String(firstRun.pid), "first run should write the PID file");
  await firstRun.close();

  const reuse = await ports.assignPort(firstRunProject, "server");
  assert(reuse.port === firstRun.port && reuse.notice === null, "subsequent runs should silently reuse the persisted port");
  await reuse.close();

  const deadPidProject = project();
  const deadInitial = await ports.assignPort(deadPidProject, "server");
  await deadInitial.close();
  writeSettings(deadPidProject, { ports: { server: deadInitial.port } });
  fs.writeFileSync(path.join(deadPidProject, ".context", ".vazir-server-server.pid"), "999999999\n");
  const reclaimed = await ports.assignPort(deadPidProject, "server");
  assert(reclaimed.port === deadInitial.port && reclaimed.notice === null && reclaimed.live_instance === false, "dead PID files should be reclaimed without a notice");
  await reclaimed.close();

  const retryProject = project();
  const retryOccupied = await ports.tryBindPort(ports.PORT_RANGE_START);
  assert(retryOccupied !== null, "test should occupy the retry candidate port");
  writeSettings(retryProject, { ports: { server: ports.PORT_RANGE_START } });
  fs.writeFileSync(path.join(retryProject, ".context", ".vazir-server-server.pid"), "999999999\n");
  let retryAttempts = 0;
  const retry = await ports.assignPort(retryProject, "server", {
    bindPort: async port => {
      retryAttempts += 1;
      if (retryAttempts === 1) {
        if (retryOccupied) await retryOccupied.close();
        return null;
      }
      return ports.tryBindPort(port);
    },
  });
  assert(retryAttempts === 2 && retry.port === ports.PORT_RANGE_START && retry.notice === null, "dead PID recovery should retry the persisted port without a notice");
  await retry.close();

  const boundaryProject = project();
  const boundaryOccupied = await ports.tryBindPort(3000);
  assert(boundaryOccupied !== null, "test should occupy the below-range persisted port");
  writeSettings(boundaryProject, { ports: { server: 3000 } });
  fs.writeFileSync(path.join(boundaryProject, ".context", ".vazir-server-server.pid"), "999999999\n");
  const boundary = await ports.assignPort(boundaryProject, "server");
  assert(boundary.port === ports.PORT_RANGE_START, "out-of-range persisted ports should scan from the range start");
  await boundary.close();
  if (boundaryOccupied) await boundaryOccupied.close();

  const movedProject = project();
  const occupied = await ports.tryBindPort(ports.PORT_RANGE_START);
  assert(occupied !== null, "test should occupy the first candidate port");
  writeSettings(movedProject, { ports: { server: ports.PORT_RANGE_START } });
  fs.writeFileSync(path.join(movedProject, ".context", ".vazir-server-server.pid"), "999999999\n");
  const moved = await ports.assignPort(movedProject, "server");
  assert(moved.port === ports.PORT_RANGE_START + 1, "foreign port holders should cause a range fallback");
  assert(moved.notice?.includes("server") === true, "range fallback should return a service-specific notice");
  assert((helpers.readProjectSettings(movedProject).previous_ports.server) === ports.PORT_RANGE_START, "port changes should persist previous_ports");
  await moved.close();
  if (occupied) await occupied.close();

  const duplicateProject = project();
  const duplicateLease = await ports.tryBindPort(ports.PORT_RANGE_START);
  assert(duplicateLease !== null, "test should create a live duplicate listener");
  writeSettings(duplicateProject, { ports: { server: ports.PORT_RANGE_START } });
  fs.writeFileSync(path.join(duplicateProject, ".context", ".vazir-server-server.pid"), `${(process as any).pid}\n`);
  const duplicate = await ports.assignPort(duplicateProject, "server");
  assert(duplicate.live_instance === true, "a PID holding the persisted port should be detected as a duplicate");
  assert(duplicate.pid === (process as any).pid && duplicate.port === ports.PORT_RANGE_START, "duplicate metadata should include the recorded PID and port");
  assert(duplicate.baseUrl === `http://localhost:${ports.PORT_RANGE_START}` && duplicate.server === null, "duplicate metadata should include the base URL without a new lease");
  if (duplicateLease) await duplicateLease.close();

  const fileOverrideProject = project();
  writeSettings(fileOverrideProject, { ports_override: { server: 3005 } });
  const fileOverride = await ports.assignPort(fileOverrideProject, "server");
  assert(fileOverride.port === 3005 && fileOverride.notice === null, "a valid file override should be attempted first");
  await fileOverride.close();

  const lowerBoundaryProject = project();
  writeSettings(lowerBoundaryProject, { ports_override: { server: 1 } });
  const lowerBoundary = await ports.assignPort(lowerBoundaryProject, "server", {
    bindPort: async port => ({ port, server: null, close: async () => undefined }),
  });
  assert(lowerBoundary.port === 1, "port 1 should be accepted as the lower override boundary");
  await lowerBoundary.close();

  const upperBoundaryProject = project();
  writeSettings(upperBoundaryProject, { ports_override: { server: 65535 } });
  const upperBoundary = await ports.assignPort(upperBoundaryProject, "server", {
    bindPort: async port => ({ port, server: null, close: async () => undefined }),
  });
  assert(upperBoundary.port === 65535, "port 65535 should be accepted as the upper override boundary");
  await upperBoundary.close();

  for (const invalidValue of [0, 65536, -1, 3100.5]) {
    const invalidNumericProject = project();
    writeSettings(invalidNumericProject, { ports_override: { server: invalidValue } });
    const warnings: string[] = [];
    const originalNumericWarn = (console as any).warn;
    (console as any).warn = (message: string) => warnings.push(message);
    const invalidNumeric = await ports.assignPort(invalidNumericProject, "server");
    (console as any).warn = originalNumericWarn;
    assert(invalidNumeric.port === ports.PORT_RANGE_START && warnings.length === 1, `invalid numeric override ${invalidValue} should warn once and use auto-assignment`);
    await invalidNumeric.close();
  }

  const envOverrideProject = project();
  writeSettings(envOverrideProject, { ports_override: { server: 3005 } });
  const previousEnvOverride = (process as any).env.VAZIR_PORT_SERVER;
  (process as any).env.VAZIR_PORT_SERVER = "3006";
  const envOverride = await ports.assignPort(envOverrideProject, "server");
  if (previousEnvOverride === undefined) delete (process as any).env.VAZIR_PORT_SERVER;
  else (process as any).env.VAZIR_PORT_SERVER = previousEnvOverride;
  assert(envOverride.port === 3006, "the environment override should take precedence over the file override");
  await envOverride.close();

  const invalidFileProject = project();
  writeSettings(invalidFileProject, { ports_override: { server: "not-a-port" } });
  const originalWarn = (console as any).warn;
  const fileWarnings: string[] = [];
  (console as any).warn = (message: string) => fileWarnings.push(message);
  const invalidFile = await ports.assignPort(invalidFileProject, "server");
  (console as any).warn = originalWarn;
  assert(invalidFile.port === ports.PORT_RANGE_START && fileWarnings.length === 1, "an invalid file override should warn once and use auto-assignment");
  await invalidFile.close();

  const invalidEnvProject = project();
  writeSettings(invalidEnvProject, { ports_override: { server: 3005 } });
  const previousInvalidEnv = (process as any).env.VAZIR_PORT_SERVER;
  (process as any).env.VAZIR_PORT_SERVER = "70000";
  const envWarnings: string[] = [];
  (console as any).warn = (message: string) => envWarnings.push(message);
  const invalidEnv = await ports.assignPort(invalidEnvProject, "server");
  (console as any).warn = originalWarn;
  if (previousInvalidEnv === undefined) delete (process as any).env.VAZIR_PORT_SERVER;
  else (process as any).env.VAZIR_PORT_SERVER = previousInvalidEnv;
  assert(invalidEnv.port === ports.PORT_RANGE_START && envWarnings.length === 1, "an invalid environment override should warn once and use auto-assignment");
  await invalidEnv.close();

  const occupiedOverrideProject = project();
  const occupiedOverride = await ports.tryBindPort(3005);
  assert(occupiedOverride !== null, "test should occupy the override port");
  writeSettings(occupiedOverrideProject, { ports_override: { server: 3005 } });
  const occupiedOverrideAssignment = await ports.assignPort(occupiedOverrideProject, "server");
  assert(occupiedOverrideAssignment.port === ports.PORT_RANGE_START && occupiedOverrideAssignment.notice?.includes("override port 3005") === true, "an occupied override should use standard range fallback");
  await occupiedOverrideAssignment.close();
  if (occupiedOverride) await occupiedOverride.close();

  const exhaustionProject = project();
  const exhaustionLeases: Array<{ close: () => Promise<void> }> = [];
  for (let port = ports.PORT_RANGE_START; port <= ports.PORT_RANGE_END; port += 1) {
    const lease = await ports.tryBindPort(port);
    if (lease) exhaustionLeases.push(lease);
  }
  assert(exhaustionLeases.length === ports.PORT_RANGE_END - ports.PORT_RANGE_START + 1, "test should occupy the complete candidate range");
  try {
    await ports.assignPort(exhaustionProject, "server");
    throw new Error("range exhaustion should fail");
  } catch (error) {
    assert(error instanceof ports.PortAssignmentError, "range exhaustion should use the named port assignment error");
    assert((error as Error).message.includes("'server'") && (error as Error).message.includes("3100–3199"), "range exhaustion error should name the service and range");
  } finally {
    await Promise.all(exhaustionLeases.map(lease => lease.close()));
  }

  console.log("vazir port settings and assignment validation passed");
} finally {
  await Promise.all(leases.map(lease => lease.close()));
  for (const cwd of projects) fs.rmSync(cwd, { recursive: true, force: true });
}
