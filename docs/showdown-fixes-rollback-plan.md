# Post-Showdown Corrections Rollout and Rollback

## Milestone commits

| Milestone | Commit | Verification |
| --- | --- | --- |
| 1. UI and engine audit | `bcbfa6e4f7d5bd8192c418b10537b9d03d24d5c2` | Test, typecheck, lint |
| 2. Rune helpers and card legality | `b3d8ef3c439cf00aa2fde898cdf4ac5abd2e89c8` | Test, typecheck, lint |
| 3. Controlled Unit destinations | `a9239386ddd951385df5dbcc0260879fb23d4d43` | Test, typecheck, lint, build |
| 4. Live combat keywords | `13e450ef49cf2701673685865b1eab9c44bc1b99` | Test, typecheck, lint |
| 5. Showdown and pending-choice UI | `97f177c7e99d8ff05389c1c5fbfe3a5c12caadf2` | Test, typecheck, lint, build |
| 6. Rollout certification | `fb2ba8ffdd068c79a7e34fc4e6122492aadf1d0d` | 117 tests, typecheck, lint, build |
| 7. Rollback record | Identify by subject `docs(game): record post-showdown rollout and rollback` and use the hash reported at delivery. | Final test, typecheck, lint, build |

Milestones form one ordered dependency chain. Roll back only a contiguous
newest-first suffix.

## Rollout

The canonical modifier shape now includes target scope. Existing development
games are intentionally not migrated.

1. Stop every application process using the development database.
2. Run `npm run game:reset-runtime`.
3. Start the application from milestone 7.
4. Create a new match; do not reuse a projection or action ID obtained before
   the reset.

The reset is confirmation-gated and deletes only matches, games, game events,
and match deck snapshots. Catalog cards, behavior definitions, and validation
collections are excluded.

## Partial rollback

- Reverting milestone 7, 6, or 5 does not require a runtime reset.
- If rollback includes milestone 4, 3, or 2 after games were created on the new
  engine, stop the application and run `npm run game:reset-runtime` before
  reverting.
- Revert each selected hash separately, newest first. Do not squash, amend, or
  reset the branch.
- After the reverts, run `npm test`, `npm run typecheck`, `npm run lint`, and
  `npm run build`.

## Complete rollback

From a clean worktree:

```powershell
npm run game:reset-runtime
git revert <milestone-7-hash>
git revert fb2ba8ffdd068c79a7e34fc4e6122492aadf1d0d
git revert 97f177c7e99d8ff05389c1c5fbfe3a5c12caadf2
git revert 13e450ef49cf2701673685865b1eab9c44bc1b99
git revert a9239386ddd951385df5dbcc0260879fb23d4d43
git revert b3d8ef3c439cf00aa2fde898cdf4ac5abd2e89c8
git revert bcbfa6e4f7d5bd8192c418b10537b9d03d24d5c2
npm test
npm run typecheck
npm run lint
npm run build
```

Stop the application before the reset and keep it stopped until all reverts
and verification commands complete.
