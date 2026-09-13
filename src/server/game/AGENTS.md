# Game Engine Agent Instructions

## Scope

These instructions apply to files under `src/server/game/**`.

The game engine is shared infrastructure. A card or deck may expose a missing
capability, but the implementation must preserve generic ownership and all
previously accepted consumers.

Read `docs/game_definition.md`, `docs/testing.md`, the applicable rules
authority, and the relevant skills before changing shared semantics.

## Corpus capability boundary

For card-corpus expansion work, first determine the approved corpus and derive
the capabilities it actually requires.

The implementation boundary is:

> **implemented capabilities ⊆ approved corpus capability dependency set**

Do not implement, complete, or broaden a keyword, behavior, selector, rules
subsystem, token flow, or engine feature merely because:

- it appears in a rules example;
- it would be convenient test data;
- a nearby card uses it;
- it may be useful in a future corpus.

If an unrelated capability is discovered, leave it out of the current
production change unless the task explicitly expands scope.

## Reusable ownership

Before adding a runtime path, state field, action, selector, payment flow,
trigger flow, transition, or helper:

1. search for the existing owner;
2. inspect its contract and current consumers;
3. reuse it when it already represents the requirement;
4. extend it generically when the semantics are compatible;
5. introduce a new abstraction only when existing owners are genuinely
   semantically unsuitable.

Never implement reusable game behavior with branches keyed by card name,
public code, set, Champion, Legend, or deck ID.

A named card can remain fixture/data input; it must not become the runtime
architecture.

## Semantic model discipline

Do not reuse an existing field/helper only because its name or current use looks
close to the new requirement. Inspect its writers, readers, lifecycle, and
accepted consumers first.

Keep these concepts distinct unless a durable authority explicitly says
otherwise:

- canonical card definition identity;
- registered/physical copy identity;
- runtime `instanceId`;
- game-object incarnation across rules-relevant zone changes;
- mutable object/state versioning;
- player/controller identity;
- location/zone identity;
- Chain origin;
- Priority;
- Focus.

If the task requires changing the meaning of an accepted primitive, field, or
subsystem contract, stop normal implementation flow. Document:

- the semantic change;
- authoritative basis;
- existing consumers;
- regression surface;
- migration/persistence impact if any.

Obtain explicit approval before changing accepted semantics.

## Consumer-impact requirement

Before changing a shared owner, identify its accepted consumers from repository
and canonical-corpus evidence.

Regression scope follows the shared owner, not the delivery deck.

At minimum, determine:

- which existing behavior definitions bind to the owner;
- which engine subsystems call/read it;
- which accepted tests protect it;
- which manually accepted gameplay relies on the contract where known.

Do not treat the current card/deck as the only regression boundary.

## Alternate-path analysis

Trace every meaningful construction/resolution path through a changed semantic
contract.

When applicable, inspect:

- direct action and response paths;
- simultaneous-trigger ordering;
- pending choice pause/resume;
- target-selection continuation;
- replacement effects;
- Chain creation versus append;
- Chain removal and Cleanup;
- zone transitions and new-object boundaries;
- scoring/phase continuation after pending work.

A fix that only repairs the reported reproduction path is incomplete when the
same semantic contract has other supported paths.

## Required workflow

For reusable engine changes, use:

- `skills/engine-change-impact-SKILL.md`;
- `skills/behavior-change-tdd-SKILL.md` when behavior is fixed or extended;
- `skills/riftbound-local-rules-reference-SKILL.md` for rules interpretation.

Do not change production semantics until the applicable accepted-contract
baseline and impact analysis are established.

## Completion

Before presenting engine work as technically ready:

- confirm no out-of-scope capability was introduced;
- confirm the reusable owner is correct;
- confirm accepted consumers remain valid;
- confirm alternate paths were considered;
- confirm existing accepted expectations were not silently rewritten;
- run focused regressions and the applicable final technical gates.

Complete card/deck gameplay acceptance remains manual.
