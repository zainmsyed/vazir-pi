import * as fs from "node:fs";
import { getEventListeners } from "node:events";
import * as path from "node:path";

import { assert, loadExtensionModule, repoRoot } from "./lib/validation-harness.mts";
import { assertProjectUnchanged, createTemporaryProject } from "./lib/test-sandbox-fixtures.mts";
import type { SandboxPlanInput, SandboxToolDetails } from "../.pi/extensions/vazir-sandbox/index.ts";

const module = await loadExtensionModule<typeof import("../.pi/extensions/vazir-sandbox/index.ts")>("vazir-sandbox", `${Date.now()}-sandbox-command`);

function register() {
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const commandCounts = new Map<string, number>();
  const sentMessages: string[] = [];
  const pi = {
    registerCommand(name: string, definition: any) {
      commandCounts.set(name, (commandCounts.get(name) ?? 0) + 1);
      commands.set(name, definition);
    },
    registerTool(definition: any) { tools.set(definition.name, definition); },
    async sendUserMessage(message: unknown) { sentMessages.push(String(message)); },
  };
  module.default(pi as any);
  return { commands, tools, commandCounts, sentMessages };
}

function makePlan(test: [string, ...string[]], updates: Partial<SandboxPlanInput> = {}): SandboxPlanInput {
  return {
    request: "Verify the active story's sandbox behavior",
    purpose: "Exercise a purpose-specific feature path in an isolated copy",
    isolation_reason: "The test writes temporary evidence and should not mutate the source workspace",
    expected_outcomes: ["The test command exits zero", "The phase log contains story-specific evidence"],
    test,
    timeout_ms: 5_000,
    port_role: "app",
    preserve_on_failure: true,
    ...updates,
  };
}

function details(result: any): SandboxToolDetails {
  return result.details as SandboxToolDetails;
}

const registration = register();
assert(registration.commandCounts.get("test-sandbox") === 1, "/test-sandbox must be registered exactly once by its owning extension");
assert(registration.tools.has(module.SANDBOX_TOOL_NAME), "agent-callable sandbox tool must be registered");
const tool = registration.tools.get(module.SANDBOX_TOOL_NAME)!;
assert(tool.promptSnippet.includes("feature tests"), "tool should be discoverable for natural-language feature testing");
assert(tool.promptGuidelines.some((line: string) => line.includes("explicitly asks to test behavior in a sandbox")), "tool guidance should cover natural-language requests");
assert(tool.promptGuidelines.some((line: string) => line.includes("Never call") && line.includes("story completion")), "tool guidance should forbid automatic workflow invocation");
assert(tool.executionMode === "sequential", "approval-bearing sandbox tool should execute sequentially");

const command = registration.commands.get("test-sandbox")!;
const commandProject = createTemporaryProject();
try {
  const storyDir = path.join(commandProject.root, ".context", "stories");
  fs.mkdirSync(storyDir, { recursive: true });
  fs.writeFileSync(path.join(storyDir, "story-088.md"), [
    "# Story 088: Sandbox command fixture",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-09-03  ",
    "**Last accessed:** 2026-09-03  ",
    "**Completed:** —",
    "",
    "## Goal",
    "Validate command handoff.",
    "",
    "## Verification",
    "Inspect the generated instruction.",
    "",
    "## Scope — files this story may touch",
    "- scripts/validate-vazir-test-sandbox-command.mts",
    "",
    "## Out of scope — do not touch",
    "- source workspace",
    "",
    "## Dependencies",
    "- —",
    "",
    "## Checklist",
    "- [ ] Validate handoff",
    "",
    "## Issues",
    "",
    "## Completion Summary",
  ].join("\n"));
  await command.handler("test checkpoint restore cancellation", {
    cwd: commandProject.root,
    ui: { notify() {} },
  });
  assert(registration.sentMessages.length === 1, "inline command request should hand off exactly once to the agent");
  assert(registration.sentMessages[0].includes("test checkpoint restore cancellation"), "inline request must survive command handoff");
  assert(registration.sentMessages[0].includes(".context/stories/story-088.md"), "command handoff should identify the active story");
  assert(registration.sentMessages[0].includes(module.SANDBOX_TOOL_NAME), "command handoff should name the agent-callable tool");
  assert(!registration.sentMessages[0].includes("${request}"), "raw interpolation placeholders must not leak into the instruction");
} finally {
  commandProject.cleanup();
}

const prompted = register();
await prompted.commands.get("test-sandbox")!.handler("", {
  cwd: repoRoot,
  ui: { async input() { return "verify no-argument handoff"; }, notify() {} },
});
assert(prompted.sentMessages[0]?.includes("verify no-argument handoff"), "bare command should capture and hand off a natural-language request");

