# M1 Garen Primitive Discovery

Snapshot: 2026-07-10

Active milestone: M1 - Garen Proving Grounds deck ingestion.

Rules authority used:

- `docs/riftbound_core_rules_reference.md`
- Card text from `data/sets`

No online rulings or external sources were used.

## Input Readiness

`data/decks/garen.dec.txt` has been normalized to the project deck syntax:

- `Legend:` now has `1 Might of Demacia - Starter`.
- `Main Deck:` is now `MainDeck:`.

Deck validation against the full local set corpus passes:

| Check | Result |
|---|---|
| Unique deck card names | 21 |
| Total instances | 56 |
| Legend | `Might of Demacia - Starter` |
| Champion | `Garen, Rugged` |
| Rune count | 12 |
| Battlefield count | 3 unique |
| Deck construction | Valid |

## Card Coverage Summary

| Card status | Count |
|---|---:|
| Total unique Garen deck cards | 21 |
| Existing MVP catalog cards | 9 |
| New scoped catalog cards needed | 12 |
| Supported by current suggested primitives | 16 |
| Needs new or extended runtime primitive coverage | 5 |
| Required gameplay token kinds | 1 |
| Missing required token data | 0 |
| Rule blocked | 0 |
| Public intent/approval blocked | 0 primitive families |

New scoped catalog cards needed:

| Card code | Name | Reason |
|---|---|---|
| `OGS-023` | Might of Demacia - Starter | Garen legend |
| `OGS-007` | Garen, Rugged | Garen champion |
| `OGN-294` | Trifarian War Camp | Garen battlefield |
| `OGN-130` | Crackshot Corsair | Garen main deck |
| `OGN-211` | Faithful Manufactor | Garen main deck |
| `OGN-132` | First Mate | Garen main deck |
| `OGN-222` | Noxian Drummer | Garen main deck |
| `OGS-024` | Decisive Strike | Garen main deck |
| `OGN-131` | Dune Drake | Garen main deck |
| `OGN-215` | Petty Officer | Garen main deck |
| `OGS-013` | Garen, Commander | Garen main deck |
| `OGS-015` | Recruit the Vanguard | Garen main deck |

## Token Coverage Summary

| Token kind | Source cards | Token data present | Behavior executable | Blocker |
|---|---|---|---|---|
| `1 :rb_might: Recruit unit` | Faithful Manufactor, Noxian Drummer, Recruit the Vanguard | Yes, via `Recruit (DE)`, `Recruit (NX)`, and `Recruit (ZN)` in `data/sets/ogn.json` | Yes | Runtime supports generated Recruit token identity plus fixed and chosen placement |

M1 should collapse the printed Recruit variants into one gameplay token identity.

## Primitive Delta

| Primitive / mechanic | Existing? | Needs extension? | Cards affected | Rule status | Regression approval needed? | Blocker |
|---|---|---|---|---|---|---|
| `ability.exhaust_for_resource` | Yes | No | Body Rune, Order Rune | Covered by rules reference | No | None |
| `ability.recycle_for_power` | Yes | No | Body Rune, Order Rune | Covered by rules reference | No | None |
| `timing.action` | Yes | No | Confront, Decisive Strike, Recruit the Vanguard | Covered by rules reference | No | None |
| `timing.reaction` | Yes | No | Back to Back | Covered by rules reference | No | None |
| `timing.delayed` | Yes | No | Targon's Peak | Covered by rules reference | No | None |
| `trigger.on_play` | Yes | No | Faithful Manufactor, First Mate | Covered by rules reference | No | None |
| `trigger.on_move` | Yes | No | Noxian Drummer | Covered by rules reference | No | None |
| `trigger.attack` | Yes | No | Crackshot Corsair, Dune Drake | Covered by rules reference | No | Must be added manually to behavior models because discovery did not infer it |
| `trigger.conquer_battlefield` | Yes | No | Targon's Peak | Covered by rules reference | No | None |
| `trigger.hold_battlefield` | Yes | No | The Papertree | Covered by rules reference | No | None |
| `trigger.conquer` | No | New primitive implemented | Might of Demacia - Starter | Covered by rules reference and card text | No | None |
| `condition.unit_presence` | No | New primitive implemented | Might of Demacia - Starter, Dune Drake | Covered by card text + existing readiness/location rules | No | None |
| `selector.unit` / `selector.friendly_unit` / `selector.enemy_unit` `excludesSource` | Yes | Implemented | First Mate now; broader future corpus | Covered by card text + "another" wording | Approved and implemented | None |
| `selector.unit` | Yes | Manual model correction needed | Might of Demacia - Starter, First Mate | Covered by card text | No | Discovery parameters are insufficient for these cards |
| `selector.enemy_unit` | Yes | Manual model correction needed | Crackshot Corsair, Dune Drake | Covered by card text | No | Dune Drake needs ready-only existence, not target selection |
| `action.draw_cards` | Yes | No | Might of Demacia - Starter, Confront | Covered by rules reference | No | None after global conquer condition support |
| `action.ready_cards` | Yes | Maybe | Targon's Peak, First Mate, Dune Drake | Covered by rules reference | Yes for `First Mate` targeting through `excludesSource` | Needs target-selection model for "another unit" |
| `action.deal_damage` | Yes | No | Crackshot Corsair | Covered by rules reference | No | None after attack trigger model correction |
| `action.play_token` | Yes | Runtime implemented | Faithful Manufactor, Noxian Drummer, Recruit the Vanguard | Covered by rules reference token rules and card text | Approved and implemented | None |
| `modifier.enter_ready` | Yes | No | Confront, Vanguard Attendant | Covered by rules reference and card text | No | None |
| `modifier.modify_numeric_value` | Yes | No | Trifarian War Camp, Back to Back, Decisive Strike, Dune Drake, Garen, Commander | Covered by rules reference | No | Some manual duration/location parameters needed |
| `keyword.assault` | Yes | No | Garen, Rugged, Daring Poro, Petty Officer | Covered by rules reference | No | None |
| `keyword.shield` | Yes | No | Garen, Rugged | Covered by rules reference | No | None |

