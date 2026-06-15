# Implementation TODO

This checklist follows the accepted implementation order in
`docs/game_definition.md`. Keep tasks checked only when the behavior is
implemented, tested, and documented where relevant.

## 1. Project Scaffold

- [x] Create Next.js 15 App Router project structure.
- [x] Configure React 19 and TypeScript.
- [x] Install and configure Tailwind CSS 4.
- [x] Install and initialize shadcn/ui.
- [x] Add baseline scripts for dev, build, lint, typecheck, and test.
- [x] Add initial app shell route.

## 2. Custom Node Server

- [x] Add custom long-running Node server entrypoint.
- [x] Wire Next request handling into the custom server.
- [x] Add Socket.IO server scaffold.
- [x] Add initial socket event scaffold.
- [x] Defer remaining Socket.IO implementation until the game loop works through pure services and the HTTP intent API.

## 3. Backend Module Skeleton

- [x] Create `src/server/catalog`.
- [x] Create `src/server/db`.
- [x] Create `src/server/deck`.
- [x] Create `src/server/engine`.
- [x] Create `src/server/events`.
- [x] Create `src/server/match`.
- [x] Create `src/server/realtime`.
- [x] Create `src/shared`.
- [x] Add boundary tests ensuring pure backend modules do not import Next.js or React.

## 4. MongoDB Persistence

- [x] Add MongoDB native driver dependency.
- [x] Add database connection module.
- [x] Add repository interfaces.
- [x] Add `matches` collection repository.
- [x] Add `games` collection repository.
- [x] Add `gameEvents` collection repository.
- [x] Add `deckSnapshots` collection repository.
- [x] Add `cardCatalogVersions` collection repository.
- [x] Add tests or integration checks for repository serialization.
- [x] Confirm Mongoose is not installed or imported.

## 5. Card Catalog

- [x] Load all JSON files from `data/sets`.
- [x] Validate card metadata shape with Zod.
- [x] Index cards by name.
- [x] Index cards by public code.
- [x] Preserve set ID, type, supertype, domains, tags, attributes, text, and media URL.
- [x] Compute catalog version/hash.
- [x] Persist catalog version metadata.
- [x] Add tests for Annie/Lux card lookup.

## 6. Deck Parsing And Validation

- [x] Parse official deck sections: `Legend:`, `Champion:`, `Runes:`, `Battlefields:`, `MainDeck:`, optional `Sideboard:`.
- [x] Reject `Main Deck:` spelling.
- [x] Resolve every listed card against the catalog.
- [x] Enforce exactly one Legend.
- [x] Enforce exactly one Chosen Champion Unit.
- [x] Enforce main deck size of at least 40 cards counting the chosen champion.
- [x] Enforce 1-3 copies per MainDeck entry.
- [x] Enforce max 3 copies across Champion, MainDeck, and Sideboard.
- [x] Enforce exactly 12 runes.
- [x] Enforce exactly 3 unique battlefields.
- [x] Reject duplicate names in MainDeck and Sideboard sections.
- [x] Enforce section placement by card type.
- [x] Enforce champion tag compatibility.
- [x] Enforce domain identity.
- [x] Enforce signature card limits.
- [x] Validate `data/decks/annie.dec.txt`.
- [x] Validate `data/decks/lux.dec.txt`.
- [x] Add negative validation tests.

## 7. Deck Snapshots

- [x] Expand validated deck entries into stable runtime card instances.
- [x] Preserve source deck text.
- [x] Store parsed deck structure.
- [x] Store catalog version/hash used for validation.
- [x] Persist deck snapshots in MongoDB.
- [x] Add tests that runtime card instance IDs are stable for audit/log correlation.

## 8. Match And Game Setup

- [x] Create best-of-3 match model.
- [x] Create player seat model.
- [x] Generate anonymous player tokens.
- [x] Create game model.
- [x] Implement game 1 starting-player chooser by seeded RNG.
- [x] Implement game 2/3 chooser as previous game loser.
- [x] Implement starting player choice intent.
- [x] Implement battlefield commit.
- [x] Implement battlefield reveal after both players lock.
- [x] Enforce used battlefield cannot be reused by same player.
- [x] Shuffle main decks with seeded RNG.
- [x] Shuffle rune decks with seeded RNG.
- [x] Place Legend, Champion, Main Deck, Rune Deck, and Battlefields into zones.
- [x] Draw opening hands.
- [x] Implement zero-card mulligan for first acceptance scenario.
- [x] Add setup tests.

## 9. Seeded RNG And Events

