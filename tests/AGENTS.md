# Test Agent Instructions

## Scope and authority

These instructions apply to `tests/**`.

`docs/testing.md` is the detailed testing authority. This file exists to enforce
the most important rules at the point where tests are authored or changed.

## Durable test ownership

Automated gameplay tests belong to reusable:

- primitives;
- behavior families;
- rules contracts;
- engine subsystems;
- compilers/mappers;
- projection/security contracts;
- generic validation pipelines.

Cards, Champions, Legends, decks, sets, and delivery PRs may expose a need or
provide fixture data. They do not become permanent gameplay-test boundaries.

Name the test file, case, and assertions after the reusable contract.

## Accepted tests are protected history

A passing expectation that represents accepted reusable behavior is
**PASS_TO_PASS** regression evidence.

Do not:

- delete it because new code breaks it;
- weaken its assertion;
- change its expected result merely to restore green;
- replace it with a broader/vaguer expectation.

If an accepted expectation genuinely must change, the task must first establish
an authoritative semantic-contract change, identify affected consumers, define
regression scope, and obtain the required approval.

Refactoring test mechanics is allowed only when semantics remain equivalent.

## New behavior uses FAIL_TO_PASS

A reusable bug fix or extension should normally add a focused generic
**FAIL_TO_PASS** case:

1. establish the relevant PASS_TO_PASS baseline;
2. add the new reusable regression;
3. observe it fail for the intended reason when practical;
4. change production behavior;
5. observe the new case pass;
6. rerun the original PASS_TO_PASS contracts unchanged.

Do not infer that a test was meaningful merely because it is green after the
implementation.

Use `skills/behavior-change-tdd-SKILL.md` for this workflow.

## Manual versus automated scope

Complete card/deck gameplay acceptance remains manual.

When manual gameplay exposes a reusable defect:

- reproduce the shared contract in automation;
- fix the reusable owner;
- protect the accepted behavior there;
- manually revalidate the named card/deck composition.

Do not create a permanent gameplay suite whose durable purpose is only “this
card works.”

## Fixtures

Prefer minimal synthetic fixtures when they make the reusable contract clear.

Use real canonical cards when integration with canonical modeling is itself
under test or the real definition is the clearest fixture. Even then, keep
test ownership/assertions generic.

## Deck and catalog validation

Every permanent deck definition must pass the same canonical generic validation
pipeline.

Do not maintain a second test-only permanent-deck list or create per-deck
validators. Validation inputs must derive from the canonical production
registry.

## Review before completion

For each new or changed test, be able to answer:

- What reusable contract does this protect?
- Which subsystem owns it?
- Is this new behavior FAIL_TO_PASS rather than a rewritten old expectation?
- Which accepted PASS_TO_PASS contracts must remain unchanged?
- Which other consumers share this owner?
- Would this test still have durable value if the exposing card were replaced?

If those answers are unclear, stop and correct the test boundary before merge.
