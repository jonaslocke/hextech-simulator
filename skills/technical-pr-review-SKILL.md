---
name: technical-pr-review
description: Use for fresh independent Hextech technical review of a fixed BASE/HEAD diff against scope, durable authorities, testing contracts, consumers, and regressions.
---

# Technical PR Review

Review from the task/spec, applicable authorities, BASE SHA, HEAD SHA, actual
diff, and tests. The implementer's summary is context, not proof.

Use progressive retrieval: start from changed files/symbols and relevant
contracts; expand to callers/consumers/lifecycle only where the change requires
it.

## 1. Spec and scope

Check requested outcome, explicit exclusions, corpus capability boundary, and
final diff hygiene. Unrequested capability work is a scope defect even if it is
correct.

## 2. Architecture and tests

Check reusable ownership, absence of card/deck runtime branches, existing-owner
reuse, test ownership, PASS_TO_PASS preservation, meaningful new coverage, and
single-source-of-truth registries. Apply `docs/testing.md` rather than restating
its contract.

## 3. Regression and semantics

For each changed shared owner, inspect accepted consumers and meaningful
alternate paths. Verify existing abstractions retain their meaning. For timing or
delayed-state work, inspect relevant intermediate checkpoints and identity/
lifecycle boundaries rather than only the final state.

## Evidence and verdict

Use repository authorities, diff, focused tests, consumer searches, and final
verification evidence. When the environment permits a final technical review, run
`npm run verify:pr -- --base=<BASE_SHA>` yourself; otherwise state that independent
final-gate execution was unavailable. A green suite or implementation report alone
is insufficient.

Report actionable findings only:

- **BLOCKER:** correctness, regression, scope, semantic, persistence/security, or
  durable test-architecture issue.
- **NON-BLOCKING:** maintainability/clarity issue that does not invalidate the
  requested contract.

Verdict: **Approve — technical review passed**, **Request changes — blocking
findings remain**, or **Blocked — required evidence/authority unavailable**.
Technical approval is neither manual gameplay acceptance nor merge authorization.
If HEAD changes after a blocker fix, review the new revision.
