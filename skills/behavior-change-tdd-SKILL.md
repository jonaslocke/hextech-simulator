---
name: behavior-change-tdd
description: Enforce PASS_TO_PASS preservation and FAIL_TO_PASS evidence when fixing or extending reusable Hextech behaviors and engine subsystems.
---

# Behavior Change TDD

Use this skill for reusable behavior/subsystem fixes and extensions.

This is not a requirement to automate complete card gameplay. The test seam is
the reusable owner defined by `docs/testing.md`.

## Core contract

```text
existing accepted GREEN
  -> new generic RED
    -> implementation
      -> new GREEN
        -> existing accepted GREEN unchanged
```

The purpose is twofold:

1. prove the new test can detect the missing/broken behavior;
2. prove the extension did not rewrite previously accepted history.

## 1. Find the durable test seam

Before writing a test, identify the primitive, behavior family, rules contract,
subsystem, compiler, projection, or generic validation pipeline that owns the
behavior.

Do not create a card/deck-owned gameplay test merely because a named card
exposed the defect.

Use a synthetic fixture when it makes the reusable contract clearer. A real
card may remain fixture data when canonical integration is part of the contract.

## 2. Capture PASS_TO_PASS

Identify and run the existing accepted tests for the owner before production
changes.

Treat their semantic expectations as protected.

Do not:

- delete them;
- weaken them;
- rewrite expected values;
- replace them with vaguer assertions.

If an old expectation appears wrong, stop and use the semantic-contract change
gate in `docs/testing.md`.

## 3. Create FAIL_TO_PASS

Add the smallest generic case that proves the missing requirement.

Run it against the pre-change production code and confirm that it fails for the
intended reason.

A compile error caused only by test code using an API that does not exist can be
valid RED when the API itself is the requested contract, but prefer behavioral
failure when practical.

Do not claim RED without actually observing it.

## 4. Implement the smallest generic correction

Change the reusable owner, not the fixture card.

Do not add speculative behavior outside the approved scope.

Do not edit the new test merely because the first implementation does not pass;
first determine whether the implementation or the test's authoritative contract
is wrong.

## 5. Prove GREEN and non-regression

Run:

1. the new FAIL_TO_PASS case;
2. the original PASS_TO_PASS set unchanged;
3. proportional tests for accepted consumers;
4. broader project gates according to risk.

A new green case plus a broken old contract is a failed change.

## 6. Exceptions

RED-before-implementation may be impractical for:

- pure documentation;
- generated-output refreshes where behavior is unchanged;
- external/manual-only interaction defects with no deterministic reusable seam.

When an exception applies, state why and use the strongest deterministic
evidence available. Do not invent a meaningless automated test merely to satisfy
the ritual.

## 7. Final report

Report:

- reusable owner;
- PASS_TO_PASS baseline executed;
- new FAIL_TO_PASS case and observed pre-fix failure;
- production correction;
- post-fix result;
- accepted consumer coverage;
- any test expectation changed, with explicit semantic authority.

If trace evidence is unavailable, do not claim a RED step that was not observed.
