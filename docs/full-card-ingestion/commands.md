# Full Card Ingestion Commands

Snapshot: 2026-07-09T23:52:11-03:00

This file records the command baseline for M0. Commands are written in the form
that works in this Windows workspace, where direct `npm` from PowerShell can be
blocked by execution policy.

## Verified Non-Mutating Checks

| Purpose | Command | M0 result |
|---|---|---|
| TypeScript typecheck | `cmd /c npm run typecheck` | Pass |
| Test suite | `cmd /c npm test` | Pass |
| Lint | `cmd /c npm run lint` | Pass |
| Production build | `cmd /c npm run build` | Pass |

## Warning Baseline

An earlier M0 exploration pass observed these warnings:

| File | Warning |
|---|---|
| `src/features/game-board/components/action-rail.tsx` | `handleConcedeDialogOpenChange` is assigned a value but never used |
| `src/features/game-board/components/action-rail.tsx` | `handleConfirmConcede` is assigned a value but never used |
| `src/features/game-board/components/combat-damage-dialog.tsx` | `Button` is defined but never used |

The implementation verification rerun no longer reproduces them. The current M0
baseline is clean lint and clean build output.

## Catalog And Persistence Commands

These commands are part of the existing catalog workflow but write to persistent
state or generated catalog state. They were documented for M0 and not run as part
of this baseline without explicit execution approval.

| Purpose | Command | Notes |
|---|---|---|
| Synchronize behavior definitions | `cmd /c npm run catalog:sync-behaviors` | Writes behavior definitions to MongoDB. |
| Synchronize deck definitions | `cmd /c npm run catalog:sync-decks` | Writes deck definitions to MongoDB. |
| Reset canonical cards | `cmd /c npm run catalog:reset-canonical-cards` | Clears/rebuilds canonical card persistence. |
| Clear behavior validations | `cmd /c npm run catalog:clear-validations` | Deletes validation records. |
| Reset runtime matches | `cmd /c npm run game:reset-runtime` | Runtime cleanup only; not an ingestion milestone step. |

## Behavior Change Gate

The current workflow remains rules-text-hash focused:

- Import preview computes `sourceTextHash` with `hashCardRulesText` from normalized
  `card.text.plain`.
- Import preview marks persisted cards as `changed_since_persisted` when the
  stored hash differs.
- Canonical publication rejects approval payloads when the submitted hash no
  longer matches the card rules text.
- Runtime deck loading rejects stale canonical cards whose stored hash no longer
  matches their approved card rules text.

M0 does not replace this model with metadata drift or full-card-definition drift.
