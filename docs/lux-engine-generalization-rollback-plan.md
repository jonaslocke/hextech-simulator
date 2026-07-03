# Lux Engine Generalization Rollout and Rollback

## Delivered commits

The milestones are one dependency chain. Their immutable commit hashes are:

| Milestone | Commit | Subject |
| --- | --- | --- |
| 0 | `805518634e2755bbc6813ffc9e95a36b20ddcfd5` | `docs(game): add Lux engine generalization execution ledger` |
| 1 | `1ab17562aade228e1a99d7dcee9bdc0bcb7cb4fc` | `refactor(game): separate gameplay engine subsystems` |
| 2 | `c519fc9c0dc144d4d91383426b7f2d73f0774faa` | `refactor(game): centralize modifiers and victory scoring` |
| 3 | `92bceb1fa9759ffb2874a87f1d8877b0e575bca5` | `feat(game-board): display effective victory score` |
| 4 | `5b98a3dcf085ed8c05ed2ddfd271343949a6cb1f` | `feat(game): complete matches and present game results` |
| 5 | `36897da207d9c1cb22f8d08df7bb159938c252ee` | `refactor(game): add resumable effect selection` |
| 6 | `74f989e66cf0a325090b0d9fc07aa66f5a607cf5` | `refactor(game-board): render projected choices generically` |
| 7 | `bcdba7b2e581e49690647d6a20226e1a1a3ccc04` | `fix(game): require executable behavior snapshots` |
| 8 | `cf1b4a0cee209b95ae73de3c6c3222c116aba1c1` | `test(game): certify generalized Lux runtime` |
| 9 | See the commit with this exact subject | `docs(game): record Lux engine rollout and rollback` |

Baseline: `fd693a76c51aaf7f469300017fdcf29b6a22a897`.

## Verification record

The milestone 8 certification and milestone 9 final gate passed on July 3,
2026:

- `npm test`: 120 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

The runtime reset has not been performed. It is an intentional rollout action,
not an implementation or test action.

## Data compatibility boundary

Milestones 0 through 4 retain the previous persisted runtime schema. Milestone 5
introduces persistent generic effect-resolution frames and changes pending
effect choices from `readyCards` to `effectSelection`. Games, projections, and
action IDs created before that boundary must not be reused after rollout.

The reset command deletes only matches, games, game events, and match-owned deck
snapshots. It does not delete canonical cards, behavior definitions, or
validation records. This implementation does not change canonical behavior
record shapes, so catalog migration or restoration is not required.

## Rollout

With the application stopped:

```powershell
npm run game:reset-runtime
npm test
npm run typecheck
npm run lint
npm run build
```

Then:

1. Start the application.
2. Create a new Lux-vs-Lux match; do not reuse old projections or action IDs.
3. Verify setup and normal gameplay.
4. Verify an 8-point win without Aspirant's Climb.
5. Verify Aspirant's Climb projects Victory Score 9 and requires the ninth
   point.
6. Verify the result dialog and its Create New Match action.

## Rollback rules

Roll back only a contiguous newest-first suffix of the milestone chain. Use
separate `git revert` commits. Do not reset, force-push, amend, squash, or
otherwise rewrite history.

Reverting only milestones 9, 8, or 7 is code-only and does not require a runtime
reset.

Milestones 4 and 3 may be reverted together after every later milestone has
been reverted. This removes result UX and the dynamic Victory Score projection
while retaining the earlier scoring behavior.

Any rollback that includes milestone 6 or 5 crosses the persisted-state
boundary and requires this sequence:

1. Stop the application.
2. Run `npm run game:reset-runtime` while the command still exists.
3. Revert the selected contiguous commits newest-first.
4. Run the complete verification suite.
5. Start the reverted application and create a new match.

Never restore games containing generic effect frames into a revision that
expects `readyCards`.

## Complete rollback

From a clean worktree, keep this document or command list available outside the
repository. Replace `<milestone-9-hash>` with the hash of the commit whose exact
subject is `docs(game): record Lux engine rollout and rollback`.

```powershell
npm run game:reset-runtime
git revert <milestone-9-hash>
git revert cf1b4a0cee209b95ae73de3c6c3222c116aba1c1
git revert bcdba7b2e581e49690647d6a20226e1a1a3ccc04
git revert 74f989e66cf0a325090b0d9fc07aa66f5a607cf5
git revert 36897da207d9c1cb22f8d08df7bb159938c252ee
git revert 5b98a3dcf085ed8c05ed2ddfd271343949a6cb1f
git revert 92bceb1fa9759ffb2874a87f1d8877b0e575bca5
git revert c519fc9c0dc144d4d91383426b7f2d73f0774faa
git revert 1ab17562aade228e1a99d7dcee9bdc0bcb7cb4fc
git revert 805518634e2755bbc6813ffc9e95a36b20ddcfd5
npm test
npm run typecheck
npm run lint
npm run build
```

Catalog data requires no migration or restoration.