## Approved Runtime Extensions

### Public intent contract change

`action.play_token` cannot be fully implemented for M1 without modeling token
placement choices. `Recruit the Vanguard` says its four Recruit tokens can be
played to the controller's base or to battlefields they control. The current
player intent and pending-choice schemas select existing cards or battlefields;
they do not represent placing multiple new tokens across base/battlefield
locations.

Implemented after user approval:

```text
Primitive or mechanic:
action.play_token / token placement choice

Why approval is needed:
Implementing Recruit the Vanguard correctly requires extending the public
pending-choice and intent contract to submit token placement choices.

Expected behavior before:
No runtime support for token creation; Garen token cards cannot be executable.

Expected behavior after:
Token-creating effects create canonical Recruit token instances. Effects with
fixed location such as "here" resolve automatically. Recruit the Vanguard asks
the controller where each token enters among legal base/controlled battlefield
locations.

Existing cards/decks affected:
No accepted MVP deck currently uses action.play_token. Future token cards will
share the primitive.

Manual regression focus:
Existing Lux, Annie, and Master Yi match creation and normal pending choices
still work; Garen token placement prompts render and submit correctly.
```

### Shared selector extension

`First Mate` says "ready another unit." The primitive discovery already records
`excludesSource`, but runtime selectors do not enforce it.

Implemented after user approval:

```text
Primitive or mechanic:
selector.unit / selector.friendly_unit / selector.enemy_unit excludesSource

Why approval is needed:
This changes shared selector legality by removing the source card from legal
targets when a behavior model sets excludesSource.

Expected behavior before:
A source unit may remain a legal target even when card text says "another."

Expected behavior after:
The source card is excluded from legal target lists whenever the behavior model
sets excludesSource.

Existing cards/decks affected:
No accepted MVP deck card currently has a discovered excludesSource selector.
Full corpus discovery finds future cards that need this behavior.

Manual regression focus:
Existing targeted spells and abilities still project their previous targets
unless their model explicitly sets excludesSource.
```

## Rule Blockers

No rule blocker was found from the M1 discovery pass. The required mechanics are
covered by the rules reference and card text:

- Tokens: rules 170-178.
- Triggered abilities: rules 582-585.
- Conquer scoring and conquer abilities: rules 630-632.
- Attack/defend triggered abilities: rules 551 and 625.

## Remaining Implementation Order

1. Add focused behavior-model tests for the exact Garen cards that need manual
   model corrections.
2. Publish/approve exact behavior models for every unique Garen deck card.
3. Add `garen` to permanent local and online deck selectors only after every
   unique card and required token is executable.
4. Run focused automated checks and prepare manual match scenarios.

## Manual Validation Scenarios

| Scenario | Cards / mechanics |
|---|---|
| Garen vs Lux | General setup, Action timing, Garen deck loading |
| Garen vs Annie | Damage, token blockers, removal interactions |
| Garen vs Master Yi | Combat modifiers, attack triggers, ready/exhaust interactions |
| Garen mirror | Recruit token placement and board congestion |
| Might of Demacia conquer | Draw 2 only when the conquer battlefield has 4+ friendly units |
| Dune Drake attack | Gets +2 Might only when a ready enemy unit is at its battlefield |
| First Mate play | Can ready another unit, not itself |
| Recruit the Vanguard | Places four Recruit tokens among legal locations |
| Faithful Manufactor / Noxian Drummer | Fixed-location Recruit token creation |

## M1 Status

Status: Behavior modeling

The user approved the public token placement choice contract change and the
shared selector `excludesSource` extension. Runtime implementation is complete
for:

- counted token placement through `tokenPlacements` action intents;
- fixed-location token creation for "here" effects;
- `excludesSource` unit selector filtering;
- `trigger.conquer`;
- `condition.unit_presence`.

Verified commands:

- `node --import tsx --test tests/game-token-placement.test.ts`
- `cmd /c npm run catalog:check-mvp`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
