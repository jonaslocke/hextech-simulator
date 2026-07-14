# OGN M2 Continuation Plan — Remaining Origins Card Corpus

Snapshot date: 2026-07-13

## 1. Purpose

This document replaces the implementation direction for the remaining Origins
cards after the accepted Kai'Sa and Viktor deck batches.

The next step is not to implement the remaining cards one by one. The next step
is to extend the existing Riftbound engine by behavior family, reusing the
accepted game systems and card behavior contracts already established by the
Garen, Kai'Sa, and Viktor work.

The program succeeds when the remaining gameplay-distinct OGN cards:

- are modeled through existing reusable systems wherever possible;
- introduce new primitives only when the rules concept is genuinely new;
- do not create parallel implementations of an existing game verb, timing flow,
  payment flow, choice flow, trigger flow, placement flow, or zone transition;
- are manually validated in small behavior-family batches;
- preserve accepted behavior through focused manual regression scenarios; and
- reach complete executable coverage before OGN is accepted.

## 2. Non-negotiable decisions

### 2.1 Manual gameplay is the only gameplay acceptance

The only new automated tests allowed by this plan are focused unit tests for
reusable primitives.

A primitive unit test is justified only when a new primitive is introduced or an
existing primitive's generic contract is extended. It must test the primitive
itself in isolation or through the smallest practical engine fixture.

Allowed primitive tests must:

- be generic and independent of card names or card codes;
- verify the primitive's inputs, outputs, legality, emitted events, or direct
  state transition;
- cover only the shared rule contract owned by that primitive;
- remain narrow, deterministic, and inexpensive to maintain; and
- fail for a defect in the primitive rather than for unrelated match,
  projection, UI, deck, or persistence behavior.

Codex must not create or modify:

- gameplay integration tests;
- card-by-card behavior tests;
- deck tests;
- full-match or multi-turn scenario tests;
- API or persistence tests solely to exercise card gameplay;
- UI or component tests;
- snapshots;
- broad regression suites; or
- automated scenario matrices.

A primitive test must not recreate an entire match merely to call itself a unit
test. If the behavior can only be proven through several game subsystems working
together, it belongs to manual validation.

Existing tests and new primitive unit tests are technical safeguards. They are
not evidence that a card, behavior family, deck, or set works.

Other technical checks remain limited to:

- source and catalog validation;
- behavior synchronization validation;
- typecheck;
- lint;
- build;
- fresh runtime startup; and
- fresh match creation.

Only the user's manual testing can mark gameplay behavior as passed or accepted.

### 2.2 Reuse before extension

Before implementing a behavior family, Codex must inspect the engine and identify
the existing implementation that owns the relevant rules concept.

The search must include:

- accepted canonical behavior models;
- runtime primitives and primitive handlers;
- action discovery and projected legal actions;
- payment and resource-source planning;
- pending choices and effect resumption;
- trigger collection and Chain continuation;
- Unit play and placement;
- zone transitions and cleanup;
- tokens and created-card identity;
- continuous modifiers and turn-scoped memory;
- privacy and viewer projection; and
- accepted Kai'Sa, Viktor, Garen, Lux, Annie, and Master Yi behaviors that use
  the same rules verbs or timing concepts.

A new card must not receive a new execution flow merely because its card text is
new.

### 2.3 No card-name-specific runtime behavior

Card names and card codes may be used for:

- catalog lookup;
- diagnostics;
- tracking;
- manual validation instructions; and
- identifying a representative example.

They must not determine runtime rules behavior.

Runtime execution must be driven by generic primitives, selectors, conditions,
costs, triggers, replacements, modifiers, and event data.

### 2.4 Accepted behavior is a reusable baseline

The accepted Kai'Sa and Viktor implementations are not isolated deck work. Their
shared behavior is part of the engine baseline.

When a remaining OGN card uses an already implemented concept, Codex must reuse
or parameterize that implementation rather than rebuilding it.

When the existing implementation is incomplete, Codex must improve the shared
owner of the concept. It must not create a second path that works only for the
new cards.

## 3. Primary implementation goal

The primary goal for the remaining OGN corpus is:

> Increase engine coverage by extending shared rules systems, not by increasing
> the number of card-specific implementations.

