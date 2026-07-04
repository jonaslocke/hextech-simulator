# Annie Runtime Progress

## Baseline

- Commit: `eab506a`
- Runtime reset performed: no
- Persisted runtime compatibility: unchanged through milestone 1; milestone 2
  introduces stable target identity and requires a runtime reset before rollout.
- Canonical card persistence: cards are persisted only through the admin
  preview/review/approval workflow.

## Milestones

- [x] 0. `docs(game): plan Annie catalog rollout`
- [x] 1. `test(card-catalog): define Annie behavior suggestions`
- [x] 2. `refactor(game): add stable zone-aware targets`
- [x] 3. `feat(game): execute return and movement effects`
- [x] 4. `feat(game): resolve lifecycle triggers`
- [x] 5. `refactor(game): centralize damage effects`
- [x] 6. `feat(game): add private Vision resolution`
- [x] 7. `feat(game): enforce Deflect costs`
- [x] 8. `feat(game): support card-driven unit destinations`
- [ ] 9. `feat(card-catalog): certify Annie publication`
- [ ] 10. `feat(match): support Annie deck selection`
- [ ] 11. `test(game): certify Annie runtime`

## Current checkpoint

- Completed through: milestone 8
- Verification: unit destination, game flow, and Annie discovery tests,
  typecheck, lint, and `git diff --check` pass.
- Next milestone: certify the Annie publication and strict snapshot gate.

## Resume procedure

```powershell
git status --short
git log --oneline -14
Get-Content docs/annie-runtime-progress.md
```

If the worktree is dirty, inspect and continue the interrupted milestone.
Never discard, reset, amend, squash, or combine milestone work automatically.
