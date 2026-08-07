import os from "node:os";
import path from "node:path";
import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const fs = await import("node:fs");
const helpers = await loadFileModule<{
  readProjectSettings: (cwd: string) => { ports: Record<string, number>; previous_ports: Record<string, number>; ports_override: Record<string, number>; [key: string]: unknown };
  writeProjectSettings: (cwd: string, updates: Record<string, unknown>) => Record<string, unknown>;
  portSettings: (cwd: string) => { ports: Record<string, number>; previous_ports: Record<string, number>; ports_override: Record<string, number> };
}>(path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts"), String(Date.now()));

function createProject(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-ports-"));
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({
    project_name: "port-test",
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" },
  }, null, 2));
  return cwd;
}

const cwd = createProject();
try {
  const initial = helpers.readProjectSettings(cwd);
  assert(Object.keys(initial.ports).length === 0, "missing ports should normalize to an empty object");
  assert(Object.keys(initial.previous_ports).length === 0, "missing previous_ports should normalize to an empty object");
  assert(Object.keys(initial.ports_override).length === 0, "missing ports_override should normalize to an empty object");

  const settingsPath = path.join(cwd, ".context", "settings", "project.json");
  fs.writeFileSync(settingsPath, "{ invalid json");
  const invalidJson = helpers.readProjectSettings(cwd);
  assert(Object.keys(invalidJson.ports).length === 0, "invalid JSON should normalize ports to an empty object");
  assert(Object.keys(invalidJson.previous_ports).length === 0, "invalid JSON should normalize previous_ports to an empty object");
  assert(Object.keys(invalidJson.ports_override).length === 0, "invalid JSON should normalize ports_override to an empty object");

  fs.writeFileSync(settingsPath, JSON.stringify(["not", "an", "object"]));
  const nonObjectRoot = helpers.readProjectSettings(cwd);
  assert(Object.keys(nonObjectRoot.ports).length === 0, "non-object roots should normalize ports to an empty object");
  assert(Object.keys(nonObjectRoot.previous_ports).length === 0, "non-object roots should normalize previous_ports to an empty object");
  assert(Object.keys(nonObjectRoot.ports_override).length === 0, "non-object roots should normalize ports_override to an empty object");

  fs.writeFileSync(settingsPath, JSON.stringify({
    project_name: "port-test",
    ports: ["malformed"],
    previous_ports: "malformed",
    ports_override: { server: "3100", frontend: 3005 },
    vcs_mirror: { mode: "none", path: "", remoteName: "origin", branch: "main" },
  }, null, 2));
  const malformed = helpers.portSettings(cwd);
  assert(Object.keys(malformed.ports).length === 0, "array port maps should normalize to an empty object");
  assert(Object.keys(malformed.previous_ports).length === 0, "scalar port maps should normalize to an empty object");
  assert(JSON.stringify(malformed.ports_override) === JSON.stringify({ frontend: 3005 }), "malformed map entries should be discarded");

  helpers.writeProjectSettings(cwd, {
    ports: { frontend: 3002 },
    previous_ports: { server: 3001 },
  });
  const updated = helpers.writeProjectSettings(cwd, {
    ports: { server: 3103 },
  });
  assert(updated.project_name === "port-test", "port updates must preserve unrelated settings");
  assert((updated.vcs_mirror as { mode: string }).mode === "none", "port updates must preserve vcs_mirror");
  assert((updated.ports as Record<string, number>).frontend === 3002 && (updated.ports as Record<string, number>).server === 3103, "port updates should merge by key");
  assert(JSON.stringify(updated.previous_ports) === JSON.stringify({ server: 3001 }), "unrelated port maps should remain intact");

  const serialized = fs.readFileSync(path.join(cwd, ".context", "settings", "project.json"), "utf-8");
  const roundTrip = JSON.parse(serialized) as Record<string, unknown>;
  assert(roundTrip.project_name === "port-test", "settings should remain valid JSON after writing");
  assert((roundTrip.ports as Record<string, number>).server === 3103, "written port should survive JSON round-trip");
  console.log("vazir port settings validation passed");
} finally {
  fs.rmSync(cwd, { recursive: true, force: true });
}
