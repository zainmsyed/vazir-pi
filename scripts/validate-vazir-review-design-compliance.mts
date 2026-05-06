import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { assert, loadFileModule, repoRoot } from "./lib/validation-harness.mts";

const helpers = await loadFileModule<{
  createReviewDraft: (cwd: string, options: any) => any;
  reviewFileTemplate: (created: string, scope: string, storyLabel: string, focus: string, trigger: string, staticAnalysis: string, isUiStory?: boolean, designSystemEmpty?: boolean) => string;
  buildReviewInstruction: (review: any, staticAnalysisPrompt?: string, cwd?: string) => string;
}>(path.join(repoRoot, ".pi", "extensions", "vazir-context", "helpers.ts"), "review-design");

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "memory"), { recursive: true });
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "memory", "system.md"), "# System\n");
  return cwd;
}

function writeStory(cwd: string, number: number, scopeFile: string, type?: string): void {
  const filePath = path.join(cwd, ".context", "stories", `story-${String(number).padStart(3, "0")}.md`);
  fs.writeFileSync(filePath, [
    `# Story ${String(number).padStart(3, "0")}: Test`,
    "",
    ...(type ? [`**Type:** ${type}  `] : []),
    `**Status:** in-progress  `,
    "**Created:** 2026-03-25  ",
    `**Last accessed:** 2026-03-25  `,
    "**Completed:** —",
    "",
    "---",
    "",
    "## Goal",
    "Test.",
    "",
    "## Verification",
    "Test.",
    "",
    "## Scope — files this story may touch",
    `- ${scopeFile}`,
    "",
    "## Out of scope — do not touch",
    "- other.ts",
    "",
    "## Dependencies",
    "- ",
    "",
    "---",
    "",
    "## Checklist",
    "- [ ] Task",
    "",
    "---",
    "",
    "## Issues",
    "",
    "---",
    "",
    "## Completion Summary",
    "",
  ].join("\n"));
}

function writeDesignSystem(cwd: string, content: string): void {
  const designDir = path.join(cwd, ".context", "design");
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(path.join(designDir, "design-system.md"), content);
}

// ── reviewFileTemplate ─────────────────────────────────────────────────

const nonUi = helpers.reviewFileTemplate("2026-05-05T12:00:00Z", "story", "story-001", "test", "manual", "pass", false, false);
assert(!nonUi.includes("## Design Compliance"), "non-UI review template should not include Design Compliance");

const ui = helpers.reviewFileTemplate("2026-05-05T12:00:00Z", "story", "story-001", "test", "manual", "pass", true, false);
assert(ui.includes("## Design Compliance (UI stories only)"), "UI review template should include Design Compliance");
assert(ui.includes("Colors reference design-system.md tokens"), "UI review template should include colors check");
assert(ui.includes("Spacing follows the declared scale"), "UI review template should include spacing check");
assert(ui.includes("Typography uses declared families"), "UI review template should include typography check");
assert(ui.includes("components.md was checked"), "UI review template should include components check");
assert(!ui.includes("design compliance checks skipped"), "UI review with populated design system should not have skip note");

const uiEmpty = helpers.reviewFileTemplate("2026-05-05T12:00:00Z", "story", "story-001", "test", "manual", "pass", true, true);
assert(uiEmpty.includes("## Design Compliance (UI stories only)"), "UI empty review template should include Design Compliance");
assert(uiEmpty.includes("`.context/design/design-system.md` is empty or incomplete"), "UI empty review template should have skip note");

console.log("reviewFileTemplate tests passed");

// ── createReviewDraft integration ──────────────────────────────────────

{
  const cwd = createProject("vazir-review-design-draft-");

  // Non-UI story
  writeStory(cwd, 1, "src/api.ts");
  const nonUiDraft = helpers.createReviewDraft(cwd, { focus: "test", scope: "story", storyLabel: "story-001", trigger: "manual" });
  const nonUiContent = fs.readFileSync(nonUiDraft.filePath, "utf-8");
  assert(!nonUiContent.includes("## Design Compliance"), "createReviewDraft for non-UI should omit Design Compliance");

  // UI story with empty design system
  writeStory(cwd, 2, "src/Card.tsx");
  const uiEmptyDraft = helpers.createReviewDraft(cwd, { focus: "test", scope: "story", storyLabel: "story-002", trigger: "manual" });
  const uiEmptyContent = fs.readFileSync(uiEmptyDraft.filePath, "utf-8");
  assert(uiEmptyContent.includes("## Design Compliance (UI stories only)"), "createReviewDraft for UI should include Design Compliance");
  assert(uiEmptyContent.includes("`.context/design/design-system.md` is empty or incomplete"), "createReviewDraft for UI with empty DS should have skip note");

  // UI story with populated design system
  writeStory(cwd, 3, "src/Button.tsx");
  writeDesignSystem(cwd, "# Design System\n\n## Colours\n- Primary: #333\n");
  const uiDraft = helpers.createReviewDraft(cwd, { focus: "test", scope: "story", storyLabel: "story-003", trigger: "manual" });
  const uiContent = fs.readFileSync(uiDraft.filePath, "utf-8");
  assert(uiContent.includes("## Design Compliance (UI stories only)"), "createReviewDraft for UI with DS should include Design Compliance");
  assert(!uiContent.includes("design compliance checks skipped"), "createReviewDraft for UI with populated DS should not have skip note");

  console.log("createReviewDraft tests passed");
}

// ── buildReviewInstruction ─────────────────────────────────────────────

{
  const cwd = createProject("vazir-review-instr-");

  // Non-UI story
  const nonUiInstr = helpers.buildReviewInstruction({ fileName: "review-001.md", scope: "story", storyLabel: "story-001", focus: "test", trigger: "manual" }, "", cwd);
  assert(!nonUiInstr.includes("design-system.md tokens"), "buildReviewInstruction for non-UI should not mention design tokens");

  // UI story with empty design system
  writeStory(cwd, 2, "src/Card.tsx");
  const uiEmptyInstr = helpers.buildReviewInstruction({ fileName: "review-002.md", scope: "story", storyLabel: "story-002", focus: "test", trigger: "manual" }, "", cwd);
  assert(uiEmptyInstr.includes("design-system.md tokens"), "buildReviewInstruction for UI should mention design tokens");
  assert(uiEmptyInstr.includes("skip design compliance checks"), "buildReviewInstruction for UI with empty DS should mention skipping");

  // UI story with populated design system
  writeStory(cwd, 3, "src/Button.tsx");
  writeDesignSystem(cwd, "# Design System\n\n## Colours\n- Primary: #333\n");
  const uiInstr = helpers.buildReviewInstruction({ fileName: "review-003.md", scope: "story", storyLabel: "story-003", focus: "test", trigger: "manual" }, "", cwd);
  assert(uiInstr.includes("design-system.md tokens"), "buildReviewInstruction for UI with DS should mention design tokens");
  assert(!uiInstr.includes("skip design compliance checks"), "buildReviewInstruction for UI with populated DS should not mention skipping");

  console.log("buildReviewInstruction tests passed");
}

console.log("All review design compliance validation tests passed");
