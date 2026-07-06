import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionSubmissionGuard } from "../src/features/match-simulator/action-submission-guard";

test("allows only one active action submission", () => {
  const guard = new ActionSubmissionGuard();
  const first = guard.begin();

  assert.equal(typeof first, "number");
  assert.equal(guard.begin(), null);
  assert.equal(guard.finish(first!), true);
  assert.equal(typeof guard.begin(), "number");
});

test("reset enables a new decision without letting an old request clear it", () => {
  const guard = new ActionSubmissionGuard();
  const oldSubmission = guard.begin();
  guard.reset();
  const newSubmission = guard.begin();

  assert.equal(typeof newSubmission, "number");
  assert.equal(guard.finish(oldSubmission!), false);
  assert.equal(guard.begin(), null);
  assert.equal(guard.finish(newSubmission!), true);
});
