/// <reference path="../../../types/node-runtime-ambient.d.ts" />

import * as fs from "fs";
import * as path from "path";
import { refreshVcsState } from "../vazir-tracker/index.ts";
import { showMarkdownViewer } from "../../lib/vazir-ui.ts";
import {
  compareStoriesByRecencyDesc,
  listStories,
  parseStoryFrontmatter,
  readIfExists,
  todayDate,
  updateStoryFrontmatter,
} from "../../lib/vazir-helpers.ts";
import {
  assessStoryCompletionReadiness,
  appendFallowToComplaintsLog,
  buildLearnedRuleCloseoutInstruction,
  commitStoryCloseChanges,
  contextPersistenceStatus,
  formatReviewFindingSummary,
  formatReviewRecommendedFixSummary,
  learnedRuleCloseoutDraftPath,
  miniConsolidateCandidatesPath,
  parseMiniConsolidateCandidates,
  parseReviewFrontmatter,
  prepareLearnedRulesForConsolidation,
  promoteRulesToSystemMd,
  readLearnedRuleCloseoutDraft,
  readStorySection,
  reviewsDir,
  reviewFallowFindingsFromFile,
  reviewFindingsFromFile,
  reviewOtherFixesFromFile,
  reviewRecommendedFixesFromFile,
  reviewRecommendedFixesFromFindings,
  shouldEnforceContextCommit,
  type LearnedRuleCloseoutDraft,
  type LearnedRuleCloseoutDraftReadResult,
  type ReviewDraft,
  type ReviewFindingSummary,
  type ReviewRecommendedFix,
  type StoryCompletionReadiness,
} from "./helpers.ts";

export type CompleteStoryCloseIntent = "close" | "close-commit";

export type PendingCompleteStoryRequest = {
  storyFile: string;
  reviewFile?: string;
  reviewCloseoutReady?: boolean;
  closeIntent?: CompleteStoryCloseIntent;
  learnedRuleCloseoutFile?: string;
};

type PersistedCompleteStoryCloseoutState = PendingCompleteStoryRequest;

export type CompleteStoryPhase =
  | "idle"
  | "readiness-review"
  | "ready-for-closeout"
  | "review-in-progress"
  | "review-closeout"
  | "learned-rule-closeout";

export type CompleteStoryPhaseSnapshot = {
  phase: CompleteStoryPhase;
  storyFile?: string;
  reviewFile?: string;
  closeIntent?: CompleteStoryCloseIntent;
};

export const COMPLETE_STORY_PHASE_HANDOFFS = [
  {
    phase: "readiness-review",
    entry: "complete-story command stores a pending story without a review file when checklist, issues, or summary blockers remain.",
    handoff: "turn_end re-checks readiness after the agent updates the story file.",
  },
  {
    phase: "ready-for-closeout",
    entry: "the story has no readiness blockers and no active review or learned-rule draft.",
    handoff: "turn_end can start a story-scoped review or continue directly to learned-rule closeout.",
  },
  {
    phase: "review-in-progress",
    entry: "a story-scoped complete-story review exists and the review file is not yet complete.",
    handoff: "turn_end waits for the review to finish; the same phase also covers remediation reruns after the review is reset to in-progress.",
  },
  {
    phase: "review-closeout",
    entry: "the review file is complete or the pending request explicitly allows the closeout prompt to resume.",
    handoff: "turn_end prompts for open review findings, which can branch to remediation or learned-rule closeout.",
  },
  {
    phase: "learned-rule-closeout",
    entry: "the pending request points at a learned-rule draft and already knows the final close intent.",
    handoff: "agent_end promotes or skips learned rules, then final story completion applies the close intent.",
  },
] as const;

export type ReviewCloseoutTarget = "story" | "review";

export interface CompleteStoryControllerDependencies {
  pendingRequests: Map<string, PendingCompleteStoryRequest>;
  sendInternalAgentMessage: (ctx: any, content: string, details: Record<string, unknown>) => void;
  startReviewFlow: (
    ctx: any,
    options: { focus: string; scope?: "story" | "whole-codebase"; storyLabel?: string; trigger?: string },
  ) => Promise<ReviewDraft>;
  markStoryCloseoutApproved?: (ctx: any, storyPath: string) => void;
}

function completeStoryCloseoutStatePath(cwd: string, storyFile: string): string {
  const storyLabel = path.basename(storyFile, ".md");
  const draftPath = learnedRuleCloseoutDraftPath(cwd, storyLabel);
  return path.join(path.dirname(draftPath), `${storyLabel}-complete-story-closeout.json`);
}

function persistCompleteStoryCloseoutState(cwd: string, pendingRequest: PendingCompleteStoryRequest): void {
  const statePath = completeStoryCloseoutStatePath(cwd, pendingRequest.storyFile);
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(pendingRequest, null, 2));
  } catch {
    /* ignore persistence failures */
  }
}

