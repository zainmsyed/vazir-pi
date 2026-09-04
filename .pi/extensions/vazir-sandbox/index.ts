/// <reference path="../../../types/node-runtime-ambient.d.ts" />
/// <reference path="../../../types/pi-runtime-ambient.d.ts" />

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";

import {
  assertValidTestSandboxSettings,
  findActiveStory,
  TEST_SANDBOX_DEFAULT_PORT_ROLE,
  TEST_SANDBOX_DEFAULT_TIMEOUT_MS,
  validateTestSandboxSettings,
  type TestSandboxCommand,
  type TestSandboxSettings,
} from "../../lib/vazir-helpers.ts";
import { runTestSandbox, type TestSandboxResult } from "../../lib/vazir-test-sandbox.ts";

export const SANDBOX_TOOL_NAME = "vazir_test_sandbox";
export const SANDBOX_SECURITY_BOUNDARY = "Workspace isolation only: commands run as your user and can access host files, processes, environment values, credentials, and the network. This is not host security isolation.";

export interface SandboxPlanInput {
  request: string;
  purpose: string;
  isolation_reason: string;
  expected_outcomes: string[];
  setup?: TestSandboxCommand | null;
  start?: TestSandboxCommand | null;
  readiness?: TestSandboxCommand | null;
  test: TestSandboxCommand;
  timeout_ms?: number;
  port_role?: string;
  preserve_on_failure?: boolean;
}

export interface SandboxToolDetails {
  outcome: "passed" | "cancelled" | "validation-failed" | "execution-failed";
  approval: "approved" | "cancelled" | "revise-requested" | "unavailable";
  validationErrors: string[];
  plan: SandboxPlanInput | null;
  result: TestSandboxResult | null;
}

type SandboxRunner = (options: { cwd: string; signal?: any; settings: TestSandboxSettings }) => Promise<TestSandboxResult>;

const commandSchema = {
  type: "array",
  minItems: 1,
  items: { type: "string" },
  description: "Executable followed by individual arguments. Never pass a shell command string.",
};

const sandboxPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["request", "purpose", "isolation_reason", "expected_outcomes", "test"],
  properties: {
    request: { type: "string", minLength: 1, description: "The user's natural-language testing request." },
    purpose: { type: "string", minLength: 1, description: "What behavior this plan will verify." },
    isolation_reason: { type: "string", minLength: 1, description: "Why a disposable workspace is appropriate." },
    expected_outcomes: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "Observable evidence that will establish pass or failure." },
    setup: { ...commandSchema, description: "Optional one-time setup executable and arguments." },
    start: { ...commandSchema, description: "Optional long-running service executable and arguments." },
    readiness: { ...commandSchema, description: "Optional readiness probe executable and arguments." },
    test: { ...commandSchema, description: "Required purpose-specific test executable and arguments." },
    timeout_ms: { type: "integer", minimum: 1_000, maximum: 900_000, description: "Per-phase timeout; defaults to 120000." },
    port_role: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$", description: "Allocated loopback port role; defaults to app." },
    preserve_on_failure: { type: "boolean", description: "Preserve failed workspace and full logs; defaults to true." },
  },
};

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateSandboxPlan(plan: unknown): string[] {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["Sandbox plan must be an object."];
  const input = plan as Partial<SandboxPlanInput> & Record<string, unknown>;
  const issues: string[] = [];
  if (!nonEmpty(input.request)) issues.push("request must describe the user's test request.");
  if (!nonEmpty(input.purpose)) issues.push("purpose must describe the behavior under test.");
  if (!nonEmpty(input.isolation_reason)) issues.push("isolation_reason must explain why workspace isolation is appropriate.");
  if (!Array.isArray(input.expected_outcomes) || input.expected_outcomes.length === 0 || input.expected_outcomes.some(item => !nonEmpty(item))) {
    issues.push("expected_outcomes must contain at least one non-empty observable outcome.");
  }

  const rawSettings = {
    setup: input.setup ?? null,
    start: input.start ?? null,
    readiness: input.readiness ?? null,
    test: input.test,
    timeout_ms: input.timeout_ms ?? TEST_SANDBOX_DEFAULT_TIMEOUT_MS,
    port_role: input.port_role ?? TEST_SANDBOX_DEFAULT_PORT_ROLE,
    preserve_on_failure: input.preserve_on_failure ?? true,
  };
  issues.push(...validateTestSandboxSettings(rawSettings));
  return [...new Set(issues)];
}

export function sandboxSettingsFromPlan(plan: SandboxPlanInput): TestSandboxSettings {
  return assertValidTestSandboxSettings({
    setup: plan.setup ?? null,
    start: plan.start ?? null,
    readiness: plan.readiness ?? null,
    test: plan.test,
    timeout_ms: plan.timeout_ms ?? TEST_SANDBOX_DEFAULT_TIMEOUT_MS,
    port_role: plan.port_role ?? TEST_SANDBOX_DEFAULT_PORT_ROLE,
    preserve_on_failure: plan.preserve_on_failure ?? true,
  });
}

function commandText(command: TestSandboxCommand | null | undefined): string {
  return command ? JSON.stringify(command) : "skipped";
}

