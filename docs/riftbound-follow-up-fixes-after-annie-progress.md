# Riftbound Follow-up Fixes After Annie Progress

## Baseline and resume procedure

- Baseline commit: `0c131f2`
- Runtime reset performed: no
- Persisted runtime or catalog schema boundary: none planned
- Pre-existing worktree changes:
  - `src/features/game-board/components/combat-damage-dialog.tsx`
  - `src/features/game-board/game-board.tsx`
  - `src/shared/components/choice-dialog.tsx`
- Those pre-existing UI changes belong to the user. Preserve them and exclude
  them from milestone commits unless a follow-up fix necessarily overlaps them.

Resume with:

```powershell
git status --short
git log --oneline -12
Get-Content docs/riftbound-follow-up-fixes-after-annie-progress.md
```

If additional milestone changes are present, inspect and continue them. Never
discard, reset, amend, squash, or combine milestone work.

## Validated defects

1. **Move-trigger Showdown Focus — valid symptom, corrected rule model.**
   Rules 140.1.b–140.1.c require a Standard Move to begin in Neutral Open.
   Rule 583.3 permits its triggered abilities to create a Chain. Rules 615 and
   621 require Cleanup, an empty Chain, and opposing units before Combat starts.
   Rules 625.1 and 549 then open the Showdown and give Focus to the player who
   applied Contested. Therefore a move-trigger Chain must resolve before the
   move's Cleanup opens its Showdown. It is not an already-open Showdown Chain,
   so rule 552 must not pass Focus after it. For Chains genuinely opened during
   a Showdown, rule 552 still passes Focus normally.
2. **Bonus Damage on triggered abilities — valid.**
   Annie, Fiery says the controller's spells and abilities deal 1 Bonus Damage,
   with each damage instance increased by 1. Rule 139.3.a treats spell and
   ability damage uniformly. Tibbers' play trigger is a triggered ability under
   rules 583.1–583.3, so each unit it damages receives the modified amount.
3. **Morbid Return Trash selection — valid.**
   Rules 107.1.c and 107.1.f establish each player's public Trash. Rule 107.1.e
   makes Trash unordered. Rules 138.1.b.1–138.1.b.3 preserve Unit type in Trash
   and permit effects that specify Units there. Every eligible Unit in the
   controller's Trash must be selectable, independent of visual order.
4. **Firestorm battlefield selection — valid.**
   Rules 163.5 and 163.7 make Battlefields targetable Locations. Rules 559.3 and
   559.3.a distinguish the specifically chosen Battlefield from units affected
   by criteria. Firestorm chooses one Battlefield containing an enemy unit;
   enemy units there are derived affected objects, not separately submitted
   targets.

## Milestones

- [x] 0. `docs(game): plan Annie follow-up fixes`
  - Record validation, the rules correction, milestones, and resume procedure.
- [x] 1. `fix(game): defer move showdowns until triggers resolve`
  - Keep move-trigger Chains in Neutral Closed.
  - Open pending combat/non-combat Showdowns only after trigger stabilization.
  - Preserve normal rule-552 Focus passing for Chains opened inside Showdowns.
- [ ] 2. `fix(game): apply bonus damage to triggered effects`
  - Carry generic damage-source context through effect frames.
  - Apply controller Bonus Damage to spell and ability damage, including
    automatic groups, without card identities.
- [ ] 3. `fix(game-board): expose all eligible trash choices`
  - Project every eligible source-zone card.
  - Render/select any eligible Unit in unordered Trash.
- [ ] 4. `fix(game): validate battlefield-scoped group effects`
  - Validate Firestorm using its selected Battlefield only.
  - Derive affected enemy units at resolution.
- [ ] 5. `test(game): certify Annie follow-up fixes`
  - Add cross-feature regressions, run the complete gate, and record hashes.

## Current checkpoint

- Completed through: milestone 1
- Last verification: 142 tests passed; typecheck, lint, and scoped
  `git diff --check` passed.
- Next milestone: apply Bonus Damage to triggered ability damage.

## Important implementation notes

- Lux and Annie define acceptance coverage, not engine branches.
- Selected targets, source-zone choices, and automatic affected groups remain
  separate runtime concepts.
- The move's `contestedByPlayerId` and Battlefield state can preserve the
  pending parent flow without introducing card-specific trigger metadata.
- Movement now dispatches `unit.moved` before opening a pending Showdown.
  Generic stabilization opens either Combat or a non-combat Showdown only when
  its trigger Chain and pending choices are empty. The attacker consequently
  gains initial Focus under rules 549 and 625 rather than having it passed
  under rule 552.
- Existing games should remain schema-compatible unless implementation proves
  otherwise. Stop and revise this ledger before any persisted schema change.
