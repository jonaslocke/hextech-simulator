# Kai'Sa Manual-Test Resolution Ledger

Source: [`issues.md`](issues.md). This ledger preserves every reported finding,
groups them by the shared runtime subsystem, and controls their resolution. The
original report remains the evidence record; this file is the implementation
and verification record.

## Status rules

- `Reported` — manual finding captured; no diagnosis is asserted yet.
- `Investigating` — reproduce the smallest scenario and identify the shared
  engine boundary.
- `Implementing` — change is limited to the named shared subsystem, with a
  focused automated regression check.
- `Ready for retest` — automated check passes; the ledger gives the exact
  manual scenario to replay.
- `Accepted` — user confirms the retest.

No issue may move to `Accepted` from an automated check alone. A single fix may
close several rows only when every listed manual scenario has been replayed.

## Shared-cause groups

| Group | Shared subsystem | Findings controlled together |
|---|---|---|
| T1 | Turn lifecycle, trigger collection, and chain priority | KAI-01, KAI-07, KAI-09, KAI-10, KAI-11, KAI-17 |
| T2 | Target/choice flow and mandatory-choice enforcement | KAI-06, KAI-13, KAI-14, KAI-18 |
| T3 | Payment lock and Deflect cost derivation | KAI-02, KAI-15 |
| T4 | Zone movement and resolving-spell cleanup | KAI-16 |
| T5 | Catalog/media correctness and player-facing projection | KAI-03, KAI-04, KAI-05, KAI-08, KAI-12 |

## Resolution ledger

| ID | Finding | Shared owner | Status | Focused regression gate | Manual retest required |
|---|---|---|---|---|---|
| KAI-01 | The Arena's Greatest fires at end of turn and affects both players when only one battlefield is in play. | T1 | Accepted | A Beginning-Phase event produces one point only for the event player and only when the Arena is active. | Validated by user. |
| KAI-02 | Void Seeker leaves Pass Focus enabled while a Deflect payment is incomplete. | T3 | Investigating | Incomplete required payment has no enabled priority/pass action that can progress resolution. | Target a Deflect unit with Void Seeker while short 1 Power; verify only legal payment/cancel options. |
| KAI-03 | Daughter of the Void uses a non-canonical image printing. | T5 | Reported | Catalog media resolver selects the base canonical printing for the source card code. | Inspect Daughter of the Void in deck, legend zone, and preview. |
| KAI-04 | Daughter of the Void Add-resource ability is not available. | T5 | Reported | Legend action projection exposes the ready Add ability and applies spell-only Rainbow Power. | Exhaust the Legend; verify Add is available at legal timing and can pay a spell but not a Unit. |
| KAI-05 | A unit preview does not disclose temporary keyword/text changes such as Cleave's Assault. | T5 | Reported | Projection includes current temporary keywords/modifiers with duration/source. | Cast Cleave on a unit, inspect it, and verify Assault 3 and its this-turn duration are visible. |
| KAI-06 | Reaver's Row cannot be declined; closing its choice leaves the game stuck. | T2 | Accepted | Optional triggered selection accepts an empty selection and always resumes the chain. | Validated by user. |
| KAI-07 | After Reaver's Row resolves, Focus returns to the defender rather than the attacker. | T1 | Accepted | Trigger resolution restores showdown Focus according to the combat initiator/turn rules. | Validated by user. |
| KAI-08 | Accelerate action wording is unclear. | T5 | Reported | Projected Accelerate label follows `Play accelerated <card> to <location>`. | Inspect an Accelerate card in hand with a legal destination. |
| KAI-09 | Watchful Sentry's Deathknell fails after combat death. | T1 | Accepted | Combat and non-combat death both dispatch one own-death trigger after the unit leaves play. | Validated by user. |
| KAI-10 | Reaver's Row triggers once per unit and produces duplicate React keys. | T1 | Accepted | One defend event at one battlefield creates one unique Reaver trigger. | Validated by user. |
| KAI-11 | Legion is active on the first card of a turn. | T1 | Accepted | Legion discount/effect requires a prior Main Deck card played by the same player that turn. | Validated by user. |
| KAI-12 | Battlefield preview does not suit battlefield-specific information and interactions. | T5 | Reported | Battlefield preview design preserves readable ability text, controller/contest state, and non-unit layout. | Inspect every Kai'Sa battlefield in a match at normal viewport width. |
| KAI-13 | Candlelit Sanctum does not let the player reorder un-recycled top cards. | T2 | Accepted | After zero/one recycle, the remaining looked-at cards accept and persist submitted top-to-bottom order. | Validated by user. |
| KAI-14 | Candlelit Sanctum rejects a legal recycle selection. | T2 | Accepted | Private top-deck selection validates against the current looked-at card identities, not stale/aggregated targets. | Validated by user. |
| KAI-15 | Falling Star/Icathian Rain target flow is unclear and Deflect does not add required Power. | T2 + T3 | Investigating | Each repeat creates its own target decision; each Deflect target adds Power before that hit resolves. | Cast both spells, choose same/different targets, and include a Deflect unit while short on Power. |
| KAI-16 | Time Warp exists in both Trash and Banishment. | T4 | Reported | Resolving spell zone cleanup places the source in exactly one destination. | Resolve Time Warp and inspect Trash and Banishment after the extra turn is queued. |
| KAI-17 | Darius does not ready after the second Unit, though it works after a spell. | T1 | Accepted | Second-card trigger counts every Main Deck card type exactly once before trigger dispatch. | Validated by user. |
| KAI-18 | Dr. Mundo permits zero selections and does not require the maximum legal recycle count. | T2 | Accepted | Mandatory bounded selection is omitted only for zero legal cards and otherwise requires `min(3, available)`. | Validated by user. |

