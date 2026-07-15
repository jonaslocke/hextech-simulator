# Origins M2 Corpus Analysis and Implementation Proposal

Snapshot date: 2026-07-13

This is the Phase 1 and Phase 2 record for Origins (`OGN`). It is a discovery
and implementation proposal, not behavior approval. Manual acceptance remains
open for all remaining OGN cards.

## Input Readiness

- `data/sets/ogn.json` parses against the local set schema. It contains 352
  records, every record has the required identity fields, and every record has
  `set.set_id: "OGN"`.
- The source contains 298 `metadata.clean_name` groups. The three equivalent
  Recruit printings (`OGN-271`, `OGN-272`, and `OGN-273`) are one gameplay
  token definition, leaving 296 gameplay-distinct definitions for this
  milestone.
- The 42 ordinary printed-variant groups contain 96 records. Their gameplay
  fields and rules text are identical within each group. No mismatched variant
  group was found.
- Of the 296 gameplay definitions, 284 have non-empty rules text and 12 are
  textless vanilla or intrinsic cards. The six Basic Runes remain executable
  through their intrinsic rune behavior; they are not behaviorless gameplay
  cards.
- Both user-provided decks parse and satisfy construction rules after
  non-semantic format normalization: `Runes:` is the supported section name,
  and Battlefield entries require an explicit quantity. They retain real
  Legend deck names (`Kai'Sa - Daughter of the Void` and
  `Viktor - Herald of the Arcane`) through the Legend-only deck-name rule in
  the plan.

## Heuristic Coverage Snapshot

The existing primitive-discovery pass is deliberately not behavior approval.
It reports the following against the 298 source-clean-name groups before the
Recruit token printings are merged for milestone coverage:

| Discovery result | Definitions |
|---|---:|
| Supported by the current suggestion catalog | 126 |
| Partially supported | 13 |
| Requires engine support | 75 |
| Ambiguous heuristic result | 53 |
| Unsupported heuristic result | 31 |
| Complete suggestions | 214 |
| Missing suggested parameters | 27 |

This proves that full-set approval cannot begin from generated suggestions.
Every clause still needs exact source-text review and an approved executable
model. The ambiguous and unsupported counts are review backlog, not a ruling
request by themselves.

## Token Dependency Inventory

| Gameplay token | Canonical source and variants | OGN references | Required behavior | Current state |
|---|---|---|---|---|
| 1 Might Recruit Unit, Recruit tag | `OGN-271` Recruit (DE), `OGN-272` Recruit (NX), `OGN-273` Recruit (ZN); one gameplay identity, three media variants | Vanguard Captain, Viktor Innovator, Viktor Leader, Forge of the Future, Faithful Manufactor, Altar to Unity, Machine Evangel, Noxian Drummer, Herald of the Arcane; plus prior OGS Recruit the Vanguard | Unit token, exhausted by default; source-specified base, source battlefield, or controlled destination; controller and owner are the creator; ceases to exist outside the board | Executable from the source-derived token catalog. |
| ready 3 Might Sprite Unit, Fae tag, Temporary | `OGN-274` Sprite | Sprite Call and Sprite Mother | Unit token, enters ready, gets Temporary, is created at the specified base or battlefield, and ceases to exist outside the board | Executable token definition with a controller-Beginning-Phase Temporary trigger. Exact Sprite-creating card models are not yet approved. |

No OGN card references a token whose source data is missing. The later-set Gold,
Mech, and Sand Soldier tokens are outside M2 behavior scope and remain future
corpus dependencies.

## Primitive Delta

Already executable primitives cover the baseline selectors, standard target
choices, draw, discard, damage, ready, channel, kill, return-to-hand, movement,
numeric modifiers, Action/Reaction timing, Assault, Shield, Tank, Deflect,
Ganking, Vision, basic triggers, and the M1 Recruit placement paths.

The OGN corpus needs the following generic additions or exact-model extensions:

| Group | Required primitives or capabilities |
|---|---|
| Card and zone operations | Recycle selected cards, reveal and look at cards, banish, stun, and generalized exhaust effects. |
| Choices, costs, and conditions | Optional and modal choices, payable additional costs, source-exhaustion costs, and exact `if`/`while` conditions. |
| Keywords | Accelerate, Deathknell, Hidden, Legion, Mighty, Temporary, and an amount-aware Deflect model. |
| Events and timing | Generic own-death and ready triggers, per-turn memory, delayed effects, and opponent-turn play checks. |
| Replacements and prevention | `instead`, prevention, next-event replacement, and target validity across delayed resolution. |
| Token support | Catalog-defined token lookup, token keywords and stats, placement variants, and board-leave cleanup. |

The discovery also found existing primitive use that needs exact parameter review
per card, including `action.play_token`, `action.move_unit`,
`modifier.modify_numeric_value`, `trigger.on_play`, and the selectors. Existing
support does not certify a newly discovered clause.

## Regression-Approval Gate

The following shared changes can alter accepted M0/M1 behavior and require user
approval before implementation under plan section 5.8:

1. Replace the current name-based generated-token resolver with catalog-driven
   token definitions. This affects the accepted Recruit paths in the Garen deck.
   Before, Recruit properties and media come from a hard-coded name match; after,
   they come from the resolved canonical token definition. Focused regression:
   Faithful Manufactor, Noxian Drummer, and Recruit the Vanguard, including
   placement and leaving the board.
