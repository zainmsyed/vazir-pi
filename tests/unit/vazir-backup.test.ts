import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import vazirBackup, {
  archiveBackup,
  clearTracking,
  createBackupApi,
  getBackupDir,
  getModifiedFiles,
  getPendingBackupPath,
  restoreFromBackup,
  seedPendingBackupFile,
  walkDir,
} from "../../.pi/extensions/vazir-backup.ts";

type ToolCallHandler = (event: {
  toolName: string;
  input: {
    path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
}, ctx: { ui: { notify(message: string, level?: string): void } }) => Promise<{ block: false }>;

function withTempWorkspace(testFn: (workspaceRoot: string) => void | Promise<void>): Promise<void> {
  const workspaceRoot = join(process.cwd(), ".tmp-vazir-backup-tests", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workspaceRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(workspaceRoot);
  clearTracking();

  return Promise.resolve()
    .then(() => testFn(workspaceRoot))
    .finally(() => {
      clearTracking();
      process.chdir(originalCwd);
      rmSync(workspaceRoot, { recursive: true, force: true });
    });
}

function createHandler(): ToolCallHandler {
  const calls: Array<Parameters<ToolCallHandler>[1]> = [];
  const fakePi = {
    on(_eventName: string, handler: ToolCallHandler) {
      calls.push({ ui: { notify() {} } });
      (fakePi as { handler?: ToolCallHandler }).handler = handler;
    },
  } as unknown as { on(eventName: string, handler: ToolCallHandler): void; handler?: ToolCallHandler };

  vazirBackup(fakePi as never);

  if (!fakePi.handler) {
    throw new Error("Expected backup handler to be registered");
  }

  return fakePi.handler;
}

test("backs up an existing file on the first write", async () => {
  await withTempWorkspace(async () => {
    mkdirSync(join(process.cwd(), "docs"), { recursive: true });
    writeFileSync(join(process.cwd(), "docs/note.md"), "original content", "utf-8");

    const handler = createHandler();
    const result = await handler(
      { toolName: "write", input: { path: "docs/note.md", content: "updated content" } },
      { ui: { notify() {} } },
    );

    assert.deepEqual(result, { block: false });
    assert.equal(readFileSync(getPendingBackupPath("docs/note.md"), "utf-8"), "original content");
    assert.equal(getModifiedFiles().get("docs/note.md")?.original, "original content");
    assert.equal(getModifiedFiles().get("docs/note.md")?.current, "updated content");
  });
});

test("does not create a second backup for repeated writes", async () => {
  await withTempWorkspace(async () => {
    mkdirSync(join(process.cwd(), "src"), { recursive: true });
    writeFileSync(join(process.cwd(), "src/app.ts"), "first version", "utf-8");

    const handler = createHandler();
    await handler({ toolName: "write", input: { path: "src/app.ts", content: "second version" } }, { ui: { notify() {} } });
    await handler({ toolName: "write", input: { path: "src/app.ts", content: "third version" } }, { ui: { notify() {} } });

    assert.equal(readFileSync(getPendingBackupPath("src/app.ts"), "utf-8"), "first version");
    assert.equal(getModifiedFiles().get("src/app.ts")?.original, "first version");
    assert.equal(getModifiedFiles().get("src/app.ts")?.current, "third version");
  });
});

test("tracks a new file with an empty original value", async () => {
  await withTempWorkspace(async () => {
    const handler = createHandler();

    await handler({ toolName: "write", input: { path: "notes/todo.md", content: "hello" } }, { ui: { notify() {} } });

    assert.equal(existsSync(getPendingBackupPath("notes/todo.md")), false);
    assert.equal(getModifiedFiles().get("notes/todo.md")?.original, "");
    assert.equal(getModifiedFiles().get("notes/todo.md")?.current, "hello");
  });
});

test("updates current content correctly for edit calls", async () => {
  await withTempWorkspace(async () => {
    mkdirSync(join(process.cwd(), "src"), { recursive: true });
    writeFileSync(join(process.cwd(), "src/edit.ts"), "alpha beta gamma", "utf-8");

    const handler = createHandler();
    await handler({ toolName: "edit", input: { path: "src/edit.ts", old_string: "beta", new_string: "delta" } }, { ui: { notify() {} } });

    assert.equal(getModifiedFiles().get("src/edit.ts")?.current, "alpha delta gamma");
    assert.equal(getModifiedFiles().get("src/edit.ts")?.original, "alpha beta gamma");
  });
});

test("ignores missing file paths and still returns block false", async () => {
  await withTempWorkspace(async () => {
    const handler = createHandler();

    const result = await handler({ toolName: "write", input: { content: "ignored" } }, { ui: { notify() {} } });

    assert.deepEqual(result, { block: false });
    assert.equal(getModifiedFiles().size, 0);
  });
});

test("restoreFromBackup copies pending files back into the working tree", async () => {
  await withTempWorkspace(async () => {
    writeFileSync(join(process.cwd(), "restore-me.txt"), "working content", "utf-8");
    seedPendingBackupFile("restore-me.txt", "backup content");

    restoreFromBackup();

    assert.equal(readFileSync(join(process.cwd(), "restore-me.txt"), "utf-8"), "backup content");
  });
});

test("archiveBackup moves the pending folder into history", async () => {
  await withTempWorkspace(async () => {
    seedPendingBackupFile("archive-me.txt", "pending content");

    const archiveDir = archiveBackup("2026-03-19T00-00-00Z");

    assert.equal(archiveDir, join(process.cwd(), ".context/history", "2026-03-19T00-00-00Z"));
    assert.equal(existsSync(getBackupDir()), false);
    assert.equal(readFileSync(join(archiveDir, "archive-me.txt"), "utf-8"), "pending content");
  });
});

test("clearTracking empties the in-memory trackers", async () => {
  await withTempWorkspace(async () => {
    mkdirSync(join(process.cwd(), "docs"), { recursive: true });
    writeFileSync(join(process.cwd(), "docs/reset.md"), "original", "utf-8");

    const handler = createHandler();
    await handler({ toolName: "write", input: { path: "docs/reset.md", content: "changed" } }, { ui: { notify() {} } });

    assert.ok(getModifiedFiles().size > 0);

    clearTracking();

    assert.equal(getModifiedFiles().size, 0);
    assert.equal(existsSync(getPendingBackupPath("docs/reset.md")), true);
  });
});

test("exports a backup API object for workflow integration", () => {
  const api = createBackupApi();

  assert.equal(typeof api.getModifiedFiles, "function");
  assert.equal(typeof api.getBackupDir, "function");
  assert.equal(typeof api.clearTracking, "function");
  assert.equal(typeof api.restoreFromBackup, "function");
  assert.equal(typeof api.archiveBackup, "function");
});

test("walkDir returns nested relative paths", async () => {
  await withTempWorkspace(async () => {
    seedPendingBackupFile("nested/a.txt", "a");
    seedPendingBackupFile("nested/deeper/b.txt", "b");

    assert.deepEqual(walkDir(getBackupDir()).sort(), ["nested/a.txt", "nested/deeper/b.txt"]);
  });
});