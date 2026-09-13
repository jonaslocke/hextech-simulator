# Testing Contract

## Authority

This document defines the durable automated-testing contract for Hextech Simulator.

Testing must preserve the same architecture used by the runtime: cards and decks
consume reusable behavior, rules, and validation systems; they do not own isolated
gameplay implementations.

The governing principle is:

> **Cards and decks can expose gaps; reusable owners acquire automated tests.**

A card or deck may be the reason a defect or missing capability is discovered,
but the durable automated test belongs to the primitive, behavior family, rules
contract, subsystem, or generic validation pipeline that owns the behavior.

Manual gameplay remains the final acceptance authority for complete card and deck
experiences when required by the active program.

---

## 1. Automated-test boundaries

Automated gameplay tests must target durable reusable contracts such as:

- behavior primitives;
- trigger and timing contracts;
- selectors and conditions;
- payment and resource systems;
- modifiers and characteristic calculation;
- attachment, movement, Cleanup, Recall, and zone-transition systems;
- Chain, Focus, Priority, and response-window rules;
- player-decision and effect-continuation contracts;
- projection and hidden-information boundaries;
- canonical behavior compilation;
- deck-validation rules;
- catalog/repository invariants;
- match, BO3, and sideboarding contracts;
- deterministic regressions at the reusable owner of a confirmed defect.

Do not create an automated gameplay-test boundary merely because a card, Champion,
Legend, deck, set, or delivery milestone introduced the work.

The implementation scope and the automated-test scope are different concepts.

---

## 2. Card and deck scope is not test ownership

A named card may reveal that the engine lacks a reusable capability. In that case:

1. identify the reusable owner of the behavior;
2. reproduce the defect or missing behavior at that owner;
3. establish the accepted PASS_TO_PASS baseline;
4. add or extend the focused FAIL_TO_PASS contract there;
5. implement the generic correction;
6. verify affected accepted consumers;
7. manually validate the named card as part of the relevant delivery scope.

Do not retain a permanent automated gameplay test whose durable purpose is only
"this named card works."

Likewise, a deck may define which cards must become playable in a delivery slice,
but it does not become an automated-test subsystem.

For corpus-expansion work:

> **The deck defines implementation and manual-validation scope. It does not
> define automated-test scope.**

---

## 3. Real cards as fixture data

A real named card may be used as fixture data when its canonical definition is
useful or necessary to reproduce a reusable contract.

Using a real card as fixture data does **not** make a test card-specific when all
of the following are true:

- the test name describes the reusable behavior or subsystem;
- the test file is owned by that reusable behavior or subsystem;
- the assertions describe a generic contract;
- another card binding to the same behavior would rely on the same contract;
- removing or replacing that particular fixture card would not remove the
  durable reason for the test.

Prefer synthetic/minimal definitions when they make the reusable contract clearer
and cheaper to maintain. Prefer real canonical definitions when the integration
between canonical modeling and the reusable runtime contract is itself what must
be validated.

---

## 4. Prohibited card-by-card gameplay testing

Do not create or grow suites organized as permanent gameplay checks for individual
cards or delivery decks, for example:

- `ornn-blacksmith-regressions.test.ts`;
- `clockwork-keeper.test.ts`;
- `kennen-card-behaviors.test.ts`;
- one gameplay test file per deck;
- one test matrix per card in the executable corpus.

A confirmed manual defect discovered through one card must not automatically
produce a test named after that card. First identify which reusable contract
failed.

Examples:

- A card with "look at the top N, optionally choose a matching card, recycle the
  rest" should strengthen the generic search/look/select/recycle contract.
- A card with an optional additional Power cost should strengthen the optional
  additional-cost/payment contract.
- A Legend that adds restricted Power should strengthen resource-source and
  restricted-payment contracts.
- A Gear that exposes an attachment/Cleanup defect should strengthen attachment,
  Cleanup, Recall, or zone-transition contracts.
- A card that exposes incorrect Focus after a Chain should strengthen the Chain
  origin / Focus / Priority timing contract.

---

## 5. Generic deck validation

Deck construction and legality are generic product contracts.

> **Every permanent deck definition must pass the canonical deck-validation pipeline.**

The automated validation suite must discover applicable permanent deck definitions
from the canonical production registry and validate them through the same generic,
data-driven path.

Do not maintain a second test-only list that can drift from production.

Deck-specific test suites must not be created to reassert generic construction
rules such as:

- Main Deck minimum size;
- copy limits;
- Sideboard limits;
- Rune Deck size and compatibility;
- Battlefield count and uniqueness;
- Champion and Legend requirements;
- domain identity;
- Signature restrictions;
- section/card-type legality;
- canonical card resolution;
- registered-copy conservation where applicable.

A specific deck may appear as one input row in a generic permanent-deck validation
corpus. Its presence as input does not make the test deck-specific.

If a deck fails validation, fix the deck definition, canonical data, or generic
validator as appropriate. Do not add a special validator or special test for that
deck.

---

## 6. Canonical corpus and publication tests

Generic catalog and canonical-publication tests may verify contracts such as:

- every published gameplay definition resolves to a canonical card;
- approved behavior bindings reference executable primitives;
- source identities and equivalent print variants canonicalize correctly;
- required generated/token dependencies resolve;
- every permanent deck references canonical executable definitions;
- canonical definitions can produce valid runtime snapshots through normal paths.

