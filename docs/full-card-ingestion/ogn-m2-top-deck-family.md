# OGN M2 Family: Top-Deck Inspection and Zone Transfer

Status: Manual Family Passed

## Reuse map

| Field | Decision |
|---|---|
| Remaining OGN cards | Stacked Deck (`OGN-183`) in this batch; later candidates include Reinforce, Baited Hook, Dazzling Aurora, Nocturne, Horrifying, and remaining top-deck effects. |
| Rules verbs and timing | Action timing; privately look at Main Deck cards; choose a looked-at card; put it into hand; recycle the remaining looked-at cards. |
| Accepted reference | The Candlelit Sanctum (`OGN-291`) for private top-deck look, optional recycle, and preserving the original looked-at group while cards leave the deck. |
| Existing owner | `src/server/game/effect-resolution.ts` and `src/server/game/primitive-handlers.ts`; catalog contracts live in `primitive-catalog.ts`. |
| Existing primitives | `timing.action`, `action.look`, `action.recycle_top_cards`, and the existing private vision choice flow. |
| New shared capability | `action.take_to_hand` moves a chosen card only from the original looked-at group; `recycleAllRemaining` makes the existing recycle operation automatically move every looked-at card still in the deck. |
| Regression risk | Accepted The Candlelit Sanctum look/recycle/order flow; private card projection; effect resumption after a vision choice. |
| Manual regression scope | One accepted Candlelit Sanctum activation with one recycled card and one with none recycled. |

## Clause classification: Stacked Deck

| Clause | Classification | Model |
|---|---|---|
| `[Action]` | Parameterized reuse | `timing.action` |
| `Look at the top 3 cards of your Main Deck` | Parameterized reuse | `action.look` with `count: 3`, `selectionKey: lookedCards` |
| `Put 1 into your hand` | New primitive | `action.take_to_hand` with `sourceSelectionKey: lookedCards`, `count: 1`, and a private card choice |
| `Recycle the rest` | Shared extension | `action.recycle_top_cards` with `sourceSelectionKey: lookedCards` and `recycleAllRemaining: true`; cards already moved to hand are automatically excluded because they are no longer in Main Deck |

## Behavior contract

- Source zone: the controller's Main Deck; only the top three cards are looked
  at, and no other deck cards become legal choices.
- Privacy: the looked-at identities are exposed only to the controller through
  the existing vision presentation.
- Choice: exactly one looked-at card is moved to the controller's hand. If the
  deck contains fewer than three cards, the available looked-at cards define
  the legal set.
- Zone transition: the selected card leaves Main Deck for hand before the
  recycle choice is evaluated.
- Recycle: every looked-at card still in Main Deck is automatically recycled to
  the bottom of the Main Deck in its remaining top-to-bottom order; there is no
  optional decline or second selection prompt for this instruction.
- Events: the hand transfer emits `card.addedToHand`; recycling retains the
  existing grouped `card.recycled` event.
- Chain and focus: the action resolves as one existing Action Chain item and
  resumes its originating Focus/priority after pending choices.
- Projection: the opponent sees neither looked-at identities nor private
  choices; the controller sees only the three legal cards.

## Manual scenario

1. Create a match with `Stacked Deck` in the controller's hand and at least
   three known Main Deck cards: A, B, and C.
2. Play `Stacked Deck` at Action timing on the controller's turn.
3. Verify that the controller receives a private prompt containing exactly A,
   B, and C, while the opponent sees no identities.
4. Choose B. Verify that B moves to hand, A and C are automatically recycled to
   the bottom of Main Deck in their remaining order, no fourth deck card moves,
   and the action Chain closes normally without another prompt.
6. Repeat with fewer than three Main Deck cards and verify no unavailable card
   is projected.
7. Focused regression: activate accepted The Candlelit Sanctum once recycling
   one looked-at card and once recycling none; verify its remaining cards are
   ordered from the original looked-at group.

## Manual validation result

The user manually passed this family on 2026-07-13. The validation confirmed
the private keep-one prompt, automatic recycling of the unkept looked-at cards,
normal Chain completion, and the shared prompt title using the source card's
name. The focused Candlelit Sanctum regression was also included in the manual
validation deck.
