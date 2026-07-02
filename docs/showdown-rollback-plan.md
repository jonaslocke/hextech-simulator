# Showdown and Combat Rollout and Rollback

## Milestone commits

| Milestone | Commit | Subject |
| --- | --- | --- |
| 1 | `02f98c4` | `docs(game): define showdown and combat rule contract` |
| 2 | `2a114f9` | `refactor(game): establish timing chain and choice kernel` |
| 3 | `48a48f9` | `feat(game): implement control movement cleanup and scoring` |
| 4 | `bd605b8` | `feat(game): complete showdown action and reaction flow` |
| 5 | `b14defb` | `feat(game): implement combat showdown and resolution` |
| 6 | `147c1ac` | `feat(game-board): make showdown and combat fully playable` |
| 7 | `HEAD after certification` | `test(game): certify showdown rollout and rollback` |

## Rollout

1. Stop application processes that can write match state.
2. Run `npm run game:reset-runtime` against the development database.
3. Deploy the seven commits in order.
4. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
5. Create a new match; pre-rollout game documents are intentionally unsupported.

The reset command deletes only matches, games, game events, and deck snapshots
whose `matchId` is not null. It does not alter canonical cards, behavior
definitions, catalog versions, or validation records.

## Complete rollback

Run the reset while milestone 7 and its guarded command still exist:

```powershell
npm run game:reset-runtime
git revert <milestone-7-hash>
git revert 147c1ac
git revert b14defb
git revert bd605b8
git revert 48a48f9
git revert 2a114f9
git revert 02f98c4
npm test
npm run typecheck
npm run lint
npm run build
```

For a partial rollback, revert only a contiguous newest-first suffix. Do not
revert an earlier milestone while retaining a later milestone that depends on
its state or projection contracts.

## Recovery checks

- The worktree contains only the intended revert commits.
- A newly created match reaches setup and the action phase.
- Viewer projections do not expose an opponent hand or deck.
- The API rejects action identifiers from an earlier state version.

## Certification

- `npm test`: 106 passing tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with all application and API routes generated.
