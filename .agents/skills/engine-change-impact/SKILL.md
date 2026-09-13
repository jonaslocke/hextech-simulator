---
name: engine-change-impact
description: Use before changing shared Hextech game-engine semantics or implementing card-corpus capabilities; establishes scope, owner, consumers, paths, and regression baseline.
---

# Engine Change Impact

Use `src/server/game/AGENTS.md` and the relevant durable authorities for the
contract. This skill is the procedure.

## Procedure

1. **Bound the task.** For corpus work, list only capabilities required by the
   approved corpus. Record adjacent/unrelated capabilities as out of scope.
2. **Locate the owner.** Search for the existing primitive/behavior, handlers,
   state/transitions, callers, and tests. Reuse or extend it unless evidence
   shows its semantics are different.
3. **Check semantics.** Before reusing a field/helper, inspect its writers and
   readers. State what it represents and what changes it.
4. **Find consumers.** Search canonical behavior/data and source call sites for
   accepted consumers; identify their relevant regression tests.
5. **Trace paths.** Enumerate supported paths that create/consume the changed
   semantic state; inspect only the paths relevant to the owner, expanding when
   lifecycle evidence requires it.
6. **Establish baseline.** Run the focused PASS_TO_PASS contracts before editing
   production semantics. Use `behavior-change-tdd` for new behavior/regressions.
7. **Implement the smallest generic change.** Do not broaden capability scope or
   create card/deck runtime branches.
8. **Prove impact.** Run the new focused coverage, unchanged accepted contracts,
   proportional consumer regressions, then the appropriate final gates.

## Stop and escalate

Do not continue normal implementation when the change would redefine accepted
semantics, rewrite an accepted expectation, expand approved corpus scope, or
introduce an unrequested persistence/migration contract. Provide the authority,
consumer impact, and regression scope before seeking approval.

Keep verbose discovery evidence under `.agent-work/`; retain only conclusions
needed by the implementation/review context.
