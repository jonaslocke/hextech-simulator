# PR 01 — Ornn Corpus Expansion Review Corrections

## Purpose

This document defines the correction scope for the current PR 01 revision.

The repository testing and delivery authorities have been updated. Before changing code, read and follow:

- `AGENTS.md`
- `docs/testing.md`
- `docs/deck_validation.md`
- `docs/eight-deck-card-corpus-expansion-plan.md`
- `docs/riftbound_core_rules_reference.md`
- `docs/card_behavior.md`

PR 01 is a **card-corpus expansion slice**. Ornn is the delivery and manual-validation scope; Ornn is not an engine boundary, behavior boundary, or automated-test boundary.

Do not merge PR 01, begin PR 02, or claim manual acceptance. This task returns the PR to technical readiness and independent review only.

---

## Goal

Correct the remaining PR review findings at their reusable owning subsystems, remove out-of-scope production changes that are not required by PR 01, and refactor automated coverage so that it protects reusable behavior, rules, subsystem, catalog, and deck-validation contracts rather than individual Ornn cards or the Ornn deck.

Preserve previously accepted behavior. Any implementation change that affects accepted shared semantics must include the appropriate regression evidence required by the project authorities.

---

# 1. Blocking gameplay findings

## 1.1 Quick-Draw Gear must preserve the correct Chain origin and Focus transition

### Problem

The current Gear-play path can put a Quick-Draw Gear directly into Base and then represent only its triggered attachment ability on the Chain.

That can cause the engine to classify the Chain as having been opened by a triggered ability, even though the Chain was actually opened by playing the Gear card.

This distinction matters during a Showdown because ordinary card-play Chain closure and the triggered/Add Chain exceptions have different Focus behavior.

### Required correction

Model the sequence according to the current local rules:

1. Playing the Gear is the action that opens the Chain.
2. Unit/Gear play follows its normal Finalization/resolution rules.
3. Quick-Draw creates its triggered ability as part of that play sequence.
4. The eventual Focus transition must be determined by the true Chain origin, not by whichever item remains represented after the permanent enters play.

Do not fix this by checking Sterak's Gage, Cloth Armor, Quick-Draw card names, or the Ornn deck ID.

The reusable Chain/play/timing owner must retain enough semantic information to distinguish:

- a Chain opened by playing a card;
- a Chain opened by a triggered ability;
- a Chain opened by an Add ability;
- responses appended to an already-open Chain.

### Required automated contract

Add or update a generic timing/Chain test that proves:

- player A has Focus in an Open Showdown;
- player A plays a Quick-Draw Gear;
- the Gear play and its triggered ability resolve through the correct Chain sequence;
- after the complete ordinary card-play Chain closes, Focus passes according to the normal rule;
- a genuinely trigger-opened Chain still retains Focus according to the triggered-Chain exception;
- an Add-opened Chain still follows its exception.

The test must be owned by the Chain/Focus/play subsystem, not by Sterak's Gage, Cloth Armor, or Ornn.

---

## 1.2 Temporary must be implemented as a triggered ability

### Problem

The current implementation can kill Temporary permanents directly during the Beginning Phase.

Temporary is a triggered ability. Directly moving the permanent to Trash skips the Chain, response window, trigger ordering, and other timing semantics.

### Required correction

Implement Temporary through the generic trigger system at the correct Beginning Phase checkpoint.

The reusable implementation must:

- detect eligible Temporary permanents at the required timing;
- create the appropriate triggered ability on the Chain;
- allow normal Chain processing and legal responses;
- kill the permanent only when the triggered effect resolves;
- preserve correct ordering when multiple start-of-Beginning triggers exist;
- ensure scoring waits for the required pre-scoring triggered work to complete.

Do not special-case Sprite, Sprite Fountain, or any Ornn card.

### Required automated contract

Create or extend a generic Temporary/start-of-phase trigger test proving:

- Temporary creates a Chain item rather than directly mutating the zone;
- the permanent remains present before the trigger resolves;
- players receive the normal response opportunity;
- resolution kills the permanent;
- multiple applicable Beginning triggers follow the generic trigger ordering rules;
- scoring does not occur before the required pre-scoring Chain resolves.

---

## 1.3 Enemy-spell-domain selection must use controller identity correctly

### Problem

The implementation used for the Decree of Focus condition can compare an enemy spell's controller against a **card instance ID** instead of the relevant **player/controller ID**.

This can make a friendly Fury spell incorrectly satisfy a condition that requires the unit to be targeted by an **enemy** Fury spell.

### Required correction

Fix the reusable selector/condition owner so enemy/friendly determination always uses explicit player/controller state.

Never infer ownership or controller from:

