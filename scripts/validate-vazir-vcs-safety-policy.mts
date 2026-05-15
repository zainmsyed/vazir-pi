import { createRequire } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { assert, cleanupStubModules, installCommonPiStubs, loadExtensionModule, loadFileModule, makePi, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const stubModuleDirs = installCommonPiStubs();

const helpersPath = path.join(repoRoot, ".pi", "lib", "vazir-helpers.ts");
const helpers = await loadFileModule<typeof import("../.pi/lib/vazir-helpers.ts")>(helpersPath, String(Date.now()));
const extensionModule = await loadExtensionModule<{ default: (pi: any) => void }>("vazir-context", String(Date.now()));

function createProject(prefix: string, systemContent: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "settings"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), systemContent);
  fs.writeFileSync(path.join(cwd, ".context", "memory", "context-map.md"), "# Context Map\n\n- Project: Test\n");
  fs.writeFileSync(path.join(cwd, ".context", "memory", "index.md"), "# File Index\n\n");
  fs.writeFileSync(path.join(cwd, ".context", "settings", "project.json"), JSON.stringify({ active_vcs_mode: "fossil" }, null, 2));
  return cwd;
}

function makeCtx(cwd: string) {
  return {
    cwd,
    ui: {
      notify() {},
    },
  };
}

async function assembledSystemPrompt(cwd: string): Promise<string> {
  const harness = makePi([extensionModule.default]);
  const results = await harness.emitResults("before_agent_start", { systemPrompt: "BASE" }, makeCtx(cwd));
  const result = results.find(entry => entry && typeof entry === "object" && "systemPrompt" in (entry as Record<string, unknown>)) as { systemPrompt: string } | undefined;
  return result?.systemPrompt ?? "";
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

try {
  assert(helpers.isProtectedVcsTarget(".git/config"), "expected .git/config to be protected");
  assert(helpers.isProtectedVcsTarget("nested/.jj/repo/store"), "expected nested .jj path to be protected");
  assert(helpers.isProtectedVcsTarget(".fslckout"), "expected .fslckout to be protected");
  assert(helpers.isProtectedVcsTarget(".fossil-settings/ignore-glob"), "expected .fossil-settings path to be protected");
  assert(!helpers.isProtectedVcsTarget("src/.gitignore"), "did not expect .gitignore to be treated as protected metadata");

  const protectedTargets = helpers.protectedVcsTargetsInText("rm -rf .git .jj/store .fslckout .fossil-settings");
  assert(protectedTargets.length === 4, `expected 4 protected targets, got ${protectedTargets.length}`);

  const rmProtected = helpers.approvalGatedVcsOperation("rm -rf .git");
  assert(rmProtected.needsApproval, "expected deleting .git to require approval");
  assert(rmProtected.protectedTargets.includes(".git"), "expected .git in protected target list");

  assert(helpers.approvalGatedVcsOperation("git reset --hard HEAD~1").needsApproval, "expected git reset to require approval");
  assert(helpers.approvalGatedVcsOperation("jj abandon @").needsApproval, "expected jj abandon to require approval");
  assert(helpers.approvalGatedVcsOperation("fossil clean --force").needsApproval, "expected fossil clean to require approval");
  assert(!helpers.approvalGatedVcsOperation("echo ok > notes.txt").needsApproval, "did not expect normal file write to require approval");

  const safetyGuidance = helpers.buildVcsSafetyGuidanceText();
  assert(safetyGuidance.includes("Commit `.context` changes whenever they are part of the work"), "guidance missing .context commit rule");
  assert(safetyGuidance.includes("Never delete, reset, clean, reinitialize, or overwrite VCS metadata"), "guidance missing VCS metadata rule");

  const defaultSystem = helpers.buildDefaultSystemRulesMarkdown();
  assert(helpers.hasVcsSafetyPolicyText(defaultSystem), "default system rules should include VCS safety policy text");

  const bootstrappedPrompt = await assembledSystemPrompt(createProject("vazir-vcs-safe-", defaultSystem));
  assert(countOccurrences(bootstrappedPrompt, "Commit `.context` changes whenever they are part of the work") === 1, "bootstrapped prompt duplicated the .context commit rule");
  assert(countOccurrences(bootstrappedPrompt, "Never delete, reset, clean, reinitialize, or overwrite VCS metadata") === 1, "bootstrapped prompt duplicated the VCS metadata rule");

  const legacySystem = [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "- Write directly to real project files.",
    "- Ask before changing ambiguous areas.",
    "",
    "## Learned Rules",
    "",
  ].join("\n");
  const legacyPrompt = await assembledSystemPrompt(createProject("vazir-vcs-legacy-", legacySystem));
  assert(countOccurrences(legacyPrompt, "Commit `.context` changes whenever they are part of the work") === 1, "legacy prompt should inject the .context commit rule once");
  assert(countOccurrences(legacyPrompt, "Never delete, reset, clean, reinitialize, or overwrite VCS metadata") === 1, "legacy prompt should inject the VCS metadata rule once");

  console.log("validate-vazir-vcs-safety-policy: ok");
} finally {
  cleanupStubModules(stubModuleDirs);
}