function readPersistedCompleteStoryCloseoutState(cwd: string, storyFile: string): PersistedCompleteStoryCloseoutState | null {
  const statePath = completeStoryCloseoutStatePath(cwd, storyFile);
  if (!fs.existsSync(statePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (!raw || typeof raw !== "object") return null;

    const storyFileValue = typeof (raw as { storyFile?: unknown }).storyFile === "string"
      ? String((raw as { storyFile: unknown }).storyFile).trim()
      : "";
    if (!storyFileValue || storyFileValue !== storyFile) return null;

    const reviewFileValue = typeof (raw as { reviewFile?: unknown }).reviewFile === "string"
      ? String((raw as { reviewFile: unknown }).reviewFile).trim()
      : undefined;
    const reviewCloseoutReadyValue = typeof (raw as { reviewCloseoutReady?: unknown }).reviewCloseoutReady === "boolean"
      ? Boolean((raw as { reviewCloseoutReady: unknown }).reviewCloseoutReady)
      : undefined;
    const closeIntentRaw = typeof (raw as { closeIntent?: unknown }).closeIntent === "string"
      ? String((raw as { closeIntent: unknown }).closeIntent).trim()
      : undefined;
    const closeIntentValue = closeIntentRaw === "close" || closeIntentRaw === "close-commit"
      ? closeIntentRaw
      : undefined;
    const learnedRuleCloseoutFileValue = typeof (raw as { learnedRuleCloseoutFile?: unknown }).learnedRuleCloseoutFile === "string"
      ? String((raw as { learnedRuleCloseoutFile: unknown }).learnedRuleCloseoutFile).trim()
      : undefined;

    return {
      storyFile: storyFileValue,
      reviewFile: reviewFileValue,
      reviewCloseoutReady: reviewCloseoutReadyValue,
      closeIntent: closeIntentValue,
      learnedRuleCloseoutFile: learnedRuleCloseoutFileValue,
    };
  } catch {
    return null;
  }
}

function clearPersistedCompleteStoryCloseoutState(cwd: string, storyFile: string): void {
  const statePath = completeStoryCloseoutStatePath(cwd, storyFile);
  try {
    if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
  } catch {
    /* ignore cleanup failures */
  }
}

function setPendingCompleteStoryRequest(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  pendingRequest: PendingCompleteStoryRequest,
): PendingCompleteStoryRequest {
  pendingRequests.set(cwd, pendingRequest);
  persistCompleteStoryCloseoutState(cwd, pendingRequest);
  return pendingRequest;
}

function samePendingCompleteStoryRequest(
  left: PendingCompleteStoryRequest | null | undefined,
  right: PendingCompleteStoryRequest | null | undefined,
): boolean {
  if (!left || !right) return left == null && right == null;
  return left.storyFile === right.storyFile
    && left.reviewFile === right.reviewFile
    && left.reviewCloseoutReady === right.reviewCloseoutReady
    && left.closeIntent === right.closeIntent
    && left.learnedRuleCloseoutFile === right.learnedRuleCloseoutFile;
}

function listPersistedCompleteStoryCloseoutStates(cwd: string): PersistedCompleteStoryCloseoutState[] {
  const dir = reviewsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const states: PersistedCompleteStoryCloseoutState[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith("-complete-story-closeout.json")) continue;
    const statePath = path.join(dir, name);
    try {
      const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (!raw || typeof raw !== "object") continue;
      const storyFile = typeof (raw as { storyFile?: unknown }).storyFile === "string"
        ? String((raw as { storyFile: unknown }).storyFile).trim()
        : "";
      if (!storyFile || !fs.existsSync(storyFile)) continue;
      const restored = readPersistedCompleteStoryCloseoutState(cwd, storyFile);
      if (restored) states.push(restored);
    } catch {
      /* ignore malformed restored state */
    }
  }

  return states.sort((a, b) => {
    const aTime = fs.existsSync(completeStoryCloseoutStatePath(cwd, a.storyFile)) ? fs.statSync(completeStoryCloseoutStatePath(cwd, a.storyFile)).mtimeMs : 0;
    const bTime = fs.existsSync(completeStoryCloseoutStatePath(cwd, b.storyFile)) ? fs.statSync(completeStoryCloseoutStatePath(cwd, b.storyFile)).mtimeMs : 0;
    return bTime - aTime;
  });
}

function resolvePendingCompleteStoryRequest(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile?: string,
): PendingCompleteStoryRequest | null {
  const existing = pendingRequests.get(cwd) ?? null;
  const targetStoryFile = storyFile ?? existing?.storyFile;

  if (targetStoryFile) {
    const persisted = readPersistedCompleteStoryCloseoutState(cwd, targetStoryFile);
    if (persisted) {
      if (!samePendingCompleteStoryRequest(existing, persisted)) pendingRequests.set(cwd, persisted);
      return persisted;
    }

    if (existing?.storyFile === targetStoryFile) pendingRequests.delete(cwd);
    if (storyFile) return null;
  }

  const restored = listPersistedCompleteStoryCloseoutStates(cwd)[0] ?? null;
  if (restored) {
    if (!samePendingCompleteStoryRequest(existing, restored)) pendingRequests.set(cwd, restored);
    return restored;
  }

  if (existing) pendingRequests.delete(cwd);
  return null;
}

export function deriveCompleteStoryPhase(input: {
  pendingRequest?: PendingCompleteStoryRequest | null;
  readinessBlocked?: boolean;
  reviewStatus?: string | null;
}): CompleteStoryPhaseSnapshot {
  const pendingRequest = input.pendingRequest ?? null;
  if (!pendingRequest) {
    return { phase: input.readinessBlocked ? "readiness-review" : "idle" };
  }

  if (pendingRequest.learnedRuleCloseoutFile) {
    return {
      phase: "learned-rule-closeout",
      storyFile: pendingRequest.storyFile,
      reviewFile: pendingRequest.reviewFile,
      closeIntent: pendingRequest.closeIntent,
    };
  }

  if (!pendingRequest.reviewFile) {
    return {
      phase: input.readinessBlocked ? "readiness-review" : "ready-for-closeout",
      storyFile: pendingRequest.storyFile,
    };
  }

  if (pendingRequest.reviewCloseoutReady || input.reviewStatus === "complete") {
    return {
      phase: "review-closeout",
      storyFile: pendingRequest.storyFile,
      reviewFile: pendingRequest.reviewFile,
    };
  }

  return {
    phase: "review-in-progress",
    storyFile: pendingRequest.storyFile,
    reviewFile: pendingRequest.reviewFile,
  };
}

export function enterCompleteStoryReadinessReview(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile: string,
): PendingCompleteStoryRequest {
  return setPendingCompleteStoryRequest(pendingRequests, cwd, { storyFile });
}

export function enterCompleteStoryReview(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile: string,
  reviewFile: string,
): PendingCompleteStoryRequest {
  return setPendingCompleteStoryRequest(pendingRequests, cwd, {
    storyFile,
    reviewFile,
    reviewCloseoutReady: false,
  });
}

export function markCompleteStoryReviewCloseoutReady(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile: string,
  reviewFile: string,
): PendingCompleteStoryRequest {
  return setPendingCompleteStoryRequest(pendingRequests, cwd, {
    storyFile,
    reviewFile,
    reviewCloseoutReady: true,
  });
}

function readMarkdownSection(content: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`(^|\\n)## ${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |\\n---\\s*$|$)`));
  return match?.[2]?.trim() ?? "";
}

function reviewCompletionSummaryLooksFinalized(content: string): boolean {
  const summary = readMarkdownSection(content, "Completion Summary");
  if (!summary) return false;
  const normalized = summary.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized !== "reopened for remediation — completion summary will be rewritten after fixes."
    && normalized !== "reopened for remediation - completion summary will be rewritten after fixes."
    && normalized !== "still in progress."
    && normalized !== "[summarize the review outcome. if there are no findings, say so directly and note any residual verification gaps.]";
}

