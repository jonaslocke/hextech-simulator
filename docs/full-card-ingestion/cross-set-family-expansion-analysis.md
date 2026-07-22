# Cross-Set Behavior-Family Expansion Analysis

Snapshot: 2026-07-22

This is an analysis and planning document. It does not publish card models,
change runtime behavior, change implementation ledgers, or add tests.

The review used the local rules authority in this order: `docs/riftbound_core_rules_reference.md`,
`docs/deck_validation.md`, `data/errata/official.json`, the four set files, and
`docs/game_definition.md`. Errata text is treated as the effective card text
for semantic classification. The runtime conclusions below were traced through
the current behavior catalog, `behavior-runtime.ts`, `triggers.ts`,
`effect-resolution.ts`, `primitive-handlers.ts`, `actions.ts`, `payment.ts`,
`keyword-evaluation.ts`, `unit-destinations.ts`, and the implementation-status
and family documents.

## 1. Executive summary

The four raw corpora contain 936 records. After excluding alternate-art,
overnumbered, signature, duplicate-printing, and one metadata-mislabeled
duplicate presentation, the review covers **780 unique gameplay identities**:

| Set | Raw records | Gameplay identities reviewed | Presentations excluded |
| --- | ---: | ---: | ---: |
| OGS | 24 | 24 | 0 |
| OGN | 352 | 298 | 54 |
| SFD | 280 | 233 | 47 |
| UNL | 280 | 225 | 55 |
| **Total** | **936** | **780** | **156** |

The identity pass uses normal, non-alternate, non-overnumbered printings as
representatives when available. It also treats `UNL-238` Baron Nashor
(Ultimate) as a duplicate of the identical `UNL-147` gameplay text. Conversely,
`SFD-247` Emperor of the Sands is retained as a distinct gameplay identity
from `SFD-197`: its same-name text adds a different static Weaponmaster clause.
That distinction is important because the current clean-name printing key would
otherwise collapse the two cards.

Current approval state is uneven: OGS has 24 canonical models, 6 complete-card
accepted entries, and 18 implemented entries; OGN has 157 canonical models, 67
complete-card accepted entries, 28 `manual_family_passed` entries, 25
`ready_for_manual_validation` entries, and 37 other implemented entries; SFD
has only the accepted `SFD-219` model; UNL has no canonical gameplay models.
Family-pass status is evidence for a reusable primitive gate, not complete-card
acceptance.

The review found **12 established behavior families** broad enough to compare
across sets. The following are planning classifications, not claims that the
cards are already approved or manually accepted:

| Classification | Unique cards | Meaning |
| --- | ---: | --- |
| Directly supported | 208 | Existing executable primitives and an honest existing family contract are sufficient; only canonical behavior data, bindings, and approval remain. |
| Existing primitive composition | 126 | Existing primitives can express the behavior, but a new clause ordering, selector combination, or binding composition is required. |
| Small generic extension | 84 | A reusable parameter or narrowly scoped engine contract is missing, such as a Gear selector, dynamic remembered value, or broader replacement scope. |
| New primitive or subsystem | 212 | The card crosses a material boundary such as Repeat, countering, copying, XP, control transfer, or private-zone replay. |
| Ambiguous or blocked | 150 | Local identity, errata, rules interpretation, source data, or a required semantic contract is not currently safe to resolve. |
| **Total** | **780** | One primary classification per gameplay identity. |

The most valuable near-term expansion is not a new set milestone. It is a
cross-set batch combining:

1. top-deck inspection with filtered draw, recycle, and effect-driven play;
2. public-Trash recovery and replay using the already passed OGN family; and
3. simple trigger-plus-effect families for move, hold, Beginning, play, and
   token/combat-role modifiers.

Together these are likely to unlock **334 cards without new primitives**
(direct support plus existing composition), with **84 more** likely after small
generic extensions. They should be implemented only after the identity blocker
around same-name variants and no-standard printings is resolved or explicitly
excluded from the publication batch.

## 2. Current family inventory

The family names below describe reusable behavior, not card-name groups.