Card count is a progress measure, not the implementation strategy.

A behavior batch is successful when several cards become executable because one
shared rules boundary is correct.

## 4. Mandatory reuse classification

Before changing runtime code, every remaining rules-text clause in the active
batch must receive one of these classifications:

| Classification | Meaning | Allowed action |
|---|---|---|
| Exact reuse | An accepted behavior already expresses the clause without semantic change. | Bind the card to the existing behavior. |
| Parameterized reuse | The existing primitive supports the rule after supplying different selectors, amounts, timing, zones, or other parameters. | Add the exact card model without changing runtime semantics. |
| Shared extension | The correct subsystem exists, but it lacks a generic parameter or lifecycle case required by multiple cards. | Propose and implement the smallest generic extension. |
| New primitive | The rules concept is genuinely absent from the engine. | Add one reusable primitive in the subsystem that owns the concept. |
| Rule blocker | Card text and the local rules reference do not determine one implementation. | Stop and request a ruling. |
| Data blocker | A token, card definition, errata entry, or other required source is missing. | Stop and request the missing source. |

Codex must not begin implementation while a clause remains unclassified.

## 5. Reuse map required for each behavior family

For each behavior family, Codex must record:

```text
Behavior family:
Remaining OGN cards:
Rules verbs and timing concepts:
Accepted reference cards:
Existing subsystem owner:
Existing primitives and handlers:
Reuse classification by clause:
Missing generic capability:
Public contract impact:
Accepted cards or decks at regression risk:
Smallest manual regression scope:
```

The reuse map is an implementation decision record, not a request for user
approval by default.

Codex may proceed autonomously when the family is exact reuse, parameterized
reuse, a new isolated primitive, or a shared extension that cannot change
accepted behavior.

Codex must stop before implementation when:

- the rule is ambiguous;
- the extension can alter accepted behavior;
- a public intent or projection contract must change; or
- required source data is missing.

## 6. Single-owner rules model

Every general Riftbound concept must have one authoritative engine owner.

Examples include:

- playing a card;
- playing a Unit;
- selecting a destination;
- moving one or more Units;
- paying Energy or Power;
- activating a resource ability;
- adding resources;
- choosing zero, one, many, ordered, repeated, or player-owned targets;
- killing and dying;
- emitting and collecting triggers;
- continuing a Chain after a child trigger or pending choice;
- passing Focus and Priority;
- scoring and replacing a score event;
- creating and removing tokens;
- applying turn-scoped memory;
- changing zones; and
- exposing legal actions to each viewer.

When a new card invokes one of these concepts, its model must enter that existing
flow. The plan must not permit parallel versions such as:

- normal Unit play versus effect-driven Unit play;
- Rune payment versus permanent-generated resource payment;
- direct spell resolution versus trigger-extended Chain resolution;
- card death versus token death;
- hand card-play accounting versus Champion-zone card-play accounting; or
- normal score resolution versus a replacement handled outside the scoring
  system.

## 7. Behavior contract required before implementation

Before coding a family, Codex must describe the shared behavior contract.

The contract must state, where applicable:

- legal source zones;
- active and inactive source zones;
- legal timing;
- payer and controller;
- Energy and Power requirements;
- legal resource-producing sources;
- automatic versus intentional payment behavior;
- legal destinations;
- minimum and maximum selections;
- whether zero selections are legal;
- whether duplicate or ordered selections are legal;
- which player owns each decision;
- events emitted;
- trigger source eligibility;
- Chain and Focus continuation;
- object identity required after zone changes;
- final zone and cleanup behavior;
- token lifecycle;
- turn-scoped state;
- projection and privacy behavior; and
- interaction with accepted replacement or continuous effects.

A card model cannot be approved merely because its happy path resolves.

## 8. Implementation order for the remaining OGN corpus

### Phase A — Freeze the accepted baseline

Codex must treat the accepted Garen, Kai'Sa, and Viktor behavior as the current
engine baseline.

Before implementing remaining OGN cards:

1. identify every shared subsystem changed during those deck passes;
2. identify the accepted behavior contracts now available for reuse;
3. remove obsolete discovery assumptions that predate those fixes; and
4. update the active corpus analysis so remaining cards are compared against the
   current engine rather than the earlier heuristic snapshot.