2. Extend the shared effect-resolution and pending-choice model for generic
   optional/modal choices and non-standard costs. Existing pending target and
   token-placement choices must retain their current legality and stale-choice
   behavior. Focused regression: one existing targeted spell and Recruit the
   Vanguard's placement prompt.
3. Extend shared trigger and replacement processing for Deathknell, delayed
   effects, and prevention/replacement effects. Existing on-play, attack,
   defend, conquer, hold, and end-of-turn triggers must retain chain ordering
   and showdown focus. Focused regression: one accepted Garen attack trigger,
   one hold/conquer trigger, and one end-of-turn trigger.

All other listed capabilities will be added with new explicit behavior bindings
and defaults that do not change existing approved models. If source-text review
shows that an existing primitive itself needs a semantic correction, that
specific correction will be reported for approval before it is implemented.

## Proposed Implementation Order

1. Perform full OGN catalog intake as unapproved records and retain print and
   token-variant links.
2. Review the corpus in behavior families, preserving unsupported or ambiguous
   clauses as unapproved.
3. After the regression-approval gate, make token resolution catalog-driven and
   implement the shared choice, cost, condition, trigger, and zone primitives.
4. Approve models in batches only when every clause and token dependency is
   executable at the current rules-text hash.
5. Run the Phase 5 completeness gate, then add the two supplied decks as new
   permanent selectable decks without replacing existing decks.
6. Complete technical checks and request fresh manual validation only after
   the full OGN corpus is executable.

## Implementation Progress

The first approved shared change is implemented:

- `action.play_token` now requires `tokenCardCode` and resolves a token from
  the source-derived token catalog rather than matching token names in runtime
  code.
- The runtime and game projection share that immutable token registry, so a
  runtime-created token stores only its instance and canonical card code.
- The accepted Garen Recruit bindings now reference `OGN-272` (Recruit NX) as
  their canonical gameplay token source. The canonical behavior catalog and
  all affected M1 cards were synchronized on 2026-07-11.

The remaining approved choice/cost, trigger/replacement, and OGN-specific
primitive work remains in progress. Sprite card-creator models remain
unapproved until their exact text, placement, and card-play clauses are
reviewed.

Fresh Garen manual regression validation completed after this migration. The
user confirmed Recruit the Vanguard, Faithful Manufactor, and Noxian Drummer
token placement on 2026-07-11.

The focused Garen shared-choice regression also passed: target selection,
choice flow, and Recruit placement all worked after the optional-choice
extension.

The optional-choice foundation is also implemented. It creates a viewer-safe,
server-validated Accept/Decline decision and records the result by a stable
choice key. Effects with `requiresChoiceKey` execute only after the matching
Accept decision. Card-specific optional costs and modes still require their
own exact models and supporting cost or mode primitives.

The following further generic foundations are implemented and synchronized:

- `trigger.beginning` and `keyword.temporary` dispatch before scoring, so a
  Temporary token is killed at the start of its controller's Beginning Phase.
- Activated abilities now enforce explicit Energy and source-exhaustion costs
  before entering the chain. Power/domain payments and other non-standard costs
  remain deliberately unavailable until their exact parameters are modeled.
- `trigger.on_death` preserves an own-death source long enough to queue and
  resolve its Deathknell-style clause after it leaves play.
- `action.recycle_cards` returns selected physical cards to the bottom of the
  owner's Main Deck or Rune Deck and emits one grouped recycle event.
- `action.banish_card` moves selected physical cards to their owner's
  Banishment; tokens still cease when they would leave the board.
- `action.ready_cards` and `action.exhaust_cards` now change selected cards
  only when their state actually changes and emit the corresponding event.
- `action.stun_card` records the binary Stunned state, omits Stunned units'
  Might from combat damage, clears it at the next Ending Step, and exposes it
  in the card projection.
- `keyword.hidden` now provides an empty facedown slot at a controlled
  battlefield, pays one Power to hide from hand without opening a chain, and
  permits a free Reaction play on the next player's turn. Hidden play targets
  are constrained to its associated battlefield.
- `keyword.accelerate` creates a distinct ready-entry play action that pays
  one additional Energy and one additional Power matching the Unit's domain.
- `keyword.legion` records prior Main Deck cards played this turn and gates
  Legion clauses from the card's play-time state.
- `trigger.on_death` now supports own, friendly, another-friendly, and enemy
  death relationships. Existing named death replacements remain executable;
  arbitrary `instead` and prevention models still require exact card-specific
  replacement parameters before approval.
- `action.look` exposes a private, non-moving top-deck inspection choice, and
  `action.reveal` emits reveal events without moving the revealed cards.
- `action.take_to_hand` moves a chosen card from the original private look
  group into hand, and `action.recycle_top_cards` can require all remaining
  looked-at cards to be recycled. The first remaining family binding is
  prepared for `Stacked Deck` during the completed ingestion pass.

The current remaining-card inventory snapshot contains 242
gameplay-distinct definitions, 236 with rules text, and 298 clauses after
accepted deck cards, equivalent printings, and represented token printings are
excluded. See
`ogn-m2-remaining-inventory.md` for the inventory contract and
`ogn-m2-top-deck-family.md` for the first family reuse map and manual gate.

## Manual Coverage to Reserve

The two supplied decks exercise Hidden, Action, Reaction, Recruit creation,
Sprite creation, opponent-turn card play, Legion, Deathknell, recycle, and
sideboarding. Additional manual scenarios will still be required for every
approved primitive not reached by those decks, especially replacements,
prevention, reveal/look/banish, modal choices, and Temporary cleanup.
