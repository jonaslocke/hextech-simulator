# Card Catalog Fixes Rollback Plan

## Milestone Commits

| Milestone | Commit | Scope |
| --- | --- | --- |
| Persistence reset | `dbc9a8f` | Removes behavior schema versions and compatibility handling. |
| Selector composition | `86335e2` | Moves exact and optional count bounds into Unit selectors and removes duplicate minimum conditions. |
| Event contracts | `4bae38a` | Declares listener/emitter contracts and delayed timing metadata. |
| Numeric modifiers | `4459787` | Replaces narrow numeric modifiers with the corpus-backed modifier-chain primitive. |
| Resource abilities | `ae5e58d` | Splits Basic Rune abilities and reuses exhaust-for-resource behavior. |

## Catalog Persistence Milestones

| Milestone | Commit | Scope |
| --- | --- | --- |
| Damage targets | `2ae05e5` | Restricts `action.deal_damage` to unit target references. |
| Source duration | `c894964` | Adds catalog-owned `whileSourceOnBoard` duration. |
| Behavior catalog | `887c09e` | Adds reusable behavior persistence and synchronization. |
| Canonical cards | `9b617f4` | Publishes approved canonical cards with reusable behavior bindings. |

## Lux MVP Behavior Catalog

### Milestone Commits

| Milestone | Commit | Scope |
| --- | --- | --- |
| Structured behavior clauses | `9041b99` | Replaces flat canonical bindings with play timings and ordered, categorized clauses. |
| Lux behavior definitions | `4c927ce` | Completes behavior discovery and definitions for the 21-card Lux MVP catalog. |
| Runtime-pending publication | `27f9103` | Separates modeling approval from runtime support and adds canonical reset operations. |
| Lux deck acceptance | `572d5fd` | Validates exact behavior models and canonical publication for every unique Lux MVP card. |

These commits model and publish card behavior only. They do not wire canonical
behaviors into the game engine, match runtime, or game board.

### Rollout

Back up both affected collections before deploying. Use a unique backup directory
for each rollout and stop if either command fails:

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
$backupPath = "backups/lux-mvp-behaviors-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=behaviors --out=$backupPath
if ($LASTEXITCODE -ne 0) { throw "Behavior backup failed." }
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=canonicalCards --out=$backupPath
if ($LASTEXITCODE -ne 0) { throw "Canonical-card backup failed." }
```

Then deploy the structured behavior code and run these operations in order:

```powershell
npm run catalog:reset-canonical-cards
npm run catalog:sync-behaviors
```

Both commands are destructive database operations and require the explicit
confirmation flag embedded in their npm scripts. Do not run them as part of an
application startup or automated deployment hook.

After synchronization:

1. Open `/admin/card-catalog`.
2. Upload or resynchronize the set data containing every card referenced by
   `data/decks/lux.dec.txt`.
3. Confirm that the report contains 21 unique cards, with no incomplete,
   ambiguous, unsupported, missing, or invalid behavior bindings.
4. Review each card's clauses, parameters, modeling approval, and separate
   runtime-support status.
5. Publish all 21 cards. Runtime-pending status is expected for some cards and
   must not disable publication when modeling is complete.
6. Confirm `Vanguard Sergeant` (`OGN-219`) and `Mega-Mech` (`OGN-088`) publish
   with zero clauses.

No database reset, synchronization, upload, or publication was executed while
implementing these milestones.

### Rollback

Retain a backup of any canonical cards published after rollout, then revert the
Lux commits newest-first:

```powershell
git revert --no-commit 572d5fd 27f9103 4c927ce 9041b99
git commit -m "Rollback Lux MVP behavior catalog"
```

Restore both pre-rollout collections from the same backup directory:

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
$backupPath = "backups/lux-mvp-behaviors-YYYYMMDD-HHMMSS"
mongorestore --uri=$env:MONGODB_URI --db=$dbName --drop "$backupPath/$dbName/behaviors.bson"
if ($LASTEXITCODE -ne 0) { throw "Behavior restore failed." }
mongorestore --uri=$env:MONGODB_URI --db=$dbName --drop "$backupPath/$dbName/canonicalCards.bson"
if ($LASTEXITCODE -ne 0) { throw "Canonical-card restore failed." }
```

Run the behavior synchronization command from the reverted revision only when
the restored `behaviors` collection does not match that revision's code-authored
contract. Do not synchronize before restoring, because synchronization removes
definitions that are not in the active code set.

Finally, rerun the full verification suite:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

These milestones change only the card-catalog pipeline and admin workflow. They do
not integrate database behaviors or canonical cards into the game engine.

### Pre-deployment Backup

Back up all affected collections before clearing or synchronizing data:

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=cardBehaviorValidations --out=backups/card-catalog-before-persistence
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=behaviors --out=backups/card-catalog-before-persistence
mongodump --uri=$env:MONGODB_URI --db=$dbName --collection=canonicalCards --out=backups/card-catalog-before-persistence
```

Do not continue if the backup command fails.

### Deployment Data Steps

The implementation intentionally provides no migration from mixed validation
documents. After creating the backup:

```powershell
npm run catalog:clear-validations
npm run catalog:sync-behaviors
```

The admin catalog must report `behavior_catalog_not_initialized` until behavior
definitions have been synchronized. Only cards explicitly published with status
`approved` are written to `canonicalCards`.

### Persistence Rollback

Revert the implementation commits newest-first:

```powershell
git revert --no-commit 9b617f4 887c09e c894964 2ae05e5
git commit -m "Rollback catalog persistence fixes"
```

Then restore the legacy validation collection used by the reverted application:

```powershell
$dbName = if ($env:MONGODB_DB_NAME) { $env:MONGODB_DB_NAME } else { "hextech_simulator" }
mongorestore --uri=$env:MONGODB_URI --db=$dbName --drop backups/card-catalog-before-persistence/$dbName/cardBehaviorValidations.bson
```

If `behaviors` or `canonicalCards` existed before deployment, restore their backup
files as well. If they were created only by these milestones, retain a backup of
newly published data before removing them. Reverting code does not delete data.

Run the full verification suite after rollback:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Full Rollback

Revert milestones newest-first because later catalog definitions depend on earlier ones:

```powershell
git revert --no-commit ae5e58d 4459787 4bae38a 86335e2 dbc9a8f
git commit -m "Rollback card catalog fixes"
```

Run the complete validation suite after resolving any conflicts:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Partial Rollback

- Revert `ae5e58d` alone to restore the composite Basic Rune behavior.
- Revert `4459787` only after reverting `ae5e58d`, because resource-amount modification depends on the generic numeric modifier.
- Revert `4bae38a` only after reverting both later behavior milestones.
- Revert `86335e2` only after reverting all later catalog-model milestones.
- Revert `dbc9a8f` last if schema-version compatibility is intentionally restored.

Use `git revert`, not history rewriting, after these commits are shared.

## Database State

The implementation does not migrate or preserve old behavior validations. Clear the collection once before validating cards with the new catalog:

```powershell
npm run catalog:clear-validations
```

The command deletes only the `cardBehaviorValidations` collection contents. The configured MongoDB endpoint was unreachable during implementation, so no deletion was confirmed.

There is no database restoration step unless a separate backup exists. The deleted documents use obsolete primitive shapes and should not be restored into the new catalog.
