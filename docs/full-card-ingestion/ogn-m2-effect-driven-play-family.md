# OGN M2 Family: Effect-Driven Unit Recovery and Play from Trash

Status: Manual family passed (2026-07-14)

## Reuse map

| Field | Decision |
|---|---|
| Remaining OGN cards | Cemetery Attendant (`OGN-165`), Morbid Return (`OGN-170`), Soulgorger (`OGN-196`), and The Harrowing (`OGN-198`). |
| Rules verbs and timing | Select and lock a controller-owned Unit in Trash before the parent spell or ability gives Priority; then either return it to hand or play it from Trash. A nested Unit play chooses its normal destination and may waive only its Energy cost. |
| Accepted reference | Morbid Return in the Annie baseline for return-to-hand; Spectral Matron (`OGN-226`) in the accepted Viktor deck for play-from-Trash and normal destination selection. |
| Existing subsystem owner | `src/server/game/primitive-handlers.ts` for zone selection and effect-driven Unit play; `src/server/game/payment.ts` for authoritative Power payment; `src/server/game/effect-resolution.ts` for resumable selection and destination choices. |
| Existing primitives and handlers | `selector.card`, `action.return_to_hand`, `action.play_selected_unit`, normal Unit destination policy, and `buildPaymentPlan` / `payCardCost`. |
| Reuse classification by clause | Cemetery Attendant and Morbid Return are exact reuse. Soulgorger and The Harrowing require a shared extension: `action.play_selected_unit` must support an opt-in Power-only payment mode, paired with a selector filter that exposes only Units whose Power can currently be paid. |
| Public contract impact | Existing pending-choice and placement intents are reused. However, the effect-driven placement handler must use the normal Unit placement policy rather than hardcoding Base or controlled battlefields; this can expose an additional legal destination for an accepted effect-driven play. |
| Regression risk | Spectral Matron’s existing “ignore its cost” play-from-Trash flow may gain a legal open-battlefield destination when the selected Unit has that permission. Morbid Return’s return-to-hand flow and normal Power source planning also require focused regression. |
| Smallest manual regression scope | Play Spectral Matron from Trash, select an eligible Unit, and confirm it is played without Energy or Power payment. Cast Morbid Return and return a Unit from Trash to hand. |

## Clause classification

| Card | Clause | Classification | Model |
|---|---|---|---|
| Cemetery Attendant | When played, return a Unit from Trash to hand | Exact reuse | `trigger.on_play`, `selector.card`, `action.return_to_hand` |
| Morbid Return | Return a Unit from Trash to hand | Exact reuse | `timing.action`, `selector.card`, `action.return_to_hand` |
| Soulgorger | When played, you may play a Unit from Trash, ignoring Energy | Shared extension | `trigger.on_play`, optional `selector.card`, `action.play_selected_unit` with `costMode: powerOnly` |
| The Harrowing | Play a Unit from Trash, ignoring Energy | Shared extension | `selector.card`, `action.play_selected_unit` with `costMode: powerOnly` |

## Behavior contract

- Source zone: only the controller's Trash. A legal target is a Unit owned by that controller; no Hand, Champion Zone, Base, or Battlefield card is eligible.
- Target timing: public-Trash selectors are locked targets, not resolution-time choices. A spell selects its target while being played; a triggered ability selects its target while it is placed on the Chain. Players receive Priority only after that target is recorded. If it leaves Trash, changes object identity, or otherwise becomes illegal before resolution, the instruction fails without offering a replacement target.
- Return effects: the selected Unit moves from Trash to its owner's hand. Cemetery Attendant is a mandatory on-play effect; Morbid Return follows its normal Action timing and must have a legal Unit target to be played.
- Effect-driven play: the selected Unit is played from Trash using the existing standard Unit placement policy: the controller chooses Base or a controlled battlefield.
- Costs: Spectral Matron retains its existing all-cost waiver. Soulgorger and The Harrowing waive only the selected Unit's Energy cost; its full base Power cost, including normal Power-domain legality and Power-producing sources, must be payable and is paid before the Unit leaves Trash.
- Choice: Soulgorger and Spectral Matron may select zero Units. The Harrowing, Morbid Return, and Cemetery Attendant must select one legal Unit. The Harrowing and Soulgorger expose only currently Power-payable Units; later changes to available Power can make the already locked nested play fail without changing its target.
- Events and continuation: a successfully played Unit records `card.played` with effective Energy cost zero and continues through the existing on-play trigger, Legion, and Chain flow. A returned Unit is not played and emits no play event.
- Projection and privacy: only the controller receives the Trash selection and destination decisions. The server filters out Units whose Power cost cannot be paid and revalidates payment before zone movement.

## Approved shared extension

The user approved the generic placement correction and Power-only cost mode on
2026-07-13. `action.play_selected_unit` now routes through the existing normal
Unit destination policy, preserving Spectral Matron's all-cost waiver by
default. Soulgorger and The Harrowing opt into `powerOnly`, which pays base
Power but not Energy.

The four canonical card models are published. Typecheck, focused primitive
coverage, the full test suite, lint, production build, and OGN inventory check
all pass.

The user manually passed the public-Trash target-locking flow in a new match on
2026-07-14. The prior Game 2 report was correctly identified as an immutable
snapshot created before the corrected canonical card models were published.

## Manual scenario to prepare

1. Play Soulgorger with two controller-owned Units in Trash: one whose Power cost can be paid and one whose Power cost cannot. Before players receive Priority, verify only the payable Unit is selectable and the selected target is shown on its Chain item.
2. Respond by removing that selected Unit from Trash. On resolution, verify Soulgorger does not offer another target and finishes without playing a Unit.
3. Cast The Harrowing with a payable Unit in Trash. Select and lock it during the spell's play process; after Priority passes, verify the normal Unit destination choice and Power-only nested payment.
4. Make the selected Unit or required Power unavailable before resolution. Verify the locked Unit remains in or returns to Trash, no alternate target is offered, and The Harrowing still finishes resolving.
5. Focused regressions: play Spectral Matron and Cemetery Attendant, and cast Morbid Return. In each case, select the Trash target before Priority; verify an invalid locked target is not replaced.

## Manual validation completed

`annie-harrowing` is persisted as the manual validation deck for Cemetery
Attendant, Soulgorger, and The Harrowing. The family passed its manual gate in
a new match on 2026-07-14.