- [x] Add `seedrandom`.
- [x] Store string seed.
- [x] Store `rngAlgorithm: "seedrandom"`.
- [x] Track `rngStep`.
- [x] Log every random operation purpose.
- [x] Log every random operation result.
- [x] Add game-log event tests for chooser selection and deck shuffles.
- [x] Add game-log event tests for simultaneous Main Deck recycle ordering.

## 10. Visibility Projections

- [x] Define canonical state shape.
- [x] Define viewer projection shape.
- [x] Hide opponent hand identities.
- [x] Hide main deck order.
- [x] Hide rune deck order.
- [x] Show public trash and banishment.
- [x] Show face-up board objects.
- [x] Model facedown slots as battlefield sub-objects.
- [x] Show facedown identity only to controller.
- [x] Show mulligan lock state without selected count or identities.
- [x] Add projection tests for both players.

## 11. Basic Board UI

- [x] Build app shell with game board route.
- [x] Replace static fixture-only home page with fixed Annie/Lux deck selection.
- [x] Add opponent area.
- [x] Add shared battlefield area.
- [x] Add player base/board area.
- [x] Add player hand area.
- [x] Add legend and champion zones.
- [x] Add deck, rune deck, trash, and banishment zones.
- [x] Add score display.
- [x] Add current turn and phase indicator.
- [x] Add priority and focus indicator.
- [x] Add hidden/private placeholders.
- [x] Render card images from `media.image_url`.
- [x] Keep preview functional and not driven by screenshot-only details.
- [x] Add temporary action-zone buttons for chain, banish, and game log.
- [x] Mirror opponent/player board structure.
- [x] Render player-selected and opponent-selected battlefield zones separately.
- [x] Use local card back art for hidden/non-visible cards.
- [x] Use neutral, subtle zone labels in mirrored player areas.
- [x] Render board from viewer-safe `GameProjection` instead of component-only fixture arrays.
- [x] Resolve projected card instance IDs to catalog card media for visible cards.
- [ ] Add responsive layout checks for desktop and mobile.

## 12. First Gameplay Intents

- [x] Define Zod schema for `POST /api/matches/:matchId/intents`.
- [x] Implement HTTP intent route that validates token, match, game, payload, and state version.
- [x] Implement pure intent-handling service shared by HTTP now and Socket.IO later.
- [x] Persist accepted intent game snapshots.
- [x] Append accepted intent game-log events.
- [x] Return viewer-safe projection and log entries from accepted intents.
- [x] Return stable rejection response without mutating state or events.
- [x] Implement recycle action/event.
- [x] Recycle Main Deck cards to the bottom of their owner's Main Deck.
- [x] Randomize simultaneous 2+ card Main Deck recycle order with seeded RNG.
- [x] Recycle Runes to the bottom of their owner's Rune Deck.
- [x] Intentionally randomize simultaneous 2+ Rune Deck recycle order with seeded RNG.
- [x] Implement draw intent/action.
- [x] Implement channel intent/action.
- [x] Implement pass priority/focus intent.
- [x] Implement end turn intent.
- [x] Add canonical per-player rune pool state.
- [x] Add canonical visible card exhaustion state.
- [x] Implement manual Rune-to-Energy resource generation.
- [x] Implement manual Rune-to-Power resource generation.
- [x] Implement structured cost model for metadata Energy and Power requirements.
- [x] Implement automatic `playCard` payment from rune pool and ready Runes.
- [x] Implement supported Unit play from hand/champion zone to base.
- [x] Reject unsupported immediate play text, additional costs, and unsupported card types before mutation.
- [x] Enforce state version checks.
- [x] Reject unsupported card behavior at intent time.
- [x] Keep state unchanged on rejected intents.
- [x] Add tests for draw visibility.
- [x] Add tests for channel.
- [x] Add tests for Recycle ordering rules.
- [x] Add tests for end turn.
- [x] Add tests for rune-pool resource generation.
- [x] Add tests for automatic cost payment and supported card play.

## 12A. Complete Rune Pool And Payment System

