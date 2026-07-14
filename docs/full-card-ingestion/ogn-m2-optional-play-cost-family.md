# OGN M2 Optional Play-Cost Family

Status: Manually validated and published (2026-07-14).

## Shared Contract

An optional additional cost is chosen and paid while its card is being played,
before the card is finalized on the Chain. The selected object is a record of
payment, not a resolving effect target.

| Concern | Contract |
|---|---|
| Decision timing | Select or decline the optional cost during the parent card's Play process. |
| Legality | The selection must satisfy its selector when made; an exhausted or otherwise illegal Unit cannot be selected for an exhaust cost. |
| Payment | The selected cost is paid before the card enters the Chain. The normal Energy and Power payment flow remains unchanged. |
| Chain record | Store the selection by its selector binding, alongside ordinary locked targets. |
| Resolution | Do not revalidate a paid optional cost as a current effect target. Its own payment may make it fail the selector's former readiness or Buff condition. |
| Ordinary targets | Continue to use ordinary target legality and object-identity checks at resolution. |
| Effects | Effects that branch on the optional cost use the locked payment selection, even if the selected object has since moved or changed state. |
| Decline | Zero selections are legal when the optional selector has a zero minimum; the fallback branch resolves. |
| Projection | The pre-play selector remains explicitly labelled as an optional cost and exposes only legal candidates. |

## Reuse Map

| Card | Printed behavior | Model |
|---|---|---|
| Meditation (MVP) | You may exhaust a friendly Unit as an additional cost; draw 2 if paid, otherwise draw 1. | optional `selector.friendly_unit` -> `cost.exhaust_selected_unit` -> `action.draw_by_optional_cost` |
| OGN-207 | May spend a friendly Unit's Buff as an alternate play cost while targeting a Unit. | ordinary target selector + optional Buff-cost selector -> `cost.spend_buff` |

## Manual Validation

Passed on 2026-07-14:

1. Play Meditation with a ready friendly Unit, select it as the optional cost,
   and finish the normal payment. The Unit is exhausted before priority is
   exchanged; after both players pass, draw two cards.
2. Play Meditation and decline the optional cost. After both players pass,
   draw one card.
3. Confirm an exhausted friendly Unit cannot be selected as Meditation's
   optional cost.
4. Focused regression: a normal target that becomes invalid before resolution
   must still fail rather than being treated as a paid optional cost.