| Family | Current representative cards | Existing primitives | Validated capabilities | Known limitations |
| --- | --- | --- | --- | --- |
| Targeted and area damage | `OGS-002`, `OGS-003`, `OGS-018`, `OGS-022`, `OGN-024`, `OGN-123` | `selector.unit`, `selector.enemy_unit`, `selector.friendly_unit`, `action.deal_damage`, `action.kill_unit`, `condition.effect_killed_target`, numeric modifiers | One or many units; friendly, enemy, or all units; battlefield and base areas; damage events and lethal cleanup | Does not imply split-damage allocation, damage equal to a selected value, prevention, or combat-only damage semantics. |
| Board state and combat-role modifiers | `OGS-005`, `OGS-007`, `OGN-004`, `OGN-057`, `OGN-074`, `OGN-279` | `modifier.grant_keyword`, `modifier.modify_numeric_value`, Assault, Shield, Tank, Deflect, Ganking | Temporary and static keyword grants; combat-role Might; source-location continuous grants; duration cleanup | Conditional grants such as “while Mighty,” tag-based grants, copied keywords, and generic equipment attachment semantics remain separate. |
| Play, move, conquer, hold, and Beginning triggers | `OGS-010`, `OGS-021`, `OGS-023`, OGN Garen/Viktor cards, `OGN-289` | `trigger.on_play`, `trigger.on_move`, `trigger.conquer`, `trigger.hold_battlefield`, `trigger.beginning`, `trigger.end_of_turn`, `action.draw_cards`, `action.move_unit`, `action.ready_cards` | Trigger routing through the Chain; source and event-subject relationships; simple effects; simultaneous trigger ordering | Choices that must be locked while creating a trigger, linked movement, combat-result memory, and source copies outside normal board zones need explicit contracts. |
| Public-Trash recovery and effect-driven play | `OGN-165`, `OGN-170`, `OGN-196`, `OGN-198`, `OGN-226` | `selector.card`, `action.return_to_hand`, `action.play_selected_unit`, `action.play_selected_card`, normal destination policy, Power payment | Public-Trash target locking before Priority; return to Hand; all-cost and Power-only Unit play; normal destination choices; resumable resolution | Hand/private-zone play, source-specific banishment, Spell replay, and replay after a conditional kill need separate review. |
| Opponent-Hand reveal and selection | `OGN-156`, `OGN-192` | `selector.card` with `revealZone`, opponent ownership, `action.discard_cards`, `action.recycle_cards`, pending effect selection | Opponent Hand reveal, controller-only private selection, discard or recycle of the revealed card | Does not cover the opponent choosing, playing, or retaining a private card; delayed return of a remembered card is separate. |
| Top-deck inspection and Vision | `OGN-183`, `OGN-171`, `OGN-235` | `keyword.vision`, `action.look`, `action.vision`, `action.take_to_hand`, `action.recycle_top_cards`, `action.select_looked_unit`, `action.order_top_cards` | Private look/reveal, optional top-card recycle, selected look-result routing, ordered remainder, viewer-safe projection | Filtered play from looked cards, replacement of draw with reveal, Predict 2 ordering, and multiple-player private decisions require composition or extension. |
| Optional play-cost declaration | `OGN-048` Meditation | `choice.optional`, `cost.exhaust_selected_unit`, `action.pay_optional_exhaust`, `action.draw_by_optional_cost` | Choice and cost are made during card play, before the parent item receives Priority; accepted paid and declined branches | This is not a generic resolution payment or a generic additional-cost framework for XP, kill, or dynamic cost reduction. |
| Resolution-time optional payment and modes | `OGN-035`, `OGN-152`, `OGN-282`, `OGN-157` | persisted effect frames, `choice.optional`, `choice.choose_mode`, resource/ Buff/exhaust payment handlers, `condition.turn_event_count`, `condition.state` | Accept/decline, pending resource payment, mode choice, per-turn memory, continuation after payment, cleanup | Payment source interaction, entry-state replacement, Repeat, XP, and choices that belong to another player require separate family boundaries. |
| Legion and conditional resource abilities | `OGN-021`, `OGN-217`, `OGN-253`, `OGN-254` | `keyword.legion`, `ability.exhaust_for_resource`, `modifier.enter_ready`, `modifier.legion_energy_discount`, `action.kill_on_next_damage` | Legion entitlement after another card; automatic payment eligibility; turn-scoped enter-ready and discounts; typed resource Add | General activated Add abilities are not automatically generalized; Legion must not be treated as ordinary Action timing. |
| Next-damage and death replacement | `OGS-020`, `OGN-023`, `OGN-254`, `OGN-269` | `action.kill_on_next_damage`, `replacement.recall_on_next_death`, `replacement.optional_recall_on_death`, replacement-aware lethal cleanup | Locked selected target; one-shot expiry; optional payment; heal/exhaust/recall; suppressed versus emitted death/kill events; resumable cleanup | Continuous “any unit here would die,” dynamic Might comparisons, combat-only replacements, and “kill this instead” require a broader replacement contract. |
| Token creation and temporary lifecycle | `OGS-015`, `OGN-106`, `OGN-211`, `OGN-218` | `action.play_token`, `keyword.temporary`, token catalog, token placement pending choice | Fixed and counted token creation; Base or source-controlled battlefield placement; ready/exhausted entry; Beginning cleanup | Copy tokens, token duplication, token-specific equipment/keyword grants, and tokens whose characteristics depend on a selected object are not generic token play. |
| Location, destination, and active-zone permissions | `OGN-070`, `OGN-161`, `OGN-193`, `OGN-277` | `modifier.play_unit_destination`, `modifier.unit_play_restriction`, `modifier.active_in_zone`, `modifier.cannot_ready`, `modifier.cannot_move_from_source_battlefield`, destination projection/execution | Self versus friendly-unit destination scope; active source zone; server-side legality and stale-action rejection | Linked swaps, occupied-enemy movement, battlefield replacement, and permissions that depend on a remembered origin or combat result are separate. |
| Turn/event memory and typed event routing | `OGN-019`, `OGN-059`, `OGN-143`, `OGN-202`, `OGN-235`, `OGN-277` | `trigger.event`, `condition.turn_event_count`, `condition.event_value`, `condition.event_subject_characteristic`, `condition.event_origin_source_location`, persisted turn history | Typed discard, recycle, ready, stun, move, and origin-location events; turn reset; source/event-subject attribution | Excess damage, “first qualifying choice,” copied values, event counts involving XP or combat wins, and cross-zone source discovery require new event fields or policy. |

Execution is server-authoritative. Card play and activated abilities collect
declaration selections before finalization; trigger finalization can create a
persisted choice before the item is placed on the Chain; effect resolution
creates persisted frames for deferred selectors, mode choices, binary choices,
resource payments, token placement, and death replacement. Viewer projections
are derived from legal server actions, so a candidate is not Directly Supported
merely because a primitive name exists in the catalog.

### Semantic signature used for grouping

Each candidate was compared using a behavior signature rather than a text
similarity score. The signature records the following dimensions:

| Signature dimension | Repository interpretation |
| --- | --- |
| Source | Card type, supertype, source object, and whether the source remains on the Board. |
| Ability and timing | Printed ability/action/reaction/trigger status, normal play timing, showdown/Chain timing, and whether a choice is a declaration cost. |
| Trigger and condition | Event kind, event subject, controller/owner relation, intervening condition, state predicate, turn history, and event-origin location. |
| Selector | Target type, zone, controller, location relation, count bounds, optionality, filters, and whether the selector is automatic or player-declared. |
| Cost | Base cost, additional cost, resolution-time payment, resource domain, Buff/XP/object costs, and whether payment changes the parent card's cost. |
| Effect sequence | Ordered versus simultaneous instructions, modes, captured values, repeated instructions, and continuation after a pending decision. |
| Zone and destination | Play, move, recall, kill, discard, recycle, banish, channel, reveal, Hand, Trash, Champion Zone, Main Deck, Banishment, Base, or Battlefield. |
| Duration and delayed work | This turn, this combat, until leaves play, source-location duration, next-event/next-death, Beginning, End-of-Turn, and later-turn effects. |
| Replacement and modifiers | Prevention, replacement, numeric modifier, keyword grant, cost modifier, destination permission, control restriction, and whether the effect changes a legal action. |
| Remembered data | Selected object identity, original location, source/event value, discarded/revealed card type, combat/excess-damage result, and per-turn choice memory. |
| Privacy and priority | Public, private, or secret information; which player may see it; and whether the choice must be locked while playing the card, while finalizing a trigger, or during resolution before opponents receive Priority. |

Two cards share a family only when every difference in this signature can be
represented by a validated parameter or by composition of existing ordered
primitives. A shared verb such as “return,” “draw,” or “play” is not sufficient.

## 3. Cross-set expansion matrix

The matrix intentionally lists representative card codes, not alternate
presentations. Classification is for the complete card identity, including all
clauses and effective errata text.

