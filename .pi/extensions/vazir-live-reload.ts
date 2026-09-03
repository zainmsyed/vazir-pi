/// <reference path="../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

const WATCH_DEBOUNCE_MS = 250;
const RELOAD_COOLDOWN_MS = 1000;
const STARTUP_GRACE_MS = 1000;
const POLL_INTERVAL_MS = 750;
const WATCHABLE_FILE_PATTERN = /\.(ts|js|mts|cts)$/i;
const IGNORE_FILE_PATTERN = /(^\.|~$|\.swp$|\.tmp$|\.temp$|\.bak$)/i;

const watchers: fs.FSWatcher[] = [];
let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reloadInFlight = false;
let lastReloadAt = 0;
let ignoreEventsUntil = 0;
let latestUi: any = null;
let latestCwd = "";
let lastSnapshot = "";

const LIVE_RELOAD_COMMAND = "/vazir-live-reload-apply";

function clearPendingReloadTimer(): void {
  if (!pendingReloadTimer) return;
  clearTimeout(pendingReloadTimer);
  pendingReloadTimer = null;
}

function clearPollTimer(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function closeWatcher(): void {
  clearPendingReloadTimer();
  clearPollTimer();
  for (const dirWatcher of watchers) {
    try {
      dirWatcher.close();
    } catch {
      // Ignore close failures during reload churn.
    }
  }
  watchers.length = 0;
}

function shouldHandleFile(filename: string | null): boolean {
  if (!filename) return false;
  const baseName = path.basename(filename);
  if (IGNORE_FILE_PATTERN.test(baseName)) return false;
  return WATCHABLE_FILE_PATTERN.test(baseName);
}

function notify(type: "info" | "warning" | "error", message: string): void {
  try {
    latestUi?.notify?.(message, type);
  } catch {
    // Ignore UI notification failures during reload churn.
  }
}

function setStatus(text: string | undefined): void {
  try {
    latestUi?.setStatus?.("vazir-live-reload", text);
  } catch {
    // Ignore status failures; the watcher should still operate.
  }
}

function directorySnapshot(extDir: string): string {
  // Recursive walk: extension code lives in nested directories
  // (e.g., .pi/extensions/vazir-context/index.ts), and fs.watch is not
  // recursive on Linux, so a flat snapshot would miss every nested edit.
  const entries: string[] = [];
  const pending = [extDir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let dirents;
    try {
      dirents = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!shouldHandleFile(entry.name)) continue;
      const relative = path.relative(extDir, entryPath);
      try {
        const stats = fs.statSync(entryPath);
        entries.push(`${relative}:${stats.mtimeMs}:${stats.size}`);
      } catch {
        entries.push(`${relative}:missing`);
      }
    }
  }

  return entries.join("|");
}

async function triggerReload(reason: string): Promise<void> {
  if (reloadInFlight) return;
  if (Date.now() < ignoreEventsUntil) return;
  if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return;

  reloadInFlight = true;
  lastReloadAt = Date.now();
  ignoreEventsUntil = Date.now() + STARTUP_GRACE_MS;

  try {
    notify("info", `Reloading Pi after extension change: ${reason}`);
    piApi.sendUserMessage(LIVE_RELOAD_COMMAND);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify("error", `Live reload failed: ${message}`);
  } finally {
    reloadInFlight = false;
  }
}

function queueReload(reason: string): void {
  clearPendingReloadTimer();
  pendingReloadTimer = setTimeout(() => {
    pendingReloadTimer = null;
    void triggerReload(reason);
  }, WATCH_DEBOUNCE_MS);
  (pendingReloadTimer as unknown as { unref?: () => void }).unref?.();
}

function startWatcher(extDir: string): void {
  closeWatcher();
  ignoreEventsUntil = Date.now() + STARTUP_GRACE_MS;
  lastSnapshot = directorySnapshot(extDir);
  setStatus("live reload: armed");

  // Watch the top-level directory plus every nested extension directory:
  // fs.watch is not recursive on Linux, so without the nested watchers
  // edits inside e.g. .pi/extensions/vazir-context/ go undetected.
  const watchDirs = [extDir];
  try {
    for (const entry of fs.readdirSync(extDir, { withFileTypes: true })) {
      if (entry.isDirectory()) watchDirs.push(path.join(extDir, entry.name));
    }
  } catch {
    // Keep the top-level watch only.
  }

  for (const dir of watchDirs) {
    const dirWatcher = fs.watch(dir, (eventType: string, filename: unknown) => {
      const resolvedFilename = typeof filename === "string" ? filename : filename == null ? null : String(filename);
      if (!shouldHandleFile(resolvedFilename)) return;
      queueReload(`${path.relative(extDir, dir)}/${resolvedFilename} (${eventType})`);
    });
    watchers.push(dirWatcher);
  }

  pollTimer = setInterval(() => {
    if (!extDir || Date.now() < ignoreEventsUntil) return;
    const nextSnapshot = directorySnapshot(extDir);
    if (nextSnapshot === lastSnapshot) return;
    lastSnapshot = nextSnapshot;
    queueReload("extension directory changed (poll)");
  }, POLL_INTERVAL_MS);
  (pollTimer as unknown as { unref?: () => void }).unref?.();
}

let piApi: ExtensionAPI;

export default function(pi: ExtensionAPI) {
  piApi = pi;

  pi.registerCommand("vazir-live-reload-apply", {
    description: "Internal helper used by the extension watcher to reload Pi",
    handler: async (_args: string, ctx: any) => {
      if (typeof ctx.waitForIdle === "function") {
        await ctx.waitForIdle();
      }
      if (typeof ctx.reload !== "function") {
        notify("warning", "Live reload watcher fired, but this command context cannot reload. Use /reload manually.");
        return;
      }
      await ctx.reload();
    },
  });

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    latestUi = ctx.ui ?? latestUi;
    latestCwd = ctx.cwd;

    const extDir = path.join(ctx.cwd, ".pi", "extensions");
    if (!fs.existsSync(extDir)) {
      setStatus(undefined);
      notify("warning", "Live reload is enabled, but .pi/extensions does not exist in this workspace.");
      return;
    }

    startWatcher(extDir);
  });

  pi.on("session_shutdown", async () => {
    latestUi = null;
    latestCwd = "";
    setStatus(undefined);
    closeWatcher();
  });
}