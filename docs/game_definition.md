# Riftbound Simulator Game Definition

## Status And Authority

This document defines the first server-authoritative Riftbound simulator target for
Hextech. It is the working product and rules definition for a best-of-3 duel
simulator.

This document does not replace the support documents. When there is a conflict,
use this authority order:

1. `docs/riftbound_core_rules_reference.md` for official rules behavior.
2. `docs/deck_validation.md` for deck legality requirements.
3. `data/sets/*.json` for card metadata and card text.
4. This document for simulator scope, sequencing, server/client contracts, and
   MVP decisions.

The first playable fixture decks are:

- `data/decks/annie.dec.txt`
- `data/decks/lux.dec.txt`

Both fixture decks must pass strict deck validation before they can be used in a
game. Invalid decks are not playable.

## Product Shape

Hextech is a server-authoritative simulator. The server owns the canonical match,
game state, randomness, hidden information, legality checks, state transitions,
and event log. Clients display projected state and submit player intentions.

Clients must not:

- Mutate game state directly.
- Decide whether an intent is legal.
- Resolve card text.
- Reveal hidden information.
- Infer private state from server payloads.

The MVP has no chat and no deck editor. Players provide deck lists in the strict
official text format. The first supported format is 1v1 best-of-3.

## Core Challenge: Primitives Are Not Only Zone Moves

The simulator should use primitives, but the primitive vocabulary must not
flatten official rules terms into generic zone movement.

The rules distinguish physical state changes from rules-recognized actions:

- A card changing zones is not automatically a `Move`.
- `Move` is a rules action for a permanent changing locations on the board.
- `Kill` places a permanent from the board into its owner's trash and is not a
  subset of `Move`.
- `Banish` places a card into banishment and is not a subset of `Kill` or
  `Discard`.
- `Recall` changes board locations without being a `Move`.

The engine therefore needs two layers:

- Low-level state transitions: small deterministic mutations of canonical state.
- Rules actions/events: official game concepts that may use one or more
  low-level transitions and that can trigger other rules.

Implementation must preserve this distinction in state, event names, tests, and
log output.

## Two-Layer Primitive Model

### Low-Level State Transitions

Low-level transitions are internal implementation operations. They are not
direct player intents and are not automatically official rules events.

Required low-level transition families:

- Place object into zone or location.
- Transfer card or object between zones.
- Transfer permanent between board locations.
- Set or clear face-up, facedown, revealed, exhausted, ready, stunned, attacker,
  defender, contested, pending-combat, and similar state.
- Add, remove, or update counters and temporary modifiers.
- Assign or change controller.
- Add, spend, or clear rune-pool resources.
- Shuffle an ordered zone using seeded server RNG.
- Reorder an ordered zone when a rule permits a player choice.
- Create or remove logical objects such as abilities on the chain, tokens,
  buffs, and delayed effects.

Low-level transitions must be deterministic, validated by the rules action that
requested them, and recorded in enough detail for replay.

### Rules Actions And Events

Rules actions/events are official or simulator-facing game concepts. These are
the vocabulary clients, tests, logs, and card-runtime coverage should use.

Required initial action/event vocabulary:

| Action/event | Definition boundary |
| --- | --- |
| `Draw` | Takes the top card of a player's main deck and adds it to that player's hand. Handles Burn Out when required. |
| `Play` | Executes the official play process for cards or tokens, including legality, costs, chain placement, and resolution behavior supported by MVP primitives. |
| `Move` | Moves units/permanents between board locations only. This is not generic zone transfer. |
| `Hide` | Places an eligible card facedown at a controlled battlefield according to Hidden rules. |
| `Discard` | Moves cards from hand to owner trash without executing their normal text. |
| `Reveal` | Temporarily exposes private or secret cards to all players while they remain in their zone. |
| `Counter` | Negates a card or ability on the chain according to rules and puts countered cards into trash. |
| `Buff` | Adds a buff object/counter to a unit if it does not already have one. |
| `Banish` | Places cards or permanents into owner banishment. Not Kill or Discard. |
| `Kill` | Places permanents from the board into owner trash. Not Move. |
| `Add` | Adds energy or power to a player's rune pool. |
| `Channel` | Takes one or more runes from the top of a player's rune deck and puts them onto the board. |
| `BurnOut` | Replacement action when a player tries to draw/look/reveal/mill from an empty main deck. |
| `Recall` | Changes a permanent's board location without being Move. |
| `Score` | Applies Conquer or Hold scoring and final-point restrictions. |
| `Conquer` | A Score source caused by gaining control of a battlefield not scored this turn. |
| `Hold` | A Score source caused by controlling a battlefield during Beginning Phase. |
| `Cleanup` | Performs state-based cleanup checks after rules-defined moments. |
| `Showdown` | Structured window with relevant players, focus, priority, legal Action/Reaction behavior, pass sequencing, and close conditions. |

