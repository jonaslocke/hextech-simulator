# Card Catalog Fixes Rollback Plan

## Milestone Commits

| Milestone | Commit | Scope |
| --- | --- | --- |
| Persistence reset | `dbc9a8f` | Removes behavior schema versions and compatibility handling. |
| Selector composition | `86335e2` | Moves exact and optional count bounds into Unit selectors and removes duplicate minimum conditions. |
| Event contracts | `4bae38a` | Declares listener/emitter contracts and delayed timing metadata. |
| Numeric modifiers | `4459787` | Replaces narrow numeric modifiers with the corpus-backed modifier-chain primitive. |
| Resource abilities | `ae5e58d` | Splits Basic Rune abilities and reuses exhaust-for-resource behavior. |

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
