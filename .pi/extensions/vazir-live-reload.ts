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

let watchers: fs.FSWatcher[] = [];
let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reloadInFlight = false;
let lastReloadAt = 0;
let ignoreEventsUntil = 0;
let latestUi: any = null;
let latestCwd = "";
let lastSnapshot = "";
let lastWatchedDirsSignature = "";

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

function closeWatcherHandles(): void {
  for (const currentWatcher of watchers) {
    try {
      currentWatcher.close();
    } catch {
      // Ignore watcher shutdown failures during reload churn.
    }
  }
  watchers = [];
}

function closeWatcher(): void {
  clearPendingReloadTimer();
  clearPollTimer();
  closeWatcherHandles();
}

function shouldHandleFile(filename: string | null): boolean {
  if (!filename) return false;
  const baseName = path.basename(filename);
  if (IGNORE_FILE_PATTERN.test(baseName)) return false;
  return WATCHABLE_FILE_PATTERN.test(baseName);
}

function shouldHandleDirectory(dirname: string | null): boolean {
  if (!dirname) return false;
  const baseName = path.basename(dirname);
  return !IGNORE_FILE_PATTERN.test(baseName);
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

function walkExtensionTree(extDir: string, visit: (filePath: string) => void): void {
  if (!fs.existsSync(extDir)) return;

  for (const name of fs.readdirSync(extDir)) {
    const entryPath = path.join(extDir, name);
    try {
      const stats = fs.statSync(entryPath);
      if (stats.isDirectory()) {
        if (!shouldHandleDirectory(name)) continue;
        walkExtensionTree(entryPath, visit);
        continue;
      }
      if (shouldHandleFile(name)) {
        visit(entryPath);
      }
    } catch {
      // Ignore transient file-system churn while scanning.
    }
  }
}

function directorySnapshot(extDir: string): string {
  const entries: string[] = [];

  walkExtensionTree(extDir, (filePath: string) => {
    try {
      const stats = fs.statSync(filePath);
      const displayPath = filePath.startsWith(`${extDir}${path.sep}`) ? filePath.slice(extDir.length + 1) : filePath;
      entries.push(`${displayPath}:${stats.mtimeMs}:${stats.size}`);
    } catch {
      entries.push(`${filePath}:missing`);
    }
  });

  entries.sort();
  return entries.join("|");
}

function collectWatchDirectories(extDir: string): string[] {
  const directories: string[] = [];

  function visit(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    directories.push(dirPath);

    for (const name of fs.readdirSync(dirPath)) {
      const entryPath = path.join(dirPath, name);
      try {
        const stats = fs.statSync(entryPath);
        if (!stats.isDirectory()) continue;
        if (!shouldHandleDirectory(name)) continue;
        visit(entryPath);
      } catch {
        // Ignore transient file-system churn while scanning.
      }
    }
  }

  visit(extDir);
  directories.sort();
  return directories;
}

function watchDirectoriesSignature(extDir: string): string {
  return collectWatchDirectories(extDir).join("|");
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

function startDirectoryWatchers(extDir: string): void {
  closeWatcherHandles();
  const watchDirs = collectWatchDirectories(extDir);
  lastWatchedDirsSignature = watchDirs.join("|");

  for (const watchDir of watchDirs) {
    try {
      const watcher = fs.watch(watchDir, (eventType: string, filename: unknown) => {
        const resolvedFilename = typeof filename === "string" ? filename : filename == null ? null : String(filename);
        if (!shouldHandleFile(resolvedFilename)) return;
        const reason = resolvedFilename ? `${watchDir}${path.sep}${resolvedFilename} (${eventType})` : `${watchDir} (${eventType})`;
        queueReload(reason);
      });
      watchers.push(watcher);
    } catch {
      // Fall back to polling if an individual directory watcher cannot be attached.
    }
  }
}

function startWatcher(extDir: string): void {
  closeWatcher();
  ignoreEventsUntil = Date.now() + STARTUP_GRACE_MS;
  lastSnapshot = directorySnapshot(extDir);
  startDirectoryWatchers(extDir);
  setStatus("live reload: armed");

  pollTimer = setInterval(() => {
    if (!extDir || Date.now() < ignoreEventsUntil) return;

    const nextWatchedDirsSignature = watchDirectoriesSignature(extDir);
    if (nextWatchedDirsSignature !== lastWatchedDirsSignature) {
      startDirectoryWatchers(extDir);
      lastWatchedDirsSignature = nextWatchedDirsSignature;
    }

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