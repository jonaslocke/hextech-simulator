# Testing Contract

## Authority

This document defines Hextech Simulator's durable automated-testing contract.

> **Cards and decks can expose gaps; reusable owners acquire automated tests.**

Complete card/deck gameplay acceptance remains manual. Automation protects the
reusable contracts that make those composed experiences work.

## 1. Durable test boundary

Automated gameplay tests belong to stable reusable owners such as primitives,
behavior families, timing/trigger contracts, selectors, payment/resources,
modifiers, attachments/zone transitions, Chain/Focus/Priority, player decisions,
projections, behavior compilation, catalog invariants, or generic deck
validation.

A card, Champion, Legend, deck, set, or delivery milestone does not become a
permanent gameplay-test boundary merely because it exposed the work.

A real card may be fixture data when useful. The test is still generic when its
name, ownership, and assertions describe the reusable contract and another
consumer of that contract relies on the same behavior. Prefer a minimal
synthetic fixture when it expresses the contract more clearly.

## 2. Accepted contract lifecycle

A passing test expectation that represents accepted reusable behavior is
protected regression history: **PASS_TO_PASS**.

Behavior extensions add evidence; they do not rewrite accepted history.

Do not delete, weaken, broaden, or change an accepted expectation merely because
a new implementation makes it fail. A failing accepted test is evidence of a
regression or a possible semantic-contract change, not an instruction to update
the test.

### Semantic-contract change gate

An accepted expectation may change only when all are true:

1. an authoritative rules source or approved product decision changes the
   semantic contract;
2. the change is explicitly identified as semantic;
3. affected accepted consumers are inventoried;
4. regression and migration/persistence impact are defined where relevant;
5. explicit approval is obtained before rewriting the expectation.

Refactoring test mechanics without changing semantics is allowed.

## 3. FAIL_TO_PASS for new behavior

A reusable bug fix or extension should normally add a focused **FAIL_TO_PASS**
case that fails before the correction for the intended reason and passes after
it.

Preferred sequence:

```text
accepted GREEN
  -> new generic RED
    -> smallest reusable correction
      -> new GREEN
        -> accepted GREEN unchanged
```

If true RED demonstration is impractical, document why and use the strongest
deterministic evidence available. Never claim RED that was not observed.

Use `skills/behavior-change-tdd-SKILL.md` for the procedure.

## 4. Regression scope follows consumers

When a shared owner changes, identify its accepted consumers before finalizing
the correction. Regression scope follows that owner, not the current delivery
card/deck.

For state-machine/timing defects, assert relevant intermediate checkpoints, not
only the final board state. Protect invariants exposed by meaningful alternate
execution paths.

Manual findings should produce reusable automated regressions when they expose a
stable shared defect, followed by manual revalidation of the composed card/deck
experience.

## 5. Generic deck and catalog validation

Every permanent deck definition must pass the canonical deck-validation
pipeline. The automated suite must discover permanent definitions from the same
canonical production registry; do not maintain a second test-only list or
per-deck validators for generic legality rules.

Catalog/publication tests should likewise be data-driven across the applicable
registry/corpus. A new card that exposes a compiler, mapper, publication, or
schema gap strengthens that generic contract rather than acquiring a permanent
card-owned suite.

## 6. Naming and review

Tests remain under `tests/**/*.test.ts` and should be named after the durable
contract they protect.

Before merge, a new/changed gameplay test should answer:

- What reusable contract and subsystem own this assertion?
- Is the named card only fixture data?
- Is this new FAIL_TO_PASS evidence or an edited PASS_TO_PASS expectation?
- If an accepted expectation changed, where are the authority and approval?
- Which accepted consumers share this owner?
- Is any generic registry/validation logic being duplicated?

If those answers are unclear, correct the test boundary before merge.