export function formatSandboxPlanPreview(plan: SandboxPlanInput): string {
  return [
    "Sandbox test plan",
    `Request: ${plan.request}`,
    `Purpose: ${plan.purpose}`,
    `Why isolate: ${plan.isolation_reason}`,
    "Expected outcomes:",
    ...plan.expected_outcomes.map(item => `- ${item}`),
    "Phases (structured executable/argument arrays; shell parsing disabled):",
    `- setup: ${commandText(plan.setup)}`,
    `- start: ${commandText(plan.start)}`,
    `- readiness: ${commandText(plan.readiness)}`,
    `- test: ${commandText(plan.test)}`,
    `- timeout_ms: ${plan.timeout_ms ?? TEST_SANDBOX_DEFAULT_TIMEOUT_MS}`,
    `- port_role: ${plan.port_role ?? TEST_SANDBOX_DEFAULT_PORT_ROLE}`,
    `- preserve_on_failure: ${plan.preserve_on_failure ?? true}`,
    "",
    `Security boundary: ${SANDBOX_SECURITY_BOUNDARY}`,
    "The source workspace will not be modified or receive exported sandbox changes.",
  ].join("\n");
}

export function buildTestSandboxInstruction(request: string, cwd: string): string {
  const activeStory = findActiveStory(cwd);
  const storyPath = activeStory ? path.relative(cwd, activeStory.file) : "none";
  return [
    `The user requested sandbox testing: ${JSON.stringify(request)}`,
    `Active story: ${storyPath}`,
    "Inspect the project, active story, relevant changes, scripts, and existing tests before choosing commands.",
    "Decide whether disposable workspace isolation is appropriate for this request.",
    `If appropriate, build one purpose-specific structured plan and call ${SANDBOX_TOOL_NAME}. The tool itself previews every command and asks for explicit approval, so do not ask for separate confirmation first.`,
    "Use executable-and-argument arrays only; never use shell strings or shell parsing. Include observable expected outcomes.",
    "After the tool returns, report only observed phase evidence, log excerpts or preserved log paths, and the preserved failure workspace when present.",
    "If workspace isolation is not appropriate or cannot validate the requested behavior, explain why and propose the right validation approach; do not silently execute outside the sandbox.",
    "This workflow is opt-in and recommended before /complete-story, but it is not a completion gate.",
  ].join("\n");
}

function toolResult(details: SandboxToolDetails, message: string) {
  return {
    content: [{ type: "text", text: `${message}\n\nStructured sandbox evidence:\n${JSON.stringify(details, null, 2)}` }],
    details,
  };
}

export function createSandboxToolDefinition(runner: SandboxRunner = runTestSandbox as SandboxRunner) {
  return {
    name: SANDBOX_TOOL_NAME,
    label: "Test Sandbox",
    description: "Run an agent-authored, purpose-specific test plan in a disposable workspace only after showing the complete plan and receiving explicit user approval. Use for natural-language requests to test new features safely away from the source workspace. Commands must be executable/argument arrays, never shell strings. Returns phase evidence, bounded log excerpts, full preserved log paths on failure, and cleanup state.",
    promptSnippet: "Plan and run user-requested feature tests in a disposable workspace with approval",
    promptGuidelines: [
      `Use ${SANDBOX_TOOL_NAME} when the user explicitly asks to test behavior in a sandbox or invokes /test-sandbox; inspect the project and active story before authoring the plan.`,
      `Never call ${SANDBOX_TOOL_NAME} automatically from implementation, review, fix, or story completion; never replace executable/argument arrays with shell strings.`,
    ],
    parameters: sandboxPlanSchema,
    executionMode: "sequential",
    async execute(_toolCallId: string, params: SandboxPlanInput, signal: any, _onUpdate: any, ctx: any) {
      const validationErrors = validateSandboxPlan(params);
      if (validationErrors.length > 0) {
        return toolResult({ outcome: "validation-failed", approval: "unavailable", validationErrors, plan: null, result: null }, "Sandbox plan rejected before preview or execution.");
      }

      if (!ctx.hasUI || typeof ctx.ui?.select !== "function") {
        return toolResult({ outcome: "cancelled", approval: "unavailable", validationErrors: [], plan: params, result: null }, "Sandbox plan was not run because explicit approval UI is unavailable.");
      }

      const choice = await ctx.ui.select(formatSandboxPlanPreview(params), [
        "Approve and run this plan",
        "Revise plan with the agent",
        "Cancel",
      ]);
      if (choice !== "Approve and run this plan") {
        const revise = choice === "Revise plan with the agent";
        return toolResult({ outcome: "cancelled", approval: revise ? "revise-requested" : "cancelled", validationErrors: [], plan: params, result: null }, revise
          ? "No commands ran. The user requested plan revisions; ask what should change before submitting another plan."
          : "No commands ran. The user cancelled sandbox testing.");
      }

      try {
        const result = await runner({ cwd: ctx.cwd, signal, settings: sandboxSettingsFromPlan(params) });
        const outcome = result.ok ? "passed" : "execution-failed";
        return toolResult({ outcome, approval: "approved", validationErrors: [], plan: params, result }, result.ok
          ? "Sandbox plan passed. Report the observed phase evidence below."
          : "Sandbox execution failed. Report the failing phase, evidence, logs, and preserved workspace below.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolResult({ outcome: "execution-failed", approval: "approved", validationErrors: [], plan: params, result: null }, `Sandbox runner threw before returning a result: ${message}`);
      }
    },
  };
}

export default function vazirSandbox(pi: ExtensionAPI): void {
  pi.registerTool(createSandboxToolDefinition());

  pi.registerCommand("test-sandbox", {
    description: "Ask the agent to plan and run a natural-language test request in a disposable workspace",
    handler: async (args: string, ctx: any) => {
      let request = args.trim();
      if (!request && typeof ctx.ui?.input === "function") {
        request = (await ctx.ui.input("What behavior should the agent test in the sandbox?", "Describe a feature, story, or scenario"))?.trim() ?? "";
      }
      if (!request) {
        ctx.ui?.notify?.("/test-sandbox cancelled — no testing request was provided.", "info");
        return;
      }
      await pi.sendUserMessage(buildTestSandboxInstruction(request, ctx.cwd));
    },
  });
}