function finalizeReviewFileAfterRemediation(reviewFile: string): boolean {
  const content = fs.existsSync(reviewFile) ? fs.readFileSync(reviewFile, "utf-8") : "";
  if (!content) return false;

  const frontmatter = parseReviewFrontmatter(reviewFile);
  if (!frontmatter || frontmatter.status === "complete") return false;

  const recommendedFixes = reviewRecommendedFixesFromFile(reviewFile);
  const otherFixes = reviewOtherFixesFromFile(reviewFile);
  const unresolvedFixes = [...recommendedFixes, ...otherFixes].filter(fix => !fix.checked);
  if (unresolvedFixes.length > 0) return false;
  if (!reviewCompletionSummaryLooksFinalized(content)) return false;

  let updated = content.replace(/^\*\*Status:\*\*\s*.+$/m, "**Status:** complete");
  updated = updated.replace(/^\*\*Completed:\*\*\s*.+$/m, `**Completed:** ${todayDate()}`);
  updated = updated.replace(/^- \[ \] Write the completion summary and mark the review complete$/m, "- [x] Write the completion summary and mark the review complete");
  if (updated !== content) {
    fs.writeFileSync(reviewFile, updated);
    return true;
  }
  return false;
}

export function resetReviewFileForRemediation(reviewFile: string): void {
  const content = fs.existsSync(reviewFile) ? fs.readFileSync(reviewFile, "utf-8") : "";
  if (!content) return;

  let updated = content.replace(/^\*\*Status:\*\*\s*.+$/m, "**Status:** in-progress");
  updated = updated.replace(/^\*\*Completed:\*\*\s*.+$/m, "**Completed:** —");
  updated = updated.replace(/(\n## Completion Summary\n)[\s\S]*?(?=\n## |\n---\s*$|$)/, "$1Reopened for remediation — completion summary will be rewritten after fixes.\n");
  updated = updated.replace(/^- \[x\] Write the completion summary and mark the review complete$/m, "- [ ] Write the completion summary and mark the review complete");
  if (updated !== content) {
    fs.writeFileSync(reviewFile, updated);
  }
}

export function resetCompleteStoryReviewForRemediation(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile: string,
  reviewFile: string,
): PendingCompleteStoryRequest {
  const next = enterCompleteStoryReview(pendingRequests, cwd, storyFile, reviewFile);
  resetReviewFileForRemediation(reviewFile);
  return next;
}

export function enterLearnedRuleCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  options: {
    storyFile: string;
    draftFile: string;
    closeIntent: CompleteStoryCloseIntent;
    reviewFile?: string;
  },
): PendingCompleteStoryRequest {
  return setPendingCompleteStoryRequest(pendingRequests, cwd, {
    storyFile: options.storyFile,
    reviewFile: options.reviewFile,
    reviewCloseoutReady: true,
    closeIntent: options.closeIntent,
    learnedRuleCloseoutFile: options.draftFile,
  });
}

export function applyCompleteStoryClosure(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
  storyFile: string,
): string {
  pendingRequests.delete(cwd);
  clearPersistedCompleteStoryCloseoutState(cwd, storyFile);
  updateStoryFrontmatter(storyFile, {
    status: "complete",
    lastAccessed: todayDate(),
    completed: todayDate(),
  });
  return path.basename(storyFile, ".md");
}

export function clearCompleteStoryCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  cwd: string,
): void {
  pendingRequests.delete(cwd);
}

export function isHighPrioritySeverity(severity: string): boolean {
  const normalized = severity.trim().toLowerCase();
  return normalized === "critical" || normalized === "high";
}

export function listCompletionBlockers(readiness: StoryCompletionReadiness): string[] {
  const blockers: string[] = [];
  if (readiness.uncheckedChecklistItems.length > 0) {
    blockers.push(`${readiness.uncheckedChecklistItems.length} unchecked checklist item${readiness.uncheckedChecklistItems.length === 1 ? "" : "s"}`);
  }
  if (readiness.openIssueStatuses.length > 0) {
    blockers.push(`${readiness.openIssueStatuses.length} open issue${readiness.openIssueStatuses.length === 1 ? "" : "s"} (${[...new Set(readiness.openIssueStatuses)].join(", ")})`);
  }
  if (!readiness.hasCompletionSummary) {
    blockers.push("missing completion summary");
  }
  return blockers;
}

export function buildCompleteStoryInstruction(storyLabel: string, readiness: StoryCompletionReadiness): string {
  const blockers = listCompletionBlockers(readiness);

  return [
    `Review .context/stories/${storyLabel}.md for completion readiness.`,
    "",
    `Current blockers: ${blockers.length > 0 ? blockers.join("; ") : "none"}.`,
    "",
    "Your job:",
    "1. Review the story checklist, issues, and completion summary.",
    "2. Resolve or clearly explain any remaining blockers inside the story file.",
    "3. If the implementation is done but the summary is weak or missing, write a useful Completion Summary.",
    "4. Do not mark the story complete yet. Vazir will handle the final closeout prompt.",
    "5. Report whether the story is ready and what, if anything, still blocks completion.",
  ].join("\n");
}

export function buildReviewCloseoutPromptLines(options: {
  findings: ReviewFindingSummary[];
  pendingFixes: ReviewRecommendedFix[];
  pendingHighPriorityFixes: ReviewRecommendedFix[];
  pendingLowerPriorityFixes: ReviewRecommendedFix[];
  targetNoun: ReviewCloseoutTarget;
}): string[] {
  const { findings, pendingFixes, pendingHighPriorityFixes, pendingLowerPriorityFixes, targetNoun } = options;

  if (findings.length === 0 && pendingFixes.length === 0) {
    return ["Review complete. No findings.", `Close the ${targetNoun} now?`];
  }

  const lines = [`Review complete. ${findings.length} finding${findings.length === 1 ? "" : "s"}:`];
  lines.push(...findings.map(finding => formatReviewFindingSummary(finding)));
  lines.push("");

  if (pendingFixes.length === 0) {
    lines.push("All recommended fixes in the review file are marked complete.");
    lines.push(`Close the ${targetNoun} now or inspect the review document first?`);
    return lines;
  }

  const fixSummaryParts: string[] = [];
  if (pendingHighPriorityFixes.length > 0) fixSummaryParts.push(`${pendingHighPriorityFixes.length} high-priority`);
  if (pendingLowerPriorityFixes.length > 0) fixSummaryParts.push(`${pendingLowerPriorityFixes.length} other`);

  lines.push(`Pending recommended fixes: ${fixSummaryParts.join(", ")}.`);
  lines.push(...pendingFixes.slice(0, 6).map(fix => formatReviewRecommendedFixSummary(fix)));
  if (pendingFixes.length > 6) {
    lines.push(`- ... ${pendingFixes.length - 6} more pending item${pendingFixes.length - 6 === 1 ? "" : "s"}`);
  }
  lines.push("");

  if (pendingHighPriorityFixes.length > 0) {
    lines.push("What should Vazir do next?");
    return lines;
  }

  lines.push("High-priority items are done. Do you want to fix the remaining items before closing?");
  return lines;
}

