# OGN M2 Family: Conditions, Optional Decisions, Modes, and Turn Memory

Status: First 22-card subset manually validated; all 34 remainder cards are
published and ready for manual validation. They remain unaccepted until the
user validates them in-game.

## Scope contract

This is the authoritative **56-card** OGN portfolio for this task. Every card
is classified below under its exact reusable primitive. A card is published
only when its complete text is supported; no card received a name-specific
branch or a partial model.

## Card-by-card initial scope table

| Exact reusable primitive | Cards | Initial disposition |
|---|---|---|
| `condition.turn_event_count` + conditional static keyword grants | `OGN-019` Raging Soul | Published |
| Activated Legion effect with turn-scoped enter-ready permission | `OGN-021` Sun Disc | Published |
| Dynamic score-distance condition + source-play Energy reduction | `OGN-047` Find Your Center | Published |
| Optional resolution branch + Gear selection | `OGN-056` Adaptatron | Published |
| Typed `unit.stunned` event trigger | `OGN-059` Eclipse Herald | Published |
| Tagged-unit presence condition | `OGN-061` Poro Herder | Published |
| Source Buff-state continuous numeric modifier | `OGN-065` Wizened Elder | Published |
| Facedown-card state condition | `OGN-101` Mushroom Pouch | Published |
| Source Buff-state continuous keyword grant | `OGN-125` Bilgewater Bully | Published |
| Typed ready event + event-subject modifier | `OGN-143` Pirate's Haven | Published |
| Enemy-death history + source-play Energy reduction | `OGN-144` Spoils of War | Published |
| Resolution-time mode choice | `OGN-155` Qiyana, Victorious | Published |
| Per-turn choice memory for an activated ability | `OGN-157` Udyr, Wildman | Already published; included in validation |
| First source-move this-turn condition + optional selection | `OGN-162` Miss Fortune, Captain | Published |
| Hidden-origin play event metadata | `OGN-167` Ember Monk | Published |
| Typed discard event trigger | `OGN-202` Jinx, Rebel | Published |
| Source-location automatic friendly-unit group | `OGN-223` Peak Guardian | Published |
| Typed recycle event + deferred friendly-unit selection | `OGN-235` Karma, Channeler | Published |
| Low-hand state condition | `OGN-251` Loose Cannon | Published |
| Moved-event origin equals source location | `OGN-277` Back-Alley Bar | Published |
| Optional triggered channel | `OGN-288` Startipped Peak | Already published; included in validation |
| Source-location unit-count condition + immediate win | `OGN-293` The Grand Plaza | Published |
| Combat excess-damage history | `OGN-034` Tryndamere, Barbarian | Excluded: combat assignment must retain excess-damage totals for triggers. |
| Conditional entry-ready state | `OGN-035` Vayne, Hunter; `OGN-079` Leona, Zealot | Excluded: entry-state condition must be evaluated before the Unit is placed. |
| Continuous play and ready restriction | `OGN-070` Mageseeker Warden | Excluded: shared restriction/prevention legality hooks. |
| Cross-target numeric comparison and value copy | `OGN-108` Convergent Mutation | Excluded: selected-unit relative numeric comparison and copy-value modifier. |
| Public-Trash source trigger and modified re-play | `OGN-006` Flame Chompers; `OGN-037` Immortal Phoenix; `OGN-252` Super Mega Death Rocket! | Excluded: event sources outside the active board plus modified public-Trash play. |
| Death replacement | `OGN-023` Unlicensed Armory; `OGN-269` The Boss | Excluded: optional paid replacement of a pending death. |
| Resolution-time optional resource cost | `OGN-035` Vayne, Hunter; `OGN-072` Solari Shrine; `OGN-147` Wildclaw Shaman; `OGN-152` Mistfall; `OGN-282` Monastery of Hirana; `OGN-249` Relentless Storm | Excluded: generic optional payment during a resolving effect or trigger. |
| Spell-control and new-choice ownership | `OGN-080` Mystic Reversal | Excluded: control transfer for a pending Chain spell and target re-declaration. |
| Effect-driven play from Hidden or public Trash | `OGN-107` Ava Achiever; `OGN-112` Kai'Sa, Evolutionary; `OGN-194` Nocturne, Horrifying | Excluded: nested play from non-hand zone with source-specific cost and timing changes. |
| Optional declaration cost that changes the parent spell cost | `OGN-146` Wallop | Excluded: optional Buff payment during parent-spell declaration. |
| Repeating optional cost for each selected Unit | `OGN-153` Overt Operation | Excluded: per-recipient optional cost loop with independent results. |
| Special Unit destination permission | `OGN-161` Deadbloom Predator; `OGN-193` Miss Fortune, Buccaneer | Excluded: occupied-enemy and open-battlefield destination legality policy. |
| Battlefield-to-battlefield linked movement or swap | `OGN-067` Blitzcrank, Impassive; `OGN-177` Stealthy Pursuer; `OGN-199` Tideturner; `OGN-262` Zenith Blade | Excluded: generic battlefield movement, linked movement, and swap transaction. |
| Sequenced player decisions | `OGN-071` Party Favors; `OGN-187` Whirlwind | Excluded: ordered, independently optional decisions for each player. |
| Top-deck comparative play | `OGN-242` Baited Hook | Excluded: look-result numeric comparison, selected-card play, and mandatory recycling remainder. |
| Champion-zone return | `OGN-281` Hallowed Tomb | Excluded: Trash-to-Champion-Zone transfer with chosen-champion and empty-zone checks. |
| Next-play scoped cost modifier | `OGN-031` Raging Firebrand | Excluded: one-shot modifier consumed by the next matching card play. |
| Damage prevention condition | `OGN-189` Kayn, Unleashed | Excluded: prevention layer for conditional damage immunity. |
| First qualifying target-choice event | `OGN-292` The Dreaming Tree | Excluded: per-source, per-turn memory for spell target choices at a source location. |

