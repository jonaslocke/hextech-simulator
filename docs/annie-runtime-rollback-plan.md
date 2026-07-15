# Annie Runtime Rollout and Rollback

## Delivered commits

The Annie milestones form one dependency chain:

| Milestone | Commit | Subject |
| --- | --- | --- |
| 0 | `30ba086b9468e0543eca999b51ae8f650893a514` | `docs(game): plan Annie catalog rollout` |
| 1 | `a3843d4b7fee3957612ede831024a2b6cefd7b75` | `test(card-catalog): define Annie behavior suggestions` |
| 2 | `6a3908eecf55897e7b7fa4db2ff31242803bc235` | `refactor(game): add stable zone-aware targets` |
| 3 | `5224ea2c1915862a542a3fb380a6482b9490aae2` | `feat(game): execute return and movement effects` |
| 4 | `a2aeb53de0b93c27bec8c06051936716f4fc507e` | `feat(game): resolve lifecycle triggers` |
| 5 | `d226478fc23236c224e13b8f7b5327a6861285a9` | `refactor(game): centralize damage effects` |
| 6 | `4f0fe98b1be2d33dfc84085de353ec31fd4229f6` | `feat(game): add private Vision resolution` |
| 7 | `c8c4d3cfe5fd37244b9474074e91ddaa2937fefb` | `feat(game): enforce Deflect costs` |
| 8 | `e4ea02091597489221d626a4bf951cd526d39d87` | `feat(game): support card-driven unit destinations` |
| 9 | `645fd6122bd269c01fb251c0feebf87ab6396506` | `feat(card-catalog): certify Annie publication` |
| 10 | `94eab681004d2541f5c5e7460bcd7ac80eea615a` | `feat(match): support Annie deck selection` |
| 11 | See the commit with this exact subject | `test(game): certify Annie runtime` |

Baseline: `eab506a669eb5d570f6e1a97bb9ad993db326209`.

## Verification record

The milestone 11 gate passed on July 4, 2026:

- `npm test`: 135 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Neither the runtime reset nor production/admin publication was performed during
implementation.

## Data boundaries

Milestone 2 introduces object-versioned targets and persistent effect-resolution
state. Games, projections, pending choices, and action IDs created before that
milestone must not be reused after rollout or across a rollback that includes
milestone 2.

The canonical-card document shape did not change. Annie cards are intentionally
created only by admin preview, review, and approval. Existing approved Lux
records remain compatible. The reset command excludes canonical cards, behavior
definitions, and validation records.

## Rollout

First synchronize behavior definitions:

```powershell
npm run catalog:sync-behaviors
```

Then review the committed runtime catalog at `/admin/card-catalog` and approve
the 18 Annie-only records, and confirm a complete Annie snapshot is available.
With the application stopped:

```powershell
npm run game:reset-runtime
npm test
npm run typecheck
npm run lint
npm run build
```

Start the application and verify Lux/Lux, Annie/Annie, Lux/Annie, and Annie/Lux.
Do not reuse previous projections or action IDs.

## Rollback rules

Revert only a contiguous newest-first suffix, using separate `git revert`
commits. Never reset, amend, squash, force-push, or otherwise rewrite history.

A rollback limited to milestones 11, 10, or 9 is code-only. If Annie canonical
records were approved, they may remain persisted; older revisions will not
offer the Annie deck.

Any rollback that includes milestone 2 requires:

1. Stop the application.
2. Run `npm run game:reset-runtime`.
3. Revert the selected commits newest-first.
4. Run the complete verification suite.
5. Start the reverted application and create a new match.

## Complete rollback

Keep this document outside the repository while reverting. Replace
`<milestone-11-hash>` with the hash of the commit whose exact subject is
`test(game): certify Annie runtime`.

```powershell
npm run game:reset-runtime
git revert <milestone-11-hash>
git revert 94eab681004d2541f5c5e7460bcd7ac80eea615a
git revert 645fd6122bd269c01fb251c0feebf87ab6396506
git revert e4ea02091597489221d626a4bf951cd526d39d87
git revert c8c4d3cfe5fd37244b9474074e91ddaa2937fefb
git revert 4f0fe98b1be2d33dfc84085de353ec31fd4229f6
git revert d226478fc23236c224e13b8f7b5327a6861285a9
git revert a2aeb53de0b93c27bec8c06051936716f4fc507e
git revert 5224ea2c1915862a542a3fb380a6482b9490aae2
git revert 6a3908eecf55897e7b7fa4db2ff31242803bc235
git revert a3843d4b7fee3957612ede831024a2b6cefd7b75
git revert 30ba086b9468e0543eca999b51ae8f650893a514
npm test
npm run typecheck
npm run lint
npm run build
```