export function buildReviewCloseoutOptions(options: {
  pendingFixCount: number;
  pendingHighPriorityFixCount: number;
  targetNoun: ReviewCloseoutTarget;
}): string[] {
  const { pendingFixCount, pendingHighPriorityFixCount, targetNoun } = options;
  const choices: string[] = [];

  if (pendingHighPriorityFixCount > 0) {
    choices.push(`Keep ${targetNoun} open and fix high-priority recommended items`);
  }
  if (pendingFixCount > 0) {
    choices.push(
      pendingHighPriorityFixCount > 0
        ? `Keep ${targetNoun} open and fix all recommended items`
        : `Keep ${targetNoun} open and fix remaining recommended items`,
    );
  }
  choices.push("Open review document");
  choices.push(pendingFixCount > 0 ? `Close ${targetNoun} now (remaining items noted)` : `Close ${targetNoun} now`);
  if (targetNoun === "story") choices.push(`Close ${targetNoun} and commit all`);
  choices.push("Not yet, keep working");
  return choices;
}

export async function viewReviewDocument(ctx: any, reviewFilePath: string, reviewLabel: string): Promise<void> {
  const content = readIfExists(reviewFilePath).trimEnd();
  if (!content) {
    ctx.ui.notify(`No content found in ${reviewLabel}`, "info");
    return;
  }

  if (typeof ctx.ui.custom !== "function") {
    ctx.ui.notify(`Review viewer is unavailable in this mode. Open ${reviewLabel} from the workspace if needed.`, "info");
    return;
  }

  await showMarkdownViewer(ctx, path.basename(reviewFilePath), content);
}

export async function promptReviewFindingsCloseout(
  ctx: any,
  reviewFilePath: string,
  findings: ReviewFindingSummary[],
  targetNoun: ReviewCloseoutTarget = "story",
): Promise<"fix-high" | "fix-all" | "close-commit" | "close" | "not-yet" | null> {
  const reviewLabel = path.relative(ctx.cwd, reviewFilePath).replace(/\\/g, "/");
  const recommendedFixes = reviewRecommendedFixesFromFile(reviewFilePath);
  const otherFixes = reviewOtherFixesFromFile(reviewFilePath);
  const trackedFixes = (recommendedFixes.length > 0 || otherFixes.length > 0)
    ? [...recommendedFixes, ...otherFixes]
    : reviewRecommendedFixesFromFindings(findings);
  const pendingFixes = trackedFixes.filter(fix => !fix.checked);
  const pendingHighPriorityFixes = pendingFixes.filter(fix => isHighPrioritySeverity(fix.severity));
  const pendingLowerPriorityFixes = pendingFixes.filter(fix => !isHighPrioritySeverity(fix.severity));

  if (!ctx.hasUI) {
    ctx.ui.notify(
      pendingFixes.length > 0
        ? `Review ${reviewLabel} is complete with pending recommended fixes. Re-run ${targetNoun === "story" ? "/complete-story" : "/review"} in an interactive session to decide whether to fix them or close it out.`
        : `Review ${reviewLabel} is complete. Re-run ${targetNoun === "story" ? "/complete-story" : "/review"} in an interactive session to close it out.`,
      "info",
    );
    return null;
  }

  while (true) {
    const promptLines = buildReviewCloseoutPromptLines({
      findings,
      pendingFixes,
      pendingHighPriorityFixes,
      pendingLowerPriorityFixes,
      targetNoun,
    });
    const choice = await ctx.ui.select(
      promptLines.join("\n"),
      buildReviewCloseoutOptions({
        pendingFixCount: pendingFixes.length,
        pendingHighPriorityFixCount: pendingHighPriorityFixes.length,
        targetNoun,
      }),
    );

    if (choice == null) return null;
    if (choice === "Open review document") {
      await viewReviewDocument(ctx, reviewFilePath, reviewLabel);
      continue;
    }
    if (choice === `Keep ${targetNoun} open and fix high-priority recommended items`) return "fix-high";
    if (choice === `Keep ${targetNoun} open and fix all recommended items` || choice === `Keep ${targetNoun} open and fix remaining recommended items`) {
      return "fix-all";
    }
    if (choice === `Close ${targetNoun} and commit all`) return "close-commit";
    if (choice.includes(`Close ${targetNoun} now`)) return "close";
    return "not-yet";
  }
}

export function buildReviewRemediationInstruction(
  cwd: string,
  reviewFilePath: string,
  mode: "high" | "all",
  targetedFixes: ReviewRecommendedFix[],
  targetNoun: ReviewCloseoutTarget,
): string {
  const reviewLabel = path.relative(cwd, reviewFilePath).replace(/\\/g, "/");
  const scopeLabel = mode === "high" ? "high-priority unchecked recommended items only" : "all unchecked recommended items";
  const listedItems = targetedFixes.length > 0
    ? targetedFixes.map(fix => formatReviewRecommendedFixSummary(fix))
    : ["- No tracked checklist items yet — derive them from the findings and add them before fixing."];

  return [
    `Review ${reviewLabel} and fix ${scopeLabel} before the ${targetNoun} closeout continues.`,
    "",
    "Targeted recommended fixes:",
    ...listedItems,
    "",
    "Requirements:",
    "1. Treat `## Recommended Fixes` and `## Other Fixes` in the review file as the remediation source of truth.",
    "2. If the review file does not yet have one checklist item per finding, add the missing items first using `- [ ] severity — action`.",
    mode === "high"
      ? "3. Only work the unchecked items marked `high` or `critical`. Leave lower-priority items unchecked."
      : "3. Work all unchecked recommended fix items that remain in the review file.",
    "4. Mark an item `[x]` only after the code or docs change is complete and you have verified what you can.",
    "5. If the targeted remediation is complete, rewrite the review Completion Summary and finish the review by setting `**Status:** complete` and `**Completed:**` to today's date.",
    "6. Leave unresolved or deferred items unchecked and explain blockers briefly in the review file's Completion Summary.",
    targetNoun === "story"
      ? "7. Do not mark the story complete. Vazir will return to the closeout choices after the review is complete."
      : "7. Do not close any attached story here. Vazir will return to the review closeout choices after the review is complete.",
  ].join("\n");
}

