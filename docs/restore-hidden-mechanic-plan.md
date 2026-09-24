# Restore Hidden Mechanic from Previously Working Subsystem

## Objective

Restore the Riftbound **Hidden / Hide** mechanic that was previously implemented and later removed, using the last known-good implementation as the primary behavioral and architectural reference.

This work must begin from the current `main` branch, be implemented on a new dedicated branch, and finish as a Pull Request that can be reviewed before merge.

The intent is **not** to redesign Hidden, reimplement it from scratch, or blindly revert historical commits. The intent is to recover the previously working subsystem while preserving legitimate engine, catalog, Gear, UI, and architecture changes that were introduced afterward.

---

## Known Regression History

Git history already established the relevant baseline:

- `7b2801f` — `fix: execute Hidden cards through canonical game flow`
  - Known-good implementation of Hidden gameplay.
  - Added Hide and play-from-Hidden flows.
  - Marked `keyword.hidden` as executable.

- `9924544` — `fix: restore pr01 technical readiness`
  - Later removed the Hidden gameplay paths.
  - Changed Hidden back to requiring engine support.

The current branch descends from the removal.

Therefore this task must treat the issue as a **regression restoration**, not as a new mechanic implementation.

---

## Source of Truth

Use the following authority order while restoring the mechanic:

1. Current Riftbound core rules in the repository.
2. The previously working implementation from commit `7b2801f`.
3. Current engine architecture and contracts on `main`.
4. Current Gear, Cleanup, projection, interaction, and catalog behavior.

The historical implementation is a reference for intended subsystem behavior, but current `main` remains the integration target.

Do not restore obsolete architecture simply because it existed in `7b2801f`.

---

## Required Git Workflow

### 1. Start from Current Main

Before making changes:

```bash
git checkout main
git pull
git status
```

The working tree must be clean.

Do not base this work on the current Ornn feature branch or any other in-progress branch.

### 2. Create a Dedicated Recovery Branch

Create a new branch from the updated `main`.

Suggested name:

```bash
git checkout -b fix/restore-hidden-mechanic
```

Equivalent names are acceptable if they follow repository conventions.

### 3. Inspect Historical Changes Before Editing

Review both relevant commits before making implementation changes:

```bash
git show 7b2801f
git show 9924544
```

Also inspect the commit ranges around them where useful:

```bash
git log --oneline --decorate --graph --all
git diff 7b2801f^ 7b2801f
git diff 9924544^ 9924544
```

The purpose is to determine:

- which files originally implemented Hidden;
- which engine/state/action/projection/UI paths were added;
- which files were later removed or altered;
- why `9924544` removed or disabled the subsystem;
- which surrounding systems have changed since then.

Do not assume that every line removed by `9924544` should be restored.

---

## Investigation Phase

Before implementation, produce a concise internal inventory of the previously working Hidden subsystem.

The inventory should identify the historical owners of:

- Hidden keyword executable metadata;
- Hide action discovery;
- Hide cost/payment;
- facedown Battlefield-zone state;
- facedown occupancy validation;
- play-from-Hidden action discovery;
- play-from-Hidden timing;
- target restriction to the associated Battlefield;
- Chain integration;
- viewer-safe projection;
- owner/opponent information visibility;
- cleanup behavior;
- UI rendering and interaction;
- automated tests or regression coverage.

For each historical file, classify it as one of:

- **restore largely as-is**;
- **port into current equivalent subsystem**;
- **obsolete because current architecture replaced it**;
- **requires adaptation because of later changes**.

Do not begin by copying code until this mapping is understood.

---

## Rules Behavior That Must Be Restored

The implementation must preserve the current Riftbound rules for Hidden.

### Hide Action

A card with Hidden may be hidden from hand when its prerequisites are satisfied.

Hiding:

- is a discretionary action;
- is not a Play action;
- does not open the Chain;
- pays the Hidden cost;
- places the card facedown into the Facedown Zone associated with a Battlefield the player controls;
- may only use a Facedown Zone that is eligible and unoccupied.