The table contains exactly **56 distinct cards**. `OGN-035` appears in two
rows because it needs both listed missing primitives; it is counted once.

## Reusable contracts completed

1. Typed controller, opponent, and source state conditions, including score
   distance to the current victory requirement, hand size, facedown cards,
   card tags, Buff state, and battlefield presence.
2. This-turn event history for discarded, died, moved, readied, and recycled
   cards, reset at every turn boundary.
3. Typed event triggers, including event-subject and origin-location routing.
4. Accept/decline optional branches, resolution-time mode choices, and the
   existing activated per-turn mode-memory contract.
5. Conditional source-play Energy modifiers, event-subject numeric modifiers,
   automatic friendly-unit groups at the source location, and immediate
   win-game resolution.

## Remainder implementation batches

### Batch 1: state, legality, numeric copying, and prevention

| Contract | Ownership and reuse | Classification | Published cards |
|---|---|---|---|
| Combat excess-damage history | Combat assignment records excess before damage is applied and forwards the attacking side's total on the conquer event. | Shared extension | `OGN-034` |
| Conditional entry-ready | The card-play pipeline evaluates source entry replacement conditions before placement; the existing entry-ready modifier performs the state change. | Parameterized reuse | `OGN-079` |
| Continuous play/ready restrictions | Unit-destination projection/execution and ready-effect execution consult active battlefield restrictions. Natural Awakening is deliberately unaffected. | New reusable legality hooks | `OGN-070` |
| Cross-target value copy | A numeric-copy modifier snapshots the two selected Units' computed Might and records only the increase for the requested duration. | New primitive | `OGN-108` |
| Special Unit destinations | The shared destination policy supports open battlefields from an active friendly permission and occupied enemy battlefields from the played Unit's own permission. | Shared extension | `OGN-161`, `OGN-193` |
| Next-play cost modifier | The cost calculator applies the oldest matching one-shot Spell discount and consumes it only after a successful matching play. | New consumable permission | `OGN-031` |
| Conditional damage prevention | Every damage producer consults the target's conditional prevention before mutation and event emission. | New prevention hook | `OGN-189` |

These eight cards have synchronized supported canonical models. The user
manually validated `OGN-031`, `OGN-034`, `OGN-070`, `OGN-079`, `OGN-108`,
`OGN-161`, `OGN-189`, and `OGN-193` in-game on 2026-07-21. All eight have passed
their Batch 1 manual behavior-family gate without promoting their complete
gameplay identities to `accepted`. `OGN-035` also uses the entry-ready contract
but remains part of the Batch 2 optional-payment validation scope.

The follow-up deck is
`data/decks/experimental/ogn-m2-batch-1-movement-validation.dec.txt`. It uses the
Annie shell with accepted `OGN-132` First Mate for an actual unit Ready action
and Flash plus Maddened Marauder so Mageseeker Warden can move off a
battlefield.

### Batch 2: resolution payments, replacements, and zone-driven replay

