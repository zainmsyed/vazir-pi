import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureStubModule(moduleName: string, content: string): string | null {
  const moduleDir = path.join(repoRoot, "node_modules", ...moduleName.split("/"));
  if (fs.existsSync(moduleDir)) {
    return null;
  }

  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, "package.json"), JSON.stringify({ name: moduleName, type: "commonjs" }, null, 2));
  fs.writeFileSync(path.join(moduleDir, "index.js"), content);
  return moduleDir;
}

export function installCommonPiStubs(): string[] {
  return [
    ensureStubModule("@mariozechner/pi-tui", [
      "exports.__esModule = true;",
      "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape', enter: 'enter', ctrl: value => value, ctrlShift: value => value, shiftCtrl: value => value };",
      "exports.matchesKey = (data, key) => data === key;",
      "exports.Container = class { constructor() { this.children = []; } addChild(c) { this.children.push(c); } invalidate() {} render(w) { return this.children.flatMap(c => c.render ? c.render(w) : []); } };",
      "exports.Text = class { constructor(t, px, py) { this.text = t; this.px = px; this.py = py; } render(w) { return [this.text]; } };",
      "exports.Spacer = class { constructor(n) { this.n = n; } render(w) { return Array(this.n).fill(''); } };",
      "exports.Markdown = class { constructor(md, px, py, theme) { this.md = md; } render(w) { return this.md.split('\\n').slice(0, w); } };",
      "exports.SelectList = class { constructor(items, maxVisible, theme, layout) { this.items = items; this.maxVisible = maxVisible; this.theme = theme; this.layout = layout || {}; this.selectedIndex = 0; } setSelectedIndex(i) { this.selectedIndex = i; } getSelectedItem() { return this.items[this.selectedIndex] || null; } onSelect = null; onCancel = null; handleInput(data) { if (data === 'escape' && this.onCancel) this.onCancel(); } invalidate() {} render(w) { return this.items.slice(0, this.maxVisible).map(i => '  ' + i.label); } };",
      "const CSI = /\\x1b\\[[0-?]*[ -/]*[@-~]/g;",
      "const OSC = /\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)/g;",
      "const stripAnsi = str => (str || '').replace(OSC, '').replace(CSI, '');",
      "const visibleWidth = str => stripAnsi(str).length;",
      "const matchEscape = str => str.match(/^\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|^\\x1b\\[[0-?]*[ -/]*[@-~]/);",
      "exports.visibleWidth = visibleWidth;",
      "exports.truncateToWidth = (str, width, ellipsis = '…', pad = false) => { const safeWidth = Math.max(0, width || 0); if (safeWidth === 0) return ''; const text = String(str ?? ''); const ellipsisWidth = visibleWidth(ellipsis); if (visibleWidth(text) <= safeWidth) return pad ? text + ' '.repeat(Math.max(0, safeWidth - visibleWidth(text))) : text; const target = Math.max(0, safeWidth - ellipsisWidth); let out = ''; let visible = 0; for (let i = 0; i < text.length && visible < target;) { if (text[i] === '\\x1b') { const match = matchEscape(text.slice(i)); if (match) { out += match[0]; i += match[0].length; continue; } } const codePoint = text.codePointAt(i); if (codePoint == null) break; const glyph = String.fromCodePoint(codePoint); out += glyph; i += glyph.length; visible += 1; } const truncated = out + ellipsis; return pad ? truncated + ' '.repeat(Math.max(0, safeWidth - visibleWidth(truncated))) : truncated; };",
      "",
    ].join("\n")),
    ensureStubModule("@mariozechner/pi-coding-agent", [
      "exports.__esModule = true;",
      "exports.DynamicBorder = class { constructor(fn) { this.fn = fn; } render(w) { return ['─'.repeat(Math.max(2, w - 2))]; } };",
      "exports.getMarkdownTheme = () => ({});",
      "",
    ].join("\n")),
  ].filter((dir): dir is string => dir !== null);
}

export function cleanupStubModules(moduleDirs: string[]): void {
  for (const moduleDir of [...moduleDirs].reverse()) {
    fs.rmSync(moduleDir, { recursive: true, force: true });
  }
}

export async function loadFileModule<TModule = Record<string, unknown>>(filePath: string, cacheKey?: string): Promise<TModule> {
  const moduleUrl = pathToFileURL(filePath).href;
  const url = cacheKey ? `${moduleUrl}?t=${cacheKey}` : moduleUrl;
  return (await import(url)) as TModule;
}

export async function loadExtensionModule<TModule = Record<string, unknown>>(extensionName: string, cacheKey?: string): Promise<TModule> {
  const extensionPath = path.join(repoRoot, ".pi", "extensions", extensionName, "index.ts");
  return await loadFileModule<TModule>(extensionPath, cacheKey);
}

type CommandDefinition = { handler: (args: string, ctx: any) => Promise<void> | void };
type EventHandler = (event: any, ctx: any) => Promise<any> | any;

export function makePi(registerExtensions: Array<(pi: any) => void>) {
  const commands = new Map<string, CommandDefinition>();
  const eventHandlers = new Map<string, EventHandler[]>();
  const sentMessages: Array<{ message: string; options?: unknown }> = [];
  const sentInternalMessages: Array<{ message: any; options?: unknown }> = [];
  let thinkingLevel = "xhigh";

  const pi = {
    getThinkingLevel() {
      return thinkingLevel;
    },
    setThinkingLevel(level: string) {
      thinkingLevel = level;
    },
    on(name: string, handler: EventHandler) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    registerCommand(name: string, definition: CommandDefinition) {
      commands.set(name, definition);
    },
    async sendUserMessage(message: unknown, options?: unknown) {
      sentMessages.push({ message: String(message), options });
    },
    sendMessage(message: any, options?: unknown) {
      sentInternalMessages.push({ message, options });
    },
  };

  for (const registerExtension of registerExtensions) {
    registerExtension(pi as any);
  }

  return {
    commands,
    sentMessages,
    sentInternalMessages,
    getCommand(name: string) {
      return commands.get(name);
    },
    setThinkingLevel(level: string) {
      thinkingLevel = level;
    },
    async emit(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
    async emitResults(name: string, event: any, ctx: any) {
      const handlers = eventHandlers.get(name) ?? [];
      const results: unknown[] = [];
      for (const handler of handlers) {
        results.push(await handler(event, ctx));
      }
      return results;
    },
  };
}