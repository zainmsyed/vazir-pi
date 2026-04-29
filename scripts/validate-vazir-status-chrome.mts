import { createRequire } from "node:module";
import childProcess from "node:child_process";
import os from "node:os";
import path from "node:path";
import { cleanupStubModules, installCommonPiStubs, loadExtensionModule } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const stubModuleDirs = installCommonPiStubs();

const trackerExtensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
const contextExtensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context", String(Date.now()));
const registerTracker = trackerExtensionModule.default;
const registerContext = contextExtensionModule.default;

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

function createBootstrappedPlainFolder(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), "{}\n");
  return cwd;
}

function writeStory(cwd: string): string {
  const storyPath = path.join(cwd, ".context", "stories", "story-003.md");
  fs.writeFileSync(storyPath, [
    "# Story 003: Tracker chrome",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-04-03  ",
    "**Last accessed:** 2026-04-03  ",
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Render the next Vazir TUI surface.",
    "",
    "## Verification",
    "The status widget and footer show the active story state.",
    "",
    "## Scope — files this story may touch",
    "- .pi/extensions/vazir-tracker/index.ts",
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
    "- [x] Add story parser",
    "- [x] Mount status widget",
    "- [ ] Brand the footer",
    "",
    "---",
    "",
    "## Issues",
    "### /fix — \"footer issue\"",
    "- **Reported:** 2026-04-03  ",
    "- **Status:** pending  ",
    "- **Agent note:** —  ",
    "- **Solution:** —",
    "",
    "### /fix — \"old issue\"",
    "- **Reported:** 2026-04-02  ",
    "- **Status:** confirmed  ",
    "- **Agent note:** —  ",
    "- **Solution:** Fixed.",
    "",
    "### /fix — \"regression\"",
    "- **Reported:** 2026-04-03  ",
    "- **Status:** reopened  ",
    "- **Agent note:** —  ",
    "- **Solution:** —",
    "",
    "---",
    "",
    "## Completion Summary",
    "",
  ].join("\n"));
  return storyPath;
}

