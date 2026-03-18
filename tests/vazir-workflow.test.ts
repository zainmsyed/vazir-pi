import test from "node:test";
import assert from "node:assert/strict";

import {
  createExecutionTurnMessage,
  createRetryTurnMessage,
  describeReviewReadinessFromPlan,
  getPlanWriteConflict,
} from "../.pi/extensions/vazir-workflow.js";

test("createExecutionTurnMessage produces an explicit execution handoff", () => {
  const message = createExecutionTurnMessage(2);

  assert.equal(message.customType, "vazir-plan-execute");
  assert.equal(message.display, true);
  assert.match(message.content, /Execute step 2/);
  assert.match(message.content, /Use vwrite and vedit only/);
  assert.match(message.content, /vsandbox_complete/);
});

test("createRetryTurnMessage carries the rejection reason forward", () => {
  const message = createRetryTurnMessage(1, "wrong file edited");

  assert.equal(message.customType, "vazir-plan-retry");
  assert.match(message.content, /sandbox for step 1 was rejected/i);
  assert.match(message.content, /Reason: wrong file edited/);
  assert.match(message.content, /avoid repeating the same issue/);
});

test("describeReviewReadinessFromPlan explains pending and active plans", () => {
  assert.equal(
    describeReviewReadinessFromPlan(null),
    "No sandbox changes are currently staged.",
  );

  assert.match(
    describeReviewReadinessFromPlan({
      task: "Update README",
      status: "pending",
      currentStep: 0,
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z",
      steps: [{ title: "Edit README", files: ["README.md"], status: "pending" }],
    }),
    /run \/approve to execute step 1 and stage files in the sandbox/i,
  );

  assert.match(
    describeReviewReadinessFromPlan({
      task: "Update README",
      status: "active",
      currentStep: 1,
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z",
      steps: [
        { title: "Edit README", files: ["README.md"], status: "done" },
        { title: "Edit task", files: ["task.md"], status: "in-progress" },
      ],
    }),
    /Wait for the agent to finish staging files with vwrite\/vedit, then run \/diff or \/review/i,
  );
});

test("getPlanWriteConflict blocks replacing pending or active plans", () => {
  assert.equal(getPlanWriteConflict(null), null);

  assert.match(
    getPlanWriteConflict({
      task: "Existing task",
      status: "pending",
      currentStep: 0,
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z",
      steps: [{ title: "Edit README", files: ["README.md"], status: "pending" }],
    }) || "",
    /active Vazir plan already exists/i,
  );

  assert.equal(
    getPlanWriteConflict({
      task: "Completed task",
      status: "complete",
      currentStep: 0,
      createdAt: "2026-03-18T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z",
      steps: [{ title: "Edit README", files: ["README.md"], status: "done" }],
    }),
    null,
  );
});