Each Battlefield has one Facedown Zone and that zone may contain at most one card.

### Hidden Card State

A card hidden at a Battlefield:

- remains associated with that Battlefield's Facedown Zone;
- is private to the appropriate viewer;
- must not leak its identity to the opponent through projections, logs, legal-action metadata, prompts, or other transport fields;
- remains subject to the current rules for loss of Battlefield control and Cleanup.

### Playing from Hidden

Beginning on the next player's turn, the Hidden card becomes eligible to be played from facedown according to the Hidden rules.

Playing from Hidden:

- gains Reaction timing as defined by the keyword;
- ignores the card's base play cost as defined by the rules;
- does open the Chain;
- must use only valid choices associated with the Battlefield where the card was hidden;
- must remain illegal when no valid targets or choices exist.

### Normal Play Remains Available

A card with Hidden must still be playable normally from hand using its printed cost and normal timing.

Hidden must add an alternative action.

It must not replace ordinary Play.

---

## Integration Requirements

The restored mechanic must follow the current server-authoritative architecture.

### Server Legal Actions

The server must remain the source of truth for:

- whether a card may be hidden;
- eligible Battlefield destinations;
- whether a Facedown Zone is available;
- whether a hidden card is currently playable;
- valid targets and choices;
- timing and payment legality.

The client must consume projected legal actions rather than independently reconstructing Hidden legality.

### Canonical State

Restore or adapt any state required to represent:

- the facedown card;
- the associated Battlefield / Facedown Zone;
- ownership and controller;
- Hidden eligibility timing;
- any metadata needed to distinguish an actually hidden card from another facedown effect.

Prefer existing current state structures if they already support the required information.

Do not introduce card-name-specific state.

### Projection and Privacy

Projection must preserve private information.

At minimum:

**Owner view**
- can identify their own hidden card;
- can see legal actions available for it.

**Opponent view**
- can see only the facedown information allowed by the rules;
- must not receive card identity through DTO fields, action metadata, logs, inspection models, or UI props.

Privacy must be enforced server-side.

Hiding a frontend component is not sufficient.

### Chain and Timing

Preserve the current engine's Focus, Priority, Chain, and Showdown architecture.

Do not recreate a historical timing path if the current engine has a newer canonical mechanism.

Required distinction:

- Hide action: no Chain.
- Play from Hidden: normal Chain execution with Reaction timing.

### Payment

Reuse the current payment subsystem.

Do not introduce a special card-specific payment path.

The Hidden cost and the ignored base cost when playing from Hidden must integrate with current payment planning and validation.

### Cleanup

Integrate with the current Cleanup implementation.

In particular, preserve current rules affecting:

- facedown cards when Battlefield control changes;
- permanents created or played at Battlefields;
- Gear recall behavior.

---

## Gear Compatibility Requirement

Hidden restoration must be compatible with the corrected Gear subsystem.

This is especially important for **Zhonya's Hourglass**.

Expected lifecycle:

1. Zhonya's Hourglass is hidden facedown at a controlled Battlefield.
2. On a later eligible turn, it is played from Hidden.
3. Playing it from Hidden opens the Chain.
4. It resolves at the Battlefield associated with its Facedown Zone.
5. When the next applicable Cleanup occurs, current Gear rules recall it to its controller's Base.

Do not restore historical behavior that would leave a resolved Gear permanently or incorrectly located at the Battlefield.

Do not add a Zhonya-specific engine branch.

The behavior must emerge from generic Hidden + Gear + Cleanup rules.

---

## Catalog / Behavior Runtime

Restore `keyword.hidden` as an executable mechanic only when the runtime support is actually restored.

The catalog must not claim Hidden is executable before the engine path is functional.

After implementation:

- cards using Hidden must compile against executable behavior definitions;
- behavior synchronization must succeed;
- playable deck validation must no longer reject cards only because Hidden is marked unsupported.

Do not modify unrelated behavior definitions merely to make synchronization pass.

---

## UI Requirements

Restore the existing Hidden interaction model using the current game-board architecture.

The UI must support:

- identifying legal Hide actions from cards in hand;
- selecting an eligible Battlefield / Facedown Zone;
- rendering a facedown card at that Battlefield;
- showing the owner enough information to understand their own hidden card;
- keeping the opponent's information concealed;
- surfacing play-from-Hidden actions when legal;
- using the current action-submission and decision systems.

Do not implement client-only state transitions.

The visual board must update from the authoritative server projection.

If the historical Hidden UI conflicts with current board architecture, port its behavior into the current components and interaction hooks rather than restoring obsolete component structure.

---

## Historical Restoration Strategy

Do **not** use either of these approaches as the primary implementation strategy:

```bash
git revert 9924544
```

or

```bash
git cherry-pick 7b2801f
```

These commits predate later architectural and gameplay changes.

Instead:

1. inspect the historical implementation;
2. identify the behavior and subsystem boundaries it introduced;
3. compare them with current `main`;
4. port the minimum required behavior into the current owners;
5. preserve later legitimate changes;
6. use historical code selectively when it still matches current architecture.

Individual historical hunks may be reused where appropriate, but the resulting implementation must look like a current-system change, not a rollback of unrelated evolution.

---

## Regression Investigation

Determine why `9924544` removed Hidden.

The PR must include a concise explanation of the discovered reason if the Git history or surrounding changes make it identifiable.

Specifically verify whether the removal was caused by:

- catalog synchronization;
- unsupported primitive metadata;
- technical-readiness checks;
- stale generated artifacts;
- state/schema incompatibility;
- test failures;
- deck loading;
- engine timing conflicts;
- another dependency introduced around PR01.

The restored implementation must avoid reintroducing the legitimate problem that motivated the removal.

If the historical reason cannot be conclusively determined, state that explicitly in the PR rather than speculating.

---

## Acceptance Scenarios

The implementation is not complete until the following behaviors are validated.

### Scenario 1 — Hide a Legal Card

Given a player has a Hidden card in hand  
And controls an eligible Battlefield  
And that Battlefield's Facedown Zone is empty  
And the player can pay the Hidden cost  
When the player chooses Hide  
Then the cost is paid  
And the card leaves the hand  
And the card occupies that Battlefield's Facedown Zone  
And no Chain is opened.

### Scenario 2 — Occupied Facedown Zone

Given a Battlefield already contains a facedown card  
When the player inspects legal Hide actions  
Then that Battlefield is not an eligible Hide destination.

### Scenario 3 — Opponent Privacy

Given Player A hides a card  
When Player B receives their projection  
Then Player B can see only the permitted facedown state  
And cannot determine the hidden card's identity from projection data, logs, actions, or UI metadata.

### Scenario 4 — Owner Visibility

Given Player A hides a card  
When Player A receives their projection  
Then Player A can identify their own hidden card  
And can understand when it becomes legally playable.

### Scenario 5 — Cannot Play Too Early

Given a card was just hidden  
When the controller receives actions before Hidden's timing condition is satisfied  
Then play-from-Hidden is not available.

### Scenario 6 — Play from Hidden

Given the Hidden card has become eligible  
And legal targets or choices exist at its associated Battlefield  
When the controller plays the card from Hidden  
Then it uses Hidden's Reaction timing  
And ignores the base play cost as required  
And the play opens the Chain  
And normal Chain resolution follows.

### Scenario 7 — Battlefield-Restricted Choices

Given a Hidden card requires a target or choice  
When it is played from Hidden  
Then legal choices are restricted to the Battlefield associated with its Facedown Zone.

### Scenario 8 — No Legal Target

Given an eligible Hidden card has no valid target or choice at its associated Battlefield  
When legal actions are generated  
Then play-from-Hidden is not offered.

### Scenario 9 — Normal Hand Play Still Works

Given a card has Hidden and is in hand  
When its normal Play requirements are satisfied  
Then it can still be played normally using its normal timing, targeting, and cost.

### Scenario 10 — Loss of Battlefield Control

Given a player has a hidden card in a Battlefield's Facedown Zone  
When that player loses control of the Battlefield  
Then the facedown card follows the current Cleanup rules for that state.

