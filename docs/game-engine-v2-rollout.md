# Game Engine V2 Rollout and Rollback

## Milestone Commits

| Milestone | Commit |
| --- | --- |
| V2 contracts, catalog loading, persistence isolation | `170e930` |
| Projection-driven board | `d5234a6` |
| Match creation and setup | `4de1e92` |
| Core game flow | `2be14c6` |
| Canonical behavior interpreter | `e92e288` |
| Initial direct behavior execution | `1580321` |
| Triggered and deferred behavior coverage | `2badaf4` |
| V2 simulator launch | `68d44b6` |

The legacy engine remains at `/legacy` and continues using `/api/matches` and
the original MongoDB collections. V2 uses `/api/v2/matches` and the independent
`matchesV2`, `gamesV2`, `gameEventsV2`, and `deckSnapshotsV2` collections.

## Prerequisites

Before rollout:

1. Back up `behaviors` and `canonicalCards`.
2. Run `npm run catalog:sync-behaviors` if behavior definitions are not current.
3. Confirm all 21 unique cards in `data/decks/lux.dec.txt` are published with
   approved modeling and current source hashes.
4. Run the full verification suite.

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
$backupPath = "backups/game-v2-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=behaviors --out=$backupPath
if ($LASTEXITCODE -ne 0) { throw "Behavior backup failed." }
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=canonicalCards --out=$backupPath
if ($LASTEXITCODE -ne 0) { throw "Canonical-card backup failed." }
```

No migration from legacy match data is required. V2 match creation fails with a
catalog initialization error instead of falling back to local or hardcoded cards.

## Manual Validation

1. Open `/` and confirm Lux is the only deck for both seats.
2. Create a match and complete battlefield selection, starting-player choice,
   opening hands, and mulligans from both viewer positions.
3. Validate channeling, Rune Energy and Power abilities, payments, card play,
   target selection, chain priority, triggers, modifiers, movement, and showdown
   pass flow.
4. Switch viewers and confirm private hands and decks remain hidden.
5. Open `/legacy` and confirm the original simulator still uses its original API.

Combat resolution, automatic conquer/hold event production, scoring, and victory
remain outside current-flow parity. Assault and Tank are explicitly deferred;
they are not treated as executed effects.

## Diagnostics

- Missing or stale canonical cards: review and republish the affected card in
  `/admin/card-catalog`.
- Missing behavior definitions: run `npm run catalog:sync-behaviors` manually.
- Rejected client actions: reload the viewer projection; action IDs are bound to
  the projected state version.
- V2 data inspection: query only the four `*V2` collections. Do not modify the
  legacy collections when diagnosing v2.

## Rollback

Archive V2 runtime data before removing it:

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
$archivePath = "backups/game-v2-runtime-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
foreach ($collection in @("matchesV2", "gamesV2", "gameEventsV2", "deckSnapshotsV2")) {
  mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=$collection --out=$archivePath
  if ($LASTEXITCODE -ne 0) { throw "V2 collection backup failed: $collection" }
}
```

Revert implementation commits newest-first:

```powershell
git revert --no-commit 68d44b6 2badaf4 1580321 e92e288 2be14c6 4de1e92 d5234a6 170e930
git commit -m "Rollback game engine v2"
```

This restores the root page to the legacy simulator. Reverting code does not
delete V2 data. Removing the four V2 collections is optional and must be a
separate, explicitly approved database operation.

After rollback:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

No database reset, synchronization, deletion, backup, or restore command was
executed during implementation.
