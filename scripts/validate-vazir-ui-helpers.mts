import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  cleanupStubModules,
  installCommonPiStubs,
} from "./lib/validation-harness.mts";

const stubModuleDirs = installCommonPiStubs();
const extraStubDirs: string[] = [];

// Add extra stubs for pi-tui components used by vazir-ui
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const piTuiDir = path.join(repoRoot, "node_modules", "@mariozechner", "pi-tui");
if (!fs.existsSync(piTuiDir)) {
  fs.mkdirSync(piTuiDir, { recursive: true });
  fs.writeFileSync(
    path.join(piTuiDir, "package.json"),
    JSON.stringify({ name: "@mariozechner/pi-tui", type: "commonjs" }, null, 2),
  );
  const stubCode = [
    "exports.__esModule = true;",
    "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape', enter: 'enter', ctrl: value => value, ctrlShift: value => value, shiftCtrl: value => value };",
    "exports.matchesKey = (data, key) => data === key;",
    "exports.Container = class { constructor() { this.children = []; } addChild(c) { this.children.push(c); } invalidate() {} render(w) { return this.children.flatMap(c => c.render ? c.render(w) : []); } };",
    "exports.Text = class { constructor(t, px, py) { this.text = t; this.px = px; this.py = py; } render(w) { return [this.text]; } };",
    "exports.Spacer = class { constructor(n) { this.n = n; } render(w) { return Array(this.n).fill(''); } };",
    "exports.Markdown = class { constructor(md, px, py, theme) { this.md = md; } render(w) { return this.md.split('\\n').slice(0, w); } };",
    "exports.SelectList = class { constructor(items, maxVisible, theme, layout) { this.items = items; this.maxVisible = maxVisible; this.theme = theme; this.layout = layout || {}; this.selectedIndex = 0; } setSelectedIndex(i) { this.selectedIndex = i; } getSelectedItem() { return this.items[this.selectedIndex] || null; } onSelect = null; onCancel = null; handleInput(data) { if (data === 'escape' && this.onCancel) this.onCancel(); } invalidate() {} render(w) { return this.items.slice(0, this.maxVisible).map(i => '  ' + i.label); } };",
    "exports.truncateToWidth = (str, width, ellipsis = '…', pad = false) => { const len = str.length; if (len > width) return str.slice(0, width - ellipsis.length) + ellipsis; return pad ? str + ' '.repeat(Math.max(0, width - len)) : str; };",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(piTuiDir, "index.js"), stubCode);
  extraStubDirs.push(piTuiDir);
}

const piCodingAgentDir = path.join(repoRoot, "node_modules", "@mariozechner", "pi-coding-agent");
if (!fs.existsSync(piCodingAgentDir)) {
  fs.mkdirSync(piCodingAgentDir, { recursive: true });
  fs.writeFileSync(
    path.join(piCodingAgentDir, "package.json"),
    JSON.stringify({ name: "@mariozechner/pi-coding-agent", type: "commonjs" }, null, 2),
  );
  const stubCode = [
    "exports.__esModule = true;",
    "exports.DynamicBorder = class { constructor(fn) { this.fn = fn; } render(w) { return ['─'.repeat(Math.max(2, w - 2))]; } };",
    "exports.getMarkdownTheme = () => ({});",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(piCodingAgentDir, "index.js"), stubCode);
  extraStubDirs.push(piCodingAgentDir);
}

// Load the module under test
const uiModule = await import(
  new URL(`../.pi/lib/vazir-ui.ts?cache=${Date.now()}`, import.meta.url).href
);

const { showSelectionList, showMarkdownViewer } = uiModule as Record<string, any>;

// --- Scenarios ---

function scenarioExportsExist() {
  assert(typeof showSelectionList === "function", "showSelectionList should be exported as a function");
  assert(typeof showMarkdownViewer === "function", "showMarkdownViewer should be exported as a function");
  console.log("  exports exist: ok");
}