No accepted card is reimplemented during this phase.

### Phase B — Rebuild the remaining-card inventory

Create a gameplay-distinct inventory that excludes:

- accepted Kai'Sa cards;
- accepted Viktor cards;
- previously accepted Garen cards;
- equivalent printed variants; and
- token printings already represented by one executable gameplay identity.

For every remaining card, split rules text into executable clauses and assign
each clause to a behavior family.

### Phase C — Group by shared rules behavior

Cards must be grouped by the shared engine boundary they exercise, not by
collector number, domain, rarity, or card name.

Useful family boundaries include:

- card play, effect-driven play, and placement;
- payment, additional costs, alternate costs, and resource abilities;
- choices, optionality, ordering, repeated targets, and multi-player decisions;
- triggers, event identity, source activity, and Chain continuation;
- damage, death, tokens, cleanup, and zone changes;
- score, replacement, prevention, and delayed effects;
- continuous modifiers, turn memory, and card-play accounting;
- Hidden, visibility, and facedown-zone behavior;
- movement, combat entry, attacker/defender state, and Showdown lifecycle; and
- projection legality and private information.

The family list must be derived from the remaining corpus and may be adjusted
after the reuse map is built.

### Phase D — Implement one behavior family at a time

For each family:

1. build the reuse map;
2. write the shared behavior contract;
3. bind all exact and parameterized reuse cards first;
4. implement only the smallest missing shared capability;
5. update all affected card behavior models;
6. synchronize catalog behavior;
7. complete technical checks;
8. provide exact manual scenarios; and
9. stop for manual validation before opening the next family.

Codex must not implement the entire remaining set and defer all gameplay
validation until the end.

### Phase E — Manual family gate

Each family must receive manual validation before the next family begins.

The handoff must name:

- the exact cards involved;
- the minimum board state;
- the sequence of actions;
- the expected legal actions or prompts;
- the expected Chain, Focus, or Priority result when relevant;
- the expected final zones, resources, damage, control, or score;
- the accepted earlier behavior that needs focused regression; and
- the response expected from the user: `Pass`, `Report defect`, or `Provide ruling`.

A family remains open until the user passes it.

### Phase F — Full remaining-corpus completeness gate

After all behavior families pass manual validation, Codex must verify:

| Coverage measure | Required result |
|---|---:|
| Remaining gameplay-distinct OGN cards reviewed | 100% |
| Rules-text clauses classified | 100% |
| Exact or parameterized reuse clauses executable | 100% |
| Shared extensions executable | 100% |
| New primitives executable | 100% |
| Token dependencies executable | 100% |
| Rule or data blockers | 0 |
| Open manual defects | 0 |

Only then may OGN move to full-set manual acceptance.

## 9. Manual validation strategy

Manual validation is organized by behavior family, not by automated test
coverage.

Every family must include the smallest scenarios that distinguish the rules
contract from a superficially similar but incorrect implementation.

Depending on the family, scenarios should cover:

- an allowed source zone and a forbidden source zone;
- normal timing and a Showdown or Reaction timing case;
- normal payment and non-Rune resource generation;
- automatic payment and intentional supplemental payment;
- required, optional, empty, repeated, ordered, or opponent-owned choices;
- a Chain that ends normally and one extended by triggers;
- a card and a token using the same death or zone-change flow;
- a normal result and a replacement or prevention result;
- a source that remains active and one that leaves play before resolution;
- a legal action that should be projected and an illegal action that should not
  appear; and
- the correct final cleanup zone.

Not every card needs every scenario. The family contract determines the minimum
useful cases.

## 10. Regression policy

A change to a shared subsystem must identify the smallest accepted behavior that
could regress.

Manual regression must be focused. Codex must not ask the user to replay every
accepted deck after each family.

Examples of regression scope are:

- one accepted effect-driven Unit play;
- one accepted non-Rune resource ability;
- one accepted optional decision;
- one accepted trigger-extended Chain;
- one accepted token death;
- one accepted replacement effect;
- one accepted Champion-zone play; or
- one accepted Hidden play.

If a proposed extension changes the accepted behavior contract itself, Codex
must request approval before coding.

## 11. Projection and interaction gate

A behavior is not ready when the server can technically resolve it but the
player-facing flow is incomplete.

