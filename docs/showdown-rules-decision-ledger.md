# Showdown and Combat Rules Decision Ledger

## Purpose

This document is the implementation contract for the two-player showdown and
combat engine. The core rules reference remains authoritative. This ledger
records how rules that span multiple engine subsystems are represented and
identifies the one interpretation required where the reference omits an
explicit transition.

## State machine

```txt
Neutral Open
  -> move/cleanup detects Contested
    -> Showdown Open
      -> Action or Reaction
        -> Showdown Closed (chain)
          -> resolve one item and repeat priority
          -> last item resolves; next relevant player gains Focus
      -> both relevant players pass Focus consecutively
        -> non-combat control resolution, or
        -> combat damage assignment and combat resolution
          -> Cleanup
            -> next pending encounter, or Neutral Open
```

Focus grants permission to act in a Showdown Open state. Priority grants
permission to act while a chain exists. They are separate designators and must
not share a canonical field.

## Decisions

| Topic | Rules | Engine decision |
| --- | --- | --- |
| Turn state | 508-510 | State is derived from the presence of a showdown and chain: Neutral/Showdown crossed with Open/Closed. |
| Focus and Priority | 511-513 | Showdown stores Focus; chain stores Priority. Gaining Focus grants initial Priority only when a chain subsequently exists. |
| Cleanup timing | 518-526 | One stabilization service runs after moves, resolved chain items, showdowns, and combat. It schedules, but does not recursively overlap, encounters. |
| Relevant players | 528-531, 550 | In current 1v1 combat, attacker and defender are relevant. In a non-combat showdown both players are relevant. |
| Chain passes | 532-544 | Passes must be consecutive. Adding an item resets the pass sequence. Each item resolves LIFO after both relevant players pass. |
| Showdown passes | 545-553 | Passes must be consecutive. Playing or activating resets the pass sequence. After the final chain item resolves, Focus advances once. |
| Uncontrolled battlefield | 181.3-181.4, 548.2, 613.1 | The reference has no explicit non-combat resolution step. When the showdown closes with the mover's units still present, that player gains Control, Contested clears, and Conquer/Score is performed if eligible. |
| Combat creation | 614, 620-625 | A cleanup with opposing units marks combat pending. The player who applied Contested is attacker; the existing controller is defender. |
| Initial chain | 551, 625.1 | Attack triggers are ordered first by the attacker, then defend triggers by the defender, with each controller choosing their own order. |
| Combat damage | 626 | Both Might totals are locked after the showdown. Attacker assigns first and defender second; marked damage is applied simultaneously after both assignments. |
| Lethal ordering | 626.1.d | Existing marked damage reduces the additional amount required for lethal assignment. Tank units are exhausted as a priority group before non-Tank units. |
| Combat resolution | 627-628 | Lethal units die; attackers recall if both sides remain; surviving attackers gain Control if defenders are gone; Contested and combat roles clear. |
| Scoring | 629-633 | Hold and Conquer share once-per-battlefield-per-turn tracking and the final-point restrictions. Victory is immediate at the current requirement. |

## Explicit boundaries

- Two players only. Team relevance, third-player invitations, and player removal
  are not reachable in the current match model.
- The engine supports approved runtime behavior plus Action, Reaction, Assault,
  Shield, Tank, attack, and defend mechanics.
- Hidden, Ganking, Vision, and complete set-wide card behavior remain separate
  features.
- Persisted development games from before this implementation are disposable.

## Known baseline deviations

Before milestone 2, the repository has a showdown shell with these known
deviations:

- `showdown.priorityPlayerId` represents both Focus and Priority.
- The movement action accepts only an empty battlefield.
- activated abilities execute immediately rather than creating chain items;
- player score, battlefield Control/Contested, and combat do not exist in
  canonical state.

## Milestone gate

Every milestone is committed independently. Before its commit, `npm test`,
`npm run typecheck`, and `npm run lint` must pass. Later commits may depend on
earlier commits, so rollback is limited to a contiguous newest-first suffix.
