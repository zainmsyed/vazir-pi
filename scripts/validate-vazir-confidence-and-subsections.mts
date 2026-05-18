import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const helpersPath = path.join(repoRoot, ".pi", "extensions", "vazir-context", "helpers.ts");
const helpers = await loadFileModule<typeof import("../../.pi/extensions/vazir-context/helpers.ts")>(helpersPath, String(Date.now()));

const {
  updateRuleConfidence,
  organizeLearnedRules,
  prepareLearnedRulesForConsolidation,
  learnedRulesFromMd,
  parseLearnedRuleEntry,
  formatLearnedRuleEntry,
} = helpers;

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  // Create directory structure
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });

  // Create system.md with mixed rules
  fs.writeFileSync(
    path.join(cwd, ".context", "memory", "system.md"),
    [
      "# System Rules",
      "",
      "## Rules",
      "- Follow existing project conventions.",
      "",
      "## Learned Rules",
      "- Rule with recent source <!-- source: story-001 -->",
      "- Rule with no source",
      "- Rule with confidence first <!-- confidence: medium -->",
      "",
    ].join("\n"),
  );

  // Create story-001.md with issues (for failure categorization)
  fs.writeFileSync(
    path.join(cwd, ".context", "stories", "story-001.md"),
    [
      "# Story 001: Test",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-05-13  ",
      "**Last accessed:** 2026-05-13  ",
      "**Completed:** 2026-05-13",
      "",
      "---",
      "",
      "## Goal",
      "Test goal.",
      "",
      "## Verification",
      "Test verification.",
      "",
      "## Scope — files this story may touch",
      "- file.ts",
      "",
      "## Out of scope — do not touch",
      "- other",
      "",
      "## Dependencies",
      "- ",
      "",
      "---",
      "",
      "## Checklist",
      "- [x] task",
      "",
      "---",
      "",
      "## Issues",
      "### /fix — something",
      "- **Status:** resolved",
      "",
      "## Completion Summary",
      "Done.",
      "",
    ].join("\n"),
  );

  // Create story-002.md without issues (for success categorization)
  fs.writeFileSync(
    path.join(cwd, ".context", "stories", "story-002.md"),
    [
      "# Story 002: Test",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-05-13  ",
      "**Last accessed:** 2026-05-13  ",
      "**Completed:** 2026-05-13",
      "",
      "---",
      "",
      "## Goal",
      "Test goal.",
      "",
      "## Verification",
      "Test verification.",
      "",
      "## Scope — files this story may touch",
      "- file.ts",
      "",
      "## Out of scope — do not touch",
      "- other",
      "",
      "## Dependencies",
      "- ",
      "",
      "---",
      "",
      "## Checklist",
      "- [x] task",
      "",
      "---",
      "",
      "## Issues",
      "",
      "## Completion Summary",
      "Done.",
      "",
    ].join("\n"),
  );

  // Create a review file referencing story-001
  fs.writeFileSync(
    path.join(cwd, ".context", "reviews", "review-20260513-120000.md"),
    [
      "# Code Review 2026-05-13T12:00:00Z",
      "",
      "**Status:** complete  ",
      "**Created:** 2026-05-13T12:00:00Z  ",
      "**Completed:** 2026-05-13  ",
      "**Scope:** story  ",
      "**Story:** story-001  ",
      "**Focus:** test  ",
      "**Trigger:** manual",
      "",
      "---",
      "",
      "## Findings",
      "### Finding 1",
      "- Severity: medium",
      "- Category: bug",
      "- Summary: Rule with recent source is mentioned here",
      "- Rule candidate: —",
      "",
      "---",
      "",
      "## Completion Summary",
      "Done.",
      "",
    ].join("\n"),
  );

  return cwd;
}

function readSystemMd(cwd: string): string {
  return fs.readFileSync(path.join(cwd, ".context", "memory", "system.md"), "utf-8");
}

// ── Test 1: parseLearnedRuleEntry is order-agnostic ────────────────────

