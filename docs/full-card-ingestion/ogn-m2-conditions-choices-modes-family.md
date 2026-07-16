# OGN M2 Family: Conditions, Optional Decisions, Modes, and Turn Memory

Status: Implemented subset published; 22 cards ready for manual validation.

## Scope contract

This is the authoritative **56-card** OGN portfolio for this task. Every card
is classified below under its exact reusable primitive. A card is published
only when its complete text is supported; no card received a name-specific
branch or a partial model.

## Card-by-card scope table

| Exact reusable primitive | Cards | Disposition |
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
| Resolution-time optional resource cost | `OGN-035` Vayne, Hunter; `OGN-072` Solari Shrine; `OGN-147` Wildclaw Shaman; `OGN-152` Mistfall; `OGN-282` Monastery of Hirana; `OGN-300` Relentless Storm | Excluded: generic optional payment during a resolving effect or trigger. |
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

## Published cards awaiting manual validation

`OGN-019`, `OGN-021`, `OGN-047`, `OGN-056`, `OGN-059`, `OGN-061`, `OGN-065`,
`OGN-101`, `OGN-125`, `OGN-143`, `OGN-144`, `OGN-155`, `OGN-157`, `OGN-162`,
`OGN-167`, `OGN-202`, `OGN-223`, `OGN-235`, `OGN-251`, `OGN-277`, `OGN-288`,
and `OGN-293`.

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