### Scenario 11 — Hidden Gear / Zhonya's Hourglass

Given Zhonya's Hourglass was hidden at a Battlefield  
When it becomes eligible and is played from Hidden  
Then it resolves using the Hidden rules  
And after the appropriate Cleanup it is recalled to its controller's Base according to current Gear rules.

### Scenario 12 — Hidden Spell

Given a Hidden Spell is legally hidden  
When it is later played from Hidden  
Then it uses the generic Hidden execution path  
And resolves as a Spell through the normal Chain.

### Scenario 13 — Hidden Unit

Given a Hidden Unit is legally hidden  
When it is later played from Hidden  
Then it uses the generic Hidden execution path  
And resolves through the normal Unit play flow.

### Scenario 14 — Catalog Executability

Given Hidden runtime support has been restored  
When behavior definitions are synchronized and cards are loaded  
Then `keyword.hidden` is executable  
And Hidden cards are not rejected merely because the keyword requires unsupported engine work.

---

## Automated Validation

Recover useful historical Hidden tests where they still describe valid behavior.

Do not blindly restore obsolete snapshots or architecture-dependent tests.

Add or adapt focused regression coverage for at least:

- Hide legal-action generation;
- occupied Facedown Zone rejection;
- Hide transition and payment;
- no-Chain behavior for Hide;
- play-from-Hidden eligibility timing;
- play-from-Hidden cost behavior;
- target restriction to the associated Battlefield;
- opponent projection privacy;
- normal play of Hidden cards from hand;
- cleanup after loss of Battlefield control;
- Hidden Gear interaction;
- catalog executability / behavior synchronization.

Prefer deterministic engine and projection tests over broad UI snapshots.

---

## Dedicated Hidden Manual-Test Deck

A playable deck fixture containing multiple copies of a Hidden card is part of this task.

The purpose is to make the restored mechanic immediately testable after implementation without requiring the tester to modify a deck, wait for another card implementation, or depend on drawing a single copy.

### Lean Test-Deck Strategy

Do not design or implement a new deck from scratch.

Instead:

1. take an already implemented and playable deck from current `main`;
2. copy it into a new dedicated test deck;
3. keep its Legend, Champion, Battlefields, Rune Pool, and all other cards unchanged;
4. replace one existing **3-copy Main Deck entry** with **3 copies of an already implemented card that has Hidden**;
5. register the derived deck through the existing playable-deck mechanism;
6. verify it can be selected and used to create a fresh local match.

This keeps the fixture as close as possible to a known-good deck while guaranteeing enough copies of the Hidden card for practical manual testing.

### Preferred Concrete Fixture

Use the current playable **Ornn** deck as the source fixture unless inspection of current `main` shows that it is no longer a valid/playable baseline.

Create a derived deck with a clear test-oriented identity, for example:

```text
deck id: ornn-hidden-test
label: Ornn - Hidden Test
```

Keep the existing Ornn deck unchanged.

For the derived deck:

```text
remove:
3 Poro Snax

add:
3 Zhonya's Hourglass
```

The resulting Main Deck must keep the same total card count.

`Zhonya's Hourglass` is the preferred Hidden card because:

- it is already part of the implemented card corpus;
- it has the Hidden keyword;
- it is a Calm card and therefore fits the Ornn deck's existing Calm/Mind identity;
- its non-Hidden Gear behavior has already been part of the simulator work;
- it exercises the important interaction between Hidden, Gear resolution, and Cleanup;
- using three copies makes drawing the test card substantially easier than relying on a singleton.

Do not modify the original Ornn deck to accomplish this.

### Fallback Selection Rule

If current `main` proves that either:

- Ornn is no longer a valid playable source deck;
- `Poro Snax` is not present as a 3-copy entry;
- `Zhonya's Hourglass` is not currently executable apart from the Hidden regression;
- another current dependency makes this exact fixture invalid;

then preserve the same strategy instead of inventing a larger solution:

