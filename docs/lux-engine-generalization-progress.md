# Lux Engine Generalization Progress

## Baseline

- Commit: `fd693a76c51aaf7f469300017fdcf29b6a22a897`
- Runtime reset performed: no
- Compatibility: existing runtime state is compatible through milestone 4; milestone 5 introduces generic effect-resolution state and requires a runtime reset before rollout.

## Milestones

- [x] 0. `docs(game): add Lux engine generalization execution ledger`
- [x] 1. `refactor(game): separate gameplay engine subsystems`
- [x] 2. `refactor(game): centralize modifiers and victory scoring`
- [ ] 3. `feat(game-board): display effective victory score`
- [ ] 4. `feat(game): complete matches and present game results`
- [ ] 5. `refactor(game): add resumable effect selection`
- [ ] 6. `refactor(game-board): render projected choices generically`
- [ ] 7. `fix(game): require executable behavior snapshots`
- [ ] 8. `test(game): certify generalized Lux runtime`
- [ ] 9. `docs(game): record Lux engine rollout and rollback`

## Current checkpoint

- Completed through: milestone 2
- Last verification: focused game tests, `npm run typecheck`, `npm run lint`, `npm test`
- Next milestone: project the effective Victory Score and render a dynamic score track.

## Resume procedure

```powershell
git status --short
git log --oneline -12
Get-Content docs/lux-engine-generalization-progress.md
```

If the worktree is dirty, treat it as an interrupted current milestone. Inspect and continue those changes. Never discard, reset, amend, squash, or automatically overwrite them.

Each milestone must update this file, pass its gate, create exactly one normal commit, and leave the worktree clean.
