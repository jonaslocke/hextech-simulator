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

## Technical Stack And Boundaries

The implementation stack is:

- Next.js 15 App Router.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- shadcn/ui for reusable UI primitives.
- MongoDB with the official native Node.js driver.
- Zod for schema and payload validation.
- Socket.IO on a custom long-running Node server for later realtime multiplayer.

Mongoose must not be used.

The backend must remain pure Node.js/TypeScript code. The game engine,
repositories, deck validation, card catalog, seeded RNG, event log, realtime
room orchestration, and match/game services must not import React, Next.js, or UI
modules. Realtime room orchestration is deferred until after the game loop works.

Next.js responsibilities:

- Render the web client.
- Provide thin HTTP route adapters when useful.
- Serve static assets and application shell.
- Call into pure server modules rather than implementing rules directly.

Pure backend responsibilities:

- Load and validate card catalog data.
- Parse and validate deck lists.
- Own canonical match/game state.
- Validate and resolve player intents.
- Enforce visibility projections.
- Persist snapshots and events.
- Produce accepted state changes and projections that can later be broadcast to
  match rooms.

Recommended source layout:

```txt
src/
  app/                  Next.js App Router routes, layouts, and route adapters
  components/           shadcn/ui components and game UI components
  server/               framework-free backend modules
    catalog/            set JSON loading and catalog contracts
    db/                 MongoDB native driver connection and repositories
    deck/               parser, zod schemas, and validation
    engine/             rules engine, primitives, zones, visibility, RNG
    events/             canonical event log and viewer-safe projections
    match/              match/game orchestration
    realtime/           Socket.IO rooms and gameplay broadcasts
  shared/               shared zod schemas, DTOs, and transport types
```

The initial deployment assumption is local-first on a long-running Node process.
This avoids serverless constraints while gameplay, game-log, persistence, and
later realtime multiplayer contracts are still changing.

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
requested them, and recorded in enough detail for the player-facing game log and
server-side audit trail.

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
| `Recycle` | Takes one or more cards from a specified zone and places them on the bottom of the corresponding owner deck. Main Deck cards recycle to Main Deck. Runes recycle to Rune Deck. If 2+ cards recycle to Main Deck simultaneously, their bottom-deck order is randomized by seeded server RNG. If 2+ cards recycle to Rune Deck simultaneously, their bottom-deck order is chosen by the owner. |
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
acceptable only if the visibility, capacity, cleanup, and future reconstruction
compatibility above are preserved. Replay is not MVP scope.

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
- If two selected Main Deck cards are recycled simultaneously, the server uses
  seeded RNG to place them on the bottom of that player's Main Deck in random
  order.
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
- Add energy or power to a player's rune pool from supported Rune abilities.
- Play supported cards after validating and paying their energy and power costs.
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

### Rune Pool MVP

The rune pool is a per-player canonical state object, not a UI-only counter.

It stores:

- Energy as a numeric amount.
- Power as domain-keyed amounts.

Supported MVP resource generation:

- A ready Rune in a player's base can be exhausted to add 1 Energy to that
  player's rune pool.
- A Rune in a player's base can be recycled to its owner's Rune Deck to add 1
  Power matching that Rune's non-colorless domain.
- Rune-pool resources are spent by cost payment and clear at end of turn.
- End-turn advancement readies the next active player's board objects for the
  next turn's Awaken state.

The complete rune-pool target intentionally diverges from official Rune Deck
recycle ordering: whenever 2 or more Runes are recycled simultaneously, those
Runes are placed on the bottom of the Rune Deck in seeded random order. This
differs from the official rule that the owner chooses simultaneous Rune Deck
order. This divergence is accepted for Hextech automation.

The MVP does not yet implement non-Rune Add abilities, universal/rainbow Power,
or generated resources from card text other than the supported basic Rune
abilities. Add-Reaction opportunities during payment are intentionally out of
scope; payment is resolved from the player intent and the current canonical
state, not through an interactive payment window.

### Card Cost Payment MVP

Cost payment is a distinct rules subsystem from zone movement.

Supported MVP payment behavior:

- Card costs are read from authoritative card metadata.
- Energy and Power costs are separate.
- Power costs are payable with Power matching one of the played card's
  non-colorless domains.