| Proposed family | Candidate card | Set/code | Classification | Existing reusable capability | Missing capability | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Move-triggered simple draw | Stellacorn Herder | SFD / `SFD-048` | A | `trigger.on_move` + `action.draw_cards` | None identified | High | Exact semantic reuse; movement event must retain normal attribution. |
| Printed Ganking keyword | Laurent Bladekeeper | SFD / `SFD-096` | A | `keyword.ganking` | None identified | High | Keyword-only behavior; no new movement family implied. |
| Hold-triggered channel | The Papertree | SFD / `SFD-219` | A | `trigger.hold_battlefield` + `action.channel_runes` with `eachPlayer` | None identified | Medium | Confirm each-player channeling and trigger ordering during hold cleanup. |
| Deathknell channel | Black Rose Dignitary | UNL / `UNL-152` | A | `trigger.on_death` + `action.channel_runes` | None identified | Medium | The Deathknell timing marker is represented by the existing own-death trigger path. |
| Hold-triggered draw with exhaust cost | Vex - Gloomist | UNL / `UNL-193` | B | Hold trigger, optional choice, source exhaust, draw | None at primitive level | Medium | Optional cost is part of triggered-ability finalization/resolution and needs a fresh binding. |
| Hold-triggered move to Base | Amateur Recital | UNL / `UNL-207` | B | Hold trigger, friendly-unit selector, `action.move_unit` | None at primitive level | High | Verify “a unit at a battlefield” is not narrowed to the source battlefield. |
| Beginning kill-or-draw | Dusk Rose Lab | UNL / `UNL-209` | B | Beginning trigger, friendly selector, kill, optional branch, draw | None at primitive level | Medium | The “before scoring” timing must remain a Beginning-phase trigger, not an end-turn effect. |
| Beginning area damage | Frozen Fortress | UNL / `UNL-212` | B | Beginning trigger, automatic location group, damage | Automatic group location binding | Medium | Requires all units here, not only friendly or enemy units. |
| Unit-play optional Buff | Valley of Idols | UNL / `UNL-218` | B | Typed `card.played` event, location relation, optional choice, Buff | Event-location binding review | Medium | The choice belongs to the player who played the Unit; source battlefield is the event location. |
| Play-triggered selected Buff | Rengar - Pridestalker | UNL / `UNL-183` | B | `trigger.on_play`, unit selector, Buff, this-turn modifier | None at primitive level | High | “A unit” is not automatically the source; keep the selection explicit. |
| Activated stun with source costs | Shadow | UNL / `UNL-194` | B | Activated ability, payment, enemy selector, stun | Attacking-here legality binding | Medium | The target must be an attacking enemy Unit at this location. |
| Move-triggered top-card branch | Apprentice Smith | SFD / `SFD-041` | B | On-move trigger, look/reveal, type condition, draw/recycle | None at primitive level | High | Public trigger source with private top-card projection. |
| Top-four Gear selection | Ornn, Blacksmith | SFD / `SFD-058` | B | `action.look`, filtered selection, take to Hand, recycle remainder | Gear filter binding | High | Same top-deck contract as existing look/recycle; target type is Gear. |
| Static Vision grant to Mechs | Forecaster | SFD / `SFD-065` | B | Static keyword grant, source location/board scope, Vision | Tag-filtered recipient group | Medium | Generalize by tag only if the recipient scope is represented as a reusable selector. |
| Attack top-two selected play | Rek'Sai, Swarm Queen | SFD / `SFD-170` | B | Look/reveal, optional banish, selected card play, post-effect recycle | Unit-to-source-battlefield destination binding | Medium | Uses local errata; this is not the older “play then recycle rest” text. |
| Conquer top-two selected play | Void Burrower | SFD / `SFD-187` | B | Conquer trigger, look/reveal, optional banish, selected play, recycle | Destination and play-origin binding | Medium | Same errata-driven top-deck/replay contract as `SFD-170`. |
| Top-two cost-reduced play | Void Rush | SFD / `SFD-188` | B | Top-deck look, optional banish, selected card play, numeric cost modifier, draw remainder | Card-type-independent selected play review | Medium | The unplayed card is drawn, not recycled; preserve that destination. |
| Defense top-card type branch | Ravenbloom Conservatory | SFD / `SFD-215` | B | Defend-at-source trigger, reveal, type condition, draw/recycle | None identified | High | Must not become a generic Vision keyword trigger. |
| Top-three Unit draw and conditional Buff | Ivern - Nurturer | UNL / `UNL-051` | B | On-play/hold trigger, look, filtered draw, recycle remainder, conditional Buff | Tag predicate on revealed card | Medium | The revealed tag is a remembered resolution value, not a live board selector. |
| Deathknell Predict 2 | Dramatic Visionary | UNL / `UNL-062` | B | Death trigger, top-two look, recycle selected cards, order remainder | Predict/order binding | High | Private choices occur during resolution and must be viewer-safe. |
| Filtered top-four Spell draw | Fate Weaver | UNL / `UNL-064` | B | Look, filtered card selection, draw, recycle remainder | Printed Energy threshold filter | High | Uses printed cost, not an altered cost. |
| Vision plus conditional play cost | Jhin - Meticulous Killer | UNL / `UNL-089` | B | Vision plus turn-event cost condition and alternative payment | Reaction/alternate play declaration path | Medium | The conditional “play me for Power” is a play-cost model, not a normal resolution payment. |
| Resolution Predict and reveal | Diana - Lunari | UNL / `UNL-079` | C | Optional resource payment, Predict/look, reveal, conditional draw | Reveal-result branch after payment | Medium | The payment, private top-card choice, and conditional draw must resume one effect frame. |
| Vision plus activated self-cost | Divining Shells | UNL / `UNL-161` | B | Vision, action timing, self-kill/exhaust cost, Buff target | None identified | High | Keep the Vision clause separate from the activated clause. |
| Deathknell conditional draw | LeBlanc - Fragmented | UNL / `UNL-172` | C | Death trigger, draw, Beginning-phase condition | Trigger-time phase condition | Medium | “If it’s your Beginning Phase” is evaluated when the Deathknell resolves. |
| Static Mech Shield grant | Mechanized Menace | SFD / `SFD-181` | C | Static keyword grant and combat evaluation | Tag-based continuous recipient filter | Medium | Generalizable to tagged groups, but must not broaden to all friendly units. |
| Trash Gear recovery | Aspiring Engineer | SFD / `SFD-061` | C | On-play trigger, public-zone card selector, return to Hand | `selector.card` Gear type | High | A useful generic selector extension; do not model Gear as `nonUnit` if later effects need exact type. |
| Trash Unit-or-Gear recovery | Guardian of the Passage | SFD / `SFD-035` | C | Hold trigger, public Trash selection, return to Hand | Union card-type selector | Medium | “Unit or Gear” must not accidentally include Spells. |
| Trash Spell replay | Fizz, Trickster | SFD / `SFD-140` | B | Trash selector, `action.play_selected_card`, Power-only payment, post-resolution recycle | Spell Chain/recycle regression review | Medium | Existing selected-card play is broader than the passed Unit family but needs a focused contract review. |
| Deathknell Trash Unit replay | Glasc Mixologist | SFD / `SFD-165` | B | Death trigger, filtered Trash selector, all-cost selected Unit play | Deathknell effect-driven destination review | Medium | Public Trash target and cost ceiling are explicit. |
| Legion self-play from Trash | Undying Legion | UNL / `UNL-025` | C | Legion, self-reference, selected-card play, typed payment | Self-source Trash play and timing permission | Medium | The card is played from Trash for a cost; it is not a normal on-play trigger. |
| Additional kill cost plus Trash replay | Heedless Resurrection | UNL / `UNL-142` | C | Additional-cost selection, kill, Trash Unit play | Remember killed Unit's Energy/Power ceilings | Medium | The selected killed object supplies values for a later selector; those values must be locked. |
| Tagged Trash recovery | Starhound | UNL / `UNL-167` | C | On-play public Trash return-to-Hand | Tag-filtered selector | High | Generic tag filtering is reusable if kept separate from name-specific Bird/Cat/Dog/Poro logic. |
| Conditional-cost Trash play | Undying Loyalty | UNL / `UNL-168` | C | Choice, conditional Energy discount, filtered Trash play, all-cost waiver | “Choose a tag” cost condition and tag identity | Medium | The named tag choice changes legality/cost; it is not an optional target. |
| One-shot death replacement with healing | Tactical Retreat | UNL / `UNL-175` | C | Selected target, `replacement.recall_on_next_death`, duration | Heal-on-replacement parameter | High | Closest reuse to `OGS-020`; regression must prove the heal is not omitted. |
| Move-triggered top-deck plus Deathknell Hand play | Rift Herald | UNL / `UNL-179` | C | Move trigger, top-deck look/draw/recycle, Deathknell, selected Hand Unit play | Private Hand play and two-clause continuation | Medium | Do not collapse the move clause and Deathknell clause into one family. |
| Conditional self-replay after kill | Death from Below | UNL / `UNL-186` | C | Kill, effect outcome, conditional `source:self` play from Trash | Self-replay payment and spell post-resolution identity | Medium | The replay is conditional on the target's resolved Might, not a generic Trash-play target. |
| Combat death replacement at a Battlefield | Altar of Blood | UNL / `UNL-206` | C | Replacement payment, heal/exhaust/recall, death suppression | Unselected any-unit-at-source-Battlefield scope and combat duration | High | Reusable replacement extension, but materially broader than selected one-shot protection. |
| Returned-card optional channel | Ripper's Bay | UNL / `UNL-214` | C | `card.returnedToHand` event, optional payment, channel | Player attribution for the returned card's owner | Medium | Controller and owner may differ; preserve the rules distinction. |
| Dynamic Might death replacement | Soraka, Wanderer | SFD / `SFD-173` | C | Combat-role modifier and replacement cleanup | Compare dying Unit Might with source Might | Medium | Not equivalent to `OGS-020`: it is continuous, source-location scoped, and conditional. |
| Repeat cost and repeated resolution | Blood Rush | SFD / `SFD-003` | E | Existing Action, Buff, and payment primitives | Repeat keyword, per-repeat cost and continuation | High | `keyword.repeat` is not in runtime coverage. |
| Repeat modal damage/kill | Rocket Barrage | SFD / `SFD-077` | E | Mode choice, damage, kill Gear | Repeat with independent choices | High | Repeating an effect is not the same as two ordered clauses. |
| Equipped-unit damage and detach | Strike Down | SFD / `SFD-107` | E | Unit selector, dynamic Might operand, damage | Equipment attachment/detachment state and atomic detach | High | Existing damage primitive does not prove equipment semantics. |
| Repeat top-deck draw/recycle | Called Shot | SFD / `SFD-122` | E | Look, draw, recycle | Repeat continuation with private selections | High | Requires per-repeat independent top-deck choices. |
| Repeat top-deck Unit draw | Double Trouble | UNL / `UNL-032` | E | Look, filtered draw, recycle | Repeat keyword and repeated private choice lifecycle | High | Cross-set cluster with SFD Repeat cards. |
| Discarded-card typed modal sequence | Hwei - Brooding Painter | UNL / `UNL-080` | E | Draw, discard, ready, Buff | Remember discarded card type and branch-specific resolution | High | A textual mode is not the same as a player-selected mode. |
| Counter spell and return-to-Hand replacement | Abandon | UNL / `UNL-131` | E | Reaction timing and Predict | Countering a Chain item plus destination replacement | High | Must suppress normal spell resolution and Trash movement. |
| Opponent private card play | Bone Skewer | UNL / `UNL-139` | E | Hand reveal projection, Battlefield selection, selected play, stun | Opponent-owned private choice and all-cost play | High | This is not the passed opponent-Hand discard family. |
| Delayed private return | Ashe - Focused | UNL / `UNL-169` | E | Opponent reveal/select and hold trigger | Remember selected private card across zone changes and later hold | High | Requires persistent object identity and delayed ownership-safe return. |
| Spell banish/recycle threshold | Jhin - Virtuoso | UNL / `UNL-181` | E | On-play trigger, banish, channel, draw | Four-card remembered banishment set and per-spell threshold | Medium | Banishment identity must remain associated with the Legend. |
| Counter spell plus prohibition | Lilting Lullaby | UNL / `UNL-190` | E | Reaction timing | Counter subsystem and temporary “cannot play spells” permission | High | The prohibition is a player action restriction, not a numeric modifier. |
| Copy token | Mirror Image | UNL / `UNL-200` | E | Token play and Temporary cleanup | Copying a Unit's identity, text, stats, and restrictions | High | Must not be represented by a fixed token card code. |
| Sequential linked movement | Void Assault | UNL / `UNL-202` | E | Two move effects | Atomic sequential movement and attacker determination | High | The second move depends on the first and the final battlefield controllers. |

