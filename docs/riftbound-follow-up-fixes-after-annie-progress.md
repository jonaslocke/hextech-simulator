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
   Rules 144 and 410.1 make a Standard Move a Neutral-Open discretionary
   action. Rules 383.3.c and 383.3.d permit its triggered abilities to create a
   Chain, including during a Closed State. Rules 323.9 and 323.13 stage and open
   Combat only through Cleanup after outstanding work is complete. Rules 344,
   345, and 464.2.c.1.a then open the Showdown and give Focus to the player who
   applied Contested. Therefore a move-trigger Chain must resolve before the
   move's Cleanup opens its Showdown. It is not an already-open Showdown Chain,
   so rules 340.2.a and 346.1 must not pass Focus after it. For Chains genuinely
   opened during a Showdown, rule 340.2.a still passes Focus normally.
2. **Bonus Damage on triggered abilities — valid.**
   Annie, Fiery says the controller's spells and abilities deal 1 Bonus Damage,
   with each damage instance increased by 1. Rules 417.4–417.5 define Bonus
   Damage on Deal actions. Tibbers' play trigger is a triggered ability under
   rules 383.1–383.3, and rules 713–715 apply its Bonus Damage separately to
   each unit it damages.
3. **Morbid Return Trash selection — valid.**
   Rules 108.2.c–108.2.d establish each player's public, unordered Trash.
   Rules 141.1.b.3 and 141.2.b preserve Unit type in Trash
   and permit effects that specify Units there. Every eligible Unit in the
   controller's Trash must be selectable, independent of visual order.
4. **Firestorm battlefield selection — valid.**
   Rule 170.5 makes Battlefields Locations. Rules 355.9 and 355.10.d
   distinguish the specifically chosen Battlefield from units affected
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
- [x] 2. `test(game): cover bonus damage on triggered effects`
  - Verify controller Bonus Damage applies to trigger-resolved automatic groups.
  - Do not alter the already-shared numeric damage pipeline without a failing
    production case.
- [x] 3. `test(game): cover unordered trash selections`
  - Verify every eligible source-zone card is returned independent of order.
  - Retain the existing projected source-zone choice UI.
- [x] 4. `fix(game): validate battlefield-scoped group effects`
  - Validate Firestorm using its selected Battlefield only.
  - Derive affected enemy units at resolution.
- [x] 5. `test(game): certify Annie follow-up fixes`
  - Add cross-feature regressions, run the complete gate, and record hashes.

## Current checkpoint

- Completed through: milestone 5 (all milestones)
- Last verification: generated catalog, 144 tests, typecheck, lint, build,
  and `git diff --check` passed.
- Next milestone: none.

## Commit record

- Milestone 0: `cb7772f` — `docs(game): plan Annie follow-up fixes`
- Milestone 1: `15bd779` —
  `fix(game): defer move showdowns until triggers resolve`
- Milestone 2: `a80874c` —
  `test(game): cover bonus damage on triggered effects`
- Milestone 3: `5d09148` —
  `test(game): cover unordered trash selections`
- Milestone 4: `9be4e4d` —
  `fix(game): validate battlefield-scoped group effects`
- Milestone 5: `test(game): certify Annie follow-up fixes`
  (this document identifies its own commit by subject because its hash does not
  exist until after the commit is created)

## Final certification

- Move triggers resolve in Neutral Closed before pending Combat or non-combat
  Showdowns open.
- The player applying Contested gains initial Showdown Focus.
- A Chain opened inside an existing Showdown still passes Focus under rule
  340.2.a.
- Triggered automatic-group damage receives controller Bonus Damage per unit.
- Unordered Trash selectors expose every eligible Unit.
- Battlefield-scoped automatic groups submit only their selected location and
  derive affected units at resolution.
- No persisted runtime or catalog schema changed, so no runtime reset is
  required.

## Important implementation notes

- Lux and Annie define acceptance coverage, not engine branches.
- Selected targets, source-zone choices, and automatic affected groups remain
  separate runtime concepts.
- The move's `contestedByPlayerId` and Battlefield state can preserve the
  pending parent flow without introducing card-specific trigger metadata.
- Movement now dispatches `unit.moved` before opening a pending Showdown.
  Generic stabilization opens either Combat or a non-combat Showdown only when
  its trigger Chain and pending choices are empty. The attacker consequently
  gains initial Focus under rules 345 and 464.2.c.1.a rather than having it
  passed under rules 340.2.a and 346.1.
- The reported triggered Bonus Damage failure is not reproducible in the
  current source revision. Triggered effect frames retain their controller,
  `action.deal_damage` evaluates `controller_effect` modifiers once per damage
  instruction, and automatic groups receive that modified amount per unit. An
  exact trigger-resolved multi-unit regression now protects this behavior.
- The reported top-only Trash failure is also not reproducible in the current
  source revision. `selector.card` enumerates the complete logical zone and
  filters each card by type; projection and the source-zone dialog preserve all
  legal IDs. A mixed Trash regression now proves that multiple non-top Units
  remain eligible while a Spell in the same Trash is excluded.
- Firestorm's server projection already contained only its legal Battlefield
  requirement, with enemy units represented as an automatic affected group.
  The board client previously staged only card-kind requirements and therefore
  submitted no Battlefield ID. Target staging and its choice dialog now consume
  projected Battlefield requirements generically. An end-to-end regression
  selects one location and verifies damage affects only enemy units there.
- Existing games should remain schema-compatible unless implementation proves
  otherwise. Stop and revise this ledger before any persisted schema change.
