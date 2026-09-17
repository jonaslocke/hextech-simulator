---
name: larry
description: Use selectively for Hextech shared gameplay changes whose correctness depends on combinations or sequences of states/actions that example tests are likely to miss; designs bounded model/property verification at reusable owners.
---

# Larry — State-Space Verification

Larry answers one question:

> **What combinations or action sequences could falsify this reusable contract even if the reported example passes?**

Larry is not a default stage for every gameplay task. Use him only after the semantic owner/defect is understood and the change has meaningful combinatorial risk: timing/Chain lifecycle, pending choices, identity/incarnation, owner/controller, payment/preparation, alternate play paths, Cleanup/finalization, visibility/selection, projection/adaptation, or similar interacting state dimensions.

Routine parameter-only reuse or a local defect with no meaningful state-space dimension does not need Larry.

## Procedure

1. **Name the reusable contract and risk dimensions.** Identify the minimal state variables and actions whose combinations can change correctness.
2. **State invariants/properties before generating cases.** Prefer properties that remain meaningful across cards rather than examples tied to one production card.
3. **Load only the relevant reference** from `references/`:
   - `chain-timing.md`
   - `identity-incarnation.md`
   - `choices.md`
   - `payment.md`
   - `play-legality.md`
   - `projection.md`
4. **Choose the smallest useful verification form:** deterministic boundary examples, property-based generation, or a small bounded subsystem model. Do not build a second whole-game engine.
5. **Verify intermediate checkpoints** when lifecycle/timing matters, not only final state.
6. **Make failures reproducible.** Prefer deterministic seeds and record a minimized counterexample/action trace when generation finds a defect.
7. **Attach tests to the reusable owner.** Production cards may be integration fixtures, not the durable behavior-test owner. Use `behavior-change-tdd` for FAIL_TO_PASS/PASS_TO_PASS execution rather than restating that workflow here.

## Output

Report only:

- reusable contract;
- state/action dimensions selected;
- invariants/properties;
- bounded/generated cases added;
- minimized counterexample or seed when applicable;
- important untested risk that remains.

## Guardrails

- Do not invoke Larry just to increase test count.
- Do not weaken accepted expectations to satisfy generated cases.
- Prefer structural counters/state bounds over wall-clock assertions for combinatorial search.
- Keep feasibility/projection checks non-mutating unless the authoritative contract says otherwise.
