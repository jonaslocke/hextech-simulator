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
