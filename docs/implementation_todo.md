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
- [ ] Add game-log event tests for simultaneous Main Deck recycle ordering.

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
- [ ] Add responsive layout checks for desktop and mobile.

## 12. First Gameplay Intents

- [x] Define Zod schema for `POST /api/matches/:matchId/intents`.
- [x] Implement HTTP intent route that validates token, match, game, payload, and state version.
- [x] Implement pure intent-handling service shared by HTTP now and Socket.IO later.
- [x] Persist accepted intent game snapshots.
- [x] Append accepted intent game-log events.
- [x] Return viewer-safe projection and log entries from accepted intents.
- [x] Return stable rejection response without mutating state or events.
- [ ] Implement recycle action/event.
- [ ] Recycle Main Deck cards to the bottom of their owner's Main Deck.
- [ ] Randomize simultaneous 2+ card Main Deck recycle order with seeded RNG.
- [ ] Recycle Runes to the bottom of their owner's Rune Deck.
- [ ] Preserve owner-chosen order for simultaneous 2+ Rune Deck recycle.
- [ ] Implement draw intent/action.
- [ ] Implement channel intent/action.
- [ ] Implement pass priority/focus intent.
- [ ] Implement end turn intent.
- [ ] Enforce state version checks.
- [ ] Reject unsupported card behavior at intent time.
- [ ] Keep state unchanged on rejected intents.
- [ ] Add tests for draw visibility.
- [ ] Add tests for channel.
- [ ] Add tests for Recycle ordering rules.
- [ ] Add tests for end turn.

## 13. Event Log Panel

- [ ] Derive human-readable log entries from canonical events.
- [x] Add event log UI panel.
- [ ] Show setup events.
- [ ] Show draw/channel/pass/end-turn events without leaking hidden identities.
- [ ] Show rejected intent feedback separately from accepted event log.
- [ ] Add game-log projection tests.

## 14. Showdown Shell

- [ ] Detect supported movement into empty battlefield.
- [ ] Enter showdown state.
- [ ] Establish relevant players.
- [ ] Establish focus.
- [ ] Establish priority.
- [ ] Track pass sequence.
- [ ] Close showdown after all relevant players pass.
- [ ] Reject Action/Reaction play during showdown as unsupported.
- [ ] Add Annie vs Lux scripted acceptance test through showdown close.

## 15. First End-To-End Acceptance

- [ ] Validate Annie and Lux decks.
- [ ] Create best-of-3 match.
- [ ] Select and reveal battlefields.
- [ ] Choose starting player.
- [ ] Shuffle decks.
- [ ] Draw opening hands.
- [ ] Mulligan zero cards for both players.
- [ ] Resolve first turn channel and draw.
- [ ] Play one simple supported unit.
- [ ] Move a unit to an empty battlefield.
- [ ] Enter showdown shell.
- [ ] Both players pass.
- [ ] Close showdown.
- [ ] Confirm game-log audit trail for the scenario.
- [ ] Confirm both player projections preserve hidden information.

## 16. Deferred Socket Multiplayer

- [ ] Validate player token on `match:join`.
- [x] Join socket to match room and player-specific viewer context.
- [ ] Broadcast viewer-specific `match:state`.
- [ ] Broadcast viewer-safe `match:events`.
- [ ] Return latest projected state on reconnect.
- [x] Reject invalid join attempts with `match:error`.
- [ ] Add socket tests or integration smoke checks.
