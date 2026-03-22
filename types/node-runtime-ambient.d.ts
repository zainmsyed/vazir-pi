declare module "child_process" {
  export const execSync: any;
}

declare module "fs" {
  export const existsSync: any;
  export const readFileSync: any;
  export const writeFileSync: any;
  export const mkdirSync: any;
  export const readdirSync: any;
  export const copyFileSync: any;
  export const rmSync: any;
}

declare module "path" {
  export const join: any;
  export const extname: any;
  export const basename: any;
}

declare const process: {
  stdout: { rows?: number };
};