declare const process: {
  cwd(): string;
};

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf-8"): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: "utf-8"): void;
}

declare module "path" {
  export function join(...parts: string[]): string;
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
      handler: (event: AgentStartEvent, ctx: CommandContext) => Promise<{ systemPrompt: string } | void> | { systemPrompt: string } | void,
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