| Contract | Ownership and reuse | Classification | Published cards |
|---|---|---|---|
| Public-zone trigger sources | Trigger discovery includes explicit public-Trash sources and only a matching Main Deck event subject for private top-deck look/reveal triggers. | Shared extension | `OGN-006`, `OGN-037`, `OGN-194`, `OGN-252` |
| Effect-driven play | A zone-authorized play validates the source zone and payment, records play history, applies Unit placement legality, puts Spells on the Chain, and honors post-resolution recycling. | New primitive | `OGN-006`, `OGN-037`, `OGN-107`, `OGN-112`, `OGN-194` |
| Optional resolution payments | Resolution frames support revalidated Energy, typed Power, Buff, and exhaust payments. Insufficient costs suppress the offer; decline and failed revalidation leave later gated effects untouched. | New decision/payment primitives | `OGN-035`, `OGN-072`, `OGN-107`, `OGN-147`, `OGN-152`, `OGN-249`, `OGN-282` |
| Kill attribution | Spell and combat damage emit a separate kill event after lethal cleanup with the responsible player and the victim's pre-death stunned state. | Shared event extension | `OGN-037`, `OGN-072` |
| Optional paid death replacement | Lethal cleanup pauses at a replacement decision, revalidates payment, processes heal/exhaust/recall atomically, and resumes queued simultaneous deaths. | New replacement primitive | `OGN-023`, `OGN-269` |
| Activated discard declaration cost | The ability declaration locks a hand selection, exhausts the source, and emits the normal discard event before the ability enters the Chain. | Shared activation extension | `OGN-023` |

The client stages independently presented selector groups against their own
minimum and maximum. A hand-payment selector and a board-target selector no
longer expose their combined count in the hand dialog; each selection is kept
in declaration order and the server-authoritative action is submitted only
after every selector group is satisfied. This repairs the manual-validation UI
boundary found while activating `OGN-023` without changing its canonical model
or the runtime payment contract.

Declaration-cost selections are now retained by selector binding when the cost
changes their zone before the activated ability resolves. Such paid selections
are not revalidated as effect targets. A death-replacement decision suspends its
parent resolution, then resumes later linked instructions after accept or
decline while retaining the locked target reference. Direct kill attribution is
emitted only when the Unit actually dies; accepting the replacement suppresses
the kill event, while declining it preserves the original spell or ability
controller and method for downstream kill triggers.

The fourteen distinct cards in this batch have synchronized supported canonical
models and are ready for manual validation: `OGN-006`, `OGN-023`, `OGN-035`,
`OGN-037`, `OGN-072`, `OGN-107`, `OGN-112`, `OGN-147`, `OGN-152`, `OGN-194`,
`OGN-249`, `OGN-252`, `OGN-269`, and `OGN-282`. Relentless Storm was originally
tracked through the `OGN-300` overnumbered printing before its canonical
identity was repaired to the standard `OGN-249` printing. Publication is not
manual gameplay acceptance.

The user manually validated the Batch 2 resolution-time optional-payment
behavior for `OGN-035` and `OGN-152` in-game on 2026-07-21. Both have passed
that behavior-family gate without promoting their complete gameplay identities
to `accepted`.

The user manually validated `OGN-282` Monastery of Hirana's resolution-time
optional-payment behavior in-game on 2026-07-22. It has passed that
behavior-family gate without promoting its complete gameplay identity to
`accepted`.

The importable cross-domain deck at
`data/decks/experimental/ogn-m2-batch-2-validation.dec.txt` covers the twelve
non-Legend targets using the matching Loose Cannon, Jinx, Rebel, and Super Mega
Death Rocket! identity. `OGN-249` Relentless Storm still requires a separate
Legend deck with an approved Volibear Chosen Champion; the local corpus has no
approved matching Champion model, so that validation remains blocked.

`OGN-269` The Boss is now covered by
`data/decks/experimental/ogn-m2-sett-buff-validation.dec.txt`. The support
publication adds `OGN-164` Sett, Brawler as its legal Sett-tag Chosen Champion
and `OGN-124` Arena Bar as a repeatable Buff source. Sett's play and conquer
Buff triggers, spend-Buff activated cost, and turn-scoped Might modifier are
exact reuse. Arena Bar reuses activated abilities, source exhaustion, and Buff,
with a shared `exhaustedOnly` unit-selector constraint. Both support cards have
supported canonical models and are ready for manual validation; publication is
not manual gameplay acceptance.

Manual validation on 2026-07-21 confirmed Sett's tested Buff/spend-Buff ability
and The Boss's optional paid death replacement. The user also manually
validated `OGN-124` Arena Bar's exhausted-friendly-Unit Buff behavior. That
validation exposed a shared Combat Cleanup ordering defect: the engine was
evaluating step 3d's attacker recall while a lethal defender was still awaiting
its optional death replacement. Combat Cleanup now persists completion of its
lethal substep and pauses before step 3d until the replacement decision is
finished. The resulting control and Conquer behavior remains ready for manual
validation.