- card instance ID text;
- ID shape;
- card name;
- deck identity.

Audit the call path around the affected selector to ensure the parameter contract is semantically typed and cannot easily accept a card instance ID where a player ID is required.

### Required automated contract

At the generic selector/condition level, prove:

- an enemy Fury spell targeting the friendly unit satisfies the condition;
- a friendly Fury spell targeting the same unit does not;
- a non-Fury enemy spell does not;
- unrelated Chain items do not satisfy it;
- controller identity is taken from explicit game state.

The test must not be named or owned by Decree of Focus.

---

# 2. Hidden implementation scope correction

## Problem

The current PR expanded into a broad end-to-end Hidden implementation even though Hidden is not a gameplay dependency of the supplied Ornn deck.

The prior Hidden Gear discussion was used to validate the generic Cleanup/Recall rule. It was not authorization to implement the complete Hidden lifecycle as part of PR 01.

The current program explicitly avoids speculative primitives and broad engine work unrelated to a concrete dependency exposed by the current deck.

## Required action

Re-evaluate every production change added for Hidden against the current PR 01 dependency inventory.

If the complete Hidden lifecycle is not required by an actual Ornn Main Deck, Battlefield, Sideboard, token, or generated dependency:

- remove the out-of-scope production implementation from this PR;
- remove tests whose only purpose is to validate that out-of-scope Hidden implementation;
- preserve only generic changes that are independently required by PR 01 behavior.

The Cleanup/Recall engine must still correctly handle an unattached non-Unit Gear at a Battlefield. If a synthetic or existing generic fixture can prove that contract, use it. Do not keep a complete Hidden feature merely to obtain that regression scenario.

If Codex believes any part of the Hidden production implementation is a direct PR 01 runtime dependency, document the exact dependency before retaining it.

Do not broaden PR 01 to implement unrelated cards simply because they are convenient test cases.

---

# 3. Refactor automated tests to the durable testing model

The updated repository testing contract is authoritative.

## Core rule

> Cards and decks can expose gaps; reusable owners acquire automated tests.

Ornn is the current delivery and manual-validation scope. It must not create an `ornn-*` family of permanent gameplay tests.

### Required refactor

Inventory all tests added or materially rewritten by PR 01 and classify each assertion by its durable owner.

Known examples that require review include:

- `tests/ornn-blacksmith-regressions.test.ts`
- `tests/ornn-optional-costs.test.ts`
- `tests/ornn-resource-regressions.test.ts`
- `tests/ornn-equipment-regressions.test.ts`
- card-behavior assertions inside `tests/ornn-card-catalog.test.ts`
- any other test whose durable purpose is phrased as "this Ornn card works"

Do **not** simply delete useful coverage.

Move or rewrite the assertions under the reusable contracts that own them.

Examples:

| Current discovery source | Durable automated owner |
| --- | --- |
| Ornn, Blacksmith | look/search/select/reveal/recycle behavior |
| Clockwork Keeper | optional additional-cost / play-finalization contract |
| Ornn Legend / Seal | Add resources, restricted resources, manual/automatic payment |
| Cloth Armor | Shield / characteristic-modifier calculation |
| Veiled Temple | ready/detach + Cleanup/Recall |
| Quick-Draw Equipment | play/Chain/trigger/attachment timing |
| Defy | generic Chain-item selector and counter behavior |
| Decree of Focus | generic domain/controller condition/selector |
| attachment visual bugs | generic attachment projection/layout |
| Awaken Legend bug | generic Awaken ready contract |

A real canonical card may remain fixture data when useful, but:

- the test file name must describe the reusable owner;
- the test case name must describe the reusable contract;
- the assertions must be generic;
- another card using the same behavior must rely on the same contract.

Avoid permanent test ownership by card, deck, set, or PR.

---

# 4. Deck and catalog validation must be generic

The updated deck-validation contract requires:

> Every permanent deck definition must pass the canonical deck-validation pipeline.

## Required correction

Remove PR-specific automated tests whose durable purpose is to prove generic deck construction facts for Ornn, such as:

- Sideboard size;
- Rune Deck count;
- Battlefield count;
- copy limits;
- Champion/Legend construction;
- domain legality;
- canonical card resolution;
- ordinary fresh-deck construction.

Instead, ensure the generic deck-validation/catalog test path discovers and validates all applicable permanent deck definitions, including the newly added Ornn deck.

The Ornn deck may be one row/input in that generic corpus. It must not own its own validator.

Likewise, individual canonical behavior assertions for Sterak's Gage, Defy, Ornn Blacksmith, or other cards do not belong in an Ornn deck-validation test. Move those to their reusable primitive/compiler/subsystem contracts if automated coverage is warranted.

