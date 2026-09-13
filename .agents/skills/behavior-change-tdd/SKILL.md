---
name: behavior-change-tdd
description: Use for reusable Hextech behavior/subsystem fixes or extensions to prove new FAIL_TO_PASS behavior while preserving accepted PASS_TO_PASS contracts.
---

# Behavior Change TDD

`docs/testing.md` defines the testing contract. This skill executes it.

## Procedure

1. Identify the reusable test seam; a named card/deck may be fixture data only.
2. Run the relevant accepted PASS_TO_PASS baseline before production edits.
3. Add the smallest generic regression for the missing requirement and observe
   RED for the intended reason when practical.
4. Make the smallest reusable production correction.
5. Run the new case to GREEN.
6. Rerun the original PASS_TO_PASS set unchanged, then proportional shared
   consumer coverage.
7. Use focused checks during development; use the final PR gate only when ready.

Do not edit an accepted expectation to make the implementation pass. If the old
expectation appears wrong, stop and use the semantic-contract change gate in
`docs/testing.md`.

If RED-before-implementation is impractical, state why and use the strongest
available deterministic evidence. Never report an unobserved RED step.

Keep verbose command output under `.agent-work/`; report the reusable owner,
RED/GREEN evidence, PASS_TO_PASS result, and consumer coverage concisely.