- A player may manually add resources to their rune pool before playing a card.
- `PlayCard` automatically spends available rune-pool resources first.
- If more Energy is needed, `PlayCard` automatically exhausts ready Runes in
  the player's base in deterministic board order.
- If more Power is needed, `PlayCard` automatically recycles a matching Rune
  from the player's base when exactly one recycled Rune is required.
- Supported MVP Unit cards can be played from hand or champion zone to that
  player's base and enter exhausted.

Unsupported MVP payment behavior rejects before state mutation:

- Additional costs.
- Alternative costs.
- Cost increases and discounts.
- Multi-rune automatic Power payment that would require owner-selected Rune Deck
  ordering.
- Spell and Gear play.
- Card text with immediate "when you play" or "enter ready" behavior.
- Playing cards during showdown.

### Complete Rune Pool And Payment Target

This target replaces the temporary MVP payment model. Future implementation
should remove or refactor the current flat `PaymentPlan` and narrow auto-payment
logic rather than layering the complete system on top of it.

The complete implementation should be split into three subsystems:

- Rune Pool subsystem: stores, adds, spends, and clears Energy and Power.
- Cost subsystem: computes payable costs from card metadata, current object
  state, chosen optional costs, overrides, cost increases, and discounts.
- Payment subsystem: validates and applies the chosen payment plan atomically.

Power costs are represented as requirements that can be satisfied by one or more
Power domains:

```ts
type PowerRequirement = {
  amount: number;
  payableBy: "any" | Domain[];
};
```

Examples:

- `Singularity`: 2 Mind Power.
- `Defiant Dance`: 1 Power payable by Calm or Chaos.
- Deflect 1: 1 Power payable by any domain.
- Rainbow Power in the rune pool can pay any Power requirement.

Automatic payment rules:

- Spend matching domain-specific rune-pool Power before Rainbow Power.
- Spend Rainbow Power last.
- For multi-domain Power requirements, spend domains in the card metadata domain
  order.
- Spend rune-pool Energy before exhausting ready Runes.
- Exhaust ready Runes in deterministic board order for missing Energy.
- Recycle matching Runes in deterministic board order for missing Power.
- Any simultaneous recycle of 2 or more Runes places those Runes on the bottom
  of the Rune Deck in seeded random order and logs the random operation. This
  intentional simulator rule applies beyond auto-payment and diverges from the
  official owner-chosen Rune Deck order rule.
- Do not choose optional costs automatically.
- Do not choose non-resource costs automatically unless a selected payment mode
  requires them and there is only one legal way to pay them.

Optional payment modes are selected before payment validation. The payment
system does not ask strategic questions; it validates the selected payment mode
and applies costs. Viewer-safe projections expose legal available actions and
payment modes for the current game state so the client can present choices such
as:

- Pay regular card cost.
- Pay Accelerate.
- Pay Repeat once.
- Pay Hidden alternative cost.
- Pay other optional additional costs exposed by card text.

When a card can be played in multiple modes, projection should expose legal
payment options to the client. For example, `Bellows Breath` should offer
regular play and play-with-Repeat when both are legal. Repeat can be paid at
most once. The player chooses the intended mode, then the payment system
validates and applies that mode's costs.

Payment plan shape must support all cost categories:

```ts
type PaymentPlan = {
  selectedModeId: string;
  resourceCosts: {
    energy: number;
    power: PowerRequirement[];
  };
  resourcePayments: Array<
    | { type: "spendEnergy"; amount: number }
    | { type: "spendPower"; domain: Domain | "Rainbow"; amount: number }
    | { type: "exhaustRuneForEnergy"; cardInstanceId: string }
    | { type: "recycleRuneForPower"; cardInstanceId: string; producedDomain: Domain | "Rainbow" }
  >;
  nonResourceCosts: NonResourceCostPayment[];
  optionalCostsChosen: string[];
  costModifiersApplied: string[];
};
```

Cost overrides and modifiers:

- Card metadata is only the printed/base blueprint.
- Runtime game objects may have modified Energy Cost, Power Cost, domains, or
  text-derived additional costs.
- Runtime cost modifiers are stored in canonical game state as computed
  temporary modifiers. The game state must be aware of active cost changes
  rather than relying only on card metadata.
