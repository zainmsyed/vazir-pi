import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const trackerExtensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
const registerTracker = trackerExtensionModule.default;

type Notification = { message: string; level: string };
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
type FooterFactory = (
  tui: { requestRender(): void },
  theme: Theme,
  footerData: { getGitBranch(): string | null | undefined; onBranchChange?: (callback: () => void) => () => void },
) => {
  render(width?: number): string[];
  invalidate(): void;
  dispose?(): void;
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function stripAnsi(text: string | undefined): string {
  return (text ?? "").replace(ANSI_PATTERN, "");
}

function fossilAvailable(): boolean {
  try {
    childProcess.execSync("fossil version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function createFossilProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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
  fs.writeFileSync(path.join(cwd, ".context", "stories", "story-003.md"), [
    "# Story 003: Fossil footer",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-05-12  ",
    "**Last accessed:** 2026-05-12  ",
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Show Fossil metadata in the footer.",
    "",
    "## Verification",
    "Footer shows fossil branch and status.",
    "",
    "## Scope — files this story may touch",
    "- .pi/extensions/vazir-tracker/chrome.ts",
    "",
    "## Out of scope — do not touch",
    "- docs/",
    "",
    "## Dependencies",
    "- None",
    "",
    "---",
    "",
    "## Checklist",
    "- [x] Add footer state",
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

  childProcess.execSync("fossil setting autosync off", { cwd, stdio: "pipe" });
  fs.appendFileSync(path.join(cwd, "README.md"), "more\n");

  return cwd;
}

function makePi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  let thinkingLevel = "xhigh";

  const pi = {
    getThinkingLevel() {
      return thinkingLevel;
    },
    setThinkingLevel(level: string) {
      thinkingLevel = level;
    },
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
      commands.set(name, definition);
    },
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

function makeCtx(cwd: string, notifications: Notification[]) {
  const widgetMounts = new Map<string, WidgetMount>();
  let footerFactory: FooterFactory | null = null;
  let customRenderLines: string[] = [];

  return {
    cwd,
    hasUI: true,
    model: { provider: "anthropic", id: "haiku-3.5", reasoning: true },
    sessionManager: {
      getSessionFile() {
        return path.join(cwd, ".pi", "sessions", "session_deadbeef.jsonl");
      },
      getBranch() {
        return [];
      },
      getEntries() {
        return [];
      },
    },
    getContextUsage() {
      return { tokens: 1000, contextWindow: 200000, percent: 0.5 };
    },
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setWidget(key: string, factory: WidgetMount["factory"], options?: unknown) {
        widgetMounts.set(key, { key, factory, options });
      },
      setHeader() {},
      setFooter(factory: FooterFactory | undefined) {
        footerFactory = factory ?? null;
      },
      setFooterFactory(factory: FooterFactory | undefined) {
        footerFactory = factory ?? null;
      },
      setToolOutputExpanded() {},
      async custom(factory: (tui: { requestRender(): void }, theme: Theme, kb: unknown, done: () => void) => any) {
        const component = factory({ requestRender() {} }, { fg: (_label: string, text: string) => text }, undefined, () => {});
        customRenderLines = component.render(160);
      },
    },
    getFooterFactory() {
      return footerFactory;
    },
    getCustomRenderLines() {
      return customRenderLines;
    },
  };
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

try {
  if (!fossilAvailable()) {
    console.log("Fossil footer validation skipped — fossil binary not installed");
  } else {
    const cwd = createFossilProject("vazir-fossil-footer-");
    const notifications: Notification[] = [];
    const harness = makePi();
    const ctx = makeCtx(cwd, notifications);
    const theme: Theme = { fg: (_label: string, text: string) => text };

    await harness.emit("session_start", {}, ctx);
    await wait(1300);

    const footerFactory = ctx.getFooterFactory();
    assert(footerFactory !== null, "fossil footer factory was not mounted");

    let gitBranchCalls = 0;
    const footerComponent = footerFactory!(
      { requestRender() {} },
      theme,
      {
        getGitBranch() {
          gitBranchCalls += 1;
          return "main";
        },
        onBranchChange() {
          return () => {};
        },
      },
    );

    const footerLines = footerComponent.render(160).map(stripAnsi);
    assert(footerLines[1]?.includes("story-003"), "fossil footer did not include the active story");
    assert(footerLines[1]?.includes("trunk"), "fossil footer did not include the fossil branch label");
    assert(!footerLines[1]?.includes("fossil:"), "fossil footer should not prefix the branch label with the VCS name");
    assert(footerLines[1]?.includes("1 uncommitted"), "fossil footer did not include the fossil change count");
    assert(footerLines[1]?.includes("autosync off"), "fossil footer did not include the autosync-off warning");
    assert(gitBranchCalls === 0, "fossil footer should not call the host git branch helper");

    const diffCommand = harness.commands.get("diff");
    assert(Boolean(diffCommand), "diff command was not registered");
    await diffCommand!.handler("", ctx);
    const diffLines = ctx.getCustomRenderLines().map(stripAnsi);
    assert(diffLines[0]?.includes("M README.md"), "fossil diff viewer did not show the tracked file header");
    assert(diffLines.some(line => line.includes("+more")), "fossil diff viewer did not render fossil diff output");

    childProcess.execSync("fossil setting autosync on", { cwd, stdio: "pipe" });
    await harness.emit("agent_end", {}, ctx);
    const autosyncOnLines = footerComponent.render(160).map(stripAnsi);
    assert(autosyncOnLines[1]?.includes("autosync on"), "fossil footer did not show autosync on after the setting changed");
    assert(!autosyncOnLines[1]?.includes("not synced"), "fossil footer should not label local edits as not synced");

    await harness.emit("session_shutdown", {}, ctx);

    console.log("Fossil footer validation");
    console.log(`cwd: ${cwd}`);
    console.log(`footer: ${footerLines[1]}`);
    console.log(`autosyncOnFooter: ${autosyncOnLines[1]}`);
    console.log("diffLines:");
    for (const line of diffLines.slice(0, 6)) {
      console.log(`  - ${line}`);
    }
  }
} finally {
  cleanupStubModules(stubModuleDirs);
}
