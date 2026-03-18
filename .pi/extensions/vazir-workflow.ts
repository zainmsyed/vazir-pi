import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { countLineDelta, createUnifiedDiff, formatDeltaSummary, resolveReviewTarget } from "../../src/vazir-review.js";
import { diffStore, resetSandboxState } from "./vazir-sandbox.js";

type PlanStatus = "pending" | "active" | "complete";
type StepStatus = "pending" | "in-progress" | "done";

interface PlanStep {
  title: string;
  files: string[];
  status: StepStatus;
}

interface ActivePlan {
  task: string;
  status: PlanStatus;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  steps: PlanStep[];
}

interface LearningRecord {
  timestamp: string;
  text: string;
  seen: number;
}

interface TurnMessage {
  customType: string;
  content: string;
  display: boolean;
}

const PLAN_MARKER = "VAZIR_PLAN";

const contextDir = () => join(process.cwd(), ".context");
const learningsPath = () => join(contextDir(), "learnings", "code-review.md");
const planPath = () => join(contextDir(), "memory", "active-plan.md");
const systemPath = () => join(contextDir(), "memory", "system.md");
const sandboxPath = () => join(contextDir(), "sandbox");
const settingsPath = () => join(contextDir(), "settings", "project.json");

function ensureParent(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function loadSettings(): Record<string, unknown> {
  return existsSync(settingsPath()) ? JSON.parse(readFileSync(settingsPath(), "utf-8")) : {};
}

function getSeenThreshold(): number {
  const value = loadSettings().seen_threshold;
  return typeof value === "number" ? value : 3;
}

function serializePlan(plan: ActivePlan): string {
  const metadata = JSON.stringify(plan, null, 2);
  const body = plan.steps
    .map((step, index) => {
      const checkbox = step.status === "done" ? "x" : " ";
      const status = step.status;
      return [
        `${index + 1}. [${checkbox}] ${step.title}`,
        `   files: ${step.files.join(", ")}`,
        `   status: ${status}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `<!-- ${PLAN_MARKER}`,
    metadata,
    "-->",
    "",
    "# Active Plan",
    "",
    `task: ${plan.task}`,
    `status: ${plan.status}`,
    `current_step: ${plan.currentStep + 1}`,
    "",
    body,
    "",
  ].join("\n");
}

function readActivePlan(): ActivePlan | null {
  if (!existsSync(planPath())) return null;
  const raw = readFileSync(planPath(), "utf-8");
  const match = raw.match(new RegExp(`<!-- ${PLAN_MARKER}\\n([\\s\\S]*?)\\n-->`));
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as ActivePlan;
  } catch {
    return null;
  }
}

function writeActivePlan(plan: ActivePlan) {
  plan.updatedAt = new Date().toISOString();
  ensureParent(planPath());
  writeFileSync(planPath(), serializePlan(plan), "utf-8");
}

export function getPlanWriteConflict(plan: ActivePlan | null): string | null {
  if (!plan) return null;
  if (plan.status === "complete") return null;

  return `An active Vazir plan already exists for \"${plan.task}\". Finish it with /approve, clear it with /plan, or reject the current sandbox before creating a new plan.`;
}

function getActiveTask(): string {
  return readActivePlan()?.task ?? "";
}

function normalizePlanFiles(files: string[]): string[] {
  return files.map((file) => file.trim().replace(/^@/, "")).filter(Boolean);
}

function readLearningRecords(): LearningRecord[] {
  if (!existsSync(learningsPath())) return [];

  const raw = readFileSync(learningsPath(), "utf-8");
  const blocks = raw
    .split(/^---$/m)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const timestamp = block.match(/^timestamp:\s*(.+)$/m)?.[1]?.trim();
      const text = block.match(/^text:\s*([\s\S]*?)\nseen:/m)?.[1]?.trim();
      const seen = Number(block.match(/^seen:\s*(\d+)$/m)?.[1] ?? "0");
      if (!timestamp || !text || !Number.isFinite(seen) || seen < 1) return null;
      return { timestamp, text, seen } satisfies LearningRecord;
    })
    .filter(Boolean) as LearningRecord[];
}

function writeLearningRecords(records: LearningRecord[]) {
  ensureParent(learningsPath());
  const content = [
    "# Code Review Learnings",
    "",
    ...records.flatMap((record) => [
      "---",
      `timestamp: ${record.timestamp}`,
      `text: ${record.text}`,
      `seen: ${record.seen}`,
      "",
    ]),
  ].join("\n");

  writeFileSync(learningsPath(), `${content.trimEnd()}\n`, "utf-8");
}

function upsertLearning(text: string): LearningRecord {
  const records = readLearningRecords();
  const index = records.findIndex((record) => jaroWinkler(record.text.toLowerCase(), text.toLowerCase()) > 0.8);
  const timestamp = new Date().toISOString();

  if (index >= 0) {
    records[index] = {
      ...records[index],
      timestamp,
      seen: records[index].seen + 1,
    };
    writeLearningRecords(records);
    return records[index];
  }

  const created = { timestamp, text, seen: 1 } satisfies LearningRecord;
  records.push(created);
  writeLearningRecords(records);
  return created;
}

function appendToSystemMd(rule: string, source: "manual" | "learned") {
  ensureParent(systemPath());

  const entry = `${rule} (source: ${source})`;
  const existing = existsSync(systemPath()) ? readFileSync(systemPath(), "utf-8") : SYSTEM_MD_TEMPLATE;

  if (existing.includes(entry)) return;

  if (!existing.includes("## Learned Rules")) {
    writeFileSync(systemPath(), `${existing.trimEnd()}\n\n## Learned Rules\n- ${entry}\n`, "utf-8");
    return;
  }

  writeFileSync(
    systemPath(),
    existing.replace("## Learned Rules", `## Learned Rules\n- ${entry}`),
    "utf-8",
  );
}

function approvePendingPlan(): ActivePlan | null {
  const plan = readActivePlan();
  if (!plan || plan.status !== "pending" || plan.steps.length === 0) return null;

  plan.status = "active";
  plan.currentStep = 0;
  plan.steps = plan.steps.map((step, index) => ({
    ...step,
    status: index === 0 ? "in-progress" : "pending",
  }));

  writeActivePlan(plan);
  return plan;
}

function markCurrentStepRejected(): ActivePlan | null {
  const plan = readActivePlan();
  if (!plan || plan.status !== "active" || !plan.steps[plan.currentStep]) return null;

  plan.steps[plan.currentStep].status = "pending";
  writeActivePlan(plan);
  return plan;
}

function advancePlanAfterApproval(): { plan: ActivePlan | null; completedStep: number | null; nextStep: number | null } {
  const plan = readActivePlan();
  if (!plan || plan.status !== "active" || !plan.steps[plan.currentStep]) {
    return { plan, completedStep: null, nextStep: null };
  }

  const completedStep = plan.currentStep + 1;
  plan.steps[plan.currentStep].status = "done";

  if (plan.currentStep + 1 < plan.steps.length) {
    plan.currentStep += 1;
    plan.steps[plan.currentStep].status = "in-progress";
    writeActivePlan(plan);
    return { plan, completedStep, nextStep: plan.currentStep + 1 };
  }

  plan.status = "complete";
  writeActivePlan(plan);
  return { plan, completedStep, nextStep: null };
}

function createApprovalPrompt(stepNumber: number): string {
  return [
    `Plan approved. Execute step ${stepNumber} from .context/memory/active-plan.md.`,
    "Modify only the files listed for that step.",
    "Use vwrite and vedit only, then call vsandbox_complete and stop.",
  ].join(" ");
}

function createRetryPrompt(stepNumber: number, reason?: string): string {
  return [
    `The sandbox for step ${stepNumber} was rejected.`,
    reason ? `Reason: ${reason}` : undefined,
    `Retry step ${stepNumber} from .context/memory/active-plan.md and avoid repeating the same issue.`,
    "Use vwrite and vedit only, then call vsandbox_complete and stop.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function createExecutionTurnMessage(stepNumber: number): TurnMessage {
  return {
    customType: "vazir-plan-execute",
    content: createApprovalPrompt(stepNumber),
    display: true,
  };
}

export function createRetryTurnMessage(stepNumber: number, reason?: string): TurnMessage {
  return {
    customType: "vazir-plan-retry",
    content: createRetryPrompt(stepNumber, reason),
    display: true,
  };
}

function listSandboxFiles(directory: string, prefix = ""): string[] {
  if (!existsSync(directory)) return [];

  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSandboxFiles(absolutePath, relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

function getPendingSandboxFiles(): string[] {
  if (diffStore.size > 0) {
    return [...diffStore.keys()];
  }

  return listSandboxFiles(sandboxPath());
}

function readSandboxDiffs(files: string[]): string {
  return files
    .map((filePath) => readSandboxDiff(filePath))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function describeReviewReadinessFromPlan(plan: ActivePlan | null): string {
  if (!plan) {
    return "No sandbox changes are currently staged.";
  }

  if (plan.status === "pending") {
    return `No sandbox changes are currently staged yet. The current plan is still pending; run /approve to execute step ${plan.currentStep + 1} and stage files in the sandbox.`;
  }

  if (plan.status === "active") {
    return `No sandbox changes are currently staged for step ${plan.currentStep + 1} yet. Wait for the agent to finish staging files with vwrite/vedit, then run /diff or /review.`;
  }

  return "No sandbox changes are currently staged.";
}

function describeReviewReadiness(): string {
  const plan = readActivePlan();
  return describeReviewReadinessFromPlan(plan);
}

function collectSandboxDeltas(files: string[]) {
  return files
    .map((filePath) => {
      const stagedPath = join(sandboxPath(), filePath);
      if (!existsSync(stagedPath)) return null;

      const realPath = join(process.cwd(), filePath);
      const original = existsSync(realPath) ? readFileSync(realPath, "utf-8") : "";
      const staged = readFileSync(stagedPath, "utf-8");
      return { path: filePath, ...countLineDelta(original, staged) };
    })
    .filter(Boolean);
}

function readSandboxDiff(filePath: string): string | null {
  const stagedPath = join(sandboxPath(), filePath);
  if (!existsSync(stagedPath)) return null;

  const realPath = join(process.cwd(), filePath);
  const original = existsSync(realPath) ? readFileSync(realPath, "utf-8") : "";
  const staged = readFileSync(stagedPath, "utf-8");
  return createUnifiedDiff(filePath, original, staged);
}

function isPrintMode(): boolean {
  return process.argv.includes("-p") || process.argv.includes("--print");
}

function emitReviewOutput(pi: ExtensionAPI, customType: string, content: string) {
  pi.sendMessage({
    customType,
    content,
    display: true,
  });

  if (isPrintMode()) {
    process.stdout.write(`${content}\n`);
  }
}

function emitTriggeredTurn(pi: ExtensionAPI, message: TurnMessage) {
  pi.sendMessage(message, { triggerTurn: true });

  if (isPrintMode()) {
    process.stdout.write(`${message.content}\n`);
  }
}

async function resolveRejectReason(args: string, ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1]) {
  const providedReason = args.trim();
  if (providedReason) return providedReason;

  const choice = await ctx.ui.select("Reject sandbox", [
    "Add a reason to help Vazir learn",
    "Skip reason and retry",
    "Cancel",
  ]);

  if (!choice || choice === "Cancel") return null;
  if (choice === "Skip reason and retry") return "";

  const reason = await ctx.ui.input(
    "Why are you rejecting this sandbox?",
    "Example: changed the wrong file or broke the prompt structure",
  );

  return reason?.trim() || "";
}

function snapshotAndApplySandbox(filesToApply: string[]): string[] {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = join(contextDir(), "history", timestamp, "files");
  mkdirSync(snapshotDir, { recursive: true });

  const appliedFiles: string[] = [];

  for (const filePath of filesToApply) {
    const realPath = join(process.cwd(), filePath);
    const stagedPath = join(sandboxPath(), filePath);

    if (!existsSync(stagedPath)) continue;

    if (existsSync(realPath)) {
      const snapshotPath = join(snapshotDir, filePath);
      mkdirSync(dirname(snapshotPath), { recursive: true });
      copyFileSync(realPath, snapshotPath);
    }

    mkdirSync(dirname(realPath), { recursive: true });
    copyFileSync(stagedPath, realPath);
    appliedFiles.push(filePath);
  }

  ensureParent(join(contextDir(), "history", timestamp, "manifest.json"));
  writeFileSync(
    join(contextDir(), "history", timestamp, "manifest.json"),
    JSON.stringify(
      {
        timestamp,
        task: getActiveTask(),
        files: appliedFiles,
      },
      null,
      2,
    ),
    "utf-8",
  );

  rmSync(sandboxPath(), { recursive: true, force: true });
  return appliedFiles;
}

export default function vazirWorkflow(pi: ExtensionAPI) {
  pi.registerTool({
    name: "vplan_write",
    label: "Vazir Plan Write",
    description: "Persist a structured step-by-step plan to .context/memory/active-plan.md.",
    promptSnippet: "Write a structured plan to active-plan.md before waiting for user approval.",
    promptGuidelines: [
      "In step-by-step mode, call vplan_write after presenting the plan.",
      "Keep each step focused and list only the files needed for that step.",
    ],
    parameters: Type.Object({
      task: Type.String({ description: "Short task title" }),
      steps: Type.Array(
        Type.Object({
          title: Type.String({ description: "Short step title" }),
          files: Type.Array(Type.String({ description: "File path relative to project root" }), {
            minItems: 1,
            maxItems: 3,
          }),
        }),
        { minItems: 1, maxItems: 12 },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const existingPlan = readActivePlan();
      const conflict = getPlanWriteConflict(existingPlan);
      if (conflict) {
        ctx.ui.notify(conflict, "warning");
        return {
          content: [{ type: "text" as const, text: conflict }],
          details: { blockedByPlan: existingPlan?.task ?? null },
        };
      }

      const plan: ActivePlan = {
        task: params.task.trim(),
        status: "pending",
        currentStep: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: params.steps.map((step) => ({
          title: step.title.trim(),
          files: normalizePlanFiles(step.files),
          status: "pending",
        })),
      };

      writeActivePlan(plan);
      ctx.ui.setStatus("vazir-plan", `plan pending: ${plan.steps.length} step(s) - run /approve`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Saved plan with ${plan.steps.length} step(s) to .context/memory/active-plan.md`,
          },
        ],
        details: { task: plan.task, stepCount: plan.steps.length },
      };
    },
  });

  pi.registerCommand("approve", {
    description: "Accept a pending plan or apply the current sandbox to the real project",
    handler: async (_args, ctx) => {
      const pendingFiles = getPendingSandboxFiles();

      if (pendingFiles.length === 0) {
        const plan = approvePendingPlan();
        if (!plan) {
          ctx.ui.notify("No pending sandbox or plan to approve.", "info");
          return;
        }

        ctx.ui.notify(`Plan approved. Starting step 1 of ${plan.steps.length}.`, "info");
        emitTriggeredTurn(pi, createExecutionTurnMessage(1));
        return;
      }

      const appliedFiles = snapshotAndApplySandbox(pendingFiles);
      const task = getActiveTask();

      pi.appendEntry("vazir-task", {
        status: "accepted",
        task,
        files: appliedFiles,
        timestamp: new Date().toISOString(),
      });

      resetSandboxState(ctx);

      const { plan, completedStep, nextStep } = advancePlanAfterApproval();
      if (plan?.status === "complete") {
        ctx.ui.setStatus("vazir-plan", "plan complete");
      }

      const fileCount = appliedFiles.length;
      ctx.ui.notify(`Applied ${fileCount} sandbox file(s) to the project.`, "info");

      if (nextStep) {
        ctx.ui.notify(`Continuing with step ${nextStep}.`, "info");
        emitTriggeredTurn(pi, createExecutionTurnMessage(nextStep));
        return;
      }

      if (completedStep) {
        ctx.ui.notify("Plan complete.", "info");
      }
    },
  });

  pi.registerCommand("reject", {
    description: "Reject the current sandbox and optionally capture a reusable learning",
    handler: async (args, ctx) => {
      const pendingFiles = getPendingSandboxFiles();
      if (pendingFiles.length === 0) {
        ctx.ui.notify("No sandbox changes to reject.", "info");
        return;
      }

      const reason = await resolveRejectReason(args || "", ctx);
      if (reason === null) {
        ctx.ui.notify("Reject cancelled.", "info");
        return;
      }

      const trimmedReason = reason.trim();
      const attemptedFiles = pendingFiles;
      const activePlan = markCurrentStepRejected();
      const rejectedStep = activePlan?.currentStep != null ? activePlan.currentStep + 1 : null;

      rmSync(sandboxPath(), { recursive: true, force: true });
      resetSandboxState(ctx);

      pi.appendEntry("vazir-task", {
        status: "rejected",
        task: getActiveTask(),
        reason: trimmedReason || null,
        filesAttempted: attemptedFiles,
        timestamp: new Date().toISOString(),
      });

      if (trimmedReason) {
        const learning = upsertLearning(trimmedReason);
        if (learning.seen >= getSeenThreshold()) {
          const promote = await ctx.ui.confirm(
            "Promote repeated rejection to system rule?",
            `This pattern has been seen ${learning.seen} time(s).`,
            { timeout: 30000 },
          );

          if (promote) {
            const editedRule = await ctx.ui.editor("Edit rule before saving", `- ${learning.text}`);
            if (editedRule?.trim()) {
              appendToSystemMd(editedRule.trim(), "manual");
              ctx.ui.notify("Saved rule to .context/memory/system.md", "info");
            }
          }
        }
      }

      ctx.ui.notify(`Sandbox rejected and cleared (${attemptedFiles.length} file(s)).`, "warning");

      if (rejectedStep) {
        emitTriggeredTurn(pi, createRetryTurnMessage(rejectedStep, trimmedReason || undefined));
      }
    },
  });

  pi.registerCommand("plan", {
    description: "View or edit the current active plan",
    handler: async (_args, ctx) => {
      if (!existsSync(planPath())) {
        ctx.ui.notify("No active plan yet.", "info");
        return;
      }

      const current = readFileSync(planPath(), "utf-8");
      const choice = await ctx.ui.select("Active plan", ["View only", "Edit plan", "Abandon plan"]);

      if (choice === "View only") {
        await ctx.ui.editor("Active plan", current);
        return;
      }

      if (choice === "Edit plan") {
        const edited = await ctx.ui.editor("Edit active plan", current);
        if (edited?.trim()) {
          ensureParent(planPath());
          writeFileSync(planPath(), edited, "utf-8");
          ctx.ui.notify("Updated active plan.", "info");
        }
        return;
      }

      if (choice === "Abandon plan") {
        const confirmed = await ctx.ui.confirm("Abandon current plan?", "This removes .context/memory/active-plan.md.", {
          timeout: 30000,
        });
        if (!confirmed) return;

        rmSync(planPath(), { force: true });
        ctx.ui.setStatus("vazir-plan", undefined);
        ctx.ui.notify("Plan abandoned.", "info");
      }
    },
  });

  const showDelta = async (ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1]) => {
    const pendingFiles = getPendingSandboxFiles();
    if (pendingFiles.length === 0) {
      const message = describeReviewReadiness();
      ctx.ui.notify(message, "info");
      emitReviewOutput(pi, "vazir-review-help", message);
      return;
    }

    const summary = formatDeltaSummary(collectSandboxDeltas(pendingFiles));
    emitReviewOutput(pi, "vazir-delta", summary);
  };

  pi.registerCommand("delta", {
    description: "Summarize the currently staged sandbox changes",
    handler: async (_args, ctx) => {
      await showDelta(ctx);
    },
  });

  pi.registerCommand("diff", {
    description: "Show unified staged diffs for sandbox files",
    handler: async (args, ctx) => {
      const pendingFiles = getPendingSandboxFiles();
      if (pendingFiles.length === 0) {
        const message = describeReviewReadiness();
        ctx.ui.notify(message, "info");
        emitReviewOutput(pi, "vazir-review-help", message);
        return;
      }

      if (!args.trim()) {
        const diffOutput = readSandboxDiffs(pendingFiles);
        emitReviewOutput(pi, "vazir-diff", diffOutput || "No sandbox changes are currently staged.");
        return;
      }

      const target = resolveReviewTarget(args, pendingFiles);
      if (!target.path) {
        const message = target.error || "No sandbox changes to review.";
        ctx.ui.notify(message, "info");
        emitReviewOutput(pi, "vazir-review-help", message);
        return;
      }

      const diff = readSandboxDiff(target.path);
      if (!diff) {
        ctx.ui.notify(`Sandbox file not found: ${target.path}`, "warning");
        return;
      }

      emitReviewOutput(pi, "vazir-diff", diff);
    },
  });

  pi.registerCommand("review", {
    description: "Show a unified diff for one staged sandbox file",
    handler: async (args, ctx) => {
      const pendingFiles = getPendingSandboxFiles();
      const target = resolveReviewTarget(args || "", pendingFiles);

      if (!target.path) {
        const message = pendingFiles.length === 0 ? describeReviewReadiness() : target.error || "No sandbox changes to review.";
        ctx.ui.notify(message, "info");
        emitReviewOutput(pi, "vazir-review-help", message);
        return;
      }

      const diff = readSandboxDiff(target.path);
      if (!diff) {
        ctx.ui.notify(`Sandbox file not found: ${target.path}`, "warning");
        return;
      }

      emitReviewOutput(pi, "vazir-review", diff);
    },
  });

  pi.registerCommand("verify", {
    description: "Run the configured test command from .context/settings/project.json",
    handler: async (_args, ctx) => {
      const settings = loadSettings();
      const testCommand = typeof settings.test_command === "string" ? settings.test_command.trim() : "";

      if (!testCommand) {
        ctx.ui.notify("Set test_command in .context/settings/project.json first.", "warning");
        return;
      }

      ctx.ui.setWorkingMessage(`Running: ${testCommand}`);
      const shell = process.env.SHELL || "/bin/zsh";
      const result = await pi.exec(shell, ["-lc", testCommand], { timeout: 120000 });
      ctx.ui.setWorkingMessage();

      if (result.code === 0) {
        ctx.ui.notify("Tests passed.", "info");
        return;
      }

      const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
      const failureSnippet = combinedOutput
        .split("\n")
        .filter((line) => /fail|error|assert|exception/i.test(line))
        .slice(0, 5)
        .join("\n")
        .trim();

      if (failureSnippet) {
        upsertLearning(`Test failure:\n${failureSnippet}`);
      }

      ctx.ui.notify("Tests failed. Captured failure context in learnings.", "warning");
    },
  });

  pi.registerCommand("vazir-init", {
    description: "Initialize the .context contract and AGENTS.md for this project",
    handler: async (_args, ctx) => {
      const directories = [
        join(contextDir(), "memory"),
        join(contextDir(), "learnings"),
        join(contextDir(), "sandbox"),
        join(contextDir(), "history"),
        join(contextDir(), "prd"),
        join(contextDir(), "technical"),
        join(contextDir(), "templates"),
        join(contextDir(), "settings"),
        join(contextDir(), "chat", "threads"),
      ];

      for (const directory of directories) {
        mkdirSync(directory, { recursive: true });
      }

      const files: Array<[string, string]> = [
        [join(contextDir(), "memory", "context-map.md"), CONTEXT_MAP_TEMPLATE],
        [join(contextDir(), "memory", "system.md"), SYSTEM_MD_TEMPLATE],
        [join(contextDir(), "memory", "index.md"), INDEX_MD_TEMPLATE],
        [join(contextDir(), "learnings", "code-review.md"), LEARNINGS_TEMPLATE],
        [settingsPath(), PROJECT_SETTINGS_TEMPLATE],
        [join(process.cwd(), "AGENTS.md"), AGENTS_MD_TEMPLATE],
      ];

      for (const [filePath, content] of files) {
        if (existsSync(filePath)) continue;
        ensureParent(filePath);
        writeFileSync(filePath, content, "utf-8");
      }

      ctx.ui.notify("Initialized .context and AGENTS.md.", "info");
    },
  });
}

function jaroWinkler(left: string, right: string): number {
  if (left === right) return 1;

  const matchDistance = Math.floor(Math.max(left.length, right.length) / 2) - 1;
  const leftMatches = new Array(left.length).fill(false);
  const rightMatches = new Array(right.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let index = 0; index < left.length; index += 1) {
    const start = Math.max(0, index - matchDistance);
    const end = Math.min(index + matchDistance + 1, right.length);

    for (let other = start; other < end; other += 1) {
      if (rightMatches[other] || left[index] !== right[other]) continue;
      leftMatches[index] = true;
      rightMatches[other] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let rightIndex = 0;
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    if (!leftMatches[leftIndex]) continue;
    while (!rightMatches[rightIndex]) rightIndex += 1;
    if (left[leftIndex] !== right[rightIndex]) transpositions += 1;
    rightIndex += 1;
  }

  const jaro =
    (matches / left.length + matches / right.length + (matches - transpositions / 2) / matches) /
    3;

  let prefix = 0;
  for (let index = 0; index < Math.min(4, left.length, right.length); index += 1) {
    if (left[index] !== right[index]) break;
    prefix += 1;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

const CONTEXT_MAP_TEMPLATE = `# Context Map - [project-name]
last_updated: ${new Date().toISOString().split("T")[0]}

## What this project is
<!-- One sentence describing the project and who it serves. -->

## Where things live
<!-- Key directories and what belongs in them. Keep this short. -->

## Rules that matter most
<!-- 3-5 rules the agent is most likely to violate. -->

## Known fragile areas
<!-- Files or modules that require extra care. -->

## For more detail
- Full rules -> .context/memory/system.md
- Index -> .context/memory/index.md
- Current task -> .context/memory/active-plan.md
`;

const SYSTEM_MD_TEMPLATE = `# System Constitution

## Project
name:
language:
framework:
description:

## Rules

## Learned Rules

## Dependencies

## Known Fragile Areas
`;

const INDEX_MD_TEMPLATE = `# Project Index

Use this file to track important files, modules, commands, and architectural notes that make future prompts cheaper.
`;

const LEARNINGS_TEMPLATE = `# Code Review Learnings
`;

const PROJECT_SETTINGS_TEMPLATE = JSON.stringify(
  {
    project_name: "",
    primary_language: "",
    test_command: "npm run smoke-test",
    onboarded: false,
    history_max_sessions: 100,
    seen_threshold: 3,
    model_tier: "balanced",
  },
  null,
  2,
);

const AGENTS_MD_TEMPLATE = `# [Project Name] - Agent Context

## What this project is
<!-- One paragraph on what the project does, for whom, and why it exists. -->

## Tech stack
<!-- Language, framework, runtime, and important libraries. -->

## Project structure
<!-- Key directories and what belongs in each one. -->

## Rules
<!-- Hard constraints the agent must respect. -->

## Known fragile areas
<!-- Files or modules that need extra care. -->

## How to run
<!-- Build, dev, and test commands. -->
`;