## 4. Recommended family boundary changes

### A. Broaden “top-deck inspection” to “look, classify, route, and resolve a preserved private group”

Current boundary: `OGN-183` and Vision-like effects look at a fixed number of
top cards, optionally select or recycle them, and preserve the remaining order.

Proposed boundary: the family should cover a private looked-at group whose
cards can be classified, optionally selected, routed to Hand/Banishment/Trash,
played with a declared cost treatment, or returned in order.

The shared contract is: look/reveal is private to the controller; selection is
made during the resolution frame; the selected card identity is locked; the
remainder follows an explicit destination and ordering rule; printed costs are
used for filters unless the card explicitly refers to effective cost.

Parameters should represent count, card type, printed-cost bounds, optionality,
selection destination, selected-card play cost mode, remainder destination,
and whether the selected card is played at a fixed or chosen destination.
Composition should represent Vision, look, filtered select, draw, recycle,
banish, and play as separate ordered effects.

Do not absorb Repeat, private opponent-deck choices, card copying, or a value
captured from a killed object into this family. Regression cards are
`OGN-183`, `OGN-242`, `OGN-062`, `SFD-170`, `SFD-187`, and `SFD-188`.

### B. Broaden “public-Trash Unit recovery/play” to “zone-authorized effect-driven card play”

Current boundary: controller-owned public-Trash Unit selection, return to Hand,
or Unit play with all costs ignored or only Energy ignored.

Proposed boundary: an effect-authorized card selected from a specified zone can
be returned, played, or replayed with an explicit cost mode, post-resolution
destination, and destination policy. `SFD-140` adds Spell replay; `SFD-061`,
`SFD-035`, and `UNL-167` add Gear or tag-filtered recovery; `UNL-179` adds
private Hand Unit play.

Parameters should represent source zone, owner, card type, printed cost bounds,
payment mode, selection timing, destination policy, post-resolution movement,
and whether the selection is public or private. Existing `selector.card`,
`action.play_selected_unit`, `action.play_selected_card`, payment, and pending
resolution should remain the owners.

Keep separate: self-replay after a resolved kill (`UNL-186`), stored-card replay
after a banishment effect (`UNL-148`), opponent-selected private play
(`UNL-139`), and play from Hidden. Regression cards are `OGN-165`, `OGN-170`,
`OGN-196`, `OGN-198`, and `OGN-226`.

### C. Broaden “simple location/event trigger” to a typed trigger-plus-effect family

Current boundary: individual on-play, on-move, hold, conquer, Beginning, and
typed-event clauses are implemented as separate bindings.

Proposed boundary: a trigger clause is reusable when its event subject,
controller relation, source location, duration, and selection timing are
explicit. This supports `SFD-048`, `SFD-219`, `UNL-193`, `UNL-207`, `UNL-209`,
`UNL-212`, `UNL-214`, and `UNL-218` without naming cards.