1. choose another currently playable implemented deck;
2. choose one of its existing 3-copy Main Deck entries;
3. replace that entry with 3 copies of a **domain-legal, already implemented Hidden card**;
4. keep all other deck contents unchanged.

The PR must document any fallback and why the preferred Ornn/Zhonya fixture could not be used.

### Test-Deck Registration

Register the derived deck using the repository's existing deck-definition and playable-deck workflow.

Do not add a separate hard-coded testing path if the current deck system can represent the fixture normally.

The derived deck must:

- have its own deck ID;
- preserve normal deck validation;
- resolve all canonical card dependencies;
- appear in the appropriate local/manual testing deck selector;
- successfully create a fresh match after behavior synchronization;
- remain clearly identified as a test fixture rather than replacing the production Ornn deck.

If the current system distinguishes development/test deck availability from normal production deck availability, prefer the narrowest existing mechanism that still lets the local simulator select the fixture.

### Test-Deck Acceptance Scenario

Given the Hidden restoration branch has been synchronized  
And the dedicated Hidden test deck is registered  
When a tester opens the local simulator  
Then the derived Hidden test deck is selectable  
And a fresh match can be created with it  
And its Main Deck contains exactly 3 copies of the chosen Hidden card  
And the original source deck remains unchanged.

### Test-Deck Validation

Add the smallest useful automated validation proving that:

- the derived deck parses;
- the derived deck remains legal;
- the Main Deck card count is unchanged from the source deck;
- exactly three copies of the selected Hidden card are present;
- the replaced 3-copy card is absent from the derived deck;
- the original deck definition is unchanged;
- the derived deck is accepted by the same executable-dependency checks used for other playable decks.

This fixture is part of the regression-restoration work because it provides the immediate manual verification path for the mechanic.

It is not a request to expand the supported deck catalog beyond what is necessary for this test.


## Manual Validation

After automated checks pass, run fresh matches from the current branch.

At minimum manually validate:

1. a Hidden card from hand can be hidden;
2. the correct Battlefield can be selected;
3. the owner sees the expected facedown information;
4. the opponent does not see the card identity;
5. the card cannot be used prematurely;
6. it becomes available on the correct later timing window;
7. playing from Hidden opens the Chain;
8. targeting is restricted correctly;
9. the card resolves through the normal engine;
10. normal play from hand still works;
11. Zhonya's Hourglass returns to Base through Cleanup after being played from Hidden;
12. an occupied Facedown Zone cannot receive another card.

Use at least one Hidden Spell, one Hidden Unit, and one Hidden Gear if current playable/test fixtures allow it.

---

## Required Repository Checks

Run the repository's normal validation commands.

At minimum include the applicable equivalents of:

```bash
npm run typecheck
npm run lint
npm test
npm run catalog:sync-behaviors
```

If command names differ on current `main`, use the current repository equivalents.

After behavior synchronization, verify that no unexpected generated or catalog changes remain.

Review:

```bash
git status
git diff
```

Generated changes must be intentional and explained.

---

## Scope Protection

### In Scope

- restoring the generic Hidden / Hide subsystem;
- adapting historical implementation to current architecture;
- facedown Battlefield-zone state required by Hidden;
- Hide action generation and execution;
- play-from-Hidden generation and execution;
- Hidden timing and payment;
- Hidden targeting restrictions;
- projection/privacy;
- current UI interaction support;
- cleanup integration;
- Gear compatibility;
- behavior catalog executability;
- a derived playable Hidden manual-test deck based on an already implemented deck;
- focused regression tests.

### Out of Scope

- redesigning Hidden;
- changing Riftbound Hidden rules;
- broad game-board layout changes;
- unrelated Ornn behavior changes;
- unrelated Gear UI redesign;
- new card implementations unrelated to proving the generic mechanic;
- designing a new competitive deck instead of deriving the minimal Hidden test fixture;
- modifying the original source deck solely to enable Hidden testing;
- broad engine refactors;
- opportunistic architecture cleanup;
- reverting unrelated changes introduced after `7b2801f`;
- changing other keywords merely because their code is nearby.

---

