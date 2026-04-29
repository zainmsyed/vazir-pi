declare module "child_process" {
  export const execSync: any;
  export const execFileSync: any;
}

declare module "node:child_process" {
  export * from "child_process";
}

declare module "fs" {
  export type FSWatcher = any;
  export const existsSync: any;
  export const readFileSync: any;
  export const writeFileSync: any;
  export const mkdirSync: any;
  export const mkdtempSync: any;
  export const symlinkSync: any;
  export const unlinkSync: any;
  export const readdirSync: any;
  export const statSync: any;
  export const copyFileSync: any;
  export const rmSync: any;
  export const watch: any;
}

declare module "node:fs" {
  export * from "fs";
}

declare module "path" {
  export const join: any;
  export const extname: any;
  export const basename: any;
}

declare module "node:path" {
  export * from "path";
}

declare module "os" {
  export const tmpdir: any;
}

declare module "node:os" {
  export * from "os";
}

declare module "module" {
  export const createRequire: any;
}

declare module "node:module" {
  export * from "module";
}

declare module "url" {
  export const fileURLToPath: any;
  export const pathToFileURL: any;
}

declare module "node:url" {
  export * from "url";
}

declare const process: {
  stdout: { rows?: number };
  env: Record<string, string | undefined>;
};