Parameters should capture event type, subject, source-location relation,
affected-player relation, optionality, and whether target selection occurs at
trigger creation or resolution. Ordered effects remain separate so a trigger
can draw, move, kill, channel, Buff, or create a token without a family-specific
branch.

Do not merge event triggers with printed instructions, combat-result triggers,
first-time memory, or delayed source-independent effects. Regression cards are
`OGN-202`, `OGN-235`, `OGN-277`, `OGN-288`, and accepted Garen hold/conquer cards.

### D. Extend death replacement by scope, not by card name

Current boundary: a selected one-shot Unit is recalled instead of dying, with
optional payment, source exhaustion, Buff spending, and resumable cleanup.

Proposed boundary: the replacement contract can accept a target scope
(`selectedUnit`, `friendlyBuffedUnit`, `unitAtSourceBattlefield`, or
`anyUnitAtSourceBattlefield`), duration (`thisTurn` or `thisCombat`), payment,
heal, exhaust, and recall effects.

This could cover `UNL-175` and `UNL-206`, and later `SFD-173` after the dynamic
Might comparison is separately represented. The comparison must remain a
condition, not an implicit replacement exception.

Regression cards are `OGS-020`, `OGN-023`, and `OGN-269`. Do not absorb “kill
this instead” (`OGN-077`), damage prevention (`OGN-189`), or a replacement of
the spell's destination (`UNL-131`) without distinct replacement kinds.

### E. Keep Repeat as a separate subsystem boundary

Repeat appears in multiple SFD and UNL cards, but it is not a parameter of an
ordinary ordered clause. It creates a new resolution opportunity, may require a
new payment, may allow independent choices, and must preserve selected values
and per-repeat limits. `SFD-003`, `SFD-077`, `SFD-122`, and `UNL-032` should
share a future Repeat subsystem, not be added to the top-deck or damage family
through special flags.

## 5. False-positive exclusions

The following exclusions were deliberate semantic decisions rather than text
matching failures.

| Appears similar to | Excluded card(s) | Why it is different |
| --- | --- | --- |
| Public-Trash replay | `UNL-139` Bone Skewer | The opponent chooses from a private revealed Hand and plays the selected Unit. The player making the choice, privacy, owner, destination, and all-cost permission differ from `OGN-156`/`OGN-192`. |
| Public-Trash replay | `UNL-179` Rift Herald | The Move trigger and Deathknell clause are separate events with different selection times and zones; the Hand play is private and Power-paying. |
| Top-deck inspection | `SFD-170`, `SFD-187`, `SFD-188` | The errata text bansishes a selected card before play and sends the remainder to different destinations. They are not simple draw/recycle effects. |
| Ordinary move | `UNL-202` Void Assault | Two moves are sequential and the final destinations determine attacker status. A generic move composition cannot infer that relation safely. |
| Ordinary move | `OGN-199` Tideturner | It remembers the source's original location and swaps two Units. The target is locked at trigger finalization before Priority. |
| One-shot death replacement | `UNL-206` Altar of Blood, `SFD-173` Soraka | These are continuous combat/location replacements affecting an unselected class of Units, with dynamic conditions and different payment/ownership scopes. |
| One-shot death replacement | `OGN-077` Zhonya's Hourglass | The source is killed instead of the protected Unit's death; this is not a direct recall replacement. |
| Next-damage kill | `UNL-190` Lilting Lullaby | “Counter a spell” suppresses Chain resolution and changes its destination; it is not a damage or kill marker. |
| Opponent-Hand selection | `UNL-169` Ashe - Focused | The selected private card is remembered and returned on a later Hold event, even if the source leaves play. |
| Top-deck family | `UNL-080` Hwei - Brooding Painter | The discarded card's type selects a branch during resolution. It is a captured value, not a player-selected mode. |
| Token play | `UNL-199` LeBlanc - Deceiver and `UNL-200` Mirror Image | Reflection must copy a Unit's gameplay identity and then receive Temporary; a fixed token definition is insufficient. |
| Static Buff/keyword grant | `SFD-181` Mechanized Menace and `UNL-208` Black Flame Altar | Tag or status filtered recipients must remain explicit. “Your Mechs” and “Temporary Units here” are not all-friendly-unit scopes. |
| Simple conquer trigger | `OGN-034` Tryndamere and `UNL-217` Trapping Grounds | Excess-damage totals must be preserved from combat assignment; a normal conquer event does not contain that value. |
| Simple play-cost discount | `UNL-168` Undying Loyalty and `UNL-089` Jhin - Meticulous Killer | A choice or earlier event changes the alternative play cost. It is not a generic numeric modifier on the current source card. |
| Printed same-name printing | `SFD-197` and `SFD-247` Emperor of the Sands | The overnumbered text is materially different, not an alternate presentation. The current clean-name grouping would be unsafe. |

## 6. Prioritized implementation waves

Coverage gains below are planning estimates against the 780-identity corpus;
they are not approval counts.

### Wave 1 — Existing behavior only

Scope: exact or near-exact bindings with no new selector, event, payment, or
resolution contract.

Included cards: `SFD-048`, `SFD-096`, `SFD-219`, `UNL-152`.

Expected gain: 4 cards.

Dependencies: canonical representatives, effective errata text, complete
behavior clauses, and approval workflow.

Regression surface: accepted OGS Garen cards, `OGN-202` typed discard routing,
`OGN-235` recycle event attribution, and existing Beginning/hold cleanup.

Validation scenario: one synthetic match with a moving Unit, a held Battlefield,
a Deathknell Unit, and a two-player channel effect. Verify player ownership,
turn timing, and no duplicate triggers.

Exit criteria: all four models compile; projected actions and pending choices
are correct; manual in-game validation passes; no accepted card changes.

### Wave 2 — Existing primitive composition

Scope: combinations of existing triggers, selectors, top-deck actions, numeric
modifiers, token play, and destination effects.