const orderAgnosticTests = [
  {
    input: "Rule text <!-- source: story-001 --> <!-- confidence: high -->",
    expectedText: "Rule text",
    expectedSources: ["story-001"],
    expectedConfidence: "high",
  },
  {
    input: "Rule text <!-- confidence: high --> <!-- source: story-001 -->",
    expectedText: "Rule text",
    expectedSources: ["story-001"],
    expectedConfidence: "high",
  },
  {
    input: "Rule text <!-- source: story-001, story-002 -->",
    expectedText: "Rule text",
    expectedSources: ["story-001", "story-002"],
    expectedConfidence: undefined,
  },
  {
    input: "Rule text <!-- confidence: low — no signal in last 5 stories -->",
    expectedText: "Rule text",
    expectedSources: [],
    expectedConfidence: "low — no signal in last 5 stories",
  },
  {
    input: "Rule text",
    expectedText: "Rule text",
    expectedSources: [],
    expectedConfidence: undefined,
  },
];

for (const test of orderAgnosticTests) {
  const result = parseLearnedRuleEntry(test.input);
  assert(
    result.text === test.expectedText,
    `parseLearnedRuleEntry text mismatch for "${test.input}": got "${result.text}", expected "${test.expectedText}"`,
  );
  assert(
    JSON.stringify(result.sourceStories) === JSON.stringify(test.expectedSources),
    `parseLearnedRuleEntry sources mismatch for "${test.input}": got ${JSON.stringify(result.sourceStories)}, expected ${JSON.stringify(test.expectedSources)}`,
  );
  assert(
    result.confidence === test.expectedConfidence,
    `parseLearnedRuleEntry confidence mismatch for "${test.input}": got "${result.confidence ?? "undefined"}", expected "${test.expectedConfidence ?? "undefined"}"`,
  );
}

console.log("✓ parseLearnedRuleEntry is order-agnostic for source and confidence comments");

// ── Test 2: formatLearnedRuleEntry round-trips correctly ───────────────

const roundTripTests = [
  { text: "Rule text", sourceStories: ["story-001"], confidence: "high" },
  { text: "Rule text", sourceStories: ["story-001"], confidence: undefined },
  { text: "Rule text", sourceStories: [], confidence: "low" },
];

for (const test of roundTripTests) {
  const formatted = formatLearnedRuleEntry(test);
  const reparsed = parseLearnedRuleEntry(formatted);
  assert(
    reparsed.text === test.text,
    `Round-trip text mismatch: got "${reparsed.text}", expected "${test.text}"`,
  );
  assert(
    JSON.stringify(reparsed.sourceStories) === JSON.stringify(test.sourceStories),
    `Round-trip sources mismatch: got ${JSON.stringify(reparsed.sourceStories)}, expected ${JSON.stringify(test.sourceStories)}`,
  );
  assert(
    reparsed.confidence === test.confidence,
    `Round-trip confidence mismatch: got "${reparsed.confidence ?? "undefined"}", expected "${test.confidence ?? "undefined"}"`,
  );
}

console.log("✓ formatLearnedRuleEntry round-trips correctly through parseLearnedRuleEntry");

// ── Test 3: updateRuleConfidence assigns high vs low correctly ─────────

const cwdConfidence = createProject("vazir-confidence-");

// Rewrite system.md with rules we want to test
fs.writeFileSync(
  path.join(cwdConfidence, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Rule with recent source <!-- source: story-001 -->",
    "- Rule with no source",
    "- Rule from old story <!-- source: story-999 -->",
    "",
  ].join("\n"),
);

updateRuleConfidence(cwdConfidence);

const confidenceSystemMd = readSystemMd(cwdConfidence);
const confidenceRules = learnedRulesFromMd(confidenceSystemMd);

const recentRule = confidenceRules.find(r => r.text === "Rule with recent source");
const noSourceRule = confidenceRules.find(r => r.text === "Rule with no source");
const oldStoryRule = confidenceRules.find(r => r.text === "Rule from old story");

assert(recentRule !== undefined, "Recent rule should exist after updateRuleConfidence");
assert(noSourceRule !== undefined, "No-source rule should exist after updateRuleConfidence");
assert(oldStoryRule !== undefined, "Old story rule should exist after updateRuleConfidence");

assert(
  recentRule.confidence === "high",
  `Recent rule should have confidence 'high', got '${recentRule.confidence}'`,
);
assert(
  noSourceRule.confidence?.startsWith("low — no signal"),
  `No-source rule should have low confidence, got '${noSourceRule.confidence}'`,
);
assert(
  oldStoryRule.confidence?.startsWith("low — no signal"),
  `Old story rule should have low confidence, got '${oldStoryRule.confidence}'`,
);

