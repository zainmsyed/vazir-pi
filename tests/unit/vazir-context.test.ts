import assert from "node:assert/strict";
import test from "node:test";

import { buildInjectedSystemPrompt, stripHtmlComments } from "../../.pi/extensions/vazir-context.ts";

test("stripHtmlComments removes HTML comments", () => {
  const content = "alpha\n<!-- hidden note -->\nbeta";

  assert.equal(stripHtmlComments(content), "alpha\n\nbeta");
});

test("buildInjectedSystemPrompt prefers injected context and preserves the original prompt", () => {
  const prompt = buildInjectedSystemPrompt(
    "# Context Map\n\nCore instructions\n<!-- remove me -->",
    "Original system prompt",
  );

  assert.match(prompt, /Core instructions/);
  assert.match(prompt, /Original system prompt/);
  assert.doesNotMatch(prompt, /remove me/);
  assert.match(prompt, /---/);
});

test("buildInjectedSystemPrompt returns the original prompt when the source is empty after stripping", () => {
  const prompt = buildInjectedSystemPrompt("<!-- only comments -->", "Original system prompt");

  assert.equal(prompt, "Original system prompt");
});