Included cards: `SFD-041`, `SFD-058`, `SFD-065`, `SFD-140`, `SFD-165`,
`SFD-170`, `SFD-187`, `SFD-188`, `SFD-215`, `UNL-051`, `UNL-062`, `UNL-064`,
`UNL-161`, `UNL-183`, `UNL-193`, `UNL-194`, `UNL-207`, `UNL-209`, `UNL-212`,
`UNL-218`, and `UNL-211`.

Expected gain: 21 cards.

Dependencies: Wave 1 trigger routing; top-deck private projection; selected-card
play cost modes; token catalog; existing destination policy.

Regression surface: `OGN-183` Stacked Deck, `OGN-165` Cemetery Attendant,
`OGN-196` Soulgorger, `OGN-198` The Harrowing, `OGN-226` Spectral Matron,
`OGN-070` restriction scope, and `OGN-193` destination permission.

Validation scenario: top-card and top-two/top-four cases with eligible and
ineligible cards; a selected card leaving its zone before resolution; no legal
target; optional decline; source moving away; and a source-controlled versus
open Battlefield destination.

Exit criteria: all selected/remainder destinations are explicit, private cards
are exposed only to their owner, stale targets do not retarget, and the accepted
OGN top-deck and Trash families pass focused manual regression.

### Wave 3 — Small reusable extensions

Scope: generic selector, remembered-value, replacement-scope, and alternative
payment improvements.

Included cards: `SFD-035`, `SFD-061`, `SFD-173`, `UNL-025`, `UNL-079`,
`UNL-142`, `UNL-167`, `UNL-168`, `UNL-172`, `UNL-175`, `UNL-179`, `UNL-186`,
`UNL-206`, and `UNL-214`.

Expected gain: 14 cards in the first extension slice; the wider 84-card
classification includes related future variants not yet safe to bind.

Dependencies: Wave 2 zone-play and event contracts; explicit Gear/tag selector
parameters; remembered values; replacement target scopes; owner/controller
distinction; resolution-time payment continuation.

Regression surface: all OGN death-replacement cards, public-Trash family cards,
opponent-Hand privacy, and payment source projections.

Validation scenario: Gear versus Unit versus Spell selector pairs; a selected
object changing zones; a killed object supplying a remembered value; payment
accepted/declined/insufficient; source leaving play; and combat-only versus
turn-long replacement duration.

Exit criteria: each extension has at least two distinct candidate cards or a
documented future contract, server legality and projection agree, and no
existing primitive is broadened by an unscoped default.

### Wave 4 — New engine capabilities

Scope: Repeat, countering, copying, private opponent play, XP, control transfer,
equipment lifecycle, and combat-result memory.

Included cards: `SFD-003`, `SFD-077`, `SFD-107`, `SFD-122`, `UNL-032`,
`UNL-080`, `UNL-131`, `UNL-135`, `UNL-139`, `UNL-169`, `UNL-181`, `UNL-190`,
`UNL-199`, `UNL-200`, and `UNL-202`.

Expected gain: 15 named cards, with a much larger later portfolio.

Dependencies: new public contracts and focused primitive tests where the
contract is durable; effect continuation/Chain suppression; private choice
projection; copy identity; XP state; equipment attachment state; sequential
movement transaction; and combat event extensions.

Regression surface: broad. This wave must not be mixed into a family-only
milestone or used to justify approval of earlier waves.

Validation scenario: repeat accept/decline and independent targets; countered
versus resolved Chain item; private choice seen by the correct player only;
remembered card after source leaves; copied Unit identity; and sequential move
with both final destination variants.

Exit criteria: the missing subsystem contract is documented and tested in
synthetic isolation, manual card validation passes, and all prior family
regressions remain green. No Wave 4 card should be implemented as a card-name
branch.

## 7. Validation strategy

Manual in-game validation remains the authoritative acceptance gate. Automated
tests are recommended only for durable primitive, schema, selector, event, or
confirmed-regression contracts; broad browser or `GameBoard` tests are not
recommended.

| Family | Compact manual matrix |
| --- | --- |
| Damage and numeric modifiers | Base versus Battlefield; friendly versus enemy; one versus multiple targets; minimum Might; damage that kills versus does not; source Bonus Damage active/inactive; Chain resolution; replacement present/absent. |
| Move/hold/conquer/Beginning triggers | Source at Base versus Battlefield; source leaves before event; event at source versus another location; one trigger versus simultaneous triggers; hold/conquer before and after control changes; turn cleanup. |
| Top-deck/Vision | One, two, three, four, and five cards; eligible versus ineligible type/cost; take, recycle, banish, draw, and ordered remainder; no eligible card; private owner projection; target leaves before resolution; repeated trigger attempts. |
| Public-Trash recovery/play | Unit versus Gear versus Spell; one versus no eligible cards; target locked before Priority; target leaves Trash; Power sufficient/insufficient; normal Base/controlled Battlefield/open Battlefield; source leaves play; post-resolution recycle. |
| Opponent-Hand selection | Reveal one opponent Hand; choose a legal versus excluded type; controller sees cards and opponent does not gain hidden details; decline where allowed; selected card changes zone; opponent and owner differ; stale submission rejection. |
| Optional declaration cost | Pay versus decline; insufficient cost; selected cost object becomes illegal; cost moves zones; parent Chain item still resolves; optional target versus optional effect distinction. |
| Resolution payment/modes | Initially payable versus initially insufficient; Add ability from Rune, permanent, Battlefield, and Legend; accept/decline; typed Power; exact payment consumption; new player receives the decision; cleanup after cancellation. |
| Legion and entry modifiers | Before versus after another card is played; automatic payment allowed/forbidden; source exhausted; next matching play; nonmatching play; turn expiration; entry ready versus normal exhausted entry. |
| Death replacement | Base versus Battlefield; friendly versus enemy; selected versus automatic scope; one target versus simultaneous deaths; accept/decline; insufficient payment; source leaves play; replacement suppresses death event; unreplaced death emits exactly once; combat-only duration. |
| Tokens and temporary objects | Base versus source Battlefield; ready versus exhausted; counted placement; no legal destination; Temporary cleanup at Beginning before scoring; token event triggers; alternate presentation maps to one canonical token definition. |
| Destination/active-zone permissions | Self versus friendly-unit permission; open versus controlled versus enemy-occupied Battlefield; source active/inactive/moved; projection versus stale server submission; one board copy versus one Trash copy; no duplicate trigger source. |

