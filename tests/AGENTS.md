# Test Instructions

Applies to `tests/**`. Root instructions still apply. `docs/testing.md` is the
canonical testing contract.

## High-risk reminders

- Tests belong to reusable primitives, behavior families, rules contracts,
  subsystems, compilers, projections, or generic validation pipelines. Cards and
  decks may be fixtures; they are not durable gameplay-test owners.
- Existing accepted passing expectations are protected **PASS_TO_PASS** history.
  Do not delete, weaken, or rewrite them merely because new production code
  breaks them.
- New reusable behavior normally adds focused **FAIL_TO_PASS** coverage. Use
  `behavior-change-tdd` for the procedure.
- Changing an accepted expectation requires the semantic-change gate in
  `docs/testing.md` before the expectation is edited.
- Permanent deck validation must derive from the canonical production registry;
  do not maintain a second test-only deck list or per-deck validators.
- Name tests after the reusable contract, even when a real card is fixture data.

Complete card/deck gameplay acceptance remains manual.