- [x] Replace flat `PaymentPlan` with resource costs, resource payments, non-resource costs, selected modes, optional costs, and applied modifiers.
- [x] Represent Power costs as requirements payable by one or more domains or by any domain.
- [x] Add Rainbow Power to rune-pool state and payment validation.
- [ ] Support multi-domain Power payment, using `Defiant Dance` as a fixture.
- [x] Prefer domain-specific Power before Rainbow Power during auto-payment.
- [x] Use card metadata domain order for multi-domain Power auto-payment.
- [x] Spend rune-pool resources before auto-exhausting or auto-recycling Runes.
- [x] Auto-exhaust ready Runes for missing Energy in deterministic board order.
- [x] Auto-recycle matching Runes for missing Power in deterministic board order.
- [x] Intentionally randomize the bottom-deck order when any simultaneous Rune recycle recycles 2 or more Runes.
- [x] Log seeded RNG operations for multi-Rune auto-payment recycle order.
- [x] Expose regular legal play/payment mode in viewer-safe projection.
- [x] Wire selected payment mode through `game.playCard` intent.
- [ ] Expose legal play/payment modes in viewer-safe projection, including regular play and optional additional-cost modes.
- [ ] Support selected optional additional-cost modes such as Accelerate and Repeat.
- [ ] Enforce Repeat as a once-only optional additional cost.
- [ ] Treat Deflect on spells as mandatory additional Power cost.
- [ ] Allow ability flows that target Deflect objects to opt out before payment when the rules permit cancellation.
- [ ] Add canonical computed temporary cost modifiers for ignore-cost effects, increases, discounts, and modified object costs.
- [ ] Let player intent supply non-resource cost order only when order can affect legality or outcome.
- [ ] Apply non-resource costs in canonical engine order when order is not material.
- [ ] Reject payment plans that would make already-chosen play placement, targets, or later required legality checks fail.
- [ ] Keep Add-Reaction opportunities during payment intentionally unsupported.
- [ ] Add tests for Bellows Breath regular vs Repeat payment modes.
- [x] Add tests for multi-domain Power payment and Rainbow fallback.
- [x] Add tests for simultaneous multi-Rune recycle randomization.

## 13. Event Log Panel

- [x] Derive human-readable log entries from canonical events.
- [x] Add event log UI panel.
- [x] Show setup events.
- [x] Show draw/channel/pass/end-turn events without leaking hidden identities.
- [x] Show rejected intent feedback separately from accepted event log.
- [x] Add game-log projection tests.

## 14. Showdown Shell

- [x] Keep showdown engine shell available for tests and later integration.
- [ ] Defer player-facing showdown UI and full showdown play flow until after the non-showdown playable MVP.
- [x] Detect supported movement into empty battlefield.
- [x] Enter showdown state.
- [x] Establish relevant players.
- [x] Establish focus.
- [x] Establish priority.
- [x] Track pass sequence.
- [x] Close showdown after all relevant players pass.
- [x] Reject Action/Reaction play during showdown as unsupported.
- [x] Add Annie vs Lux scripted acceptance test through showdown close.

## 15. First End-To-End Acceptance

- [ ] Replace the first playable acceptance path with a no-upload Annie/Lux deck-selection path that does not require player-facing mulligan or showdown.
- [x] Validate Annie and Lux decks.
- [x] Create best-of-3 match.
- [x] Select and reveal battlefields.
- [x] Choose starting player.
- [x] Shuffle decks.
- [x] Draw opening hands.
- [x] Mulligan zero cards for both players.
- [x] Resolve first turn channel and draw.
- [x] Play one simple supported unit.
- [x] Advance turns until the played unit is ready.
- [x] Reject movement by exhausted units.
- [x] Move a ready unit to an empty battlefield and exhaust it as the Standard Move cost.
- [x] Enter showdown shell.
- [x] Both players pass.
- [x] Close showdown.
- [x] Confirm game-log audit trail for the scenario.
- [x] Confirm both player projections preserve hidden information.

## 15A. No-Upload Playable MVP Path

- [x] Expose only fixed deck choices: Annie and Lux.
- [x] Create a persisted match from selected fixed decks.
- [ ] Auto-complete non-player-facing setup steps required to start the game, including zero-card keep for mulligan until mulligan UI is implemented.
- [x] Return both player tokens for local/manual testing.
- [x] Return viewer-safe projections and game-log entries from match creation.
- [x] Connect the UI to the match creation API.
- [ ] Let the UI submit gameplay intents through the HTTP intent API.
- [ ] Support visible controls for channel, draw, add Rune resources, play supported cards, pass, and end turn.
- [ ] Keep movement-to-showdown unavailable from the default UI until showdown is brought back into scope.
- [ ] Add an end-to-end Annie/Lux service test for setup through non-showdown gameplay.

## 16. Deferred Socket Multiplayer

- [ ] Validate player token on `match:join`.
- [x] Join socket to match room and player-specific viewer context.
- [ ] Broadcast viewer-specific `match:state`.
- [ ] Broadcast viewer-safe `match:events`.
- [ ] Return latest projected state on reconnect.
- [x] Reject invalid join attempts with `match:error`.
- [ ] Add socket tests or integration smoke checks.