const cancelledNotices: string[] = [];
const cancelledCommand = register();
await cancelledCommand.commands.get("test-sandbox")!.handler("", {
  cwd: repoRoot,
  ui: { async input() { return undefined; }, notify(message: string) { cancelledNotices.push(message); } },
});
assert(cancelledCommand.sentMessages.length === 0, "cancelled request capture must not start an agent turn");
assert(cancelledNotices.some(message => message.includes("cancelled")), "cancelled request capture should be reported");

const preview = module.formatSandboxPlanPreview(makePlan(["node", "script with spaces.mjs", "--flag=value"]));
assert(preview.includes('["node","script with spaces.mjs","--flag=value"]'), "preview must preserve complete command argument boundaries");
assert(preview.includes(module.SANDBOX_SECURITY_BOUNDARY), "preview must disclose the host security boundary");
assert(preview.includes("Expected outcomes"), "preview must include observable evidence expectations");

let malformedRunnerCalls = 0;
const malformedTool = module.createSandboxToolDefinition(async () => { malformedRunnerCalls += 1; throw new Error("must not run"); });
const malformed = await malformedTool.execute("bad", { ...makePlan(["node"]), test: "npm test" as any }, undefined, undefined, { cwd: repoRoot, hasUI: true, ui: { async select() { return "Approve and run this plan"; } } });
assert(details(malformed).outcome === "validation-failed", "shell command strings should produce structured validation failure");
assert(details(malformed).validationErrors.some(issue => issue.includes("not a shell string")), "validation should explain executable/argument arrays");
assert(malformedRunnerCalls === 0, "malformed plans must be rejected before side effects");

const unavailable = await tool.execute("headless", makePlan(["node"]), undefined, undefined, { cwd: repoRoot, hasUI: false, ui: {} });
assert(details(unavailable).outcome === "cancelled" && details(unavailable).approval === "unavailable", "headless tool execution must refuse to bypass approval");

let cancelledRunnerCalls = 0;
const cancellationTool = module.createSandboxToolDefinition(async () => { cancelledRunnerCalls += 1; throw new Error("must not run"); });
const cancelled = await cancellationTool.execute("cancel", makePlan(["node"]), undefined, undefined, { cwd: repoRoot, hasUI: true, ui: { async select() { return "Cancel"; } } });
assert(details(cancelled).outcome === "cancelled" && details(cancelled).approval === "cancelled", "plan cancellation should be structured");
const revise = await cancellationTool.execute("revise", makePlan(["node"]), undefined, undefined, { cwd: repoRoot, hasUI: true, ui: { async select() { return "Revise plan with the agent"; } } });
assert(details(revise).approval === "revise-requested" && revise.content[0].text.includes("ask what should change"), "revision path should hand control back to the agent without running");
assert(cancelledRunnerCalls === 0, "cancel and revise paths must not execute commands");

const successProject = createTemporaryProject();
try {
  const success = await tool.execute("success", makePlan([process.execPath, "-e", "console.log('story-specific evidence')"], { preserve_on_failure: false }), undefined, undefined, {
    cwd: successProject.root,
    hasUI: true,
    ui: { async select(prompt: string) {
      assert(prompt.includes("purpose-specific feature path"), "approval prompt should show the complete purpose-specific plan");
      return "Approve and run this plan";
    } },
  });
  const successDetails = details(success);
  assert(successDetails.outcome === "passed" && successDetails.result?.status === "passed", "approved purpose-specific plan should execute through the shared runner");
  const testPhase = successDetails.result?.phases.find(phase => phase.phase === "test");
  assert(testPhase?.logExcerpt?.includes("story-specific evidence"), "successful cleaned runs should retain bounded phase evidence");
  assert(successDetails.result?.workspacePath === null, "successful disposable workspace should be removed");
  assert(!fs.existsSync(path.join(successProject.root, ".context", "settings", "project.json")), "agent-directed tool must not require or persist test_sandbox configuration");
  assertProjectUnchanged(successProject);
} finally {
  successProject.cleanup();
}

