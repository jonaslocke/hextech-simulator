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
| T6 | Combat completion and trigger-chain preservation | KAI-19 |
| T7 | Match-event loading for polling projections | KAI-20 |
| T8 | Repeated-effect damage, death events, and Chain presentation | KAI-21, KAI-22, KAI-23 |
| T9 | Between-games independent submission concurrency | KAI-24 |

## Resolution ledger

| ID | Finding | Shared owner | Status | Focused regression gate | Manual retest required |
|---|---|---|---|---|---|
| KAI-01 | The Arena's Greatest fires at end of turn and affects both players when only one battlefield is in play. | T1 | Accepted | A Beginning-Phase event produces one point only for the event player and only when the Arena is active. | Validated by user. |
| KAI-02 | Void Seeker leaves Pass Focus enabled while a Deflect payment is incomplete. | T3 | Ready for retest | Target-selection mode blocks Pass Focus and Pass Turn until the player submits a payable selection or cancels. | In a Showdown, start Void Seeker targeting a Deflect unit while short 1 Power. Pass Focus must be unavailable; cancel or add Power, then choose the target. |
| KAI-03 | Daughter of the Void uses a non-canonical image printing. | T5 | Ready for retest | Catalog selection now prefers the regular metadata printing over alternate, overnumbered, and signature variants; Daughter resolves to `OGN-247/298`. | Start a new Kai'Sa match and inspect the Legend. It must show the regular `OGN-247/298` Kudos Productions art, not `OGN-299` showcase/signature art. |
| KAI-04 | Daughter of the Void Add-resource ability is not available. | T5 | Ready for retest | The shared board-action menu now includes the Legend zone; the existing immediate resource primitive handles Reaction Add without opening the Chain. | On your turn or while you have priority, click ready Daughter of the Void. Choose `Add spell Power [rainbow]`: it must exhaust the Legend, add 1 spell-only Rainbow Power immediately, and not create a Chain item. Spend it on a Spell; confirm it cannot pay a Unit. |
| KAI-05 | A unit preview does not disclose temporary keyword/text changes such as Cleave's Assault. | T5 | Ready for retest | Projection includes current temporary keywords/modifiers with their duration. | Cast Cleave on a Unit, then hover it until its preview opens. It must show `Assault 3` and `This turn`. |
| KAI-06 | Reaver's Row cannot be declined; closing its choice leaves the game stuck. | T2 | Accepted | Optional triggered selection accepts an empty selection and always resumes the chain. | Validated by user. |
| KAI-07 | After Reaver's Row resolves, Focus returns to the defender rather than the attacker. | T1 | Accepted | Trigger resolution restores showdown Focus according to the combat initiator/turn rules. | Validated by user. |
| KAI-08 | Accelerate action wording is unclear. | T5 | Ready for retest | Projected Accelerate label follows `Play accelerated <card> to <location>`. | Inspect an Accelerate card in hand with a legal destination. |
| KAI-09 | Watchful Sentry's Deathknell fails after combat death. | T1 | Accepted | Combat and non-combat death both dispatch one own-death trigger after the unit leaves play. | Validated by user. |
| KAI-10 | Reaver's Row triggers once per unit and produces duplicate React keys. | T1 | Accepted | One defend event at one battlefield creates one unique Reaver trigger. | Validated by user. |
| KAI-11 | Legion is active on the first card of a turn. | T1 | Accepted | Legion discount/effect requires a prior Main Deck card played by the same player that turn. | Validated by user. |
| KAI-12 | Battlefield preview does not suit battlefield-specific information and interactions. | T5 | Ready for retest | Battlefield details use a dedicated landscape dialog with the printed art, full rules text, and current controlled/contested status, reachable from both the battlefield info control and a Battlefield card in the Chain. | Click a battlefield's info control, then click a Battlefield card in the Chain. Both must open the dedicated landscape dialog instead of relying on the standard hover preview. Verify full text and current status are visible. |
| KAI-13 | Candlelit Sanctum does not let the player reorder un-recycled top cards. | T2 | Accepted | After zero/one recycle, the remaining looked-at cards accept and persist submitted top-to-bottom order. | Validated by user. |
| KAI-14 | Candlelit Sanctum rejects a legal recycle selection. | T2 | Accepted | Private top-deck selection validates against the current looked-at card identities, not stale/aggregated targets. | Validated by user. |
| KAI-15 | Falling Star/Icathian Rain target flow is unclear and Deflect does not add required Power. | T2 + T3 | Ready for retest | Repeated assignments preserve order and duplicates; Deflect Power is counted once per selected assignment before play. | Cast both spells, choose same/different targets, and include a Deflect unit while short on Power. |
| KAI-16 | Time Warp exists in both Trash and Banishment. | T4 | Ready for retest | A resolving spell goes to Trash only when no effect has moved it to another zone. | Resolve Time Warp and inspect Trash and Banishment after the extra turn is queued. |
| KAI-17 | Darius does not ready after the second Unit, though it works after a spell. | T1 | Accepted | Second-card trigger counts every Main Deck card type exactly once before trigger dispatch. | Validated by user. |
| KAI-18 | Dr. Mundo permits zero selections and does not require the maximum legal recycle count. | T2 | Accepted | Mandatory bounded selection is omitted only for zero legal cards and otherwise requires `min(3, available)`. | Validated by user. |
| KAI-19 | A combat conquer can clear battlefield and Unit conquer triggers before they enter the Chain. | T6 | Ready for retest | Combat completion clears its own state before it scores, preserving queued conquer triggers. | Conquer The Candlelit Sanctum with Kai'Sa, Survivor. An ordering choice must show both Candlelit Sanctum and Kai'Sa triggers; resolve Candlelit normally. |
| KAI-20 | Repeated match polling spends about 630 ms reading the event log. | T7 | Ready for retest | Event logs are cached per game and invalidated after an event append. | Restart once, then leave a match open without acting. After the first GET, repeat polling GETs should no longer consistently take about 600 ms; make one action and observe only the next GET may reload the log. |
| KAI-21 | Chain target descriptions become unreadable for repeated targets. | T8 | Accepted | Chain groups assignments by exact card instance and shows each target with a count badge. | Validated by user. |
| KAI-22 | One Watchful Sentry death produces multiple Deathknell triggers when it receives repeated damage. | T8 | Accepted | A Unit can leave play and emit `unit.died` only once; later assignments to its now-invalid target fizzle. | Validated by user. |
| KAI-23 | Chain source cards show mutable board-state badges such as damage and stun. | T8 | Accepted | Chain source previews show static card identity only, not current board damage/exhaust/stun state. | Validated by user. |
| KAI-24 | Simultaneous sideboard submissions reject one player with “Between-games state has changed.” | T9 | Ready for retest | A lost optimistic-concurrency write re-reads and merges against the same between-games ID once; a completed/replaced intermission remains rejected. | End Game 1, make any legal sideboard changes, then submit from both players as close together as possible. Neither player should receive the red changed-state error; Game 2 must be created exactly once with both submitted configurations. |

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

