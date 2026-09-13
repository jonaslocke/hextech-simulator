---
name: engine-change-impact
description: Analyze scope, reusable ownership, consumers, semantics, and execution paths before changing Hextech shared game-engine behavior or implementing card-corpus capabilities.
---

# Engine Change Impact

Use this skill before modifying reusable behavior under `src/server/game/**` or
adding engine capabilities for a card-corpus slice.

Do not use it for purely visual UI changes or data-only edits that cannot affect
shared game semantics.

## Goal

Prevent locally correct changes from:

- expanding beyond the approved corpus;
- creating a parallel/card-specific behavior;
- breaking previously accepted consumers;
- fixing only one execution path;
- reusing an abstraction whose semantics do not match the requirement.

## 1. Establish scope

Identify the exact delivery scope from the task and repository data.

For corpus work, derive the **capability dependency set** actually required by
the approved cards, Battlefields, Sideboard, tokens, and generated dependencies.

Do not implement adjacent capabilities merely because they appear in rules
examples or nearby corpus data.

Record any discovered but out-of-scope capability separately; do not implement
it.

## 2. Find the reusable owner

Search before creating.

For the required behavior, identify:

- current primitive/behavior IDs;
- runtime handlers;
- state fields;
- transitions/actions;
- compiler/catalog mapping;
- projection/UI contract when relevant;
- existing tests.

Prefer:

```text
reuse existing owner
  -> generic extension
    -> new abstraction only if semantics are genuinely different
```

Never use card name, public code, set, Champion, Legend, or deck ID as the
runtime implementation switch for reusable behavior.

## 3. Audit semantics before reuse

For every field/helper you plan to reuse, inspect its writers and readers.

Ask:

- What exactly does it represent?
- What events change it?
- Which accepted consumers rely on that meaning?
- Is it identity, state version, controller, location, timing origin, or
  something else?

Do not conflate:

- runtime instance identity with game-object incarnation;
- mutable versioning with identity;
- card identity with player/controller identity;
- Priority with Focus;
- Chain item type with Chain origin.

If the existing abstraction is only superficially similar, introduce/reuse the
correct generic semantic owner rather than redefining the old one silently.

## 4. Inventory accepted consumers

Search repository and canonical corpus for existing consumers of the owner.

Inventory proportionally to risk:

- behavior definitions using the primitive;
- callers/readers;
- accepted tests;
- known manually accepted gameplay relying on the owner.

Regression scope follows this consumer set, not the current delivery card.

## 5. Trace meaningful paths

Map all supported ways the changed contract can be reached.

Depending on the owner, include:

- direct action versus response;
- Chain creation versus append;
- multiple simultaneous triggers and trigger ordering;
- pending choice pause/resume;
- selection continuation;
- replacements;
- resolution/removal/Cleanup;
- zone transitions/new-object boundaries;
- phase/scoring continuation.

Do not stop after the reported reproduction path if another path constructs the
same semantic state.

## 6. Establish the test baseline

Read `docs/testing.md` and `tests/AGENTS.md`.

Identify the relevant existing PASS_TO_PASS contracts and run them before
changing production semantics.

Use `skills/behavior-change-tdd-SKILL.md` for the new regression/extension when
applicable.

## 7. Stop conditions

Stop normal implementation and request/record explicit approval before:

- changing accepted shared semantics;
- rewriting an accepted test expectation;
- redefining a widely consumed field/helper;
- introducing a persistence/migration semantic not covered by the task;
- expanding the approved corpus capability boundary.

Provide the authoritative basis, affected consumers, regression scope, and
risk before proceeding.

## 8. Completion evidence

Before declaring the engine change technically ready, confirm:

- only required capabilities were implemented;
- the reusable owner is generic;
- existing semantic abstractions retained their meaning;
- accepted consumers are protected;
- meaningful alternate paths were covered;
- PASS_TO_PASS remains green unchanged;
- new FAIL_TO_PASS evidence is green;
- applicable final technical gates passed.

Complete card/deck gameplay acceptance remains manual.
