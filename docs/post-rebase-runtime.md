# Post-rebase Runtime Fixes

Baseline: `ca93632`

## Milestones

- [x] 0. Record the defects, screenshots, and execution order.
- [x] 1. Make printed spell cost drive "costs N or more" play triggers while
  payment continues to use the discounted cost.
- [x] 2. Keep the rune zone usable with more than seven runes.
- [x] 3. Close the chain overlay when its final item resolves.
- [x] 4. Pause start-of-turn progression for Hold triggers before Channel.
- [x] 5. Run the complete regression gate and record the delivered commits.

Each implementation milestone receives one normal commit after its focused
tests and the project typecheck pass. The final milestone runs the full test,
typecheck, lint, and production-build gate. Resume by inspecting this document,
`git status --short`, and `git log --oneline -10`.

## Defects

- [x] Cost-discounted spells should still trigger Lux. Eager Apprentice reduces
  the Energy paid for a spell by 1 while at a battlefield. Playing a spell with
  printed cost 5, such as Falling Comet, costs the player 4 but must still
  satisfy Lux's "costs 5 or more" trigger.
- [x] Exhausting more than seven runes breaks the rune-zone spacing.
  ![Rune spacing overflow](image-50.png)
- [x] When the last item leaves the chain, the chain overlay should close.
  ![Empty chain overlay](image-51.png)
- [x] The Papertree trigger is sequenced incorrectly. Hold happens during step
  B of the ABCD start-of-turn sequence, so its trigger must resolve before step
  C, Channel.
  ![Papertree Hold trigger after Channel](image-52.png)

## Verification record

- Runtime reset required: no.
- `npm test`: 123 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Current milestone: none; all documented defects are complete.

## Delivered commits

| Milestone | Commit | Subject |
| --- | --- | --- |
| 0 | `b2d1f85fe9bf6286376ed62a2627bdb8ef5ce8d2` | `docs(game): plan post-rebase runtime fixes` |
| 1 | `aa13ead4894de915f698763180849a1e740bf7ea` | `fix(game): use printed cost for spell play triggers` |
| 2 | `924f2fb96ae9a4d5154a6357d13b1ea6699d57e8` | `fix(game-board): contain large rune rows` |
| 3 | `3b3beb1d16de3b9c4525ea4576f9754a3e63f23f` | `fix(game-board): close resolved chain overlay` |
| 4 | `a8301370535f2bce3e9c6ad36df69437458a973f` | `fix(game): resolve hold triggers before channel` |
| 5 | See the commit with this exact subject | `test(game): certify post-rebase runtime fixes` |

To roll back, revert a contiguous newest-first suffix with separate
`git revert` commits. No runtime reset is required because these milestones do
not change the persisted schema.