- Ignore-cost effects, discounts, increases, Deflect, Repeat, Accelerate, and
  similar rules must be applied by the Cost subsystem before payment validation.
- Energy and Power costs cannot be reduced below zero.

Non-resource cost ordering:

- The player intent supplies cost order only when order can affect legality or
  outcome.
- Otherwise the engine applies non-resource costs in a canonical order.

Deflect behavior:

- Deflect imposed by a spell being played is a mandatory additional Power cost.
  If the player cannot pay it, the spell cannot be played.
- If an activated or triggered ability would choose a Deflect object and the
  rules allow the player to decline or cancel that choice, the player may opt
  out before payment is applied.

Cancellation:

- A no-choice payment attempt either succeeds atomically or rejects with no state
  change.
- Cancellation exists only before payment is applied, when the player is
  selecting among modes, optional costs, targets, or other choices.
- Add-Reaction payment windows are intentionally not implemented.

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
  choose, discard, kill, add, recycle, cost modification.
- Keywords: Action, Reaction, Add, Vision, Deflect, Assault, Tank.

The presence of a verb or keyword in a fixture deck does not mean the first MVP
must implement every branch of that behavior. The selected playable scenarios
define which branches are required. Other branches reject at intent time.

Open question: the exact first scenario script for Annie vs Lux is not defined
yet. Before implementation, define the intended acceptance script so primitive
coverage can be bounded without guessing.

## Server/Client Contract

### Player Identity

The MVP uses anonymous player tokens.

Rules:

- Match creation creates or accepts two player seats.
- Each seat has a server-generated player token.
- A player token authorizes that seat's intents.
- Tokens are stored by the client for the session.
- Every protected intent must include credentials that resolve to exactly one
  player seat.
- The server must reject intents from the wrong player, unknown token, or player
  that is not allowed to act in the current state.

This is not full account authentication. It is the minimum identity layer needed
to prevent one client from acting as both players or mutating a match it does not
own.

### Realtime Transport

Socket.IO is the intended realtime multiplayer transport, but it is no longer on
the critical path for the first working game loop. The MVP should first prove
the game through pure services, persisted snapshots, canonical game-log events,
viewer-safe projections, and an HTTP intent API.

Later Socket responsibilities:

- Join a match room after token validation.
- Send accepted intent results to relevant viewers.
- Broadcast viewer-specific projected state, not canonical hidden state.
- Broadcast human-readable log updates.
- Notify clients when waiting on opponent, priority, focus, mulligan, battlefield
  lock, or starting-player choice.
- Support reconnect by resending the current projected state and recent log
  position.

HTTP routes are the accepted adapter for setup, local testing, match creation,
loading initial app data, and driving gameplay while multiplayer transport is
postponed. Gameplay state changes must flow through the same pure
intent-handling service regardless of whether the adapter is HTTP, test code, or
later Socket.IO.

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

### Intent HTTP API

The MVP uses a single gameplay intent API route before Socket.IO multiplayer is
implemented.

Initial route:

- `POST /api/matches/:matchId/intents`

Responsibilities:

- Validate request shape with Zod.
- Validate the player token and resolve it to exactly one match seat.
- Check the client-known state version.
- Call the pure intent-handling service.
- Persist the updated canonical game snapshot when accepted.
- Append canonical game-log events when accepted.
- Return only the acting viewer's legal projection and viewer-safe log entries.
- Return a stable rejection response with no state or event mutation when
  illegal or unsupported.

The route must not implement rules directly. Later Socket.IO `match:intent`
handling must call the same pure intent-handling service.

### Server Outputs

Required server outputs:

- Canonical internal event stream.
- Viewer-specific game-state projection.
- Human-readable log derived from canonical events.
- Rejection responses for illegal or unsupported intents.

Viewer projection must be computed server-side. The API/socket layer must never
serialize canonical hidden information and rely on the client to hide it.

### UI Interaction Model

The MVP client uses click-driven interactions.

Expected flow:

1. Player clicks a card, zone, or prompt.
2. Client asks the current projection which actions are available, or displays
   actions already included in the projection.
3. Player clicks an action.
4. Player selects targets or modes when required.
5. Client submits one explicit intent.
6. Server accepts or rejects the intent.

