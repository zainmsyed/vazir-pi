import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const stubModuleDirs = installCommonPiStubs();

const trackerExtensionModule = await loadExtensionModule<{
  default: (pi: any) => void;
  refreshVcsState: (cwd: string) => void;
}>("vazir-tracker", String(Date.now()));
const registerTracker = trackerExtensionModule.default;

type Theme = { fg: (label: string, text: string) => string };
type WidgetMount = {
  key: string;
  factory: (tui: { requestRender(): void }, theme: Theme) => {
    render(width?: number): string[];
    invalidate(): void;
    dispose?(): void;
  };
  options?: unknown;
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function stripAnsi(text: string | undefined): string {
  return (text ?? "").replace(ANSI_PATTERN, "");
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), "{}\n");
  childProcess.execSync("git init -q", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit --allow-empty -qm init", { cwd, stdio: "pipe" });
  return cwd;
}

function createPlainFolder(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeStory(cwd: string, number: number, status: string, checklist: string[]): string {
  const storyPath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(storyPath, [
    `# Story ${String(number).padStart(3, "0")}: Test story`,
    "",
    `**Status:** ${status}  `,
    "**Created:** 2026-05-29  ",
    "**Last accessed:** 2026-05-29  ",
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Test HUD rendering.",
    "",
    "## Verification",
    "HUD shows correct state.",
    "",
    "## Scope",
    "- .pi/extensions/vazir-tracker/chrome.ts",
    "",
    "## Out of scope",
    "- docs/",
    "",
    "## Dependencies",
    "- None",
    "",
    "---",
    "",
    "## Checklist",
    ...checklist,
    "",
    "---",
    "",
    "## Issues",
    "",
    "---",
    "",
    "## Completion Summary",
    "",
  ].join("\n"));
  return storyPath;
}

function makePi() {
  const commands = new Map();
  const eventHandlers = new Map();
  let thinkingLevel = "xhigh";
  const pi = {
    getThinkingLevel() { return thinkingLevel; },
    setThinkingLevel(level: string) { thinkingLevel = level; },
    on(name: string, handler: any) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: any) { commands.set(name, definition); },
    async sendUserMessage() {},
  };
  registerTracker(pi as any);
  return {
    commands,
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(cwd: string) {
  const widgetMounts = new Map<string, WidgetMount>();
  return {
    cwd,
    hasUI: true,
    model: { provider: "anthropic", id: "haiku-3.5", reasoning: true },
    sessionManager: {
      getSessionFile() {
        return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
      },
      getBranch() {
        return [
          { type: "model_change", provider: "anthropic", modelId: "haiku-3.5" },
          { type: "thinking_level_change", thinkingLevel: "low" },
        ];
      },
      getEntries() {
        return [
          {
            type: "message",
            message: {
              role: "assistant",
              usage: {
                input_tokens: 2100,
                output_tokens: 8400,
                cost: { total: 0.0021 },
              },
            },
          },
        ];
      },
    },
    getContextUsage() {
      return { tokens: 2100, contextWindow: 200000, percent: 1.1 };
    },
    ui: {
      notify() {},
      setWidget(key: string, factory: WidgetMount["factory"], options?: unknown) {
        widgetMounts.set(key, { key, factory, options });
      },
      setHeader() {},
      setFooter() {},
      setFooterFactory() {},
      setToolOutputExpanded() {},
      async input() {
        return undefined;
      },
      async select() {
        return undefined;
      },
    },
    getWidgetMount(key: string) {
      return widgetMounts.get(key) ?? null;
    },
  };
}

// ── Scenarios ──────────────────────────────────────────────────────────

async function runUninitializedScenario() {
  const cwd = createPlainFolder("vazir-hud-uninit-");
  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD widget was not mounted for uninitialized folder");
  assert(hudMount!.options && (hudMount!.options as any).placement === "aboveEditor", "HUD was not placed aboveEditor");

  const hudComponent = hudMount!.factory({ requestRender() {} }, theme);
  const lines = hudComponent.render(140).map(stripAnsi);
  assert(lines.length === 1, "uninitialized HUD should render exactly one line");
  assert(lines[0]!.includes("/vazir-init"), "uninitialized HUD should prompt for /vazir-init");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, lines };
}

async function runNoActiveStoryScenario() {
  const cwd = createProject("vazir-hud-no-story-");
  // No stories at all → HUD should show "No active story"

  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);
  await trackerExtensionModule.refreshVcsState(cwd);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD widget was not mounted for no-active-story state");

  const hudComponent = hudMount!.factory({ requestRender() {} }, theme);

  // Wide terminal
  const wideLines = hudComponent.render(140).map(stripAnsi);
  assert(wideLines.length === 1, "no-active-story HUD wide should render one line");
  assert(wideLines[0]!.includes("No active story"), "wide HUD should show 'No active story'");
  assert(wideLines[0]!.includes(""), "wide HUD should show git VCS icon");
  assert(wideLines[0]!.includes("main") || wideLines[0]!.includes("master"), "wide HUD should show branch label");
  assert(wideLines[0]!.includes("/plan"), "wide HUD should show compact command strip");

  // Narrow terminal
  const narrowLines = hudComponent.render(40).map(stripAnsi);
  assert(narrowLines.length === 1, "no-active-story HUD narrow should render one line");
  assert(narrowLines[0]!.includes("No active story"), "narrow HUD should show 'No active story'");
  assert(!narrowLines[0]!.includes("/plan"), "narrow HUD should drop command strip");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, wideLines, narrowLines };
}