Card text extraction from `data/sets/*.json` should map text verbs and keywords
to this vocabulary. Any discovered card text that cannot map to implemented
actions is unsupported until explicitly added.

## Zones And Visibility

Every card or game object must always be in exactly one canonical zone or board
location unless it has ceased to exist under the rules.

Zone definitions must record:

- Owner and controller relationship.
- Board or non-board classification.
- Location or non-location classification.
- Ordered or unordered behavior.
- Capacity constraints.
- Public, private, or secret visibility.
- Legal card/object categories.
- Whether temporary modifications are retained or cleared when entering/leaving.

### Initial Zone Contract

| Zone | Owner scope | Board | Location | Order | Visibility | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Legend Zone | Per player | Yes | No | Single object | Public | Champion Legend starts here and cannot be removed, moved, or displaced by normal rules. |
| Champion Zone | Per player | No | No | Single/limited | Public | Chosen Champion starts here and can be played from here. |
| Main Deck | Per player | No | No | Ordered | Secret order | Main deck starts face down. Top card access must be server-only unless revealed. |
| Rune Deck | Per player | No | No | Ordered | Secret order | Rune deck starts face down and separate from main deck. |
| Hand | Per player | No | No | Unordered to opponent | Private | Owner sees identities; opponent sees count only. |
| Trash | Per player | No | No | Unordered | Public | Owner's cards that are killed, discarded, resolved as spells, or moved to trash. |
| Banishment | Per player | No | No | Unordered | Public | Owner's banished cards. Effects may reference cards banished by a specific object. |
| Base | Per player | Yes | Yes | Grouped | Public | Player-controlled location for units, gear, and runes on board. Opponents cannot control objects in another player's base. |
| Battlefield Zone | Shared | Yes | Each battlefield is a location | Set/group | Public | Best-of-3 duel uses one selected battlefield from each player per game. |
| Facedown Zone | Per battlefield | Yes | No | Capacity 1 | Private to controller | Associated with one battlefield. Controller sees identity. Opponent sees hidden token. |
| Chain | Shared | No | No | Ordered stack/list | Public except hidden choices | Holds cards and abilities while being played/activated/resolved. |

Open question: whether the implementation should model `facedown` as a separate
zone collection or as a property of the battlefield's facedown slot. Either is
acceptable only if the visibility, capacity, cleanup, and replay behavior above
are preserved.

## Deck Validation

Deck validation is a hard gate. The server must reject match/game entry for any
invalid deck.

Required validation:

- Exactly one Champion Legend in `Legend:`.
- Exactly one Chosen Champion Unit in `Champion:`.
- `MainDeck:` section spelling is strict. `Main Deck:` is invalid.
- Main deck has at least 40 cards counting the chosen champion.
- Main deck entries use 1-3 copies per entry.
- Chosen Champion, MainDeck, and Sideboard combined obey max 3 copies by name.
- Exactly 12 Rune cards.
- Exactly 3 unique Battlefields.
- Duplicate names in MainDeck and Sideboard sections are rejected.
- Every name resolves against `data/sets/*.json`.
- Section placement matches card type.
- Chosen Champion tag is compatible with the Champion Legend.
- Domain identity and signature-card limits are enforced.

The fixture decks `annie.dec.txt` and `lux.dec.txt` are the first acceptance
fixtures. They must stay valid under these rules.

## Match And Game Flow

### Format

The first simulator target is 1v1 best-of-3.

Format variables:

- Players: 2.
- Teams: none.
- Victory score: 8 points per game.
- Battlefield count: 2 in play per game, one selected by each player.
- Match win: first player to 2 game wins.
- First-turn modifier: player going second channels one extra rune during their
  first Channel Phase.

### Match Setup

Setup flow:

1. Both players submit deck lists.
2. Server validates both decks strictly.
3. Server creates expanded card instances with stable IDs.
4. Server creates match seed for deterministic RNG.
5. Server creates game 1.
6. Server determines starting-player chooser.
7. Both players lock battlefield choice privately.
8. After both battlefield choices are locked, server reveals both and places
   selected battlefields in the Battlefield Zone.
9. Starting-player chooser chooses who starts.
10. Server shuffles each player's main deck and rune deck separately with seeded
    RNG.