Before manual handoff, Codex must verify that:

- only legal actions are projected;
- unpayable actions are not presented as playable;
- the correct player receives each pending decision;
- optional choices can be declined legally;
- required minimums are enforced;
- repeated and ordered selections preserve their semantics;
- private information is viewer-safe;
- target and payment prompts resume the correct parent effect;
- action labels and destination choices describe the real operation; and
- the client submits the existing server-authoritative intent contract unless a
  change was approved.

## 12. Tracking changes

For future OGN work, the primitive and card ledgers must stop using automated
tests as the implementation gate.

The primitive ledger should use:

| Behavior family | Accepted reference implementation | Shared owner | Reuse classification | Proposed extension | Regression risk | Manual scenario | Manual result |
|---|---|---|---|---|---|---|---|

The card ledger should use:

| Card | Rules clause | Behavior family | Reused primitive or subsystem | Missing capability | Executable | Manual family | Manual result |
|---|---|---|---|---|---|---|---|

Each manual defect must record:

- observed state;
- expected behavior;
- diagnosis;
- shared subsystem owner;
- whether the fix changes accepted behavior;
- focused manual retest; and
- result.

## 13. Completion language

Codex must distinguish these states:

- `Modeled`
- `Implemented`
- `Technically Ready`
- `Ready for Manual Validation`
- `Manual Family Passed`
- `Awaiting Manual Acceptance`
- `Accepted`

No automated check may move a behavior into a manual-passed or accepted state.

## 14. Codex execution prompt

```text
You are continuing the Origins full-card-corpus milestone after the accepted
Kai'Sa and Viktor deck implementations.

Read and follow:

- docs/full-card-ingestion/plan.md
- docs/full-card-ingestion/tracking.md
- docs/full-card-ingestion/ogn-corpus-analysis.md
- docs/full-card-ingestion/deck-implementation-retrospective.md
- docs/riftbound_core_rules_reference.md
- data/sets/ogn.json
- the accepted Kai'Sa, Viktor, and Garen behavior models and issue ledgers

The remaining work is every gameplay-distinct OGN card not already accepted
through those decks or equivalent printings.

Do not create gameplay integration, card, deck, full-match, API-gameplay, UI,
snapshot, or broad regression tests.

You may create or update focused unit tests only for a reusable primitive that
is newly introduced or whose generic contract is extended. Such tests must be
card-agnostic, narrow, deterministic, and use the smallest practical fixture.
They must test the primitive's own legality, input/output, emitted event, or
direct state transition. Do not recreate a full match and call it a primitive
unit test.

Primitive unit tests and technical checks are safeguards, not gameplay
acceptance. Technical checks are otherwise limited to catalog/source
validation, typecheck, lint, build, runtime startup, and fresh match creation.

Do not begin from individual card names. First rebuild the remaining-card
inventory against the current engine, then group the cards into shared behavior
families.

For each family, before changing runtime code:

1. identify accepted reference cards with the same rules verbs or timing;
2. inspect the existing primitives, handlers, action flow, payment flow,
   choices, triggers, Chain continuation, placement, zones, projection, and
   token systems;
3. classify every clause as exact reuse, parameterized reuse, shared extension,
   new primitive, rule blocker, or data blocker;
4. record the subsystem that owns the concept;
5. define the complete behavior contract;
6. identify regression risk and the smallest manual regression scenario.

Reuse and parameterize existing behavior whenever possible. If support is
missing, extend the existing shared owner. Do not create parallel flows or
card-name-specific runtime branches.

Implement one behavior family at a time. After technical checks, stop and give
the user exact manual scenarios for that family. Do not begin the next family
until the user passes the current one.

Stop before implementation only for a real rules ambiguity, missing source
data, an unapproved accepted-behavior change, or a required public
intent/projection contract change.

The milestone remains incomplete until every remaining gameplay-distinct OGN
card and required token is executable, every behavior family has passed manual
validation, no blockers remain, and the user explicitly accepts Origins.

End every family handoff with one of:

Status: Ready for Manual Validation
Status: Blocked by Rule
Status: Blocked by Data
Status: Regression Approval Required

Never mark OGN complete. Final completion-facing status is:

Status: Awaiting Manual Acceptance
```