async function runQueueSummaryScenario() {
  const cwd = createProject("vazir-hud-queue-");
  writeStory(cwd, 1, "complete", ["- [x] done"]);
  writeStory(cwd, 2, "not-started", ["- [ ] todo"]);
  writeStory(cwd, 3, "not-started", ["- [ ] other"]);

  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);
  await trackerExtensionModule.refreshVcsState(cwd);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD widget was not mounted for queue-summary state");

  const hudComponent = hudMount!.factory({ requestRender() {} }, theme);
  const lines = hudComponent.render(140).map(stripAnsi);
  assert(lines.length === 1, "queue-summary HUD should render one line");
  assert(lines[0]!.includes("2 open"), "HUD should show queue summary (2 open not-started stories)");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, lines };
}

async function runActiveStoryScenario() {
  const cwd = createProject("vazir-hud-active-");
  writeStory(cwd, 1, "in-progress", ["- [x] done", "- [x] done2", "- [ ] todo"]);
  writeStory(cwd, 2, "not-started", ["- [ ] other"]);

  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);
  await trackerExtensionModule.refreshVcsState(cwd);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD widget was not mounted for active-story state");

  const hudComponent = hudMount!.factory({ requestRender() {} }, theme);

  // Wide terminal
  const wideLines = hudComponent.render(140).map(stripAnsi);
  assert(wideLines.length === 1, "active-story HUD wide should render one line");
  assert(wideLines[0]!.includes("story-001"), "wide HUD should show active story slug");
  assert(wideLines[0]!.includes("in-progress"), "wide HUD should show story status");
  assert(wideLines[0]!.includes("2/3"), "wide HUD should show checklist progress");
  assert(wideLines[0]!.includes(""), "wide HUD should show VCS icon");
  assert(wideLines[0]!.includes("/plan"), "wide HUD should show command strip");

  // Medium terminal (drop command strip, keep VCS)
  const mediumLines = hudComponent.render(80).map(stripAnsi);
  assert(mediumLines.length === 1, "active-story HUD medium should render one line");
  assert(mediumLines[0]!.includes("story-001"), "medium HUD should show story slug");
  assert(mediumLines[0]!.includes("2/3"), "medium HUD should show progress");
  assert(!mediumLines[0]!.includes("/plan"), "medium HUD should drop command strip");

  // Narrow terminal
  const narrowLines = hudComponent.render(40).map(stripAnsi);
  assert(narrowLines.length === 1, "active-story HUD narrow should render one line");
  assert(narrowLines[0]!.includes("story-001"), "narrow HUD should show story slug");
  assert(narrowLines[0]!.includes("2/3"), "narrow HUD should show progress");
  assert(!narrowLines[0]!.includes("in-progress"), "narrow HUD should drop status label");
  assert(!narrowLines[0]!.includes("/plan"), "narrow HUD should drop command strip");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, wideLines, mediumLines, narrowLines };
}