11. Server places Legend, Chosen Champion, Battlefields, Main Deck, and Rune
    Deck into starting zones.
12. Each player draws 4.
13. Both players commit mulligan choices privately.
14. Server resolves mulligans in turn order.
15. Game begins with first player taking their turn.

Starting-player chooser policy:

- Game 1: selected randomly by seeded server RNG.
- Games 2 and 3: previous game loser is the chooser.
- Chooser selects which player starts that game.

Battlefield policy:

- Each player chooses one of their three registered battlefields for each game.
- Choices are commit-then-reveal.
- Used battlefields cannot be selected again by that player later in the same
  match.
- Unused battlefields remain set aside.

Sideboarding/reconfiguration:

- Best-of-3 deck reconfiguration must be documented as a future rule boundary.
- It is not required for the first playable MVP.
- MVP games may run the same validated deck configuration across games.

### Mulligan

Mulligan is commit-then-resolve:

- Each player privately chooses up to two cards from their hand.
- Choices are locked before resolution.
- Server resolves mulligans in turn order.
- For each player, selected cards are set aside, that player draws the same
  number of cards, then selected cards are recycled.
- Canonical log records exact identities.
- Opponent projection must not reveal selected card identities unless a rule
  explicitly reveals them.

Open question: whether the commit step should expose only "locked/not locked" or
also the selected count to the opponent before resolution. The current definition
requires no identity leak either way.

## Turn And MVP Gameplay

The MVP must support enough gameplay to load valid Annie/Lux games, advance
turns, perform basic rule-driven actions, score, win, and enter/close a simple
showdown.

Required turn structure:

- Awaken Phase.
- Beginning Phase with Hold scoring.
- Channel Phase.
- Draw Phase.
- Action Phase.
- End of Turn Phase with cleanup/expiration behavior needed by MVP.

Required MVP capabilities:

- Opening draw and mulligan.
- Draw during Draw Phase and by supported effects.
- Channel during Channel Phase and by supported effects.
- Add resources for supported effects.
- Play supported cards.
- Activate supported abilities.
- Move units through legal Standard Move or supported effects.
- Pass priority/focus where applicable.
- End the current turn.
- Score through Hold and Conquer.
- Enforce victory at 8 points.
- Enter a showdown.
- Pass through and close a showdown.

Unsupported behavior:

- If an intent would require unimplemented card text, keyword behavior, target
  rule, payment rule, replacement effect, trigger, or resolution branch, reject
  that intent at intent time.
- Rejection leaves canonical state unchanged.
- Rejection response must identify the unsupported feature and the source card or
  rule when available.
- A valid deck may contain unsupported cards. Unsupported behavior only blocks
  the attempted intent that needs it.

## Showdown MVP

The first showdown milestone is not full combat resolution.

It must implement:

- Detection that a showdown should begin for the supported MVP scenarios.
- Showdown state separate from neutral state.
- Relevant player set.
- Focus holder.
- Priority holder when focus is gained.
- Legal pass intent for the player with focus/priority.
- Pass tracking.
- Closing the showdown after all relevant players pass in sequence.
- Cleanup after showdown close when required by rules.

It does not yet require:

- Full combat damage assignment.
- Tank damage assignment rules.
- Initial chain from attack/defend triggers.
- Action/Reaction card play during showdown unless explicitly included in the
  implemented primitive catalog.
- Full Conquer resolution from combat.

Any client or test that reaches full combat requirements before those features
exist must receive an unsupported-feature rejection or pause at a documented
unsupported boundary.

## Card Runtime And Primitive Coverage

Card runtime must be data-driven from `data/sets/*.json`, but card text is not
automatically executable just because the card exists in the catalog.

Required card-runtime workflow:

1. Load all set JSON files.
2. Extract card names, IDs, public codes, types, supertypes, domains, tags,
   costs, might, power, keywords, and plain rules text.
3. Extract card-text verbs and keywords into a primitive coverage matrix.
4. Mark each primitive as implemented, partially implemented, unsupported, or
   not needed by current MVP fixtures.
5. For Annie/Lux playable scenarios, implement only the primitives required by
   selected acceptance tests.
6. For new sets, compare extracted verbs/keywords against the matrix and add
   missing primitives deliberately.

Known Annie/Lux surface area includes:

- Verbs/actions: play, draw, move, deal damage, return, ready, channel, conquer,
  choose, discard, kill, add, cost modification.
- Keywords: Action, Reaction, Add, Vision, Deflect, Assault, Tank.