## T3/T4 implementation evidence

- Local target-selection mode now disables all pass/end-turn paths until the
  selection is submitted or cancelled. Deflect Power is counted per selected
  target assignment, including duplicate selections for repeated effects.
- Resolving spells now enter Trash only if their effects did not move them to
  another zone; Time Warp therefore remains only in Banishment after resolving.
- Focused tests cover repeated Deflect cost derivation and Time Warp's
  Banishment-only cleanup.

## T6/T7 implementation evidence

- Combat now releases the combat/showdown choice state before it awards a
  conquered battlefield. This prevents the cleanup from erasing the Chain or
  trigger-order choice created by that battlefield's conquer event.
- Match projections now cache immutable game-event logs between state changes.
  The live query plan already uses the `(gameId, sequence)` index and executes
  in under 1 ms at MongoDB; the observed ~630 ms was remote read latency paid
  for every polling request. The cache is invalidated after each appended log
  event, so a projection never serves an old log after an action.
- `tests/game-combat.test.ts` asserts that a combat conquer keeps its trigger
  on the Chain. `npm run typecheck` and `npm test` pass (204 tests, 5
  intentionally skipped).

## T5 implementation evidence

- Canonical deck construction now uses a shared printing-preference policy:
  regular printings beat alternate art, overnumbered, and signature variants.
  Daughter of the Void therefore resolves to `OGN-247/298`; the corrected
  canonical behavior is published and new deck snapshots select it even while
  older variant records remain available for provenance.
- Legend Add actions already use the shared
  `ability.exhaust_for_resource` primitive and resolve immediately. The
  missing piece was generic UI wiring: the Legend zone now forwards clicks to
  the same server-projected action menu used by other permanent cards.
- Projected cards now expose active temporary modifiers. The standard hover
  preview renders their readable label and duration; the focused test covers
  `Assault 3` for `This turn`.
- The battlefield info control and Battlefield entries in the Chain both open
  a dedicated landscape dialog containing card art and full rules text; the
  board entry also provides its current control/contest state.

## T8 implementation evidence

- `moveUnitToTrash` now ignores a Unit that already left Base or a battlefield,
  preventing later repeated assignments from emitting another death event.
- Chain target assignments are grouped by exact target instance with an `×N`
  badge, keeping repeated-effect targets readable without losing their count.
- Chain source previews now suppress mutable board-state badges. Icathian Rain
  follows its effective text: each of its six assignments deals 2; three hits
  on each of two legal targets deal 6 to each, while a target that dies earlier
  receives no later assignments.
- `tests/game-token-placement.test.ts` asserts one death event for a repeated
  lethal target, fizzling after that death, and 6 damage for each target chosen
  three times from six 2-damage assignments.

## T9 implementation evidence

- Sideboarding submissions are independent within one between-games session.
  If two submissions race on the same optimistic version, the losing request
  invalidates its local match cache and retries once against the committed
  intermission state. The intermission ID, player submission state, deck
  validation, and final compare-and-swap remain authoritative, so the retry
  cannot merge into a later game or create Game 2 twice.
