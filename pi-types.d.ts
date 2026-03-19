declare const process: {
  cwd(): string;
  chdir(directory: string): void;
};

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf-8"): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: "utf-8"): void;
  export function copyFileSync(src: string, dest: string): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function readdirSync(path: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean }>;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module "path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module "@mariozechner/pi-coding-agent" {
  export interface AgentStartEvent {
    systemPrompt?: string;
  }

  export interface UIContext {
    notify(message: string, level?: "info" | "warning" | "error"): void;
  }

  export interface CommandContext {
    ui: UIContext;
  }

  export interface ExtensionAPI {
    on(
      eventName: string,
      handler: (event: unknown, ctx: CommandContext) => unknown,
    ): void;
    registerCommand(
      name: string,
      config: {
        description: string;
        handler: (args: unknown, ctx: CommandContext) => Promise<void> | void;
      },
    ): void;
  }
}

declare module 'node:assert/strict' {
  const strict: any;
  export = strict;
}

declare module 'node:test' {
  const test: any;
  export default test;
}