console.log("✓ updateRuleConfidence assigns high to recent signal and low to missing signal");

// ── Test 3b: updateRuleConfidence ignores draft/in-progress reviews ────

const cwdDraftReview = createProject("vazir-draft-review-");

fs.writeFileSync(
  path.join(cwdDraftReview, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Rule only in draft review <!-- source: story-999 -->",
    "",
  ].join("\n"),
);

// Create a draft (in-progress) review that mentions the rule
fs.writeFileSync(
  path.join(cwdDraftReview, ".context", "reviews", "review-20260513-130000.md"),
  [
    "# Code Review 2026-05-13T13:00:00Z",
    "",
    "**Status:** in-progress  ",
    "**Created:** 2026-05-13T13:00:00Z  ",
    "**Completed:** —  ",
    "**Scope:** story  ",
    "**Story:** story-999  ",
    "**Focus:** test  ",
    "**Trigger:** manual",
    "",
    "---",
    "",
    "## Findings",
    "### Finding 1",
    "- Severity: medium",
    "- Category: bug",
    "- Summary: Rule only in draft review is mentioned here",
    "- Rule candidate: —",
    "",
    "---",
    "",
    "## Completion Summary",
    "",
  ].join("\n"),
);

updateRuleConfidence(cwdDraftReview);

const draftSystemMd = readSystemMd(cwdDraftReview);
const draftRules = learnedRulesFromMd(draftSystemMd);
const draftRule = draftRules.find(r => r.text === "Rule only in draft review");

assert(draftRule !== undefined, "Draft-review rule should exist after updateRuleConfidence");
assert(
  draftRule.confidence?.startsWith("low — no signal"),
  `Draft-review rule should have LOW confidence because in-progress reviews are excluded, got '${draftRule.confidence}'`,
);

console.log("✓ updateRuleConfidence ignores in-progress reviews and only counts complete ones");

// ── Test 4: organizeLearnedRules categorizes failure vs success ────────

const cwdSubsections = createProject("vazir-subsections-");

// Rewrite system.md with rules we want to test
fs.writeFileSync(
  path.join(cwdSubsections, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Rule from story with issues <!-- source: story-001 -->",
    "- Rule from clean story <!-- source: story-002 -->",
    "- Rule with multiple sources <!-- source: story-001, story-002 -->",
    "- Rule with no source",
    "",
  ].join("\n"),
);

organizeLearnedRules(cwdSubsections);

const subsectionSystemMd = readSystemMd(cwdSubsections);
const subsectionRules = learnedRulesFromMd(subsectionSystemMd);

const issueRule = subsectionRules.find(r => r.text === "Rule from story with issues");
const cleanRule = subsectionRules.find(r => r.text === "Rule from clean story");
const multiRule = subsectionRules.find(r => r.text === "Rule with multiple sources");
const noSourceSubRule = subsectionRules.find(r => r.text === "Rule with no source");

assert(issueRule !== undefined, "Issue rule should exist after organizeLearnedRules");
assert(cleanRule !== undefined, "Clean rule should exist after organizeLearnedRules");
assert(multiRule !== undefined, "Multi-source rule should exist after organizeLearnedRules");
assert(noSourceSubRule !== undefined, "No-source rule should exist after organizeLearnedRules");

assert(
  issueRule.kind === "failure",
  `Issue rule should be 'failure', got '${issueRule.kind}'`,
);
assert(
  cleanRule.kind === "success",
  `Clean rule should be 'success', got '${cleanRule.kind}'`,
);
assert(
  multiRule.kind === "failure",
  `Multi-source rule with at least one issue story should be 'failure', got '${multiRule.kind}'`,
);
assert(
  noSourceSubRule.kind === "success",
  `No-source rule should default to 'success', got '${noSourceSubRule.kind}'`,
);

// Verify subsection structure exists in the markdown
assert(
  subsectionSystemMd.includes("### From failures"),
  "system.md should contain '### From failures' subsection after organizeLearnedRules",
);
assert(
  subsectionSystemMd.includes("### From successes"),
  "system.md should contain '### From successes' subsection after organizeLearnedRules",
);

