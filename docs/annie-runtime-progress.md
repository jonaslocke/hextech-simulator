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
- [ ] 2. `refactor(game): add stable zone-aware targets`
- [ ] 3. `feat(game): execute return and movement effects`
- [ ] 4. `feat(game): resolve lifecycle triggers`
- [ ] 5. `refactor(game): centralize damage effects`
- [ ] 6. `feat(game): add private Vision resolution`
- [ ] 7. `feat(game): enforce Deflect costs`
- [ ] 8. `feat(game): support card-driven unit destinations`
- [ ] 9. `feat(card-catalog): certify Annie publication`
- [ ] 10. `feat(match): support Annie deck selection`
- [ ] 11. `test(game): certify Annie runtime`

## Current checkpoint

- Completed through: milestone 1
- Verification: combined upload preview reports 39 cards, 21 existing Lux
  records, 18 new Annie records, and zero unsupported, ambiguous, or
  missing-parameter clauses; focused catalog tests, typecheck, lint, and
  `git diff --check` pass.
- Next milestone: add stable target identity and generalized zone-aware
  selectors.

## Resume procedure

```powershell
git status --short
git log --oneline -14
Get-Content docs/annie-runtime-progress.md
```

If the worktree is dirty, inspect and continue the interrupted milestone.
Never discard, reset, amend, squash, or combine milestone work automatically.