## Commit Strategy

Keep commits reviewable and behavior-oriented.

A reasonable sequence would be:

1. restore/adapt canonical Hidden state and legal-action support;
2. restore/adapt Hide and play-from-Hidden execution;
3. restore projection/privacy and client interaction;
4. restore behavior-catalog executability;
5. add/adapt regression tests;
6. address integration findings and documentation if required.

The exact split may differ based on current architecture, but avoid one massive commit containing unrelated cleanup.

---

## Pull Request Requirements

Push the dedicated branch and open a PR against `main`.

Example:

```bash
git push -u origin fix/restore-hidden-mechanic
```

The PR must target:

```text
base: main
compare: fix/restore-hidden-mechanic
```

### Suggested PR Title

```text
fix: restore Hidden mechanic through canonical game flow
```

### PR Description Must Include

#### Problem

Explain that Hidden was previously implemented in `7b2801f` and later removed in `9924544`, leaving the current engine without the mechanic.

#### Restoration Approach

Explain that the PR uses the historical working subsystem as the behavioral reference while porting it into current architecture rather than blindly reverting or cherry-picking old commits.

#### Historical Cause

Document what was discovered about why `9924544` removed the mechanic.

If the reason cannot be proven, state that clearly.

#### Current Architecture Adaptations

Summarize important differences between the historical implementation and the restored current implementation.

Examples may include:

- current action generation;
- current state schema;
- payment;
- current decision system;
- Gear lifecycle;
- Cleanup;
- viewer projections;
- catalog synchronization.

#### Validation

List:

- automated tests run;
- catalog synchronization result;
- type/lint checks;
- manual gameplay scenarios validated;
- the dedicated Hidden test deck used for manual validation;
- the exact 3-copy substitution used to create that fixture.

#### Privacy

Explicitly state how opponent Hidden information remains protected at the server projection boundary.

#### Gear Interaction

Explicitly document the Zhonya's Hourglass validation and confirm that current Gear Cleanup behavior is preserved.

#### Out of Scope

State that the PR does not redesign Hidden, alter unrelated Ornn work, or revert unrelated post-implementation changes.

---

## Review Guidance

Reviewers should focus on four questions.

### 1. Is This the Same Mechanic?

Does the restored behavior match the previously working Hidden subsystem and current rules rather than creating a new interpretation?

### 2. Is It Integrated with Current Architecture?

Does the implementation use current legal-action, payment, Chain, projection, Cleanup, decision, and catalog systems?

### 3. Did We Preserve Later Fixes?

Does the PR avoid undoing legitimate changes introduced after `7b2801f`, especially current Gear behavior?

### 4. Is Hidden Information Actually Protected?

Does the server projection prevent the opponent from learning the identity of the facedown card?

---

## Definition of Done

This task is complete only when:

- the work began from updated `main`;
- the implementation exists on a dedicated branch;
- the historical working implementation was inspected;
- the removal commit was inspected;
- Hidden is restored generically rather than card-by-card;
- Hide works without opening the Chain;
- play-from-Hidden works through the Chain;
- timing, costs, targeting, and Facedown Zone constraints follow current rules;
- normal play of Hidden cards remains available;
- viewer privacy is enforced server-side;
- loss-of-control Cleanup behavior works;
- current Gear behavior is preserved;
- Zhonya's Hourglass works correctly with Hidden and Cleanup;
- `keyword.hidden` is executable again;
- catalog synchronization succeeds;
- a dedicated playable Hidden test deck exists without modifying its source deck;
- the preferred fixture uses the Ornn deck with `3 Poro Snax` replaced by `3 Zhonya's Hourglass`, unless current `main` proves that combination invalid;
- the test deck is selectable in the local/manual testing flow and can create a fresh match;
- focused regression coverage exists;
- manual gameplay validation is completed using the dedicated Hidden test deck;
- the branch is pushed;
- a Pull Request against `main` is created;
- the PR contains enough historical and validation context for a reviewer to evaluate the restoration without reconstructing the investigation independently.

The PR must remain unmerged until reviewed.