The presence of a verb or keyword in a fixture deck does not mean the first MVP
must implement every branch of that behavior. The selected playable scenarios
define which branches are required. Other branches reject at intent time.

Open question: the exact first scenario script for Annie vs Lux is not defined
yet. Before implementation, define the intended acceptance script so primitive
coverage can be bounded without guessing.

## Server/Client Contract

### Player Intents

Player intents are high-level requests. They are never direct state mutations.

Required intent families:

- Submit deck.
- Lock battlefield choice.
- Choose starting player.
- Commit mulligan.
- Take rule-prompted draw or channel choice when a choice is required.
- Play card.
- Activate ability.
- Select target.
- Select mode, optional cost, or effect choice.
- Move unit.
- Pass priority or focus.
- End turn.

Every intent must include:

- Match ID.
- Game ID where applicable.
- Acting player ID.
- Intent type.
- Client-known state version.
- Required payload for that intent.

The server response must be one of:

- Accepted with resulting events and updated projected state.
- Rejected with stable error code, message, source rule/card if known, and no
  state change.

### Server Outputs

Required server outputs:

- Canonical internal event stream.
- Viewer-specific game-state projection.
- Human-readable log derived from canonical events.
- Rejection responses for illegal or unsupported intents.

Viewer projection must be computed server-side. The API/socket layer must never
serialize canonical hidden information and rely on the client to hide it.

## Replayable Event Log

The event log is the primary audit and replay source.

Requirements:

- Log every accepted player intent.
- Log deterministic server decisions.
- Log RNG seed and random operation results, or enough RNG operation metadata to
  replay exactly.
- Log zone/object changes at canonical identity level.
- Log hidden information canonically for replay.
- Derive viewer-safe event projections for clients.
- Derive human-readable game log from canonical events.

Random operations that must use seeded server RNG:

- Initial chooser selection for game 1.
- Main deck shuffles.
- Rune deck shuffles.
- Any random ordering required by Recycle or future card effects.

Open question: exact RNG algorithm and seed serialization format are not defined
in the support documents. Implementation must choose and document them before
writing replay tests.

## Testing And Acceptance

### Deck Validation

Required tests:

- Annie deck validates.
- Lux deck validates.
- Missing catalog card rejects.
- Wrong section name, including `Main Deck:`, rejects.
- Missing Legend rejects.
- Missing Champion rejects.
- Illegal card type placement rejects.
- Illegal counts reject.
- Invalid champion/legend tag compatibility rejects.
- Invalid domain identity rejects.

### Setup

Required tests:

- Game 1 chooser is selected by seeded RNG.
- Starting-player chooser can choose either player.
- Non-chooser cannot choose starting player.
- Game 2 chooser is previous game loser.
- Battlefield choices are hidden until both players lock.
- Revealed battlefields are placed in Battlefield Zone.
- Used battlefields cannot be reused by that player.
- Setup creates correct zones and stable card instances.

### Visibility

Required tests:

- Owner sees cards in own hand.
- Opponent sees only hand count.
- No client sees main deck or rune deck order.
- Trash and banishment are public.
- Face-up board objects are public.
- Facedown battlefield cards reveal identity only to their controller.
- Mulligan committed card identities are not exposed to opponent projection.

### Replay

Required tests:

- Same seed plus same accepted intents reconstructs the same canonical state.
- Rejected intents do not alter event stream or state.
- Viewer-safe replay projections do not leak hidden identities.

### MVP Gameplay

Required tests:

- Opening draw draws 4 for each player.
- Mulligan chooses up to 2, draws replacements, then recycles selected cards.
- Draw moves top main-deck card to hand and preserves visibility.
- Channel moves top rune cards to board.
- Player going second channels one extra rune on their first Channel Phase.
- Unsupported card behavior rejects at intent time.
- Hold scoring grants points according to rules.
- Score reaching 8 wins the game immediately.
- Showdown can be entered, passed through, and closed.

## Open Questions

The following items must remain undecided until the rules documents, card data,
or an explicit product decision resolves them:

- Exact first Annie vs Lux acceptance scenario script.
- Exact RNG algorithm and seed serialization.
- Whether facedown slots are implemented as distinct zones or battlefield
  sub-objects.
- Whether opponent projection shows mulligan selected count before resolution.
- Which Action/Reaction branches, if any, are included in the first showdown MVP.
- Exact API route names, socket event names, and wire schemas.
- Persistence backend for canonical events and match state.
- Sideboarding/reconfiguration implementation timing beyond "documented, not
  first playable MVP."