### Batch 3: linked movement, sequenced decisions, and spell control

| Contract | Ownership and reuse | Classification | Published cards |
|---|---|---|---|
| Linked battlefield movement | The shared movement transaction resolves source-, event-, and selected-Unit destinations and emits both origin and destination battlefield identifiers. | Shared extension | `OGN-067`, `OGN-177`, `OGN-262` |
| Atomic battlefield swap | Both Units are removed before either is placed, so the exchange cannot observe a half-completed board and emits one move event per Unit. | New primitive | `OGN-199` |
| Sequenced player decisions | Resolution selectors and mode prompts identify their choosing player; in the two-player runtime the next player decides before the controller and each optional selection is independent. | Shared decision extension | `OGN-071`, `OGN-187` |
| Spell control and new choices | A Chain spell's controller changes before an optional target redeclaration; legal targets are recalculated for the new controller and locked target versions are replaced atomically. | New Chain primitives | `OGN-080` |

These seven cards have synchronized supported canonical models and are ready
for manual validation: `OGN-067`, `OGN-071`, `OGN-080`, `OGN-177`, `OGN-187`,
`OGN-199`, and `OGN-262`.

### Batch 4: declaration costs, comparative top-deck play, and turn memory

| Contract | Ownership and reuse | Classification | Published cards |
|---|---|---|---|
| Optional declaration cost | The existing locked optional-cost selector spends a selected friendly Buff before payment and makes the parent Spell ignore its base Energy and Power costs. | Exact and parameterized reuse | `OGN-146` |
| Repeating independent Buff costs | One resolution choice offers every currently Buffed, exhausted friendly Unit; only selected Units spend their own Buff and ready before the automatic Buff-all effect. | New repeatable-cost primitive | `OGN-153` |
| Comparative top-deck play | A resolution frame retains the killed Unit's current Might and the private looked-at group across choices. The eligible Unit is banished, played with normal placement while ignoring cost, and every still-decked remainder is recycled. | Shared resolution state plus new selection primitive | `OGN-242` |
| Champion Zone return | Trash selection filters by the instance's original Champion source and an empty destination; execution revalidates both facts and resets the returning card's object state. | New zone-transfer primitive | `OGN-281` |
| First spell target choice each turn | Spell target declaration and redeclaration emit public typed choice events. Trigger memory is keyed by battlefield source object and choosing player and resets at the turn boundary. | New event and turn-memory primitive | `OGN-292` |

These final five cards have synchronized supported canonical models and are
ready for manual validation: `OGN-146`, `OGN-153`, `OGN-242`, `OGN-281`, and
`OGN-292`. This completes publication of all 34 remainder cards without
claiming gameplay acceptance.

The user manually validated `OGN-153` Overt Operation's repeating independent
Buff costs and final Buff-all behavior in-game on 2026-07-21. It has passed
that behavior-family gate without promoting its complete gameplay identity to
`accepted`.

## Manually validated first subset

`OGN-019`, `OGN-021`, `OGN-047`, `OGN-056`, `OGN-059`, `OGN-061`, `OGN-065`,
`OGN-101`, `OGN-125`, `OGN-143`, `OGN-144`, `OGN-155`, `OGN-157`, `OGN-162`,
`OGN-167`, `OGN-202`, `OGN-223`, `OGN-235`, `OGN-251`, `OGN-277`, `OGN-288`,
and `OGN-293`.

The user completed manual in-game validation of all 22 cards after validating
the ordinary, discard-dependent, and Hidden-dependent scenarios. Automated
primitive tests remain technical safeguards and are not the acceptance evidence
for these cards.

## Remainder completion state

All 34 distinct cards formerly excluded by the scope table now have supported
canonical models. `OGN-035` satisfies both its conditional-entry and optional
payment contracts and still counts once. The remaining gate is the user's
manual in-game validation; implementation status must not be promoted to an
accepted family or complete gameplay identity before that gate.

## Manual validation handoff

