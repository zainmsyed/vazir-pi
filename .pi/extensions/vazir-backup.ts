import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export type TrackedFile = {
  original: string;
  current: string;
};

export type BackupApi = {
  getModifiedFiles: () => Map<string, TrackedFile>;
  getBackupDir: () => string;
  clearTracking: () => void;
  restoreFromBackup: () => void;
  archiveBackup: (timestamp: string) => string;
};

type ToolCallEvent = {
  toolName: string;
  input: {
    path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
};

type ToolCallContext = {
  ui?: {
    notify(message: string, level?: "info" | "warning" | "error"): void;
  };
};

const trackedFiles = new Set<string>();
const modifiedFiles = new Map<string, TrackedFile>();

export function getBackupDir(): string {
  return join(process.cwd(), ".context/history/pending");
}

export function getPendingBackupPath(filePath: string): string {
  return join(getBackupDir(), filePath);
}

export function applyTrackedEdit(current: string, oldText: string, newText: string): string {
  return current.replace(oldText, newText);
}

export function walkDir(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const childPath of walkDir(fullPath)) {
        result.push(join(entry.name, childPath));
      }
      continue;
    }

    result.push(entry.name);
  }

  return result;
}

export function clearTracking(): void {
  trackedFiles.clear();
  modifiedFiles.clear();
}

export function getModifiedFiles(): Map<string, TrackedFile> {
  return modifiedFiles;
}

export function restoreFromBackup(): void {
  const pendingDir = getBackupDir();
  if (!existsSync(pendingDir)) return;

  for (const filePath of walkDir(pendingDir)) {
    const backupPath = join(pendingDir, filePath);
    const realPath = join(process.cwd(), filePath);
    mkdirSync(dirname(realPath), { recursive: true });
    copyFileSync(backupPath, realPath);
  }
}

export function archiveBackup(timestamp: string): string {
  const archiveDir = join(process.cwd(), ".context/history", timestamp);
  const pendingDir = getBackupDir();
  mkdirSync(dirname(archiveDir), { recursive: true });
  renameSync(pendingDir, archiveDir);
  return archiveDir;
}

export function createBackupApi(): BackupApi {
  return {
    getModifiedFiles,
    getBackupDir,
    clearTracking,
    restoreFromBackup,
    archiveBackup,
  };
}

function ensureTrackedFile(filePath: string, context?: ToolCallContext): void {
  if (trackedFiles.has(filePath)) return;

  trackedFiles.add(filePath);
  if (existsSync(join(process.cwd(), filePath))) {
    const realPath = join(process.cwd(), filePath);
    const backupPath = getPendingBackupPath(filePath);
    mkdirSync(dirname(backupPath), { recursive: true });
    copyFileSync(realPath, backupPath);
    const original = readFileSync(realPath, "utf-8");
    modifiedFiles.set(filePath, { original, current: original });
  } else {
    modifiedFiles.set(filePath, { original: "", current: "" });
  }

  context?.ui?.notify?.(`⬡ Backing up ${filePath}`, "info");
}

function updateTrackedWrite(filePath: string, content: string | undefined): void {
  const tracked = modifiedFiles.get(filePath);
  modifiedFiles.set(filePath, {
    original: tracked?.original ?? "",
    current: content ?? "",
  });
}

function updateTrackedEdit(filePath: string, oldText: string | undefined, newText: string | undefined): void {
  const tracked = modifiedFiles.get(filePath);
  const current = tracked?.current ?? "";
  modifiedFiles.set(filePath, {
    original: tracked?.original ?? "",
    current: oldText && newText ? applyTrackedEdit(current, oldText, newText) : current,
  });
}

export default function vazirBackup(pi: ExtensionAPI): BackupApi {
  pi.on("tool_call", async (event, ctx) => {
    const toolEvent = event as ToolCallEvent;
    const toolCallContext = ctx as ToolCallContext;

    if (toolEvent.toolName !== "write" && toolEvent.toolName !== "edit") {
      return { block: false };
    }

    const filePath = toolEvent.input.path;
    if (!filePath) return { block: false };

    ensureTrackedFile(filePath, toolCallContext);

    if (toolEvent.toolName === "write") {
      updateTrackedWrite(filePath, toolEvent.input.content);
    } else {
      updateTrackedEdit(filePath, toolEvent.input.old_string, toolEvent.input.new_string);
    }

    return { block: false };
  });

  return createBackupApi();
}

export function seedPendingBackupFile(filePath: string, content: string): void {
  const backupPath = getPendingBackupPath(filePath);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, content, "utf-8");
}