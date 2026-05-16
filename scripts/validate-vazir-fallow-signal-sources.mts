import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildConsolidationInstruction,
  buildLearnedRuleCloseoutInstruction,
  buildMiniConsolidateInstruction,
} from "../.pi/extensions/vazir-context/helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-fallow-signal-"));
fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System Rules\n\n## Rules\n\n## Learned Rules\n");
fs.writeFileSync(path.join(cwd, ".context", "stories", "story-001.md"), "# Story 001: Example\n");

const consolidateInstruction = buildConsolidationInstruction(cwd);
assert(consolidateInstruction.includes("[fallow]"), "/consolidate instruction should explicitly mention [fallow] complaints as valid signals");
assert(consolidateInstruction.includes("/fix"), "/consolidate instruction should continue to mention /fix complaints as valid signals");

const miniInstruction = buildMiniConsolidateInstruction(cwd, "story-001");
assert(miniInstruction.includes(".context/complaints-log.md"), "mini-consolidate instruction should read complaints-log.md");
assert(miniInstruction.includes("[fallow]"), "mini-consolidate instruction should explicitly treat [fallow] entries as valid signals");
assert(miniInstruction.includes("story-001"), "mini-consolidate instruction should scope complaints-log reading to the active story");

const learnedRuleInstruction = buildLearnedRuleCloseoutInstruction(cwd, "story-001");
assert(learnedRuleInstruction.includes(".context/complaints-log.md"), "learned-rule closeout instruction should read complaints-log.md");
assert(learnedRuleInstruction.includes("[fallow]"), "learned-rule closeout instruction should explicitly treat [fallow] entries as valid signals");
assert(learnedRuleInstruction.includes("story-001"), "learned-rule closeout instruction should scope complaints-log reading to the active story");

fs.rmSync(cwd, { recursive: true, force: true });
console.log("Fallow signal-source instruction validation passed");
