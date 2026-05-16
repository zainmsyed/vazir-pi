import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readLearnedRuleCloseoutDraft,
  type LearnedRuleCloseoutDraftReadResult,
} from "../.pi/extensions/vazir-context/helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vazir-draft-edge-"));

function writeDraft(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// 1. Empty string → valid empty draft
const empty = readLearnedRuleCloseoutDraft(writeDraft("empty.json", ""));
assert(empty.kind === "valid" && empty.draft.candidates.length === 0, "empty file should yield valid empty draft");

// 2. Null JSON root → invalid
const nullRoot = readLearnedRuleCloseoutDraft(writeDraft("null.json", "null"));
assert(nullRoot.kind === "invalid", "null JSON root should be invalid");

// 3. Missing candidates field → valid with empty candidates
const missingCandidates = readLearnedRuleCloseoutDraft(writeDraft("missing-candidates.json", JSON.stringify({ note: "no candidates" })));
assert(missingCandidates.kind === "valid" && missingCandidates.draft.candidates.length === 0, "missing candidates should yield valid empty draft");

// 4. Uppercase confidence → normalized and accepted
const uppercase = readLearnedRuleCloseoutDraft(writeDraft("uppercase.json", JSON.stringify({
  note: "",
  candidates: [
    { text: "Rule A", confidence: "HIGH", sources: [], rationale: "" },
    { text: "Rule B", confidence: "Medium", sources: [], rationale: "" },
  ],
})));
assert(uppercase.kind === "valid", "uppercase confidence should be normalized");
assert(uppercase.kind === "valid" && uppercase.draft.candidates.length === 2, "both uppercase candidates should be kept");
assert(uppercase.kind === "valid" && uppercase.draft.candidates[0].confidence === "high", "HIGH should normalize to high");
assert(uppercase.kind === "valid" && uppercase.draft.candidates[1].confidence === "medium", "Medium should normalize to medium");

// 5. Invalid confidence → candidate filtered out
const invalidConfidence = readLearnedRuleCloseoutDraft(writeDraft("invalid-confidence.json", JSON.stringify({
  note: "",
  candidates: [
    { text: "Good rule", confidence: "low", sources: [], rationale: "" },
    { text: "Bad rule", confidence: "maybe", sources: [], rationale: "" },
  ],
})));
assert(invalidConfidence.kind === "valid" && invalidConfidence.draft.candidates.length === 1, "invalid confidence should filter out candidate");
assert(invalidConfidence.kind === "valid" && invalidConfidence.draft.candidates[0].text === "Good rule", "only valid-confidence candidate should remain");

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log("✓ All learned-rule closeout draft edge-case tests passed");