## Resolution order

1. T1 first: it controls incorrect trigger count/timing, Legion, Darius, and
   Deathknell, and may alter the other visible symptoms.
2. T2 next: it controls all optional/mandatory selection safety and Sanctum's
   private-card flow.
3. T3 and T4 next: payment lock and zone integrity are server-authoritative
   correctness issues.
4. T5 last: catalog-media and presentation improvements can then project the
   final authoritative state.

Each implementation update must change this ledger's status and add the exact
automated check and manual retest result before moving to the next group.

## T1 implementation evidence

- `turn.beginning` now carries an explicit first-Beginning flag, so The Arena's
  Greatest awards only the active player at the correct lifecycle point.
- A showdown remembers its pre-trigger Focus. A Reaver's Row trigger restores
  that Focus after it resolves instead of handing it to the trigger controller.
- Multiple `unit.defends` events at the same Reaver's Row deduplicate to one
  trigger item. Lethal combat cleanup now drains queued death events before
  the combat action returns.
- `tests/game-token-placement.test.ts` covers the six T1 rows: first Beginning,
  Reaver focus and duplicate triggers, combat Deathknell, Legion's first-card
  cost boundary, and Darius after a second Unit. `npm test` passes (196 tests,
  5 intentionally skipped) and `npm run typecheck` passes.

## T2 implementation evidence

- Declining Reaver's Row now submits its legal empty selection and continues
  the chain; the automated path verifies no movement and no stuck choice.
- Candlelit Sanctum stores the exact private two-card look. Recycle and reorder
  can only use that snapshot, so an unlooked third card cannot enter the
  reorder decision. The revised model is published to the Kai'Sa card batch.
- Dr. Mundo's trash selector requires `min(3, available)` whenever cards are
  available. The mandatory bound is part of the selector contract, not a UI
  convention.
- Focused tests cover decline, recycle-one, recycle-none plus reorder, and
  Mundo's zero-selection rejection. The behavior catalog and all Kai'Sa cards
  were synchronized after these contract changes.
