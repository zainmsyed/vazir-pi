import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadExtensionModule, makePi as createPiHarness } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context");
const register = extensionModule.default;

type Notification = { message: string; level: string };

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System Rules",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "",
    ].join("\n"),
  );
  return cwd;
}

function makePi() {
  const harness = createPiHarness([register]);
  const remember = harness.getCommand("remember");
  assert(Boolean(remember), "remember command was not registered");

  return { remember: remember!, sentMessages: harness.sentMessages };
}

function makeCtx(cwd: string, notifications: Notification[]) {
  return {
    cwd,
    ui: {
      async input() {
        return undefined;
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

const cwd = createProject("vazir-remember-");
const notifications: Notification[] = [];
const { remember, sentMessages } = makePi();
const ctx = makeCtx(cwd, notifications);

await remember.handler("do not rename auth helpers during refactors", ctx);
await remember.handler("", ctx);

const systemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
const summary = fs.readFileSync(path.join(cwd, ".context", "reviews", "summary.md"), "utf-8");
const remembered = fs.readFileSync(path.join(cwd, ".context", "reviews", "remembered.md"), "utf-8");

const learnedRuleCount = systemMd.split("\n").filter(line => line.trim() === "- do not rename auth helpers during refactors").length;
assert(learnedRuleCount === 1, "remember should add the learned rule only once to system.md");
assert(summary.includes("do not rename auth helpers during refactors | count: 1 | status: promoted"), "summary.md did not promote remembered rules immediately");
assert(remembered.includes("- Rule candidate: do not rename auth helpers during refactors"), "remembered.md did not record the remembered rule");
assert(notifications.some(note => note.message.includes("Remembered:")), "remember command did not notify the user");
assert(notifications.some(note => note.message.includes("Drafting a remembered rule")), "remember command did not notify when drafting from context");
assert(sentMessages.length === 1, "remember without args should send one follow-up message to the model");
assert(String(sentMessages[0].message).includes("Write one short reusable lesson to .context/reviews/remembered.md"), "remember draft instruction did not mention remembered.md");
assert(String(sentMessages[0].message).includes("recent fix context"), "remember draft instruction did not mention recent fix context");

console.log("Remember command validation");
console.log(`cwd: ${cwd}`);
console.log("notifications:");
for (const note of notifications) {
  console.log(`  - [${note.level}] ${note.message}`);
}
console.log("sentMessages:");
for (const message of sentMessages) {
  console.log(`  - ${String(message.message).split("\n")[0]}`);
}
console.log("summary:");
for (const line of summary.trim().split("\n")) {
  console.log(`  ${line}`);
}