| Primitive | Scenario | Cards covered |
|---|---|---|
| Turn history and conditional static effects | Discard a card, then inspect Raging Soul; kill an enemy then play Spoils of War; move Miss Fortune once and then a second time. | `019`, `144`, `162` |
| Source-play cost conditions | Put the opponent within three points of the live Victory Score, then play Find Your Center; separately destroy an enemy Unit then play Spoils of War. Confirm each cost is reduced by 2 only while true. | `047`, `144` |
| State conditions | Control a Poro for Poro Herder; Buff Wizened Elder and Bilgewater Bully; control a facedown card for Mushroom Pouch; begin with at most one card for Loose Cannon. | `061`, `065`, `101`, `125`, `251` |
| Optional branch and target lock | Conquer with Adaptatron, accept and kill a Gear, then repeat and decline. Confirm only acceptance kills the selected Gear and Buffs Adaptatron. | `056` |
| Typed event routing | Stun an enemy with Eclipse Herald out; ready a friendly Unit with Pirate's Haven out; discard with Jinx out; recycle with Karma out. | `059`, `143`, `202`, `235` |
| Resolution-time modes and memory | Conquer with Qiyana and choose each mode in separate attempts. Use each Udyr mode once, then verify it cannot be chosen again that turn. | `155`, `157` |
| Play-origin metadata | Play a card from Hidden while Ember Monk is on the board, then play an ordinary card. Only the Hidden-origin play gives +2 Might. | `167` |
| Automatic source-location group | Play Peak Guardian to a battlefield with other friendly Units and to Base. Confirm it Buffs only other friendlies at its battlefield. | `223` |
| Move-origin event | Move a Unit from Back-Alley Bar to Base and confirm that Unit gets +1 Might this turn; move from a different battlefield and confirm it does not. | `277` |
| Unit-count win condition | Hold The Grand Plaza with six Units, then with seven Units. Only the seven-Unit hold wins immediately. | `293` |
| Existing optional trigger | Hold Startipped Peak and test both accepting and declining the exhausted Rune channel. | `288` |
| Linked moves and invalid destinations | Play Blitzcrank to a battlefield and move an enemy from Base and from another battlefield; decline once, then hold and confirm Blitzcrank returns. Move a friendly away from Stealthy Pursuer and accept/decline following it. With Zenith Blade, stun an enemy at a battlefield, move a friendly there, and decline the move. | `067`, `177`, `262` |
| Atomic swap and event cleanup | Play Tideturner at Base and at a battlefield, swap with a friendly at another location, and decline. Confirm both locations exchange exactly once, no duplicate Unit remains, and same-location Units are not offered under the official erratum. | `199` |
| Opponent-first decisions | Resolve Party Favors with the opponent choosing Cards, then Runes; verify both players receive exactly the selected outcome. Resolve Whirlwind with opponent accept/controller decline, then opponent decline/controller accept, and verify each prompt belongs to the correct player. | `071`, `187` |
| Chain control and privacy | React to a targeted Spell with Mystic Reversal. Confirm control moves to the reactor, legal new targets are recalculated for that player, declining preserves the old choices, accepting replaces them, Priority resumes on the same Chain, and each viewer sees only normally public target information. | `080` |
| Declaration-time alternate cost | Play Wallop normally, then play it by selecting a Buffed friendly Unit. Confirm declining or having no Buff requires the printed cost; paying spends exactly one Buff, ignores the full parent cost, still requires a legal ready target, and leaves no pending cost choice after resolution. | `146` |
| Independent repeated costs | Resolve Overt Operation with multiple friendly Units covering Buffed/exhausted, Buffed/ready, unbuffed/exhausted, and unbuffed/ready states. Select some eligible Units, then none. Confirm only selected eligible Units spend Buffs and ready, after which every unbuffed friendly Unit receives one Buff. | `153` |
| Top-deck comparison and mandatory cleanup | Activate Baited Hook with exact payment and a friendly Unit of known current Might. Test eligible boundary `killed Might + 1`, an ineligible larger Unit, decline, fewer than five cards, and no eligible Unit. Confirm payment and sacrifice are locked, the chosen Unit is first banished then played to a legal chosen destination without cost, all remaining looked cards recycle, private identities stay hidden from the opponent, and no vision/destination choice remains. | `242` |
| Champion return legality | Hold Hallowed Tomb with the original Chosen Champion in Trash and an empty Champion Zone, then accept and decline. Repeat with the zone occupied and with a non-Chosen Champion-like Unit in Trash. Only the original Chosen Champion with an empty destination is offered and it returns reset. | `281` |
| First target-choice memory | At The Dreaming Tree, have each player target one of their own friendly Units there with a Spell. Confirm each player draws only on their first qualifying choice that turn; enemy, Base, and other-battlefield targets do not count. Retarget a controlled Spell with Mystic Reversal, verify the new chooser owns the event, then advance the turn and confirm memory resets. | `292` |
