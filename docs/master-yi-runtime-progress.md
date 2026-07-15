# Master Yi Runtime Progress

## Delivered scope

- Added the `master-yi` deck to local and online match creation.
- Expanded the generated MVP catalog from 39 to 57 canonical cards.
- Added executable behavior contracts for all 21 unique Master Yi deck cards.
- Implemented optional exhaustion costs, conditional and ongoing Might effects,
  Ganking movement, combat-scoped automatic damage, simultaneous mutual damage,
  channel fallback behavior, and consumable death replacement.
- Kept `docs/riftbound_core_rules_reference.md` as the sole rules authority.

## Persistence boundary

The runtime state now stores ongoing effects and lethal-death suppression
bookkeeping. Existing persisted matches must be reset before rollout. Canonical
card documents retain their existing schema.

## Rollout

1. Run `npm run catalog:sync-behaviors`.
2. Approve the new Master Yi records through the card-catalog workflow.
3. Run `npm run catalog:sync-decks`.
4. Stop the application and run `npm run game:reset-runtime`.
5. Start the application and smoke-test all nine deck pairings.

## Verification

- `npm test`: 173 passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
