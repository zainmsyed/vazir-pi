import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildConsolidationInstruction,
  buildLearnedRuleCloseoutInstruction,
  buildMiniConsolidateInstruction,
  buildReviewInstruction,
  createReviewDraft,
  reviewFileTemplate,
  updateRuleConfidence,
} from "../.pi/extensions/vazir-context/helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-fallow-signal-"));
fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
fs.writeFileSync(path.join(cwd, ".context", "complaints-log.md"), [
  "# Complaints Log",
  "",
  "2026-05-16T12:00:00Z | story-001 | [fallow] normalize duplicate fallow complaints per story before promotion | status: noted",
  "",
].join("\n"));
fs.writeFileSync(
  path.join(cwd, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "",
    "## Learned Rules",
    "- normalize duplicate fallow complaints per story before promotion <!-- confidence: medium -->",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(cwd, ".context", "stories", "story-001.md"),
  [
    "# Story 001: Example",
    "",
    "**Status:** complete  ",
    "**Created:** 2026-05-16  ",
    "**Last accessed:** 2026-05-16  ",
    "**Completed:** 2026-05-16",
    "",
    "---",
    "",
    "## Goal",
    "Example goal.",
    "",
    "## Verification",
    "Example verification.",
    "",
    "## Scope — files this story may touch",
    "- src/example.ts",
    "",
    "## Out of scope — do not touch",
    "- src/other.ts",
    "",
    "## Dependencies",
    "- —",
    "",
    "---",
    "",
    "## Checklist",
    "- [x] Example task",
    "",
    "---",
    "",
    "## Issues",
    "",
    "---",
    "",
    "## Completion Summary",
    "Done.",
    "",
  ].join("\n"),
);

const consolidateInstruction = buildConsolidationInstruction(cwd);
assert(consolidateInstruction.includes("[fallow]"), "/consolidate instruction should explicitly mention [fallow] complaints as valid signals");
assert(consolidateInstruction.includes("/fix"), "/consolidate instruction should continue to mention /fix complaints as valid signals");
assert(consolidateInstruction.includes("story completion summaries"), "/consolidate instruction should mention reading story completion summaries");
assert(consolidateInstruction.includes("decisions.md"), "/consolidate instruction should mention reading decisions.md");
assert(consolidateInstruction.includes("From failures"), "/consolidate instruction should mention From failures subsection");
assert(consolidateInstruction.includes("From successes"), "/consolidate instruction should mention From successes subsection");
assert(consolidateInstruction.includes("confidence:"), "/consolidate instruction should mention preserving confidence annotations");

const reviewPath = path.join(cwd, ".context", "reviews", "review-20260516-125356.md");
const miniInstruction = buildMiniConsolidateInstruction(cwd, "story-001", reviewPath);
assert(miniInstruction.includes(".context/complaints-log.md"), "mini-consolidate instruction should read complaints-log.md");
assert(miniInstruction.includes("[fallow]"), "mini-consolidate instruction should explicitly treat [fallow] entries as valid signals");
assert(miniInstruction.includes("story-001"), "mini-consolidate instruction should scope complaints-log reading to the active story");
assert(miniInstruction.includes(".context/reviews/review-20260516-125356.md"), "mini-consolidate instruction should render the concrete review basename when a review file is provided");
assert(!miniInstruction.includes("${path.basename(reviewFilePath)}"), "mini-consolidate instruction should not leak raw template placeholders");

const learnedRuleInstruction = buildLearnedRuleCloseoutInstruction(cwd, "story-001");
assert(learnedRuleInstruction.includes(".context/complaints-log.md"), "learned-rule closeout instruction should read complaints-log.md");
assert(learnedRuleInstruction.includes("[fallow]"), "learned-rule closeout instruction should explicitly treat [fallow] entries as valid signals");
assert(learnedRuleInstruction.includes("story-001"), "learned-rule closeout instruction should scope complaints-log reading to the active story");

const reviewTemplate = reviewFileTemplate(
  "2026-05-16T12:45:00Z",
  "story",
  "story-001",
  "fallow signal-source validation",
  "manual",
  "fallow audit — pass",
  false,
  false,
  [],
);
assert(reviewTemplate.includes("## Fallow Findings"), "review template should include a Fallow Findings section placeholder");
assert(reviewTemplate.includes("- No Fallow findings."), "review template should include a default No Fallow findings line");

const reviewTemplateWithFindings = reviewFileTemplate(
  "2026-05-16T12:45:00Z",
  "story",
  "story-001",
  "fallow signal-source validation",
  "manual",
  "fallow audit — warn",
  false,
  false,
  [{ rule: "dead-code", location: "src/example.ts:1", summary: "dead export" }],
);
assert(reviewTemplateWithFindings.includes("- [dead-code] src/example.ts:1 — dead export"), "review template should pre-populate Fallow findings when provided");

const reviewInstruction = buildReviewInstruction(
  {
    created: "2026-05-16T12:45:00Z",
    focus: "fallow signal-source validation",
    scope: "story",
    storyLabel: "story-001",
    trigger: "manual",
    staticAnalysis: "fallow audit — pass",
    fileName: "review-20260516-124500.md",
    filePath: path.join(cwd, ".context", "reviews", "review-20260516-124500.md"),
  },
  "## Static Analysis Findings (Fallow)\n- [dead-code] src/example.ts:1 — dead export",
  cwd,
);
assert(reviewInstruction.includes("## Fallow Findings"), "review instruction should mention the Fallow Findings section");
assert(reviewInstruction.includes("pre-populated by Vazir"), "review instruction should tell the agent that Fallow findings are pre-populated");

const reviewInstructionNoFallow = buildReviewInstruction(
  {
    created: "2026-05-16T12:45:00Z",
    focus: "fallow signal-source validation",
    scope: "story",
    storyLabel: "story-001",
    trigger: "manual",
    staticAnalysis: "not run (fallow unavailable)",
    fileName: "review-20260516-124501.md",
    filePath: path.join(cwd, ".context", "reviews", "review-20260516-124501.md"),
  },
  "",
  cwd,
);
assert(reviewInstructionNoFallow.includes("## Fallow Findings"), "review instruction without fallow should still mention the Fallow Findings section");
assert(reviewInstructionNoFallow.includes("pre-populated by Vazir"), "review instruction without fallow should still tell the agent that Fallow findings are pre-populated");

const confidenceChanged = updateRuleConfidence(cwd);
assert(confidenceChanged, "fallow complaints-log signal should be able to influence a downstream learned-rule consumer");
const updatedSystemMd = fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
assert(updatedSystemMd.includes("normalize duplicate fallow complaints per story before promotion <!-- confidence: high -->"), "complaints-log-only fallow signal should promote matching learned-rule confidence to high");

// ── Test: createReviewDraft with fallowFindings writes pre-populated findings ──

const draftCwd = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-draft-findings-"));
fs.mkdirSync(path.join(draftCwd, ".context", "memory"), { recursive: true });
fs.mkdirSync(path.join(draftCwd, ".context", "stories"), { recursive: true });
fs.mkdirSync(path.join(draftCwd, ".context", "reviews"), { recursive: true });
fs.writeFileSync(path.join(draftCwd, ".context", "memory", "system.md"), "# System\n");

const draft = createReviewDraft(draftCwd, {
  focus: "test",
  scope: "story",
  storyLabel: "story-001",
  trigger: "manual",
  staticAnalysis: "fallow audit — warn",
  fallowFindings: [
    { rule: "dead-code", location: "src/example.ts:1", summary: "dead export" },
    { rule: "unused-import", location: "src/lib.ts:5", summary: "unused import" },
  ],
});

const draftContent = fs.readFileSync(draft.filePath, "utf-8");
assert(draftContent.includes("## Fallow Findings"), "createReviewDraft output should include Fallow Findings section");
assert(draftContent.includes("- [dead-code] src/example.ts:1 — dead export"), "createReviewDraft should pre-populate first finding");
assert(draftContent.includes("- [unused-import] src/lib.ts:5 — unused import"), "createReviewDraft should pre-populate second finding");
assert(!draftContent.includes("- No Fallow findings."), "createReviewDraft with findings should NOT contain the default no-findings line");

fs.rmSync(draftCwd, { recursive: true, force: true });

fs.rmSync(cwd, { recursive: true, force: true });
console.log("Fallow signal-source instruction validation passed");