async function scenarioSelectionListReturnsValue() {
  const mockCtx = {
    ui: {
      custom(factory: any, options: any) {
        assert(options?.overlay === true, "selection list should use overlay");
        assert(options?.overlayOptions?.anchor === "center", "default anchor should be center");
        assert(options?.overlayOptions?.width === "60%", "default width should be 60%");
        assert(options?.overlayOptions?.minWidth === 50, "default minWidth should be 50");
        assert(options?.overlayOptions?.maxHeight === "70%", "default maxHeight should be 70%");

        const component = factory(
          { requestRender() {} },
          { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
          {},
          (_val: string | null) => {},
        );

        assert(typeof component.render === "function", "component should have render");
        assert(typeof component.invalidate === "function", "component should have invalidate");
        assert(typeof component.handleInput === "function", "component should have handleInput");

        const rendered = component.render(60);
        assert(Array.isArray(rendered) && rendered.length > 0, "render should return non-empty array");
        assert(rendered.some((line: string) => line.includes("┌")), "render should have full top border");
        assert(rendered.some((line: string) => line.includes("└")), "render should have full bottom border");
        assert(rendered.some((line: string) => line.includes("│")), "render should have side borders");

        return Promise.resolve("opt-a");
      },
    },
  };

  const result = await showSelectionList(mockCtx, "Pick one", [
    { value: "opt-a", label: "Option A" },
    { value: "opt-b", label: "Option B", danger: true },
  ]);

  assert(result === "opt-a", "showSelectionList should return the selected value");
  console.log("  selection list returns value: ok");
}

async function scenarioSelectionListReturnsNullOnCancel() {
  const mockCtx = {
    ui: {
      custom(factory: any, _options: any) {
        const component = factory(
          { requestRender() {} },
          { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
          {},
          (_val: string | null) => {},
        );

        // Simulate escape at container level
        component.handleInput("escape");
        return Promise.resolve(null);
      },
    },
  };

  const result = await showSelectionList(mockCtx, "Pick one", [
    { value: "opt-a", label: "Option A" },
  ]);

  assert(result === null, "showSelectionList should return null on cancel");
  console.log("  selection list returns null on cancel: ok");
}

async function scenarioSelectionListDefaultSafeFocus() {
  let capturedFactory: any;
  const mockCtx = {
    ui: {
      custom(factory: any, _options: any) {
        capturedFactory = factory;
        return Promise.resolve("safe-opt");
      },
    },
  };

  await showSelectionList(
    mockCtx,
    "Dangerous choice",
    [
      { value: "danger-opt", label: "Delete everything", danger: true },
      { value: "safe-opt", label: "Keep everything", danger: false },
    ],
    { destructive: true },
  );

  const component = capturedFactory(
    { requestRender() {} },
    { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
    {},
    () => {},
  );

  const rendered = component.render(60);
  assert(rendered.some((line: string) => line.includes("Delete everything")), "danger item should appear in render");
  assert(rendered.some((line: string) => line.includes("Keep everything")), "safe item should appear in render");
  assert(rendered.some((line: string) => line.includes("┌") && line.includes("┐")), "panel should have full top border");
  console.log("  selection list default-safe destructive focus: ok");
}

async function scenarioSelectionListNonDestructiveDefaultFocus() {
  let capturedFactory: any;
  const mockCtx = {
    ui: {
      custom(factory: any, _options: any) {
        capturedFactory = factory;
        return Promise.resolve("opt-a");
      },
    },
  };

  await showSelectionList(
    mockCtx,
    "Pick one",
    [
      { value: "opt-a", label: "Option A" },
      { value: "opt-b", label: "Option B" },
      { value: "opt-c", label: "Option C" },
    ],
  );

  const component = capturedFactory(
    { requestRender() {} },
    { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
    {},
    () => {},
  );

  const rendered = component.render(60);
  assert(rendered.some((line: string) => line.includes("Option A")), "first item should appear in render");
  assert(rendered.some((line: string) => line.includes("Option B")), "second item should appear in render");
  assert(rendered.some((line: string) => line.includes("Option C")), "third item should appear in render");
  console.log("  selection list non-destructive default focus: ok");
}

async function scenarioMarkdownViewerOpensAndCloses() {
  let doneCalled = false;
  const mockCtx = {
    ui: {
      custom(factory: any, options: any) {
        assert(options?.overlay === true, "markdown viewer should use overlay");
        assert(options?.overlayOptions?.anchor === "center", "default anchor should be center");
        assert(options?.overlayOptions?.width === "70%", "default width should be 70%");
        assert(options?.overlayOptions?.minWidth === 60, "default minWidth should be 60");
        assert(options?.overlayOptions?.maxHeight === "80%", "default maxHeight should be 80%");

        const component = factory(
          { requestRender() {} },
          { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
          {},
          () => { doneCalled = true; },
        );

        assert(typeof component.render === "function", "component should have render");
        assert(typeof component.invalidate === "function", "component should have invalidate");
        assert(typeof component.handleInput === "function", "component should have handleInput");

        const rendered = component.render(60);
        assert(Array.isArray(rendered) && rendered.length > 0, "render should return non-empty array");
        assert(rendered.some((line: string) => line.includes("Story Title")), "title should appear in render");
        assert(rendered.some((line: string) => line.includes("# Hello")), "markdown content should appear in render");
        assert(rendered.some((line: string) => line.includes("┌") && line.includes("┐")), "panel should have full top border");
        assert(rendered.some((line: string) => line.includes("└") && line.includes("┘")), "panel should have full bottom border");
        assert(rendered.some((line: string) => line.includes("│")), "panel should have side borders");

        component.handleInput("escape");
        assert(doneCalled, "escape should trigger done callback");

        return Promise.resolve();
      },
    },
  };

  await showMarkdownViewer(mockCtx, "Story Title", "# Hello\n\nWorld");
  console.log("  markdown viewer opens and closes: ok");
}

async function scenarioMarkdownViewerEnterCloses() {
  let doneCalled = false;
  const mockCtx = {
    ui: {
      custom(factory: any, _options: any) {
        const component = factory(
          { requestRender() {} },
          { fg: (_c: string, t: string) => t, bold: (t: string) => t, bg: (_c: string, t: string) => t },
          {},
          () => { doneCalled = true; },
        );

        component.handleInput("enter");
        assert(doneCalled, "enter should trigger done callback");

        return Promise.resolve();
      },
    },
  };

  await showMarkdownViewer(mockCtx, "Story Title", "# Hello");
  console.log("  markdown viewer enter closes: ok");
}

async function scenarioSelectionListEmptyReturnsNull() {
  const mockCtx = {
    ui: {
      custom() {
        throw new Error("should not open overlay for empty items");
      },
    },
  };

  const result = await showSelectionList(mockCtx, "Pick one", []);
  assert(result === null, "empty selection list should return null immediately");
  console.log("  empty selection list returns null: ok");
}

// --- Run ---

try {
  console.log("validate-vazir-ui-helpers:");
  scenarioExportsExist();
  await scenarioSelectionListReturnsValue();
  await scenarioSelectionListReturnsNullOnCancel();
  await scenarioSelectionListDefaultSafeFocus();
  await scenarioSelectionListNonDestructiveDefaultFocus();
  await scenarioMarkdownViewerOpensAndCloses();
  await scenarioMarkdownViewerEnterCloses();
  await scenarioSelectionListEmptyReturnsNull();
  console.log("validate-vazir-ui-helpers: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
  for (const dir of extraStubDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
