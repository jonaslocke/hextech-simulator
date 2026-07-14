# OGN M2 Opponent-Hand Selection Family

Status: Manually validated and published (2026-07-14).

## Scope

| Item | Contract |
|---|---|
| Rules verbs and timing | In 1v1, the opponent is derived automatically. Reveal that opponent's Hand to the controller; choose one legal card; then recycle or discard that exact card. |
| Shared selector | `selector.card` now supports `owner: opponent` and `cardType: nonUnit`, while omitting `owner` continues to mean the controller's zone for older models. |
| Information boundary | Only the player required to choose receives the legal Hand cards through `selectionCards`. The opponent receives no card identities outside its own normal Hand view. The public game log records every card in a Hand explicitly revealed by the card effect. |
| Reveal presentation | The choosing player sees every card in the revealed Hand. Cards outside the selector's legal set remain visible but are disabled, so the reveal is complete without allowing an illegal choice. |
| Target timing | These 1v1 opponent-Hand selectors are deferred: their card enters the Chain without a target, then the resolving effect reveals and chooses from the current Hand. |
| Stale target | A deferred selector determines its legal cards at resolution; it does not use a pre-Chain target. |

## Reuse Map

| Card | Printed behavior | Model |
|---|---|---|
| Sabotage (`OGN-156`) | Reveal an opponent's Hand, choose a non-Unit card, recycle it. | `timing.action` -> deferred `selector.card` -> `action.recycle_cards` |
| Mindsplitter (`OGN-192`) | On play, reveal an opponent's Hand, choose a card, and make that player discard it. | `trigger.on_play` -> deferred `selector.card` -> `action.discard_cards` |

## Explicitly Out of Scope

`Divine Judgment` requires each player to retain multiple card categories across
several zones and then recycle the rest. It is a separate multi-zone,
multi-player retention family; it must not be modeled as a special case of
opponent-Hand targeting.

## Automated Checks

`tests/game-token-placement.test.ts` covers:

1. Sabotage entering the Chain without a target, then filtering Units out,
   privately exposing the legal opponent Hand card to its controller at
   resolution, and recycling that selected card.
2. Mindsplitter entering the Chain without a target, then revealing the
   opponent Hand and selecting exactly one card as the triggered ability resolves.

## Manual Validation

Passed on 2026-07-14:

1. Sabotage enters the Chain without a target prompt, reveals the complete
   opponent Hand at resolution, disables ineligible cards, recycles the chosen
   non-Unit, and logs the reveal.
2. Mindsplitter enters the Chain without an opponent prompt, then reveals the
   opponent Hand and discards the selected card at resolution.
