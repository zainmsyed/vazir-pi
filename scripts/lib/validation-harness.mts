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
      "exports.Key = { up: 'up', down: 'down', pageUp: 'pageUp', pageDown: 'pageDown', escape: 'escape', ctrl: value => value, ctrlShift: value => value, shiftCtrl: value => value };",
      "exports.matchesKey = (data, key) => data === key;",
      "exports.Container = class {};",
      "exports.Text = class {};",
      "",
    ].join("\n")),
    ensureStubModule("@mariozechner/pi-coding-agent", [
      "exports.DynamicBorder = class {};",
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
  };
}