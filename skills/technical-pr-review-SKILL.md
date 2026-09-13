---
name: technical-pr-review
description: Perform a fresh independent Hextech technical review against task scope, architecture/testing contracts, shared consumers, and semantic regressions using a fixed base/head diff.
---

# Technical PR Review

Use this skill for independent technical review after implementation.

The review is not an implementation continuation. Start from the task/spec,
project authorities, BASE SHA, HEAD SHA, actual diff, and tests. Do not accept
the implementer's summary as proof.

## Required inputs

Resolve:

- repository;
- BASE SHA;
- HEAD SHA;
- task/acceptance request;
- applicable `AGENTS.md` files;
- relevant durable authorities;
- changed files and diff.

For gameplay-rule questions, use the local rules-reference skill and local card
data as authority.

## Review axis 1 — Spec and scope

Verify:

- requested behavior is implemented;
- explicit out-of-scope items remain out of scope;
- corpus-expansion work stays inside the approved capability dependency set;
- no speculative keyword/behavior/subsystem implementation was added;
- temporary implementation artifacts are absent from the final diff.

A correct implementation of unrequested capability is still a scope defect.

## Review axis 2 — Architecture and tests

Verify:

- the correct reusable owner was reused/extended;
- no card/deck/set-specific runtime branch implements reusable behavior;
- no parallel abstraction duplicates an adequate existing owner;
- test ownership matches `docs/testing.md`;
- named cards/decks are fixtures/data rather than durable gameplay-test
  boundaries;
- existing accepted PASS_TO_PASS expectations were not silently rewritten;
- new behavior has meaningful FAIL_TO_PASS coverage where applicable;
- registries/validation use a single source of truth.

A green suite does not override an architecture/test-boundary defect.

## Review axis 3 — Regression and semantics

For every shared owner changed:

- inspect existing consumers;
- identify the accepted regression surface;
- check meaningful alternate execution paths;
- verify semantic abstractions retain their intended meaning;
- check state/identity/timing concepts are not conflated;
- verify the change does not weaken previously accepted behavior.

For timing/state-machine work, inspect intermediate checkpoints, not only final
state.

For delayed work, inspect stale-source/new-object behavior.

For Chain changes, distinguish Chain origin, Priority, Focus, trigger ordering,
responses, removal, and Cleanup.

## Evidence

Prefer direct evidence from:

- diff;
- repository authorities;
- focused tests;
- full technical gates;
- source/call-site searches;
- canonical consumers.

Do not treat:

- implementation report;
- comments;
- test names;
- final green status

as sufficient evidence by themselves.

If required commands were not independently observable, say so rather than
claiming them.

## Findings

Report only actionable findings. For each blocker include:

- contract violated;
- concrete code/path;
- why it matters;
- reproducible or reasoned failure path;
- required correction boundary.

Distinguish:

- **BLOCKER** — correctness, regression, scope, semantic, persistence/security,
  or durable test-architecture issue that prevents technical approval;
- **NON-BLOCKING** — maintainability or clarity issue that does not invalidate
  the requested contract.

Do not manufacture low-value findings merely to make the review look thorough.

## Verdict

Use one of:

- **Approve — technical review passed**
- **Request changes — blocking findings remain**
- **Blocked — required evidence/authority is unavailable**

Technical approval is not manual gameplay acceptance and is not merge
authorization.

If implementation changed after a blocker fix, review the new HEAD rather than
assuming the previous approval still applies.
