import test from "node:test";
import assert from "node:assert/strict";

import { countLineDelta, createUnifiedDiff, formatDeltaSummary, resolveReviewTarget } from "../src/vazir-review.js";

test("countLineDelta reports inserted blocks accurately", () => {
  assert.deepEqual(
    countLineDelta("one\ntwo", "one\ninsert-a\ninsert-b\ninsert-c\ninsert-d\ntwo"),
    { linesAdded: 4, linesRemoved: 0 },
  );

  assert.deepEqual(
    countLineDelta("one\ntwo\nthree", "one\nTHREE"),
    { linesAdded: 1, linesRemoved: 2 },
  );
});

test("createUnifiedDiff renders unified headers and changed lines", () => {
  const diff = createUnifiedDiff("README.md", "alpha\nbeta\ngamma", "alpha\nBETA\ngamma\ndelta");

  assert.match(diff, /^--- README\.md/m);
  assert.match(diff, /^\+\+\+ \.context\/sandbox\/README\.md/m);
  assert.match(diff, /^-beta$/m);
  assert.match(diff, /^\+BETA$/m);
  assert.match(diff, /^\+delta$/m);
});

test("formatDeltaSummary aggregates staged files", () => {
  const summary = formatDeltaSummary([
    { path: "README.md", linesAdded: 2, linesRemoved: 1 },
    { path: ".pi/prompts/task.md", linesAdded: 1, linesRemoved: 0 },
  ]);

  assert.match(summary, /^Sandbox delta: 2 file\(s\), \+3\/-1$/m);
  assert.match(summary, /README\.md \(\+2\/-1\)/);
  assert.match(summary, /Run \/review <file> to inspect a single staged diff\./);
});

test("resolveReviewTarget supports exact and unique suffix matches", () => {
  assert.deepEqual(resolveReviewTarget("README.md", ["README.md"]), {
    path: "README.md",
    error: null,
  });

  assert.deepEqual(resolveReviewTarget("task.md", ["README.md", ".pi/prompts/task.md"]), {
    path: ".pi/prompts/task.md",
    error: null,
  });
});

test("resolveReviewTarget rejects ambiguous or missing targets", () => {
  const ambiguous = resolveReviewTarget("task.md", ["docs/task.md", ".pi/prompts/task.md"]);
  assert.equal(ambiguous.path, null);
  assert.match(ambiguous.error || "", /Ambiguous review target/);

  const missing = resolveReviewTarget("missing.ts", ["README.md"]);
  assert.equal(missing.path, null);
  assert.match(missing.error || "", /No staged sandbox file matches/);
});