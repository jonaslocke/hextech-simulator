# OGN M2 Family: Keyword Grants and Combat-Role Modifiers

Status: Accepted

## Reuse map

| Field | Decision |
|---|---|
| OGN cards in this batch | Cleave (`OGN-004`), Captain Farron (`OGN-015`), Block (`OGN-057`), Taric, Protector (`OGN-074`), Fortified Position (`OGN-279`), and Windswept Hillock (`OGN-297`). |
| Existing owner | `src/server/game/keyword-evaluation.ts`, `combat.ts`, `actions.ts`, `payment.ts`, and `primitive-handlers.ts`. |
| Existing primitives | `modifier.grant_keyword`, Assault, Shield, Tank, Deflect, Ganking, Action timing, and the defend-at-source-battlefield trigger. |
| Shared extension | Keyword evaluation now combines printed, temporary, and static source-location grants. Tank, Ganking, Deflect, Assault, and Shield all read the same result. |
| Duration | `thisCombat` is removed when combat resolves; `thisTurn` continues through the turn; static source-location grants stop as soon as the source or target leaves that location. |
| Explicitly deferred | Conditional grants such as "while buffed", "while Mighty", and "if you discarded" require the separate condition family and are not modeled here. |

## Behavior contract

- A temporary granted keyword is treated identically to a printed keyword for
  every consumer: Assault and Shield modify combat Might, Tank determines combat
  damage priority, Ganking enables battlefield-to-battlefield movement, and
  Deflect adds its targeting Power cost.
- Static grants apply without a target prompt while their source remains in the
  specified active location. `other friendly units here` excludes the source;
  `units here` applies to either controller's units.
- A `thisCombat` grant expires immediately after that combat resolves, before
  a later combat can use it. A `thisTurn` grant expires at turn end.
- The family does not introduce a new choice surface. Cards with a selected
  recipient use the existing unit-target prompt and cards with static recipients
  resolve automatically.

## Manual scenarios

1. Play Cleave on a unit, attack with it this turn, and verify Assault 3 applies
   only while it attacks and disappears at turn end.
2. Play Block on a unit, defend with it, and verify Shield 3 increases its
   defending Might and Tank forces it to receive combat damage before a
   non-Tank unit. Verify both disappear at turn end.
3. Defend at Fortified Position, select a unit, and verify Shield 2 lasts for
   that combat only; begin a later combat and verify it is gone.
4. Put Captain Farron or Taric, Protector with another friendly unit at the
   same battlefield. Verify only the other friendly unit receives the static
   Assault or Shield. Move it away and verify the keyword immediately stops.
5. Put units controlled by both players at Windswept Hillock. Verify either
   unit can make a battlefield-to-battlefield Ganking move while there, but not
   after leaving the Hillock.