function makePi(registerExtensions: Array<(pi: any) => void> = [registerTracker]) {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const sentMessages: string[] = [];
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
    async sendUserMessage(message: string) {
      sentMessages.push(message);
    },
  };

  for (const registerExtension of registerExtensions) {
    registerExtension(pi as any);
  }

  return {
    commands,
    sentMessages,
    setThinkingLevel(level: string) {
      thinkingLevel = level;
    },
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

function makeCtx(cwd: string, notifications: Notification[], options?: { selectResponses?: string[] }) {
  const widgetMounts = new Map<string, WidgetMount>();
  let footerFactory: FooterFactory | null = null;
  let toolOutputExpanded: boolean | null = null;
  const selectResponses = [...(options?.selectResponses ?? [])];

  const ctx = {
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
      setToolOutputExpanded(value: boolean) {
        toolOutputExpanded = value;
      },
      async input() {
        return undefined;
      },
      async select() {
        return selectResponses.shift();
      },
    },
    getWidgetMount(key: string) {
      return widgetMounts.get(key) ?? null;
    },
    getFooterFactory() {
      return footerFactory;
    },
    getToolOutputExpanded() {
      return toolOutputExpanded;
    },
  };

  return ctx;
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function runScenario() {
  const cwd = createProject("vazir-status-chrome-");
  const storyPath = writeStory(cwd);
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);

  assert(ctx.getToolOutputExpanded() === false, "tool output was not collapsed on session start");

  const statusMount = ctx.getWidgetMount("vazir-story-status");
  const footerFactory = ctx.getFooterFactory();
  assert(statusMount !== null, "story status widget was not mounted");
  assert(footerFactory !== null, "custom footer was not mounted");

  let statusRenderRequests = 0;
  let footerRenderRequests = 0;

  const statusComponent = statusMount!.factory({ requestRender() { statusRenderRequests += 1; } }, theme);
  const statusLines = statusComponent.render(140).map(stripAnsi);
  assert(statusLines.some(line => line.includes("story-003")), "status widget did not show the active story slug");
  assert(statusLines.some(line => line.includes("in-progress")), "status widget did not show the story status");
  assert(statusLines.some(line => line.includes("2/3 tasks")), "status widget did not show checklist progress");
  assert(statusLines.some(line => line.includes("2 issues")), "status widget did not show open issue count");
  assert(statusLines.some(line => line.includes("last saved")), "status widget did not show the last-saved label");

  const footerComponent = footerFactory!(
    { requestRender() { footerRenderRequests += 1; } },
    theme,
    { getGitBranch() { return "main"; } },
  );
  const footerLines = footerComponent.render(140).map(stripAnsi);
  assert(footerLines[0]?.includes("━━"), "footer did not render the separator line");
  assert(footerLines[1]?.includes("vazir"), "footer did not include Vazir branding");
  assert(footerLines[1]?.includes("story-003"), "footer did not include the story slug");
  assert(footerLines[1]?.includes("main"), "footer did not include the branch label");
  assert(footerLines[1]?.includes("haiku-3.5 (xhigh)"), "footer did not include the live thinking label");
  assert(footerLines[1]?.includes("↑2.1k ↓8.4k"), "footer did not include session token counts");
  assert(footerLines[1]?.includes("1.1%/200k"), "footer did not include context usage");
  assert(footerLines[1]?.includes("$0.002"), "footer did not include spend");
  assert(footerLines[1]?.includes("2 issues"), "footer did not include the open issue badge");
  assert(footerLines[1]?.includes("Ctrl+? for help"), "footer did not include the idle help hint");

  harness.setThinkingLevel("off");
  const toggledFooterLines = footerComponent.render(140).map(stripAnsi);
  assert(toggledFooterLines[1]?.includes("haiku-3.5 (off)"), "footer did not update after a thinking toggle");

  await harness.emit("tool_call", { toolName: "read", input: { path: "src/vazir-context.ts" } }, ctx);
  const workingStatusLines = statusComponent.render(140).map(stripAnsi);
  const workingFooterLines = footerComponent.render(140).map(stripAnsi);
  assert(!workingStatusLines.some(line => line.includes("last saved")), "status widget should hide last-saved while tool work is active");
  assert(workingFooterLines[1]?.includes("Reading · vazir-context.ts"), "footer did not show the working message during tool activity");
  assert(workingFooterLines[1]?.includes("1.1%/200k"), "footer lost context usage during tool activity");
  assert(workingFooterLines[1]?.includes("$0.002"), "footer lost spend during tool activity");
  assert(workingFooterLines[1]?.includes("Ctrl+C to abort"), "footer did not switch to the abort hint during tool activity");
  assert(!workingFooterLines[1]?.includes("↑2.1k ↓8.4k"), "footer should replace token counts with the working message during tool activity");
  await harness.emit("tool_result", { toolName: "read" }, ctx);

  const fixCommand = harness.commands.get("fix");
  assert(Boolean(fixCommand), "fix command was not registered");
  await fixCommand!.handler("save indicator missing", ctx);

  const refreshedStatusLines = statusComponent.render(140).map(stripAnsi);
  const refreshedFooterLines = footerComponent.render(140).map(stripAnsi);
  const story = fs.readFileSync(storyPath, "utf-8");
  assert(statusRenderRequests > 0, "fix did not request a story status widget rerender");
  assert(footerRenderRequests > 0, "fix did not request a footer rerender");
  assert(story.includes('### /fix — "save indicator missing"'), "fix did not append the new issue to the story file");
  assert(refreshedStatusLines.some(line => line.includes("3 issues")), "status widget did not reflect the new open issue count");
  assert(refreshedFooterLines[1]?.includes("3 issues"), "footer did not reflect the new open issue count");
  assert(refreshedFooterLines[1]?.includes("↑2.1k ↓8.4k"), "footer did not restore token counts after tool activity ended");

  await harness.emit("session_shutdown", {}, ctx);

  return {
    cwd,
    notifications,
    statusLines,
    footerLines,
    workingFooterLines,
    refreshedStatusLines,
    refreshedFooterLines,
    sentMessages: harness.sentMessages,
  };
}

