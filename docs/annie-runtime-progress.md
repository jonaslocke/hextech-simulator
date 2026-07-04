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
- [ ] 4. `feat(game): resolve lifecycle triggers`
- [ ] 5. `refactor(game): centralize damage effects`
- [ ] 6. `feat(game): add private Vision resolution`
- [ ] 7. `feat(game): enforce Deflect costs`
- [ ] 8. `feat(game): support card-driven unit destinations`
- [ ] 9. `feat(card-catalog): certify Annie publication`
- [ ] 10. `feat(match): support Annie deck selection`
- [ ] 11. `test(game): certify Annie runtime`

## Current checkpoint

- Completed through: milestone 3
- Verification: focused zone-effect and behavior-runtime tests, typecheck,
  lint, and `git diff --check` pass.
- Next milestone: add lifecycle events and sequential discard/draw effects.

## Resume procedure

```powershell
git status --short
git log --oneline -14
Get-Content docs/annie-runtime-progress.md
```

If the worktree is dirty, inspect and continue the interrupted milestone.
Never discard, reset, amend, squash, or combine milestone work automatically.
