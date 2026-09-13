# Game Engine Instructions

Applies to `src/server/game/**`. Root instructions still apply.

## Local authorities and workflows

Read only the relevant portions of `docs/game_definition.md`, `docs/testing.md`,
and the local rules/card data required by the change.

For shared engine or corpus-capability work, use
`skills/engine-change-impact-SKILL.md`. For reusable behavior fixes/extensions,
also use `skills/behavior-change-tdd-SKILL.md`.

## High-risk invariants

- **Corpus boundary:** implement only capabilities required by the approved
  corpus unless the task explicitly expands scope. Rules examples and convenient
  adjacent cards do not expand scope.
- **Reusable ownership:** extend the shared semantic owner. Never implement
  reusable behavior through card name, public code, set, Champion, Legend, or
  deck-ID runtime branches.
- **Semantic identity:** inspect writers/readers before reusing a field/helper.
  Do not conflate runtime instance identity, game-object incarnation, mutable
  versioning, controller identity, location, Chain origin, Priority, or Focus.
- **Consumer impact:** shared semantic changes require identifying accepted
  consumers and their regression surface before implementation.
- **Path completeness:** inspect meaningful alternate paths through the changed
  contract (for example trigger ordering, choice continuation, responses,
  replacements, resolution/removal/Cleanup, or zone transitions when relevant).
- **Semantic-change gate:** do not redefine an accepted primitive/contract or
  rewrite its accepted expectations without authoritative basis, impact analysis,
  and explicit approval.

Complete card/deck gameplay acceptance remains manual.
