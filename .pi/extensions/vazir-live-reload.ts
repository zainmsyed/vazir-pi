/// <reference path="../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

const WATCH_DEBOUNCE_MS = 250;
const RELOAD_COOLDOWN_MS = 1000;
const STARTUP_GRACE_MS = 1000;
const POLL_INTERVAL_MS = 750;
const WATCHABLE_FILE_PATTERN = /\.(ts|js|mts|cts)$/i;
const IGNORE_FILE_PATTERN = /(^\.|~$|\.swp$|\.tmp$|\.temp$|\.bak$)/i;

let watcher: fs.FSWatcher | null = null;
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
  if (!watcher) return;
  watcher.close();
  watcher = null;
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
  const entries = fs.existsSync(extDir)
    ? fs.readdirSync(extDir)
        .filter((name: string) => shouldHandleFile(name))
        .sort()
        .map((name: string) => {
          const filePath = path.join(extDir, name);
          try {
            const stats = fs.statSync(filePath);
            return `${name}:${stats.mtimeMs}:${stats.size}`;
          } catch {
            return `${name}:missing`;
          }
        })
    : [];

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

  watcher = fs.watch(extDir, (eventType: string, filename: unknown) => {
    const resolvedFilename = typeof filename === "string" ? filename : filename == null ? null : String(filename);
    if (!shouldHandleFile(resolvedFilename)) return;
    queueReload(`${resolvedFilename} (${eventType})`);
  });

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