Drag and drop may be added later as a visual shortcut, but it must not become
the source of truth for rules. The submitted intent remains explicit and
server-validated.

The board UI should use the attached screenshot as layout inspiration, not as an
exact implementation target.

Required MVP UI regions:

- Opponent area at the top.
- Shared battlefield area across the middle.
- Player base/board area near the bottom.
- Player hand at the bottom.
- Legend, champion, deck, rune deck, trash, and banishment zones on side rails
  or stable board positions.
- Score display for both players.
- Current turn, phase, priority, and focus indicator.
- Chain/showdown panel.
- Event log panel.
- Legal action prompt area.
- Waiting-for-opponent state.
- Rejected intent/error feedback.
- Hidden/private card placeholders that match viewer permissions.

Card images should use `media.image_url` from `data/sets/*.json` directly for
the MVP. A proxy/cache can be added later if remote image loading becomes slow,
unreliable, or unsuitable for deployment.

## Persistence

MongoDB is the persistence backend for the MVP. Use the native MongoDB Node.js
driver directly and validate application payloads with Zod at module boundaries.

Initial collections:

| Collection | Purpose |
| --- | --- |
| `matches` | Match metadata, players, current game, match score, status, and timestamps. |
| `games` | Current canonical game snapshot for fast reads and reconnects. |
| `gameEvents` | Append-only canonical event stream for player-facing game log, audit, and debugging. |
| `deckSnapshots` | Parsed and validated deck submissions, expanded runtime card instances, and source deck text. |
| `cardCatalogVersions` | Loaded set metadata version/hash so matches can be tied to the catalog used at creation. |

Persistence rules:

- Store canonical snapshots for fast current-state reads.
- Store append-only events for player-facing game log, audit, and debugging.
- Do not persist only deck text; persist validated deck snapshots and expanded
  runtime card instances.
- Persist enough catalog version information to know which set data was used for
  a match.
- Repository modules live under pure backend code and expose typed methods to the
  engine and match services.

## Game Log And Audit Event Stream

The event log is the primary audit and player-facing game-log source.

Requirements:

- Log every accepted player intent.
- Log deterministic server decisions.
- Log RNG seed, random operation purpose, and random operation result so the game
  log can explain random decisions.
- Log zone/object changes at canonical identity level.
- Log hidden information canonically server-side for audit/debugging.
- Derive viewer-safe event projections for clients.
- Derive human-readable game log from canonical events.
- Do not expose hidden card identities in opponent event projections.

Random operations that must use seeded server RNG:

- Initial chooser selection for game 1.
- Main deck shuffles.
- Rune deck shuffles.
- Any random ordering required when 2+ cards are Recycled to the Main Deck
  simultaneously.

Replay/reconstruction is explicitly out of MVP scope. Event detail should not be
reduced in a way that blocks future replay, but no replay engine or replay tests
are required for MVP.

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

### Game Log And Audit

Required tests:

- Accepted intents append canonical events.
- Rejected intents do not alter event stream or state.
- Viewer-safe event projections do not leak hidden identities.
- RNG events include seed, algorithm, step, purpose, and result.
- Human-readable game log entries are derived from canonical events without
  leaking hidden information.

### MVP Gameplay

Required tests:

- Opening draw draws 4 for each player.
- Mulligan chooses up to 2, draws replacements, then recycles selected cards.
- Recycle puts Main Deck cards on the bottom of the Main Deck and Rune cards on
  the bottom of the Rune Deck.
- Recycle randomizes simultaneous 2+ card Main Deck recycle order with seeded
  RNG.
- Recycle lets the owner choose simultaneous 2+ card Rune Deck recycle order.
- Draw moves top main-deck card to hand and preserves visibility.
- Channel moves top rune cards to board.
- Player going second channels one extra rune on their first Channel Phase.
- Unsupported card behavior rejects at intent time.
- Hold scoring grants points according to rules.
- Score reaching 8 wins the game immediately.
- Showdown can be entered, passed through, and closed.

### Technical Acceptance

Required tests/checks:

- Pure engine and deck modules run in Node tests without importing Next.js or
  React.
- Zod schemas reject malformed transport payloads.
- MongoDB repositories use the native driver and do not import Mongoose.
- Adapter boundaries call pure services rather than duplicating rules.
- UI renders public, private, and secret zones differently according to viewer
  permissions.

