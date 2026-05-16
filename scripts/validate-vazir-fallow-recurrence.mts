import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendFallowToComplaintsLog,
  countFallowOccurrences,
  reviewFallowFindingsFromFile,
} from "../.pi/extensions/vazir-context/helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createProject(prefix: string): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(cwd, ".context", "reviews"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".context", "complaints-log.md"), "# Complaints Log\n\n");
  return cwd;
}

function writeReview(cwd: string, fileName: string, findings: string[]): string {
  const filePath = path.join(cwd, ".context", "reviews", fileName);
  fs.writeFileSync(filePath, [
    "# Code Review",
    "",
    "## Fallow Findings",
    ...findings.map(finding => `- ${finding}`),
    "",
  ].join("\n"));
  return filePath;
}

const cwd = createProject("vazir-fallow-recurrence-");
const finding = "unused-export: src/utils/formatDate.ts:14 | toRelativeTime never imported";

const reviewA = writeReview(cwd, "review-a.md", [finding, finding]);
appendFallowToComplaintsLog(cwd, "story-001", reviewFallowFindingsFromFile(reviewA));
assert(countFallowOccurrences(cwd, finding) === 1, "same-story duplicate should count once");

const reviewB = writeReview(cwd, "review-b.md", [finding]);
appendFallowToComplaintsLog(cwd, "story-002", reviewFallowFindingsFromFile(reviewB));
let log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
assert(log.includes("[fallow] unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported | status: noted"), "fallow findings should sanitize pipe characters before writing the complaints log");
assert(countFallowOccurrences(cwd, finding) === 2, "two stories should still be counted as noted occurrences");
assert((log.match(/status: noted/g) || []).length === 2, "first two occurrences should stay noted");

const reviewC = writeReview(cwd, "review-c.md", [finding]);
appendFallowToComplaintsLog(cwd, "story-003", reviewFallowFindingsFromFile(reviewC));
log = fs.readFileSync(path.join(cwd, ".context", "complaints-log.md"), "utf-8");
assert(countFallowOccurrences(cwd, finding) === 3, "three distinct stories should be counted");
assert((log.match(/status: promoted/g) || []).length === 3, "third occurrence should promote the whole fallow cluster");
assert(log.includes("| story-001 | [fallow] unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported | status: promoted"), "third occurrence should rewrite the first story entry to promoted");
assert(log.includes("| story-002 | [fallow] unused-export: src/utils/formatDate.ts:14 / toRelativeTime never imported | status: promoted"), "third occurrence should rewrite the second story entry to promoted");

console.log("Fallow recurrence validation");
console.log(`cwd: ${cwd}`);
console.log(log.trim());
