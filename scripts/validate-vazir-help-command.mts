import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, makePi } from "./lib/validation-harness.mts";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chromeSource = fs.readFileSync(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "chrome.ts"), "utf-8");
const trackerSource = fs.readFileSync(path.join(repoRoot, ".pi", "extensions", "vazir-tracker", "index.ts"), "utf-8");
const stubModuleDirs = installCommonPiStubs();

try {
  const tracker = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-tracker", String(Date.now()));
  const pi = makePi([tracker.default]);
  const command = pi.getCommand("help");
  assert(Boolean(command), "/help should be registered by vazir-tracker");
  assert(trackerSource.includes('description: "Open the same interactive help experience as Ctrl+?"'), "/help description should identify the Ctrl+? alias");
  assert(trackerSource.includes('pi.registerCommand("help"'), "tracker should own /help registration");
  assert(trackerSource.includes("await openCommandHelp(ctx)"), "/help should delegate to the shared help opener");
  assert(chromeSource.includes("export async function openCommandHelp"), "shared help opener should be exported");
  assert(chromeSource.includes("await showCommandHelp(ctx)"), "shared help opener should invoke the existing renderer");
  assert(!trackerSource.includes("SelectList"), "tracker command registration must not duplicate help rendering");

  const notifications: Array<{ message: string; level: string }> = [];
  await command!.handler("", {
    hasUI: false,
    ui: { notify(message: string, level: string) { notifications.push({ message, level }); } },
  });
  assert(notifications.some(note => note.message === "Help overlay requires a TUI session"), "/help should use the shared non-TUI fallback");

  const piTui = await import("@earendil-works/pi-tui");
  const selectListPrototype = (piTui.SelectList as any).prototype;
  const originalHandleInput = selectListPrototype.handleInput;
  selectListPrototype.handleInput = function (data: string) {
    if (data === "select") this.onSelect?.(this.items[1]);
    else originalHandleInput.call(this, data);
  };

  const customCalls: Array<{ options?: any; inputs: string[] }> = [];
  const ui = {
    async custom(factory: any, options?: any) {
      const inputs: string[] = [];
      customCalls.push({ options, inputs });
      const component = factory(
        { requestRender() {} },
        { fg: (_tone: string, text: string) => text, bg: (_tone: string, text: string) => text, bold: (text: string) => text },
        undefined,
        (value: unknown) => value,
      );
      if (customCalls.length === 1) {
        inputs.push("select");
        component.handleInput("select");
      } else {
        inputs.push("escape");
        component.handleInput("escape");
      }
      return customCalls.length === 1 ? "/help" : null;
    },
    notify() {},
  };

  await command!.handler("", { hasUI: true, ui });
  assert(customCalls.length === 3, `/help should open the list, command detail, and list again before dismissal; got ${customCalls.length}`);
  assert(customCalls.every(call => call.options?.overlay === true), "/help should use modal overlays for both list and detail views");
  assert(customCalls[0]?.inputs[0] === "select", "runtime help validation should select a command from the list");
  assert(customCalls[1]?.inputs[0] === "escape", "runtime help validation should dismiss the command detail view");
  assert(customCalls[2]?.inputs[0] === "escape", "runtime help validation should dismiss the help list");

  selectListPrototype.handleInput = originalHandleInput;
  console.log("validate-vazir-help-command: registration, shared delegation, and runtime UI flow ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