These checks should be data-driven across the applicable corpus or registry.

Do not create a per-card publication test simply because a card was introduced in
the current delivery slice. If a new card exposes a compiler, mapper, publication,
or schema gap, test that generic contract.

---

## 7. Accepted contract lifecycle

Once a reusable behavior expectation has been accepted and is represented by a
passing automated test, that expectation becomes protected regression history.

The default rule is:

> **Behavior extensions add evidence; they do not rewrite accepted history.**

Existing accepted expectations are **PASS_TO_PASS** contracts. They must remain
semantically unchanged and passing across later extensions unless an
authoritative rules or approved product decision changes the contract.

This prevents implementation and tests from drifting together while always
remaining green.

A failing accepted test after a new implementation is evidence to investigate,
not an instruction to update the test.

---

## 8. PASS_TO_PASS and FAIL_TO_PASS

### PASS_TO_PASS

PASS_TO_PASS contracts:

- pass before the requested change;
- encode accepted reusable behavior;
- remain unchanged in semantic expectation;
- must pass after the change.

For shared-engine work, identify and run the relevant PASS_TO_PASS baseline before
editing production semantics.

### FAIL_TO_PASS

FAIL_TO_PASS coverage:

- describes the newly required reusable behavior or confirmed shared defect;
- fails before the correction for the intended reason when practical;
- passes after the correction.

The preferred change sequence is:

```text
accepted baseline GREEN
  -> new generic regression RED
    -> production correction
      -> new regression GREEN
        -> accepted baseline still GREEN unchanged
```

A green test written only after the implementation is weaker evidence because it
does not prove that the test detects the prior defect.

If a true RED demonstration is impractical, document why and use the strongest
available deterministic evidence. Do not fabricate RED claims.

---

## 9. Existing-test modification gate

Do not weaken, delete, or rewrite a valid accepted expectation merely to make a
new implementation pass.

An accepted expectation may change only when all of the following are true:

1. an authoritative rules source or approved product decision changes the
   semantic contract;
2. the change is explicitly identified as a semantic-contract change;
3. affected accepted consumers are inventoried;
4. regression and migration/persistence impact are defined where relevant;
5. explicit approval is obtained before the expectation is rewritten.

Refactoring test mechanics without changing semantics is allowed.

If it is unclear whether a test expectation represents accepted semantics, treat
it as protected until the ambiguity is resolved.

---

## 10. Regression testing and consumer impact

A regression test must preserve reusable knowledge.

For a confirmed defect:

1. identify the reusable owner;
2. reproduce the failing contract deterministically where practical;
3. identify accepted consumers of that owner;
4. make the smallest generic correction;
5. assert both corrected behavior and relevant invariants;
6. run proportional regression coverage for accepted consumers.

When timing is the defect, assert intermediate checkpoints, not only the final
board state.

When a shared primitive changes, regression scope follows the actual accepted
consumers of that primitive, not the delivery deck that happened to expose the
change.

Previously manually accepted cards matter as consumers of reusable behavior, but
they do not acquire permanent card-specific gameplay suites. Their reusable
contracts receive the regression protection.

---

## 11. Test naming and organization

The current Node test-runner convention remains:

```text
tests/**/*.test.ts
```

Name test files and test cases after the durable contract they protect.

Prefer names such as:

```text
optional-additional-cost.test.ts
restricted-resource-payment.test.ts
search-top-deck.test.ts
attachment-cleanup.test.ts
chain-focus-transition.test.ts
permanent-deck-validation.test.ts
canonical-behavior-compilation.test.ts
```

Avoid names whose ownership is a card, Legend, Champion, deck, set, or PR unless
the thing under test is genuinely a data artifact rather than gameplay behavior.

---

## 12. Manual validation

Automated tests are not a substitute for complete gameplay acceptance.

During card-corpus expansion, manual validation proves that:

- the current delivery deck is selectable and usable through the actual product;
- its canonical cards are modeled correctly in real gameplay;
- newly introduced or changed behavior families compose correctly;
- Sideboard and BO3 flows work when required;
- UI and interaction behavior matches the server-authoritative contracts.

Manual findings feed reusable automated regressions when they expose a stable
contract defect.

The durable split is:

- **automated tests protect reusable knowledge;**
- **manual validation accepts the complete card/deck experience.**

Once a manual finding establishes that a shared contract was wrong, fixing that
contract and adding reusable automated coverage should prevent the same shared
failure from silently returning in later corpus work.

---

## 13. Review requirements

When reviewing new or changed tests, verify:

- What reusable contract does this test protect?
- Which subsystem owns that contract?
- Is a named card only fixture data, or has it incorrectly become the test
  boundary?
- Is this a new FAIL_TO_PASS case or an edited PASS_TO_PASS expectation?
- If an accepted expectation changed, where is the authoritative semantic change
  and approval?
- Which previously accepted consumers share this owner?
- Could the same assertion protect another card using the same primitive?
- Is generic deck/catalog validation being duplicated for one delivery deck?
- Does the regression capture the real defect at the lowest durable layer?
- Are affected accepted consumers covered proportionally to risk?

A test that cannot answer these questions clearly should be challenged before
merge.
