import os from "node:os";
import path from "node:path";
import * as fs from "node:fs";
import { repoRoot } from "./lib/validation-harness.mts";
import {
  VALID_STORY_STATUSES,
  listStoryValidationIssues,
  parseStoryFrontmatter,
  validateStoryFile,
} from "../.pi/lib/vazir-helpers.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "stories"), { recursive: true });
  return cwd;
}

function storyContent(status: string, checklistLines: string[]): string {
  return [
    "# Story 001: Example",
    "",
    `**Status:** ${status}  `,
    "**Created:** 2026-06-06  ",
    "**Last accessed:** 2026-06-06  ",
    "**Completed:** —",
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
    "## Out of scope",
    "- docs/",
    "",
    "## Dependencies",
    "- story-000",
    "",
    "## Checklist",
    ...checklistLines,
    "",
    "## Issues",
    "- None yet.",
    "",
    "## Completion Summary",
    "- Pending.",
    "",
  ].join("\n");
}

function writeStory(cwd: string, fileName: string, status: string, checklistLines: string[]): string {
  const filePath = path.join(cwd, ".context", "stories", fileName);
  fs.writeFileSync(filePath, storyContent(status, checklistLines));
  return filePath;
}

const validCwd = createProject("vazir-story-validation-valid-");
const validPath = writeStory(validCwd, "story-001.md", "in-progress", ["- [ ] Implement validator"]);
const validResult = validateStoryFile(validPath);
assert(validResult.ok, "valid story should pass validation");
assert(validResult.frontmatter?.status === "in-progress", "valid story should expose parsed frontmatter");
assert(VALID_STORY_STATUSES.includes(validResult.frontmatter!.status as (typeof VALID_STORY_STATUSES)[number]), "valid story should use an allowed status");
assert(parseStoryFrontmatter(validPath)?.title === "Example", "parseStoryFrontmatter should still work for valid stories");

const invalidStatusCwd = createProject("vazir-story-validation-status-");
const invalidStatusPath = writeStory(invalidStatusCwd, "story-001.md", "todo", ["- [ ] Implement validator"]);
const invalidStatusResult = validateStoryFile(invalidStatusPath);
assert(!invalidStatusResult.ok, "invalid status should fail validation");
assert(invalidStatusResult.issues.some(issue => issue.code === "invalid-status" && issue.message.includes("todo")), "invalid status should produce an actionable issue");
assert(parseStoryFrontmatter(invalidStatusPath)?.status === "todo", "parseStoryFrontmatter should remain lenient and still parse frontmatter even for invalid status");

const malformedChecklistCwd = createProject("vazir-story-validation-checklist-");
const malformedChecklistPath = writeStory(malformedChecklistCwd, "story-001.md", "not-started", ["- [maybe] Broken task"]);
const malformedChecklistResult = validateStoryFile(malformedChecklistPath);
assert(!malformedChecklistResult.ok, "malformed checklist should fail validation");
assert(malformedChecklistResult.issues.some(issue => issue.code === "malformed-checklist" && issue.message.includes("Expected '- [ ] task' or '- [x] task'")), "malformed checklist should explain the expected format");

const aggregatedCwd = createProject("vazir-story-validation-aggregate-");
writeStory(aggregatedCwd, "story-001.md", "in-progress", ["- [ ] Looks good"]);
writeStory(aggregatedCwd, "story-002.md", "bad-status", ["- [ ] Broken status"]);
writeStory(aggregatedCwd, "story-003.md", "not-started", ["- [oops] Broken checklist"]);
const aggregatedIssues = listStoryValidationIssues(aggregatedCwd);
assert(aggregatedIssues.length >= 2, "story validation should aggregate issues across story files");
assert(aggregatedIssues.some(issue => issue.file.endsWith("story-002.md") && issue.code === "invalid-status"), "aggregated issues should include invalid status files");
assert(aggregatedIssues.some(issue => issue.file.endsWith("story-003.md") && issue.code === "malformed-checklist"), "aggregated issues should include malformed checklist files");

const missingSectionCwd = createProject("vazir-story-validation-missing-section-");
const missingSectionPath = writeStory(missingSectionCwd, "story-001.md", "in-progress", ["- [ ] task"]);
const missingSectionContent = fs.readFileSync(missingSectionPath, "utf-8").replace("## Out of scope\n", "");
fs.writeFileSync(missingSectionPath, missingSectionContent);
const missingSectionResult = validateStoryFile(missingSectionPath);
assert(!missingSectionResult.ok, "missing required section should fail validation");
assert(missingSectionResult.issues.some(issue => issue.code === "missing-section" && issue.message.includes("Out of scope")), "missing section issue should name the missing heading");
assert(parseStoryFrontmatter(missingSectionPath)?.status === "in-progress", "parseStoryFrontmatter should remain lenient and still parse frontmatter even when validation fails");

const emptyChecklistCwd = createProject("vazir-story-validation-empty-checklist-");
const emptyChecklistPath = writeStory(emptyChecklistCwd, "story-001.md", "not-started", []);
const emptyChecklistContent = fs.readFileSync(emptyChecklistPath, "utf-8").replace("## Checklist\n\n", "## Checklist\n");
fs.writeFileSync(emptyChecklistPath, emptyChecklistContent);
const emptyChecklistResult = validateStoryFile(emptyChecklistPath);
assert(!emptyChecklistResult.ok, "empty checklist should fail validation");
assert(emptyChecklistResult.issues.some(issue => issue.code === "malformed-checklist" && issue.message.includes("at least one checklist item")), "empty checklist should produce a required-item issue");

console.log("Story File Validation");
console.log(`repoRoot: ${repoRoot}`);
console.log(`validPath: ${validPath}`);
console.log(JSON.stringify({
  validStatus: validResult.frontmatter?.status,
  invalidStatusIssues: invalidStatusResult.issues,
  malformedChecklistIssues: malformedChecklistResult.issues,
  aggregatedIssueCount: aggregatedIssues.length,
  missingSectionIssueCount: missingSectionResult.issues.length,
  emptyChecklistIssueCount: emptyChecklistResult.issues.length,
}, null, 2));