async function runCleanFolderScenario() {
  const cwd = createPlainFolder("vazir-status-clean-folder-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);

  assert(ctx.getToolOutputExpanded() === false, "tool output was not collapsed on clean-folder session start");
  assert(
    notifications.some(note => note.message.includes("Run /vazir-init")),
    "clean-folder startup did not tell the user to run /vazir-init",
  );

  const statusMount = ctx.getWidgetMount("vazir-story-status");
  const footerFactory = ctx.getFooterFactory();
  assert(statusMount !== null, "clean-folder startup did not mount the story status widget");
  assert(footerFactory !== null, "clean-folder startup did not mount the footer");

  const statusComponent = statusMount!.factory({ requestRender() {} }, theme);
  const statusLines = statusComponent.render(140).map(stripAnsi);
  assert(statusLines.some(line => line.includes("run /vazir-init")), "clean-folder status widget did not show /vazir-init guidance");

  let gitBranchCalls = 0;
  let branchSubscriptions = 0;

  const footerComponent = footerFactory!(
    { requestRender() {} },
    theme,
    {
      getGitBranch() {
        gitBranchCalls += 1;
        return undefined;
      },
      onBranchChange() {
        branchSubscriptions += 1;
        return () => {};
      },
    },
  );
  const footerLines = footerComponent.render(140).map(stripAnsi);
  assert(footerLines[1]?.includes("setup required"), "clean-folder footer did not show setup-required guidance");
  assert(footerLines[1]?.includes("run /vazir-init"), "clean-folder footer did not show /vazir-init guidance");
  assert(gitBranchCalls === 0, "clean-folder footer should not call the host git branch helper");
  assert(branchSubscriptions === 0, "clean-folder footer should not subscribe to host branch-change events");

  await harness.emit("session_shutdown", {}, ctx);

  return {
    cwd,
    notifications,
    statusLines,
    footerLines,
  };
}

async function runBootstrappedPlainFolderScenario() {
  const cwd = createBootstrappedPlainFolder("vazir-status-no-git-");
  const notifications: Notification[] = [];
  const harness = makePi();
  const ctx = makeCtx(cwd, notifications);
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);

  const statusMount = ctx.getWidgetMount("vazir-story-status");
  const footerFactory = ctx.getFooterFactory();
  assert(statusMount !== null, "bootstrapped no-git startup did not mount the story status widget");
  assert(footerFactory !== null, "bootstrapped no-git startup did not mount the footer");

  const statusComponent = statusMount!.factory({ requestRender() {} }, theme);
  const statusLines = statusComponent.render(140).map(stripAnsi);
  assert(statusLines.some(line => line.includes("no active story")), "bootstrapped no-git status widget should render the normal empty state");

  let gitBranchCalls = 0;
  let branchSubscriptions = 0;

  const footerComponent = footerFactory!(
    { requestRender() {} },
    theme,
    {
      getGitBranch() {
        gitBranchCalls += 1;
        return undefined;
      },
      onBranchChange() {
        branchSubscriptions += 1;
        return () => {};
      },
    },
  );
  const footerLines = footerComponent.render(140).map(stripAnsi);
  assert(footerLines[1]?.includes("no active story"), "bootstrapped no-git footer should include the normal empty-story label");
  assert(footerLines[1]?.includes("no-git"), "bootstrapped no-git footer should show a no-git branch label");
  assert(gitBranchCalls === 0, "bootstrapped no-git footer should not call the host git branch helper");
  assert(branchSubscriptions === 0, "bootstrapped no-git footer should not subscribe to host branch-change events");

  await harness.emit("session_shutdown", {}, ctx);

  return {
    cwd,
    notifications,
    statusLines,
    footerLines,
  };
}

