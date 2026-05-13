import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import {
  assert,
  cleanupStubModules,
  installCommonPiStubs,
  loadFileModule,
  makePi as createPiHarness,
  repoRoot,
} from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

type Notification = { message: string; level: string };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".pi", "extensions", "vazir-context"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".pi", "extensions", "vazir-tracker"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".pi", "extensions", "vazir-context", "index.ts"), "export const context = true\n");
  fs.writeFileSync(path.join(cwd, ".pi", "extensions", "vazir-tracker", "index.ts"), "export const tracker = true\n");
  return cwd;
}

function makeCtx(cwd: string, notifications: Notification[], statuses: string[]) {
  return {
    cwd,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setStatus(_key: string, text: string | undefined) {
        if (text) statuses.push(text);
      },
    },
  };
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

try {
  const extensionPath = path.join(repoRoot, ".pi", "extensions", "vazir-live-reload.ts");
  const extensionModule = await loadFileModule<{ default: (pi: any) => void }>(extensionPath, String(Date.now()));
  const register = extensionModule.default;

  const harness = createPiHarness([register]);
  const notifications: Notification[] = [];
  const statuses: string[] = [];
  const cwd = createProject("vazir-live-reload-");
  const ctx = makeCtx(cwd, notifications, statuses);
  const nestedFile = path.join(cwd, ".pi", "extensions", "vazir-context", "index.ts");

  await harness.emit("session_start", {}, ctx);
  assert(statuses.includes("live reload: armed"), "live reload did not set the armed status");

  await wait(1100);

  fs.appendFileSync(nestedFile, "export const nestedEditOne = true\n");
  await wait(50);
  fs.appendFileSync(nestedFile, "export const nestedEditTwo = true\n");
  await wait(1400);

  assert(harness.sentMessages.length === 1, `expected one debounced reload after nested edits, saw ${harness.sentMessages.length}`);
  assert(String(harness.sentMessages[0].message) === "/vazir-live-reload-apply", "live reload sent the wrong command");
  assert(
    notifications.some(note => note.message.includes("Reloading Pi after extension change:")),
    "live reload did not emit a reload notification for nested edits",
  );

  await harness.emit("session_shutdown", {}, ctx);

  console.log("Live reload nested watcher validation");
  console.log(`cwd: ${cwd}`);
  console.log(`reloadCount: ${harness.sentMessages.length}`);
  console.log("notifications:");
  for (const note of notifications) {
    console.log(`  - [${note.level}] ${note.message}`);
  }
} finally {
  cleanupStubModules(stubModuleDirs);
}