The complete Ornn deck as a gameplay experience remains part of manual PR acceptance.

---

# 5. Regression protection

The current PR has already exposed regressions in previously accepted behavior. The correction must therefore treat regression protection as part of implementation, not as a final checklist.

For every shared subsystem changed:

1. identify its accepted consumers;
2. preserve or extend the existing reusable tests;
3. add focused regression coverage for the exact shared contract that failed;
4. verify that the correction does not change unrelated semantics;
5. document any semantic change that genuinely affects accepted behavior before implementing it.

At minimum, re-check affected accepted behavior around:

- restricted Add resources;
- manual and automatic payment;
- Awaken readiness;
- Chain origin / Focus / Priority;
- attachment state;
- Cleanup / Recall;
- Shield and characteristic calculation;
- player decisions and card-image selection;
- counter/Chain-item selection.

Do not create card-specific regression files for these consumers. Use the reusable subsystem tests.

---

# 6. Reuse-first implementation discipline

Before introducing a new component, runtime flow, decision shape, selector, action, payment path, or UI pattern:

1. search the repository for the existing subsystem that owns the behavior;
2. inspect its contract, existing consumers, and tests;
3. reuse it when it already satisfies the requirement;
4. extend it generically when necessary;
5. create a new abstraction only when the current owners are genuinely unsuitable.

The final implementation report must identify the reused or extended owner for each correction.

No card-name, deck-ID, or set-specific runtime branch is acceptable.

---

# 7. Technical readiness

Before returning the PR for independent re-review, run the technical checks required by the repository and the eight-deck plan, including the applicable:

- focused reusable subsystem tests;
- generic permanent-deck validation;
- catalog consistency checks;
- `npm run typecheck`;
- `npm test`;
- `npm run lint`;
- `npm run build`;
- `git diff --check`.

Report only checks actually executed.

A green suite is not sufficient if the tests are at the wrong abstraction or encode an incorrect rules interpretation.

---

# 8. Required final implementation report

Return a concise implementation report containing:

| Finding | Root cause | Reusable owner | Correction | Automated contract | Regression consumers | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Quick-Draw Chain origin | ... | ... | ... | ... | ... | Fixed / Blocked |
| Temporary timing | ... | ... | ... | ... | ... | Fixed / Blocked |
| Enemy spell controller/domain | ... | ... | ... | ... | ... | Fixed / Blocked |
| Hidden scope | ... | ... | ... | ... | ... | Removed / Retained with dependency |
| Test architecture | ... | ... | ... | ... | ... | Fixed / Blocked |
| Generic deck validation | ... | ... | ... | ... | ... | Fixed / Blocked |

Also report:

- card/deck-specific gameplay test files removed or refactored;
- new or extended reusable test files;
- any production code removed as out of scope;
- all commands run and their results;
- remaining risks or blockers.

Do not claim PR acceptance. The next step after technical readiness is independent re-review.

---

# 9. Durable-artifact cleanup before completion

This implementation request is a working artifact, not a durable project authority.

After implementation is complete, before presenting the branch as ready for review:

- remove this task/request document from the repository if it was added only to drive this implementation;
- remove prior one-off defect reports or correction prompts that were added only as temporary implementation input, unless the user explicitly promoted one to a maintained authority;
- remove temporary screenshots, copied game-state reproductions, debug exports, local analysis files, temporary migration/check scripts, and generated investigation artifacts that do not provide ongoing project value;
- remove superseded temporary notes created during this correction cycle.

Do **not** delete maintained authorities or durable project artifacts, including:

- `AGENTS.md`;
- `docs/testing.md`;
- `docs/deck_validation.md`;
- `docs/eight-deck-card-corpus-expansion-plan.md`;
- `docs/riftbound_core_rules_reference.md`;
- other existing maintained architecture/product/rules authorities;
- source code and reusable tests that form part of the accepted implementation.

The final diff must contain only durable production code, durable generic tests, maintained project documentation, required catalog/deck data, and other explicitly accepted durable artifacts.

Do not retain this correction document merely because it was useful during implementation.

---

# 10. Completion boundary

This task is complete only when:

- all three blocking gameplay findings are corrected at reusable owners;
- out-of-scope Hidden work is removed unless a concrete PR 01 dependency is demonstrated;
- card/deck-centric automated gameplay tests are refactored into reusable subsystem/behavior contracts;
- every permanent deck definition, including Ornn, is covered by the canonical generic deck-validation pipeline;
- affected accepted consumers have appropriate regression evidence;
- technical readiness checks pass;
- temporary/non-durable implementation artifacts are removed;
- the PR is ready for an independent re-review.

Do not merge PR 01.
Do not begin PR 02.
Do not mark the Ornn deck manually accepted.