## Implementation Order

Build in this order:

1. Scaffold Next.js 15, React 19, TypeScript, Tailwind CSS 4, and shadcn/ui.
2. Add custom long-running Node server with Next request handling.
3. Add pure backend module skeleton under `src/server`.
4. Add MongoDB native driver connection and repository interfaces.
5. Implement card catalog loading from `data/sets/*.json`.
6. Implement Zod-backed deck parsing and strict deck validation.
7. Persist validated deck snapshots.
8. Create match and game setup state.
9. Implement seeded RNG and game-log event append.
10. Implement viewer-safe state projections.
11. Build basic board UI from projected fixture state.
12. Add first gameplay intents: draw, channel, pass, end turn.
13. Add event log panel.
14. Add showdown enter, pass, and close shell.
15. Complete first end-to-end Annie vs Lux acceptance path.
16. Add Socket.IO match rooms and reconnect flow after the game loop works.

## Resolved Implementation Decisions

The following decisions are accepted for the first implementation pass.

### First Annie Vs Lux Scenario

The first acceptance scenario is a scripted "setup to first showdown shell"
path:

1. Validate Annie and Lux decks.
2. Create a best-of-3 match.
3. Select and reveal battlefields through commit-then-reveal.
4. Determine game 1 starting-player chooser by seeded RNG.
5. Chooser selects the starting player.
6. Shuffle decks with seeded RNG.
7. Draw opening hands.
8. Both players commit mulligan with zero selected cards.
9. Start the first turn.
10. Resolve first turn channel and draw behavior.
11. Play one simple supported unit.
12. Move a unit to an empty battlefield.
13. Enter showdown shell.
14. Both players pass.
15. Close showdown.

This scenario intentionally proves setup, projections, turn start, basic intent
resolution, movement into showdown, and pass/close flow without requiring full
combat or broad card-effect coverage.

### RNG

Use `seedrandom` with a string seed for MVP deterministic randomness.

Persist:

- `seed`
- `rngAlgorithm: "seedrandom"`
- `rngStep`
- Random event purpose
- Random event result

This is sufficient for game-log audit/debugging and future replay compatibility.
Competitive entropy or cryptographic player commitments can be revisited later.

### Facedown Slots

Model facedown slots as battlefield sub-objects, not independent top-level
zones.

Each battlefield state should include:

```ts
facedownSlot: {
  controllerId: string;
  cardInstanceId: string;
} | null;
```

This preserves the rule shape that each facedown zone is associated with a
specific battlefield and has maximum occupancy of one card.

### Mulligan Visibility

Before mulligans resolve, opponent projection shows only whether each player is
locked or not locked.

Do not expose selected card identities or selected count before resolution. After
resolution, normal public information such as hand count is visible.

### Showdown MVP Branches

The first showdown MVP does not include Action/Reaction card play inside
showdown.

It includes:

- Enter showdown.
- Establish relevant players.
- Establish focus and priority.
- Pass focus/priority.
- Track pass sequence.
- Close showdown after all relevant players pass.

Attempting to play or activate an Action/Reaction during showdown returns an
unsupported-feature rejection until the chain and card-runtime branches are
implemented.

### API And Socket Names

Initial HTTP routes:

- `POST /api/decks/validate`
- `POST /api/matches`
- `GET /api/matches/:matchId`
- `POST /api/matches/:matchId/intents`

Initial Socket.IO events:

- `match:join`
- `match:intent`
- `match:state`
- `match:events`
- `match:error`

Use one generic `match:intent` event for gameplay actions so validation and
dispatch stay centralized in the pure intent-handling service. These socket
events are deferred until after the first working game loop.

### Sideboarding Timing

Sideboarding and best-of-3 deck reconfiguration remain out of the MVP
implementation.

The first implementation repeats games using the original validated deck
snapshots and enforces battlefield reuse rules. Add sideboarding only after
setup, projections, game-log audit, and the basic game loop are stable.

## Remaining Open Questions

No open product or implementation questions are currently blocking the first
implementation pass. New questions should be added here only when they cannot be
answered from the rules reference, deck validation document, set data, or the
decisions above.