export function recordCompletedReviewFallowFindings(cwd: string, reviewFilePath: string, fallbackStoryLabel = ""): void {
  const reviewFrontmatter = parseReviewFrontmatter(reviewFilePath);
  if (reviewFrontmatter?.status !== "complete") return;

  const storyLabel = reviewFrontmatter.story !== "—" ? reviewFrontmatter.story : fallbackStoryLabel;
  if (!storyLabel || storyLabel === "—") return;

  const fallowFindings = reviewFallowFindingsFromFile(reviewFilePath);
  if (fallowFindings.length === 0) return;
  appendFallowToComplaintsLog(cwd, storyLabel, fallowFindings);
}

export function completeStoryNow(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  ctx: any,
  storyPath: string,
): void {
  const storyLabel = applyCompleteStoryClosure(pendingRequests, ctx.cwd, storyPath);
  ctx.ui.notify(`${storyLabel} marked complete`, "info");
}

function normalizeCommitLine(text: string): string {
  return text
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*+]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMeaningfulSectionLine(section: string): string {
  for (const rawLine of section.split("\n")) {
    const cleaned = normalizeCommitLine(rawLine);
    if (!cleaned || cleaned === "—") continue;
    return cleaned;
  }
  return "";
}

function firstCheckedChecklistItem(storyContent: string): string {
  const checklist = readStorySection(storyContent, "Checklist");
  for (const rawLine of checklist.split("\n")) {
    const match = rawLine.match(/^\s*-\s*\[x\]\s+(.+)$/i);
    if (!match) continue;
    const cleaned = normalizeCommitLine(match[1]);
    if (cleaned) return cleaned;
  }
  return "";
}

function isWeakCommitSummary(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === ""
    || normalized === "done"
    || normalized === "done."
    || normalized === "completed"
    || normalized === "completed."
    || normalized === "implemented"
    || normalized === "implemented."
    || normalized === "finished"
    || normalized === "finished.";
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 3));
  const boundary = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf(","), sliced.lastIndexOf(";"));
  // Only truncate at a word boundary if it's reasonably close to the limit;
  // otherwise keep the full sliced text so we don't throw away too much.
  const minKeep = Math.max(24, Math.floor(maxLength * 0.75));
  const trimmed = (boundary >= minKeep ? sliced.slice(0, boundary) : sliced).trimEnd();
  return `${trimmed}...`;
}

function pickCommitSummary(storyPath: string): string {
  const storyContent = readIfExists(storyPath);
  const summaryLine = firstMeaningfulSectionLine(readStorySection(storyContent, "Completion Summary"));
  if (summaryLine && !isWeakCommitSummary(summaryLine)) return summaryLine;

  const checklistItem = firstCheckedChecklistItem(storyContent);
  if (checklistItem) return checklistItem;

  const goalLine = firstMeaningfulSectionLine(readStorySection(storyContent, "Goal"));
  if (goalLine) return goalLine;

  return "Completed closeout work";
}

export function buildCompleteStoryCommitMessage(storyPath: string): string {
  const storyFrontmatter = parseStoryFrontmatter(storyPath);
  const storyLabel = path.basename(storyPath, ".md");
  const rawTitle = normalizeCommitLine(storyFrontmatter?.title || "");
  const title = truncateAtWord(rawTitle || storyLabel, 42);
  const summary = truncateAtWord(pickCommitSummary(storyPath), 72);
  return rawTitle && rawTitle.toLowerCase() !== storyLabel.toLowerCase()
    ? `complete ${storyLabel} ${title}: ${summary}`
    : `complete ${storyLabel}: ${summary}`;
}

export function completeStoryAndCommitNow(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  ctx: any,
  storyPath: string,
): void {
  const commitMessage = buildCompleteStoryCommitMessage(storyPath);
  completeStoryNow(pendingRequests, ctx, storyPath);
  const commitResult = commitStoryCloseChanges(ctx.cwd, commitMessage);
  ctx.ui.notify(commitResult.summary, commitResult.ok ? "info" : "warning");
  refreshVcsState(ctx.cwd);
}

export async function resolveContextPersistenceChoice(
  ctx: any,
  storyPath: string,
  closeIntent: "close" | "close-commit",
): Promise<"close" | "close-commit" | null> {
  if (closeIntent === "close-commit") return "close-commit";

  const persistence = contextPersistenceStatus(ctx.cwd);
  if (!shouldEnforceContextCommit(ctx.cwd)) {
    ctx.ui.notify(`${path.basename(storyPath, ".md")} closeout: ${persistence.summary}`, "info");
    return "close";
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(`${path.basename(storyPath, ".md")} closeout paused: ${persistence.summary} Re-run interactively to commit now or explicitly close without committing .context.`, "warning");
    return null;
  }

  const choice = await ctx.ui.select(
    `${path.basename(storyPath, ".md")} has pending project-brain updates. ${persistence.summary}`,
    [
      "Commit .context changes and close story",
      "Close story without committing .context changes",
      "Cancel",
    ],
  );

  if (choice == null || choice === "Cancel") return null;
  if (choice === "Commit .context changes and close story") return "close-commit";

  ctx.ui.notify(`${path.basename(storyPath, ".md")} closeout: user explicitly declined the pending .context commit.`, "warning");
  return "close";
}

async function promptReadyCloseout(ctx: any, storyPath: string): Promise<"review" | "close-commit" | "close" | "not-yet" | null> {
  const storyLabel = path.basename(storyPath, ".md");

  if (!ctx.hasUI) {
    ctx.ui.notify(`${storyLabel} is ready to complete. Re-run /complete-story in an interactive session to close it out.`, "info");
    return null;
  }

  const choice = await ctx.ui.select(`${storyLabel} is ready. What would you like to do?`, [
    "Start code review before closing",
    "Close story now",
    "Close story and commit all",
    "Not yet, keep working",
  ]);

  if (choice == null) return null;
  if (choice === "Start code review before closing") return "review";
  if (choice === "Close story now") return "close";
  if (choice === "Close story and commit all") return "close-commit";
  return "not-yet";
}

function startLearnedRuleCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  deps: CompleteStoryControllerDependencies,
  ctx: any,
  storyPath: string,
  closeIntent: "close" | "close-commit",
  reviewFilePath?: string,
): void {
  const storyLabel = path.basename(storyPath, ".md");
  const draftPath = learnedRuleCloseoutDraftPath(ctx.cwd, storyLabel);
  try {
    if (fs.existsSync(draftPath)) fs.rmSync(draftPath, { force: true });
  } catch {
    /* ignore stale draft cleanup failures */
  }

  enterLearnedRuleCloseout(pendingRequests, ctx.cwd, {
    storyFile: storyPath,
    reviewFile: reviewFilePath,
    closeIntent,
    draftFile: draftPath,
  });
  deps.sendInternalAgentMessage(ctx, buildLearnedRuleCloseoutInstruction(ctx.cwd, storyLabel, reviewFilePath), {
    purpose: "learned-rule-closeout",
    story: storyLabel,
    reviewFile: reviewFilePath ? path.basename(reviewFilePath) : undefined,
  });
}

async function resumePersistedLearnedRuleCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  deps: CompleteStoryControllerDependencies,
  ctx: any,
  storyPath: string,
): Promise<boolean> {
  const storyLabel = path.basename(storyPath, ".md");
  const draftPath = learnedRuleCloseoutDraftPath(ctx.cwd, storyLabel);
  const existingDraft = readLearnedRuleCloseoutDraft(draftPath);
  if (existingDraft.kind !== "valid") return false;

  const previousPending = pendingRequests.get(ctx.cwd);
  const resumedCloseIntent = previousPending?.closeIntent ?? "close";
  const resumedReviewFile = previousPending?.storyFile === storyPath ? previousPending.reviewFile : undefined;
  enterLearnedRuleCloseout(pendingRequests, ctx.cwd, {
    storyFile: storyPath,
    reviewFile: resumedReviewFile,
    closeIntent: resumedCloseIntent,
    draftFile: draftPath,
  });
  await finishLearnedRuleCloseout(pendingRequests, deps, ctx, pendingRequests.get(ctx.cwd)!);
  return true;
}

async function promptLearnedRulePromotion(
  ctx: any,
  storyLabel: string,
  draft: LearnedRuleCloseoutDraft,
): Promise<number[] | "skip" | null> {
  if (!ctx.hasUI) return "skip";

  const candidateLines = draft.candidates.map((candidate, index) => {
    const sourceLabel = candidate.sources.length > 0 ? `Sources: ${candidate.sources.join(", ")}` : "Sources: —";
    return [`${index + 1}. ${candidate.text}`, `   Confidence: ${candidate.confidence}`, `   ${sourceLabel}`].join("\n");
  });

  const prompt = [
    `Before closing ${storyLabel}, Vazir found these possible learned rules.`,
    "",
    "Candidates",
    "----------",
    ...candidateLines,
    draft.note ? "" : "",
    draft.note ? `Note: ${draft.note}` : "",
  ].filter(Boolean).join("\n");

  const summarizeRuleCandidateForOption = (text: string): string => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= 56) return normalized;
    return `${normalized.slice(0, 53).trimEnd()}...`;
  };

  const options = [
    "Promote all candidates",
    ...draft.candidates.map((candidate, index) => `Promote candidate ${index + 1} — ${summarizeRuleCandidateForOption(candidate.text)}`),
    "Skip for now",
  ];

  if (typeof ctx.ui.select === "function") {
    const choice = await ctx.ui.select(prompt, options);
    if (choice == null) return null;
    if (choice === options[0]) return draft.candidates.map((_candidate, index) => index);
    if (choice === "Skip for now") return "skip";

    const pickedIndex = options.indexOf(choice) - 1;
    return pickedIndex >= 0 ? [pickedIndex] : null;
  }

  if (typeof ctx.ui.input === "function") {
    while (true) {
      const response = (await ctx.ui.input(
        `${prompt}\n\nReply with \`all\`, \`skip\`, or candidate numbers like \`1\` or \`1,2\`.`,
        draft.candidates.length > 1 ? "Type all, skip, or numbers like 1 or 1,2" : "Type all, skip, or 1",
      ))?.trim().toLowerCase();
      if (response == null || response === "") return null;
      if (response === "skip" || response === "skip all") return "skip";
      if (response === "all" || response === "both" || response === "promote all" || response === "promote both") {
        return draft.candidates.map((_candidate, index) => index);
      }

      const picks = response
        .split(/[\s,]+/)
        .map(part => parseInt(part, 10))
        .filter(n => Number.isInteger(n) && n >= 1 && n <= draft.candidates.length);
      const uniquePicks = Array.from(new Set(picks.map(n => n - 1)));
      if (uniquePicks.length > 0) return uniquePicks;

      ctx.ui.notify("Enter `all`, `skip`, or candidate numbers like `1` or `1,2`.", "warning");
    }
  }

  return "skip";
}

function finalizeStoryCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  deps: CompleteStoryControllerDependencies,
  ctx: any,
  storyPath: string,
  closeIntent: "close" | "close-commit",
): void {
  deps.markStoryCloseoutApproved?.(ctx, storyPath);
  if (closeIntent === "close-commit") {
    completeStoryAndCommitNow(pendingRequests, ctx, storyPath);
  } else {
    completeStoryNow(pendingRequests, ctx, storyPath);
  }
}

