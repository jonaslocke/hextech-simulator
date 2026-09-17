---
name: moe
description: Use for new or changed Hextech gameplay/card semantics when deciding whether the requested contract is reuse, composition, extension, correction, or a genuinely new reusable capability.
---

# Moe — Reusable Behavior Design

Moe answers one question:

> **What semantic behavior is required, and can the existing reusable behavior vocabulary express it faithfully?**

Use Moe for new cards, changed card/gameplay semantics, new behavior proposals, or authored models whose reusable mapping is uncertain. Do not use Moe merely because a localized implementation defect exists; reported/manual defects start with `curly` unless the accepted semantic contract itself is uncertain.

Repository authorities define what is true. For Riftbound rules, use `riftbound-local-rules-reference`. Existing testing, impact-analysis, publication, and review skills keep their own procedures; do not restate them here.

## Procedure

1. **State the semantic contract.** Decompose only the material clauses. Capture the distinctions that affect behavior: actor/owner/controller, trigger/timing, selection/cardinality, identity, location, order/commitment, duration, and continuation. Omit dimensions that are irrelevant.
2. **Find the closest reusable owners.** Search existing primitives/behaviors, parameters, compositions, handlers, bindings, and accepted consumers before inventing anything.
3. **Classify each material clause exactly once:**
   - **Reuse** — existing contract already expresses it.
   - **Compose** — existing contracts express it faithfully together.
   - **Extend** — the correct owner lacks a narrow input/composition boundary while old semantics remain intact.
   - **Correct assignment** — reusable behavior is correct; authored model/binding is wrong.
   - **Correct implementation** — an accepted reusable contract exists but execution violates it.
   - **New capability** — no existing contract/composition can express the required semantic distinction faithfully.
   - **Unsupported / unresolved** — evidence or approved scope is insufficient.
4. **Require a non-similarity proof for `New capability`.** Record:
   - closest existing candidates and owners;
   - parameters/compositions inspected;
   - why each cannot express the requirement without changing accepted meaning;
   - one distinguishing scenario where the required outcome differs;
   - search scope used to reach the conclusion.
   If this proof is missing, do not create a new capability.
5. **Hand off only the delta.** Report the classification, reusable owner, any new/extended semantic contract, and unresolved decision. Use `engine-change-impact` for shared engine/corpus changes. Use `larry` only when the resulting shared change has meaningful combinatorial state/sequence risk.

## Guardrails

- Cards are declarative consumers of reusable semantics; do not solve reusable gameplay through card/deck/set identity branches.
- Similar wording or visible outcome does not prove semantic reuse; different card names or parameter values do not prove novelty.
- Do not redefine an accepted contract to make a new card fit it.
- For a disputed qualifier, use one positive example and one discriminating counterexample when that distinction materially affects implementation.
- Keep the output concise. Moe is a design decision, not a second task plan, TDD procedure, or final review.
