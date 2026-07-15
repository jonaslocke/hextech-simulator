# OGN M2 Legion Resource Ability Family

Status: Manual family passed (2026-07-15).

## Shared Contract

A Legion activated resource ability is available only after its controller has
played another card this turn. Its Exhaust and resource addition resolve
immediately; an Add ability does not enter the Chain and cannot be reacted to.

| Concern | Contract |
|---|---|
| Legion check | For an activated ability, check whether its controller has already played a card this turn when the ability is activated. |
| Availability | Before Legion is satisfied, show the ability as unavailable and do not exhaust its source. |
| Resource timing | Once legal, exhaust the source and add the printed resource immediately, with no Chain item or priority exchange. |
| Resource type | The existing `ability.exhaust_for_resource` primitive determines whether the result is Energy or Power. |

## Reuse Map

| Card | Printed behavior | Model |
|---|---|---|
| Hand of Noxus (`OGN-253`) | Exhaust; Legion; Add 1 Energy. | `timing.reaction` -> `keyword.legion` -> `ability.exhaust_for_resource` |

## Manual Validation

1. Before playing another card this turn, Hand of Noxus is unavailable.
2. After playing another card, activate it. It exhausts and adds exactly 1
   Energy immediately, without entering the Chain.
3. It cannot be activated again while exhausted.

## Manual validation result

Passed on 2026-07-15. Hand of Noxus remained unavailable before Legion,
including as an automatic-payment source for the first card played that turn.
After another card was played, it correctly exhausted to add exactly 1 Energy
without entering the Chain.