const failureProject = createTemporaryProject();
let preservedWorkspace: string | null = null;
try {
  const failure = await tool.execute("failure", makePlan([process.execPath, "-e", "console.error('purposeful failure evidence'); process.exit(7)"]), undefined, undefined, {
    cwd: failureProject.root,
    hasUI: true,
    ui: { async select() { return "Approve and run this plan"; } },
  });
  const failureDetails = details(failure);
  preservedWorkspace = failureDetails.result?.workspacePath ?? null;
  assert(failureDetails.outcome === "execution-failed" && failureDetails.result?.status === "test-failed", "execution failure should retain the runner's specific status");
  assert(failureDetails.result?.phases.find(phase => phase.phase === "test")?.logExcerpt?.includes("purposeful failure evidence"), "failure result should include observed log evidence");
  assert(Boolean(preservedWorkspace && fs.existsSync(preservedWorkspace)), "failed workspace should be preserved when requested");
  assert((failureDetails.result?.artifactPaths.length ?? 0) > 0 && failureDetails.result?.artifactPaths.every(file => fs.existsSync(file)), "preserved failure should return existing full log paths");
  assertProjectUnchanged(failureProject);
} finally {
  if (preservedWorkspace) fs.rmSync(preservedWorkspace, { recursive: true, force: true });
  failureProject.cleanup();
}

const missingStartProject = createTemporaryProject();
let missingStartWorkspace: string | null = null;
try {
  const missingStart = await tool.execute("missing-start", makePlan([process.execPath, "-e", "require('fs').writeFileSync('test-ran.txt','unexpected')"], {
    start: ["vazir-guaranteed-missing-start-executable"],
  }), undefined, undefined, {
    cwd: missingStartProject.root,
    hasUI: true,
    ui: { async select() { return "Approve and run this plan"; } },
  });
  const missingStartDetails = details(missingStart);
  missingStartWorkspace = missingStartDetails.result?.workspacePath ?? null;
  assert(missingStartDetails.outcome === "execution-failed" && missingStartDetails.result?.status === "startup-failed", "missing startup executable should report startup-failed");
  assert(missingStartDetails.result?.phases.find(phase => phase.phase === "start")?.status === "failed", "spawn error should mark the start phase failed");
  assert(missingStartDetails.result?.phases.find(phase => phase.phase === "test")?.status === "skipped", "startup spawn failure should stop the test phase");
  assert(missingStartDetails.result?.phases.find(phase => phase.phase === "start")?.logExcerpt?.includes("[spawn error]"), "startup spawn error should remain available as phase evidence");
  assert(Boolean(missingStartWorkspace && !fs.existsSync(path.join(missingStartWorkspace, "test-ran.txt"))), "dependent test command must not run after startup spawn failure");
  assertProjectUnchanged(missingStartProject);
} finally {
  if (missingStartWorkspace) fs.rmSync(missingStartWorkspace, { recursive: true, force: true });
  missingStartProject.cleanup();
}

const readinessProject = createTemporaryProject();
let readinessWorkspace: string | null = null;
const readinessController = new AbortController();
const listenerWarnings: string[] = [];
const captureWarning = (warning: Error) => {
  if (warning.name === "MaxListenersExceededWarning") listenerWarnings.push(warning.message);
};
process.on("warning", captureWarning);
try {
  const readiness = await tool.execute("readiness-listeners", makePlan([process.execPath, "-e", "process.exit(0)"], {
    readiness: [process.execPath, "-e", "process.exit(1)"],
    timeout_ms: 3_500,
  }), readinessController.signal, undefined, {
    cwd: readinessProject.root,
    hasUI: true,
    ui: { async select() { return "Approve and run this plan"; } },
  });
  const readinessDetails = details(readiness);
  readinessWorkspace = readinessDetails.result?.workspacePath ?? null;
  assert(readinessDetails.result?.status === "readiness-timeout", "repeated readiness fixture should reach its bounded timeout");
  assert((readinessDetails.result?.phases.find(phase => phase.phase === "readiness")?.attempts ?? 0) > 10, "listener regression should exercise more than Node's default warning threshold");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(listenerWarnings.length === 0, "repeated readiness attempts must not accumulate abort listeners");
  assert(getEventListeners(readinessController.signal, "abort").length === 0, "completed sandbox run must detach its caller abort listener");
  assertProjectUnchanged(readinessProject);
} finally {
  process.off("warning", captureWarning);
  if (readinessWorkspace) fs.rmSync(readinessWorkspace, { recursive: true, force: true });
  readinessProject.cleanup();
}

const workflowFiles = [
  ".pi/extensions/vazir-context/index.ts",
  ".pi/extensions/vazir-context/complete-story.ts",
  ".pi/extensions/vazir-review/index.ts",
  ".pi/extensions/vazir-story/index.ts",
  ".pi/extensions/vazir-tracker/index.ts",
];
for (const file of workflowFiles) {
  const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
  assert(!source.includes("runTestSandbox") && !source.includes(module.SANDBOX_TOOL_NAME), `${file} must not invoke sandbox testing automatically`);
}

console.log("Agent-directed /test-sandbox command and tool validation passed");
