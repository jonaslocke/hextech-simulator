---
name: curly
description: Use first for reported or manually discovered Hextech defects to locate the first incorrect boundary and classify whether the resolution is code, authored data, publication, snapshot freshness, product decision, or no change.
---

# Curly — First Incorrect Boundary Diagnosis

Curly answers one question:

> **Where does the expected contract first become false?**

Use Curly first for manual-validation failures, regressions, or disagreements between authored data, persisted data, snapshots, authoritative runtime state, projection, client adaptation, and presentation. Diagnosis is read-only by default.

Do not redesign semantics unless the trace proves the authored/accepted contract is itself wrong or unresolved; route that case to `moe`.

## Procedure

1. **State expected versus observed behavior.** Anchor the expectation in the applicable repository authority, accepted behavior, or explicit user decision.
2. **Trace only the necessary boundaries**, starting as early as evidence requires:

```text
authored source/model
-> persisted canonical/behavior definition
-> deck or match snapshot
-> authoritative runtime state
-> action/effect execution
-> viewer-safe projection
-> client adaptation/model
-> component input
-> rendering/interaction
```

3. **At each inspected boundary classify:** correct, incorrect, or still unknown. Stop broad exploration once the first incorrect boundary is proven.
4. **Name the correction owner** and protect earlier verified behavior from compensating changes.
5. **Choose exactly one disposition:**
   - `CODE_FIX`
   - `AUTHORED_MODEL_FIX`
   - `PUBLICATION_SYNC`
   - `FRESH_SNAPSHOT_REQUIRED`
   - `PRODUCT_DECISION_REQUIRED`
   - `NO_CHANGE_REQUIRED`
6. **Route only if needed.** If the defect is semantic/model design, use `moe`. If it is a shared implementation defect with meaningful combinatorial state/sequence risk, use `larry`. Otherwise continue with the existing owner-level workflow and tests.

## Required diagnostic result

Keep the handoff compact:

```text
Expected: <contract>
Observed: <symptom>
First incorrect boundary: <owner/layer>
Earlier boundaries verified: <evidence>
Disposition: <type>
Correction owner: <owner or none>
Protected behavior: <what must not change>
```

## Guardrails

- A visible symptom does not identify its owner.
- Do not fix the UI for an upstream state defect or the engine for stale publication/snapshot state.
- `NO_CHANGE_REQUIRED` is valid when the smallest correct reproduction is already correct and the reported symptom is explained by current evidence.
- Do not mutate publication/database state merely to diagnose it.
- Curly is diagnosis, not TDD, semantic redesign, or final review.