function fossilAvailable(): boolean {
  try {
    childProcess.execSync("fossil version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function runFossilIdentityScenario() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-hud-fossil-"));
  const repoPath = path.join(root, "repo.fossil");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { recursive: true });

  childProcess.execSync(`fossil init ${JSON.stringify(repoPath)}`, { cwd: root, stdio: "pipe" });
  childProcess.execSync(`fossil open ${JSON.stringify(repoPath)}`, { cwd, stdio: "pipe" });

  fs.writeFileSync(path.join(cwd, "README.md"), "hello\n");
  childProcess.execSync("fossil add README.md", { cwd, stdio: "pipe" });
  childProcess.execSync("fossil commit -m initial --user-override vazir-test", { cwd, stdio: "pipe" });

  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ vcs_preference: "fossil" }, null, 2));
  writeStory(cwd, 1, "in-progress", ["- [x] done", "- [ ] todo"]);

  childProcess.execSync("fossil setting autosync off", { cwd, stdio: "pipe" });
  fs.appendFileSync(path.join(cwd, "README.md"), "more\n");

  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);
  await trackerExtensionModule.refreshVcsState(cwd);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD widget was not mounted for fossil repo");

  const hudComponent = hudMount!.factory({ requestRender() {} }, theme);
  const lines = hudComponent.render(160).map(stripAnsi);
  assert(lines.length === 1, "fossil HUD should render one line");
  assert(lines[0]!.includes(""), "fossil HUD should show fossil VCS icon ()");
  assert(lines[0]!.includes("trunk"), "fossil HUD should show fossil branch label");
  assert(lines[0]!.includes("autosync off"), "fossil HUD should show autosync-off warning");
  assert(!lines[0]!.includes(""), "fossil HUD should not show git icon");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, lines };
}

async function runRefreshPathScenario() {
  const cwd = createProject("vazir-hud-refresh-");
  writeStory(cwd, 1, "in-progress", ["- [x] done", "- [ ] todo"]);

  const harness = makePi();
  const ctx = makeCtx(cwd);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);
  await trackerExtensionModule.refreshVcsState(cwd);

  const hudMount = ctx.getWidgetMount("vazir-hud");
  assert(hudMount !== null, "HUD was not mounted");

  let renderRequests = 0;
  const hudComponent = hudMount!.factory({ requestRender() { renderRequests += 1; } }, theme);

  // Initial render
  const before = hudComponent.render(140).map(stripAnsi);
  assert(before[0]!.includes("1/2"), "initial HUD should show 1/2 progress");
  assert(renderRequests === 0, "no render requests yet");

  // Simulate a story edit that changes checklist progress
  fs.writeFileSync(
    path.join(cwd, ".context", "stories", "story-001.md"),
    fs.readFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "utf-8").replace("- [ ] todo", "- [x] todo"),
  );

  // Trigger chrome refresh via the existing tracker path
  await trackerExtensionModule.refreshVcsState(cwd);

  const after = hudComponent.render(140).map(stripAnsi);
  assert(after[0]!.includes("2/2"), "HUD should reflect updated progress after refresh");

  await harness.emit("session_shutdown", {}, ctx);

  return { cwd, before, after };
}

function printScenario(title: string, details: Record<string, unknown>) {
  console.log(title);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.log(`${key}:`);
      for (const item of value) {
        console.log(`  - ${String(item)}`);
      }
      continue;
    }
    console.log(`${key}: ${String(value)}`);
  }
  console.log("");
}

try {
  const uninitialized = await runUninitializedScenario();
  const noActiveStory = await runNoActiveStoryScenario();
  const queueSummary = await runQueueSummaryScenario();
  const activeStory = await runActiveStoryScenario();
  const refreshPath = await runRefreshPathScenario();

  printScenario("Uninitialized", uninitialized);
  printScenario("No Active Story", noActiveStory);
  printScenario("Queue Summary", queueSummary);
  printScenario("Active Story", activeStory);
  printScenario("Refresh Path", refreshPath);

  if (fossilAvailable()) {
    const fossilIdentity = await runFossilIdentityScenario();
    printScenario("Fossil Identity", fossilIdentity);
  } else {
    console.log("Fossil Identity — skipped (fossil binary not installed)");
  }

  console.log("All HUD scenarios passed.");
} finally {
  cleanupStubModules(stubModuleDirs);
}