For every family, include at least one alternate/duplicate presentation check:
the standard representative and its alternate art, overnumbered, signature, or
suffix variant must resolve to the same canonical behavior only when the
normalized gameplay text is identical. Same-name text differences must be
tested as separate identities or held for catalog review.

## 8. Risks and unresolved questions

1. `deriveCanonicalPrintingGroupKey` uses `metadata.clean_name`; it would group
   `SFD-197` and `SFD-247` Emperor of the Sands even though their gameplay text
   differs. This is the most dangerous identity false positive in the corpus.
2. SFD has no standard printing for `SFD-222`, `SFD-223`, `SFD-226`,
   `SFD-227`, `SFD-229`, `SFD-231`, `SFD-232`, `SFD-234`, `SFD-236`, and
   `SFD-238`. UNL has no standard printing for `UNL-220` through `UNL-225`.
   These 16 identities are reviewed but must remain unpublished until explicit
   catalog review resolves their representatives.
3. The runtime coverage map says many catalog primitives are executable, but
   the complete semantic contract can still be narrow. `keyword.repeat`,
   `keyword.ambush`, equipment attachment/detachment, copy, counter, XP, and
   several card-specific-looking keywords are not safe to infer from names.
4. Primitive discovery reports are useful leads, not approval evidence. They
   over-match text such as “if,” “may,” “unit,” and “draw” and can produce
   incomplete parameter sets. Full execution path tracing is required.
5. Several historical family documents mark behavior as ready or
   `manual_family_passed`, not complete-card `accepted`. That evidence must not
   be promoted to canonical gameplay acceptance for cross-set cards.
6. `UNL-238` is a standard-flagged Baron Nashor (Ultimate) with gameplay text
   identical to `UNL-147`; the source metadata does not mark it as an alternate
   presentation. It needs an identity decision before catalog synchronization.
7. Public-Trash source activation and private Main Deck source activation now
   have explicit active-zone routing. Expanding trigger discovery additively
   would reintroduce duplicate triggers from board and Trash copies.
8. Choices made during card play, trigger finalization, and effect resolution
   are not interchangeable. `UNL-139`, `UNL-169`, `UNL-179`, and `UNL-200` are
   particularly dangerous because a plausible binding can expose private data
   or retarget after Priority.
9. “Move,” “recall,” “kill,” “would die,” “discard,” “banish,” “recycle,” and
   “put into a zone” have distinct event and replacement consequences. Textual
   grouping by destination is unsafe.
10. The local corpus contains effective errata that materially changes family
    classification, especially `SFD-170`, `SFD-187`, `SFD-188`, `OGN-025`,
    `OGN-062`, `OGN-121`, and `OGN-242`. Any future intake must apply the errata
    overlay before semantic signatures are built.

## 9. Recommended next milestone

The recommended next milestone is **Cross-set top-deck plus simple event
composition**, limited to cards that reuse current pending-choice, private
projection, and destination contracts.

Exact scope:

`SFD-041`, `SFD-048`, `SFD-058`, `SFD-065`, `SFD-096`, `SFD-170`,
`SFD-187`, `SFD-188`, `SFD-215`, `SFD-219`, `UNL-051`, `UNL-062`, `UNL-064`,
`UNL-152`, `UNL-161`, `UNL-183`, `UNL-193`, `UNL-194`, `UNL-207`, `UNL-209`,
`UNL-212`, and `UNL-218`.

Implementation order:

1. Resolve the catalog identity decision for same-name/different-text cards;
   exclude all 16 no-standard groups and `UNL-238` from publication until
   resolved.
2. Build semantic signatures from effective errata text and select only normal
   canonical representatives.
3. Bind the exact trigger-only cards (`SFD-048`, `SFD-096`, `SFD-219`,
   `UNL-152`) and manually validate trigger routing and ownership.
4. Bind simple composed modifiers/effects (`UNL-161`, `UNL-183`, `UNL-193`,
   `UNL-194`, `UNL-207`, `UNL-209`, `UNL-212`, `UNL-218`).
5. Bind top-deck cards in increasing privacy/selection complexity:
   `SFD-041`, `SFD-058`, `SFD-065`, `SFD-215`, `UNL-051`, `UNL-062`,
   `UNL-064`, then errata-sensitive selected-play cards `SFD-170`, `SFD-187`,
   and `SFD-188`.
6. Run `npm run typecheck` and `npm run lint`; perform the manual matrix above;
   do not add gameplay acceptance tests or update ledgers unless the user
   explicitly reports a manual family pass.

Stopping conditions:

- any projected legal choice differs from server validation;
- any private top-deck or Hand information is visible to the wrong player;
- any selected card is retargeted after leaving its original zone;
- any accepted OGS/OGN behavior changes, especially Stacked Deck, public Trash
  play, typed event routing, or destination permissions; or
- canonical identity remains unresolved for a candidate required by the batch.

Keep Repeat, countering, copying, XP, private opponent play, dynamic death
replacement, equipment lifecycle, linked movement, and the 16 no-standard
printing groups out of scope. Those belong to later Wave 3 or Wave 4 work and
should not be used to widen the first cross-set family milestone.
