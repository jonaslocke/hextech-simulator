# Post-Annie Gameplay Fixes Progress

## Baseline and resume procedure

- Baseline commit: `3c6d53e`
- Runtime reset performed: no
- Canonical catalog schema change: none planned
- The defect report was initially untracked and is included with this ledger.

Resume with:

```powershell
git status --short
git log --oneline -12
Get-Content docs/implementation-fixes-after-annie-progress.md
```

If the worktree is dirty, inspect it as an interrupted current milestone and
continue it. Do not discard, reset, amend, squash, or combine milestone work.

## Validated defects

1. **Deflect cost commitment — valid with clarification.**
   Rules 559–561 require choices before total cost, make Deflect mandatory, and
   then require payment. Rules 159.2 and 561.1.a require resources to be added
   to the Rune Pool, including Add Reactions during payment. Rules 721.1.c–721.2
   define any-domain and stacking behavior. A warning/preview is appropriate UX
   but its exact presentation is not prescribed by the rules.
2. **Choose a spell from Trash — valid.**
   Rules 107.1.c, 107.1.f, and 129.6 establish per-player public Trash zones.
   The selection must come from the specified Trash, not the board.
3. **Simultaneous end-of-turn triggers — valid.**
   Rules 503.2.a and 583.3.b–583.3.b.1 require simultaneous triggers to be
   collected and ordered before they are placed on the Chain. Dark Child and an
   end-of-this-turn Targon's Peak delayed effect share the end-of-turn window.
4. **Vision reveal and decision — valid.**
   Rules 729.1–729.2 require a private look followed by an independent optional
   recycle decision for every Vision instance.
5. **Firestorm battlefield selection — valid.**
   Rules 559.3.a and 163.7 distinguish the chosen Battlefield from the
   automatically affected enemy units. Rule 139.3.a governs marked damage.
6. **Discard from Hand — valid.**
   Rules 598.1–598.4 require the discarding player to choose from their private
   Hand and move as many instructed cards as possible to their Trash.
7. **Mystic Poro Vision trigger — valid.**
   Rules 729.1 and 729.1.c define Vision as a trigger when the permanent enters
   the Board.
8. **Annie, Fiery Bonus Damage — valid.**
   The card text defines the continuous modifier. Rule 139.3.a governs
   non-combat marked damage; rules 559.3.d.3–559.3.d.8 govern split damage.
9. **Tibbers automatic group — valid.**
   Rules 559.3.a and 559.3.b establish that criteria-based groups are not
   targets and triggered-permanent choices are made only if required.

## Milestones

- [x] 0. `docs(game): plan post-Annie gameplay fixes`
  - Record validation, rule references, milestones, and resume instructions.
- [x] 1. `fix(game): resolve automatic affected groups`
  - Fix Firestorm and Tibbers without card identity checks.
  - Project only required Battlefield choices and derive affected units.
- [x] 2. `feat(game-board): render zone-based effect choices`
  - Project source-zone metadata.
  - Add usable Trash and Hand card pickers for effect selections.
- [x] 3. `fix(game): resolve Vision as a private choice`
  - Register persisted Vision play triggers.
  - Reveal only to the controller and render Recycle/Keep on top.
- [x] 4. `fix(game): batch simultaneous end-of-turn triggers`
  - Collect end triggers and delayed end-of-turn effects into one ordering
    window and Chain.
- [x] 5. `fix(game): apply controlled bonus damage`
  - Apply continuous Bonus Damage once per eligible spell/ability damage
    instruction, including automatic groups.
- [ ] 6. `feat(game-board): preview Deflect additional costs`
  - Require Deflect Power in the Rune Pool.
  - Project cost/source details and warn before committing target selection.
- [ ] 7. `test(game): certify post-Annie gameplay fixes`
  - Add cross-feature regressions, run the complete gate, and record results.

## Current checkpoint

- Completed through: milestone 5
- Verification: 140 tests passed; typecheck, lint, build, and
  `git diff --check` passed.
- Next milestone: Deflect cost preview and Rune Pool enforcement.

## Important implementation notes

- Approved persisted models must remain executable. Compatibility adapters may
  interpret existing bindings, but engine behavior must not branch on card
  names or codes.
- Targets, resolution choices, source-zone selections, and automatic affected
  groups remain distinct concepts.
- No script may directly mutate or approve canonical card records.
- Every milestone updates this file and creates one normal commit.
- Automatic zero-bound selectors are removed from player target requirements.
  A paired explicit Battlefield selector is restricted to locations containing
  at least one automatically affected card. This keeps existing approved
  Firestorm and Tibbers bindings compatible.
- Effect choices now carry viewer-safe `sourceZone` metadata. Hand and Trash
  choices use a card dialog populated from the projected zone instead of board
  click targeting.
- Vision uses an explicit private presentation. Only the controller receives
  the revealed top card, and persisted `subject: "card"` play triggers are
  interpreted as the source permanent entering the Board.
- End-of-turn event triggers and due delayed effects are collected into one
  simultaneous trigger batch before any ordering prompt or Chain is created.
- `whileSourceOnBoard` now includes sources in Base as well as battlefields and
  Legends. Bonus Damage is applied to the instruction amount before applying it
  to single or automatic-group targets; combat damage remains unaffected.