async function finishLearnedRuleCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  deps: CompleteStoryControllerDependencies,
  ctx: any,
  pendingCompleteStory: PendingCompleteStoryRequest,
): Promise<boolean> {
  const storyPath = pendingCompleteStory.storyFile;
  const storyLabel = path.basename(storyPath, ".md");
  const closeIntent = pendingCompleteStory.closeIntent ?? "close";
  const draftPath = pendingCompleteStory.learnedRuleCloseoutFile ?? learnedRuleCloseoutDraftPath(ctx.cwd, storyLabel);
  const draftResult: LearnedRuleCloseoutDraftReadResult = readLearnedRuleCloseoutDraft(draftPath);
  let draft: LearnedRuleCloseoutDraft;

  // TODO: Remove legacy mini-consolidate candidates-file fallback after 2026-06-15.
  if (draftResult.kind === "missing" || draftResult.kind === "invalid") {
    const legacyCandidatesPath = miniConsolidateCandidatesPath(ctx.cwd, storyLabel);
    const legacyCandidates = fs.existsSync(legacyCandidatesPath) ? parseMiniConsolidateCandidates(legacyCandidatesPath) : [];
    if (fs.existsSync(legacyCandidatesPath)) {
      try {
        fs.rmSync(legacyCandidatesPath, { force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }

    if (legacyCandidates.length > 0 || draftResult.kind === "missing") {
      draft = {
        note: legacyCandidates.length === 0 ? "No candidates found." : "",
        candidates: legacyCandidates.map(candidate => ({
          text: candidate.text,
          confidence: candidate.confidence,
          sources: [],
          rationale: "",
        })),
      };
    } else {
      const reason = `the learned-rule draft was invalid (${draftResult.error})`;
      ctx.ui.notify(`Could not finish learned-rule closeout for ${storyLabel}: ${reason}. The story is still open. Re-run /complete-story to try again.`, "warning");
      try {
        if (fs.existsSync(draftPath)) fs.rmSync(draftPath, { force: true });
      } catch {
        /* ignore cleanup errors */
      }
      return true;
    }
  } else {
    draft = draftResult.draft;
  }

  if (draft.candidates.length === 0) {
    try {
      if (fs.existsSync(draftPath)) fs.rmSync(draftPath, { force: true });
    } catch {
      /* ignore cleanup errors */
    }
    ctx.ui.notify(draft.note || `No rule suggestions were found for ${storyLabel}.`, "info");
    finalizeStoryCloseout(pendingRequests, deps, ctx, storyPath, closeIntent);
    return true;
  }

  const selection = await promptLearnedRulePromotion(ctx, storyLabel, draft);
  if (selection == null) return true;

  const selectedCandidates = selection === "skip" ? [] : selection.map(index => draft.candidates[index]).filter(Boolean);
  const storyContent = readIfExists(storyPath);
  const issuesSection = readStorySection(storyContent, "Issues");
  const storyKind: "failure" | "success" | undefined = issuesSection.trim().length > 0 ? "failure" : "success";
  try {
    if (fs.existsSync(draftPath)) fs.rmSync(draftPath, { force: true });
  } catch {
    /* ignore cleanup errors */
  }

  if (selection === "skip") {
    ctx.ui.notify(`Mini-consolidate skipped for ${storyLabel}.`, "info");
  } else {
    const promotion = promoteRulesToSystemMd(
      ctx.cwd,
      selectedCandidates.map(candidate => ({
        text: candidate.text,
        sourceStories: [storyLabel],
        kind: storyKind,
      })),
    );
    prepareLearnedRulesForConsolidation(ctx.cwd);

    const notes: string[] = [];
    if (promotion.promoted.length > 0) notes.push(`Promoted ${promotion.promoted.length} rule(s) to system.md.`);
    if (promotion.skipped.length > 0) notes.push(`Skipped ${promotion.skipped.length} duplicate rule(s).`);
    if (notes.length === 0) notes.push(`No new rules were saved for ${storyLabel}.`);
    ctx.ui.notify(notes.join(" "), "info");
  }

  finalizeStoryCloseout(pendingRequests, deps, ctx, storyPath, closeIntent);
  return true;
}

async function promptInProgressCompleteStoryReview(
  ctx: any,
  reviewFilePath: string,
  storyLabel: string,
): Promise<"stay" | null> {
  const reviewLabel = path.relative(ctx.cwd, reviewFilePath).replace(/\\/g, "/");

  if (!ctx.hasUI) {
    ctx.ui.notify(
      `Review ${reviewLabel} for ${storyLabel} is still in progress. Re-run /complete-story in an interactive session to open the review or keep the story open while the review finishes.`,
      "info",
    );
    return "stay";
  }

  while (true) {
    const choice = await ctx.ui.select(
      [
        `${storyLabel} is waiting on ${reviewLabel}.`,
        "",
        "The review document is still marked in progress, so Vazir cannot show fix/close choices yet.",
        "Open the review document, or keep the story open and stay in review until it is marked complete.",
      ].join("\n"),
      ["Open review document", "Keep story open and stay in review"],
    );

    if (choice == null) return null;
    if (choice === "Open review document") {
      await viewReviewDocument(ctx, reviewFilePath, reviewLabel);
      continue;
    }
    return "stay";
  }
}

async function processCompleteStoryReviewCloseout(
  pendingRequests: Map<string, PendingCompleteStoryRequest>,
  deps: CompleteStoryControllerDependencies,
  ctx: any,
  cwd: string,
  storyPath: string,
  reviewFilePath: string,
): Promise<boolean> {
  const storyLabel = path.basename(storyPath, ".md");
  finalizeReviewFileAfterRemediation(reviewFilePath);
  const reviewFrontmatter = parseReviewFrontmatter(reviewFilePath);
  const pendingRequest = pendingRequests.get(cwd);
  const canResumeCloseout = pendingRequest?.reviewFile === reviewFilePath && pendingRequest.reviewCloseoutReady === true;
  if (reviewFrontmatter?.status !== "complete" && !canResumeCloseout) {
    return false;
  }

  markCompleteStoryReviewCloseoutReady(pendingRequests, cwd, storyPath, reviewFilePath);

  recordCompletedReviewFallowFindings(cwd, reviewFilePath, storyLabel);
  const findings = reviewFindingsFromFile(reviewFilePath);
  const recommendedFixes = reviewRecommendedFixesFromFile(reviewFilePath);
  const otherFixes = reviewOtherFixesFromFile(reviewFilePath);
  const trackedFixes = (recommendedFixes.length > 0 || otherFixes.length > 0)
    ? [...recommendedFixes, ...otherFixes]
    : reviewRecommendedFixesFromFindings(findings);
  const decision = await promptReviewFindingsCloseout(ctx, reviewFilePath, findings, "story");
  if (decision == null) return true;

  if (decision === "fix-high" || decision === "fix-all") {
    const targetedFixes = trackedFixes.filter(fix => !fix.checked && (decision === "fix-all" || isHighPrioritySeverity(fix.severity)));
    resetCompleteStoryReviewForRemediation(pendingRequests, cwd, storyPath, reviewFilePath);
    deps.sendInternalAgentMessage(
      ctx,
      buildReviewRemediationInstruction(ctx.cwd, reviewFilePath, decision === "fix-high" ? "high" : "all", targetedFixes, "story"),
      {
        purpose: "review-remediation",
        story: storyLabel,
        reviewFile: path.basename(reviewFilePath),
        mode: decision,
      },
    );
    return true;
  }

  if (decision === "not-yet") return true;

  const closeChoice = await resolveContextPersistenceChoice(ctx, storyPath, decision);
  if (closeChoice == null) return true;

  startLearnedRuleCloseout(pendingRequests, deps, ctx, storyPath, closeChoice, reviewFilePath);
  return true;
}

async function resolveStoryForCompletion(ctx: any, cwd: string): Promise<string | null> {
  const inProgressStories = listStories(cwd)
    .filter(story => story.status === "in-progress")
    .sort(compareStoriesByRecencyDesc);

  if (inProgressStories.length === 0) {
    ctx.ui.notify("No in-progress story is available to complete.", "info");
    return null;
  }
  if (inProgressStories.length === 1) return inProgressStories[0].file;

  const labels = inProgressStories.map(story => `${path.basename(story.file, ".md")} — last accessed ${story.lastAccessed}`);
  const choice = await ctx.ui.select("Which in-progress story do you want to complete?", [...labels, "Cancel"]);
  if (choice == null || choice === "Cancel") return null;

  const selected = inProgressStories[labels.indexOf(choice)];
  return selected?.file ?? null;
}

export function createCompleteStoryController(deps: CompleteStoryControllerDependencies) {
  async function handleCommand(ctx: any): Promise<void> {
    const cwd = ctx.cwd;
    const storyPath = await resolveStoryForCompletion(ctx, cwd);
    if (!storyPath) return;

    const storyLabel = path.basename(storyPath, ".md");
    const readiness = assessStoryCompletionReadiness(storyPath);
    const blockers = listCompletionBlockers(readiness);

    if (blockers.length > 0) {
      enterCompleteStoryReadinessReview(deps.pendingRequests, cwd, storyPath);
      ctx.ui.notify(
        `${storyLabel} is not ready to complete yet. Vazir will review the remaining checklist, issues, and summary first.`,
        "warning",
      );
      deps.sendInternalAgentMessage(ctx, buildCompleteStoryInstruction(storyLabel, readiness), {
        purpose: "complete-story-readiness",
        story: storyLabel,
      });
      return;
    }

    const persistedPending = resolvePendingCompleteStoryRequest(deps.pendingRequests, cwd, storyPath);
    if (persistedPending?.reviewFile) {
      const reviewStatus = parseReviewFrontmatter(persistedPending.reviewFile)?.status ?? null;
      const resumedPhase = deriveCompleteStoryPhase({
        pendingRequest: persistedPending,
        readinessBlocked: false,
        reviewStatus,
      });

      if (resumedPhase.phase === "review-closeout") {
        await processCompleteStoryReviewCloseout(deps.pendingRequests, deps, ctx, cwd, storyPath, persistedPending.reviewFile);
        return;
      }

      if (resumedPhase.phase === "review-in-progress") {
        await promptInProgressCompleteStoryReview(ctx, persistedPending.reviewFile, storyLabel);
        return;
      }
    }

    if (await resumePersistedLearnedRuleCloseout(deps.pendingRequests, deps, ctx, storyPath)) {
      return;
    }

    const choice = await promptReadyCloseout(ctx, storyPath);
    if (choice == null || choice === "not-yet") return;

    if (choice === "review") {
      const review = await deps.startReviewFlow(ctx, {
        focus: `${storyLabel} completion review`,
        scope: "story",
        storyLabel,
        trigger: "complete-story",
      });
      enterCompleteStoryReview(deps.pendingRequests, cwd, storyPath, review.filePath);
      return;
    }

    const closeChoice = await resolveContextPersistenceChoice(ctx, storyPath, choice);
    if (closeChoice == null) return;

    startLearnedRuleCloseout(deps.pendingRequests, deps, ctx, storyPath, closeChoice);
  }

  async function handleTurnEnd(ctx: any): Promise<boolean> {
    const cwd = ctx.cwd;
    if (ctx.hasPendingMessages?.()) return false;

    const pendingCompleteStory = resolvePendingCompleteStoryRequest(deps.pendingRequests, cwd);
    if (!pendingCompleteStory) return false;

    const readiness = assessStoryCompletionReadiness(pendingCompleteStory.storyFile);
    const closeoutPhase = deriveCompleteStoryPhase({
      pendingRequest: pendingCompleteStory,
      readinessBlocked: listCompletionBlockers(readiness).length > 0,
      reviewStatus: pendingCompleteStory.reviewFile ? parseReviewFrontmatter(pendingCompleteStory.reviewFile)?.status : null,
    });

    if (closeoutPhase.phase === "review-closeout" && pendingCompleteStory.reviewFile) {
      const handled = await processCompleteStoryReviewCloseout(
        deps.pendingRequests,
        deps,
        ctx,
        cwd,
        pendingCompleteStory.storyFile,
        pendingCompleteStory.reviewFile,
      );
      if (handled) return true;
    }

    if (closeoutPhase.phase === "review-in-progress" && pendingCompleteStory.reviewFile) {
      if (finalizeReviewFileAfterRemediation(pendingCompleteStory.reviewFile)) {
        return await handleTurnEnd(ctx);
      }
      return true;
    }

    if (closeoutPhase.phase === "readiness-review") return true;

    if (closeoutPhase.phase === "ready-for-closeout") {
      const storyLabel = path.basename(pendingCompleteStory.storyFile, ".md");
      const decision = await promptReadyCloseout(ctx, pendingCompleteStory.storyFile);
      if (decision == null || decision === "not-yet") return true;

      if (decision === "review") {
        const review = await deps.startReviewFlow(ctx, {
          focus: `${storyLabel} completion review`,
          scope: "story",
          storyLabel,
          trigger: "complete-story",
        });
        enterCompleteStoryReview(deps.pendingRequests, cwd, pendingCompleteStory.storyFile, review.filePath);
        return true;
      }

      const closeChoice = await resolveContextPersistenceChoice(ctx, pendingCompleteStory.storyFile, decision);
      if (closeChoice == null) return true;

      startLearnedRuleCloseout(deps.pendingRequests, deps, ctx, pendingCompleteStory.storyFile, closeChoice);
      return true;
    }

    return false;
  }

  async function handleAgentEnd(ctx: any): Promise<boolean> {
    const cwd = ctx.cwd;
    const pendingCompleteStory = resolvePendingCompleteStoryRequest(deps.pendingRequests, cwd);
    if (!pendingCompleteStory) return false;

    if (pendingCompleteStory.learnedRuleCloseoutFile) {
      await finishLearnedRuleCloseout(deps.pendingRequests, deps, ctx, pendingCompleteStory);
      return true;
    }

    if (!pendingCompleteStory.reviewFile) return false;
    if (pendingCompleteStory.reviewCloseoutReady) return false;

    finalizeReviewFileAfterRemediation(pendingCompleteStory.reviewFile);
    const reviewFrontmatter = parseReviewFrontmatter(pendingCompleteStory.reviewFile);
    if (reviewFrontmatter?.status === "complete") return false;

    await promptInProgressCompleteStoryReview(ctx, pendingCompleteStory.reviewFile, path.basename(pendingCompleteStory.storyFile, ".md"));
    return true;
  }

  return {
    handleCommand,
    handleTurnEnd,
    handleAgentEnd,
  };
}