console.log("✓ organizeLearnedRules categorizes rules into failure and success subsections");

// ── Test 5: Backwards compatibility — flat structure preserved when no kinds ──

const cwdFlat = createProject("vazir-flat-");

fs.writeFileSync(
  path.join(cwdFlat, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Flat rule one <!-- source: story-001 -->",
    "- Flat rule two",
    "",
  ].join("\n"),
);

// Don't call organizeLearnedRules — just dedupe
const beforeDedupe = readSystemMd(cwdFlat);
const { dedupeLearnedRules } = helpers;
const afterDedupe = dedupeLearnedRules(beforeDedupe);

assert(
  !afterDedupe.includes("### From failures") && !afterDedupe.includes("### From successes"),
  "Flat system.md should not gain subsections when no rules have kinds",
);

console.log("✓ Backwards compatibility: flat structure preserved when no kinds present");

// ── Test 6: promoteRulesToSystemMd with kind produces subsections ──────

const cwdPromote = createProject("vazir-promote-kind-");

fs.writeFileSync(
  path.join(cwdPromote, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Existing rule <!-- source: story-001 -->",
    "",
  ].join("\n"),
);

const { promoteRulesToSystemMd } = helpers;

promoteRulesToSystemMd(cwdPromote, [
  { text: "Promoted failure rule", sourceStories: ["story-001"], kind: "failure" },
]);

const promoteSystemMd = readSystemMd(cwdPromote);
assert(
  promoteSystemMd.includes("### From failures"),
  "system.md should contain '### From failures' after promoteRulesToSystemMd with kind: failure",
);

const promotedRules = learnedRulesFromMd(promoteSystemMd);
const promotedFailureRule = promotedRules.find(r => r.text === "Promoted failure rule");
assert(promotedFailureRule !== undefined, "Promoted failure rule should exist");
assert(
  promotedFailureRule.kind === "failure",
  `Promoted rule should have kind 'failure', got '${promotedFailureRule.kind}'`,
);

console.log("✓ promoteRulesToSystemMd with kind produces subsections immediately");

// ── Test 7: prepareLearnedRulesForConsolidation combines dedupe + confidence + kind ──

const cwdCombined = createProject("vazir-combined-");

fs.writeFileSync(
  path.join(cwdCombined, ".context", "memory", "system.md"),
  [
    "# System Rules",
    "",
    "## Rules",
    "- Follow existing project conventions.",
    "",
    "## Learned Rules",
    "- Duplicate rule <!-- source: story-001 -->",
    "- Duplicate rule <!-- source: story-001 -->",
    "- Rule needing confidence <!-- source: story-001 -->",
    "- Rule needing kind <!-- source: story-002 -->",
    "",
  ].join("\n"),
);

prepareLearnedRulesForConsolidation(cwdCombined);

const combinedSystemMd = readSystemMd(cwdCombined);
const combinedRules = learnedRulesFromMd(combinedSystemMd);

// Assert dedupe happened
const duplicateCount = combinedRules.filter(r => r.text === "Duplicate rule").length;
assert(duplicateCount === 1, `Duplicate rules should be merged into one, found ${duplicateCount}`);

// Assert confidence was assigned
const confidenceRule = combinedRules.find(r => r.text === "Rule needing confidence");
assert(confidenceRule !== undefined, "Rule needing confidence should exist");
assert(confidenceRule.confidence === "high", `Rule needing confidence should have 'high' confidence, got '${confidenceRule.confidence}'`);

// Assert kind was assigned
const kindRule = combinedRules.find(r => r.text === "Rule needing kind");
assert(kindRule !== undefined, "Rule needing kind should exist");
assert(kindRule.kind === "success", `Rule needing kind should be 'success' (story-002 has no issues), got '${kindRule.kind}'`);

// Assert subsection structure exists
assert(combinedSystemMd.includes("### From failures") || combinedSystemMd.includes("### From successes"), "system.md should contain at least one subsection after prepareLearnedRulesForConsolidation");

console.log("✓ prepareLearnedRulesForConsolidation applies dedupe + confidence + kind in a single I/O pass");

console.log("\nAll confidence and subsection validations passed.");