async function runInitRefreshScenario() {
  const cwd = createPlainFolder("vazir-status-init-refresh-");
  const notifications: Notification[] = [];
  const harness = makePi([registerTracker, registerContext]);
  const ctx = makeCtx(cwd, notifications, { selectResponses: ["Yes — initialise git"] });
  const theme: Theme = { fg: (_label: string, text: string) => text };

  await harness.emit("session_start", {}, ctx);

  const statusMount = ctx.getWidgetMount("vazir-story-status");
  const footerFactory = ctx.getFooterFactory();
  assert(statusMount !== null, "init-refresh scenario did not mount the story status widget");
  assert(footerFactory !== null, "init-refresh scenario did not mount the footer");

  let footerRenderRequests = 0;
  const footerComponent = footerFactory!(
    { requestRender() { footerRenderRequests += 1; } },
    theme,
    {
      // Return null so the footer falls back to branchLabel(cwd), which runs
      // git rev-parse directly. Returning "no-git" here would show "no-git"
      // even after /vazir-init initialises the repo.
      getGitBranch() {
        return null;
      },
      onBranchChange() {
        return () => {};
      },
    },
  );

  const beforeInitLines = footerComponent.render(140).map(stripAnsi);
  assert(beforeInitLines[1]?.includes("run /vazir-init"), "init-refresh footer did not start in setup-required state");

  const initCommand = harness.commands.get("vazir-init");
  assert(Boolean(initCommand), "vazir-init command was not registered in init-refresh scenario");
  await initCommand!.handler("", ctx);

  const branch = childProcess.execSync("git symbolic-ref --short HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  const afterInitLines = footerComponent.render(140).map(stripAnsi);
  // Determine expected VCS label: if /vazir-init also ran jj git init --colocate the footer
  // shows "jj" (no bookmarks yet), otherwise it shows the git branch name.
  let jjRootInCwd = false;
  try {
    childProcess.execSync("jj root", { cwd, encoding: "utf-8", stdio: "pipe" });
    jjRootInCwd = true;
  } catch {
    // JJ not active in this folder
  }
  const expectedVcsLabel = jjRootInCwd ? "jj" : branch;
  assert(footerRenderRequests > 0, "vazir-init did not request a footer rerender");
  assert(afterInitLines[1]?.includes(expectedVcsLabel), `footer did not switch to the live VCS label (${expectedVcsLabel}) after /vazir-init without reload`);
  assert(!afterInitLines[1]?.includes("no-git"), "footer still showed no-git after /vazir-init");
  assert(afterInitLines[1]?.includes("uncommitted"), "footer did not show an uncommitted counter after /vazir-init");

  childProcess.execSync("git config user.name 'Vazir Test'", { cwd, stdio: "pipe" });
  childProcess.execSync("git config user.email 'vazir-test@example.com'", { cwd, stdio: "pipe" });
  fs.writeFileSync(path.join(cwd, "scratch.txt"), "dirty\n");
  await wait(1300);

  const dirtyLines = footerComponent.render(140).map(stripAnsi);
  assert(dirtyLines[1]?.includes("1 uncommitted"), "footer did not show a dirty counter after a filesystem change without reload");

  childProcess.execSync("git add -A", { cwd, stdio: "pipe" });
  childProcess.execSync("git commit -qm save", { cwd, stdio: "pipe" });
  await wait(1300);

  const cleanLines = footerComponent.render(140).map(stripAnsi);
  assert(cleanLines[1]?.includes("✓ clean"), "footer did not return to clean after commit without reload");

  await harness.emit("session_shutdown", {}, ctx);

  return {
    cwd,
    notifications,
    beforeInitLines,
    afterInitLines,
    dirtyLines,
    cleanLines,
  };
}

function printScenario(title: string, details: Record<string, unknown>) {
  console.log(title);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.log(`${key}:`);
      for (const item of value) {
        if (typeof item === "string") {
          console.log(`  - ${item}`);
        } else if (item && typeof item === "object" && "message" in item && "level" in item) {
          const note = item as Notification;
          console.log(`  - [${note.level}] ${note.message}`);
        } else {
          console.log(`  - ${JSON.stringify(item)}`);
        }
      }
      continue;
    }

    console.log(`${key}: ${String(value)}`);
  }
  console.log("");
}

try {
  const scenario = await runScenario();
  const cleanFolder = await runCleanFolderScenario();
  const bootstrappedPlainFolder = await runBootstrappedPlainFolderScenario();
  const initRefresh = await runInitRefreshScenario();
  printScenario("Status Chrome", scenario);
  printScenario("Clean Folder Startup", cleanFolder);
  printScenario("Bootstrapped Plain Folder", bootstrappedPlainFolder);
  printScenario("Init Refresh", initRefresh);
} finally {
  cleanupStubModules(stubModuleDirs);
}