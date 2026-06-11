# Hextech Project Resume

## Purpose

Hextech is a backend project for building a **server-authoritative simulator engine** for the Riftbound Trading Card Game.

The project is not primarily trying to build a visual game client. Its main goal is to implement the rules, state model, and match lifecycle needed to run Riftbound games programmatically in a deterministic and rules-correct way.

At a high level, Hextech should become the core engine that future clients, replay tools, AI agents, deck testing tools, and debugging tools can all use.

## Core Idea

The project follows a server-authoritative model:

1. The server owns the canonical match and game state.
2. Clients never mutate game state directly.
3. Players submit intents, such as setup choices or future gameplay actions.
4. The engine validates whether those intents are legal.
5. Legal intents are resolved into deterministic state transitions.
6. State changes are eventually expected to be logged as events.
7. The public game view is projected from the authoritative state according to visibility rules.

This model is important because a trading card game engine needs to be consistent, replayable, secure for multiplayer, and suitable for automated testing.

## What The Project Is Trying To Accomplish

The long-term objective is to build a deterministic Riftbound rules engine that can:

- Validate legal deck construction using local card data.
- Create matches in supported formats such as best-of-1 and best-of-3.
- Run the complete pre-game setup flow.
- Maintain authoritative game state across players, zones, turns, and phases.
- Enforce zone movement rules and card visibility rules.
- Accept player gameplay intents instead of direct state mutation.
- Validate those intents against the official rules.
- Resolve legal actions into state changes.
- Support turn order, priority, focus, chain resolution, combat, and showdowns.
- Support deterministic randomness through seeded RNG.
- Produce event logs that can reconstruct or replay a match.
- Provide stable API and socket surfaces for future clients.

In short, the project is building the backend foundation for digital Riftbound play and simulation.

## Current Implementation Status

The current codebase already implements a meaningful foundation, especially around match creation, deck validation, setup, zones, and visibility projection.

### Backend Stack

The project is written in TypeScript and runs on Node.js.

Current runtime pieces include:

- Express HTTP API.
- Socket.IO server registration.
- In-memory match repository.
- In-memory game repository.
- Node test runner via `tsx`.

The server currently exposes routes for deck validation, match creation, match reads, setup intents, and game result reporting.

### Deck Validation

Deck validation is implemented in the domain layer.

The validator parses text deck lists and checks that they satisfy the expected Riftbound deck structure:

- Exactly one Champion Legend.
- Exactly one chosen Champion unit.
- A main deck with the required minimum size.
- A rune deck with exactly 12 rune cards.
- A Battlefields section with exactly 3 battlefields.
- No invalid duplicate entries where prohibited.
- Copy limits for main deck and sideboard pools.
- Signature card limits.
- Card type checks against the local catalog.
- Champion tag compatibility with the Champion Legend.
- Domain identity constraints.

The validator also builds runtime deck snapshots. These snapshots expand deck list entries into concrete card instances with stable IDs so game state can track specific cards instead of only card names.

### Card Catalog

Card data lives under `data/sets`.

The local catalog is used by deck validation and runtime setup to resolve card names, card types, public card codes, domains, tags, and other metadata needed by the engine.

This means the server is already treating card data as an authoritative input for rules validation instead of relying only on client-submitted payloads.

### Match Lifecycle

The project models matches separately from games.

A match tracks:

- Match ID.
- Format, such as `best-of-1` or `best-of-3`.
- Match status.
- Two players.
- Game IDs.
- Current game ID.
- Match score.
- Starting player chooser.
- Registered decks by player.
- Battlefield pools by player.
- Winner.
- Version and timestamps.

A game tracks:

- Game ID.
- Parent match ID.
- Game number.
- Game status.
- Gameplay runtime state.
- Runtime deck state by player.
- Chosen champions.
- Selected battlefields.
- Starting player.
- Winner.
- Result timestamp.
- Version and timestamps.

This separation allows the project to support best-of-3 behavior, multiple games inside one match, match score tracking, and future sideboarding or setup changes between games.

### Match Setup Flow

The current setup flow is one of the strongest implemented areas.

After a match is created, the current game starts in `setup_pending`.

Players then submit setup intents:

- Select or confirm chosen champion.
- Select battlefield.
- Select starting player.

The setup system enforces rules such as:

- Setup can only happen while the match and game are pending setup.
- Each setup choice can only be submitted once per player where applicable.
- The acting player must belong to the match.
- Best-of-1 battlefield selection is randomized from the registered battlefield pool.
- Best-of-3 battlefield selection must be provided and must come from that player's registered pool.
- Used battlefields cannot be reused by that player in the same match.
- Only the chosen starting-player chooser can select the starting player.
- Deck reconfiguration is only allowed in best-of-3 from game 2 onward.
- Reconfiguration can only swap cards among Champion, Main Deck, and Sideboard.
- Legend, Runes, and Battlefields must remain unchanged during reconfiguration.

When setup is complete, the game moves to `ready`, the match moves to `ready`, and gameplay zones are hydrated.

### Gameplay Runtime And Zones

The current gameplay runtime models the zone structure that future gameplay will use.

Canonical zones include:

- `main_deck`
- `hand`
- `trash`
- `banishment`
- `rune_deck`
- `legend_zone`
- `champion_zone`
- `base`
- `battlefield`
- `chain`
- `facedown`

Each player has their own zone buckets for private and player-owned areas. Shared zones exist for battlefields, hidden battlefield cards, and the chain.

The current implementation includes:

- Empty runtime creation for players.
- Setup hydration into runtime zones.
- Zone policy definitions.
- Zone privacy and visibility metadata.
- Zone placement primitives.
- Zone movement primitives.
- Validation for zone invariants and illegal movement.
- Hidden card projection for zones that should not be fully visible to the viewer.

This gives the project a strong base for future gameplay mechanics because all cards already have a place in the authoritative runtime state.

### Visibility And Public Match Views

The server does not expose all internal data directly.

Private implementation state such as registered deck lists and full deck state is removed from public match responses. Gameplay zones are projected according to the requesting viewer.

For example:

- Public zones can expose card IDs.
- Owner-private zones can expose card IDs only to the owning player.
- Secret or hidden zones are represented with hidden card tokens.
- Facedown battlefield cards are visible only to the controlling player.

This is important for a future multiplayer client because hidden information must be protected by the server, not trusted to the frontend.

### API Surface

The current HTTP API includes:

- `POST /api/decks/validate`
- `POST /api/matches`
- `GET /api/matches/:id`
- `POST /api/matches/:id/setup/champion`
- `POST /api/matches/:id/setup/battlefield`
- `POST /api/matches/:id/setup/starting-player`
- `POST /api/matches/:id/games`

The API currently supports deck validation, match creation, setup completion, match projection, and game result reporting.

Socket.IO is present with basic match room joining, but real-time match event broadcasting is not yet the main implemented feature.

### Tests

The repository has focused tests around the current engine foundation.

The test suite covers areas such as:

- Deck validation.
- Card catalog contract behavior.
- Match creation.
- Match reads and projections.
- Setup intent validation.
- Setup authorization and one-time intent behavior.
- Best-of-1 and best-of-3 result flows.
- Gameplay runtime shape.
- Setup hydration.
- Zone policy contracts.
- Zone movement and transition behavior.
- Battlefield history across games.
- API smoke behavior.

The tests show that the project is being built around contract-style guarantees rather than only manual testing.

## What Is Not Built Yet

Several important parts are intentionally not complete yet.

The project does not yet appear to implement the full playable Riftbound engine. Major pending areas include:

- Deterministic seeded RNG policy.
- Full turn kernel.
- Detailed phase progression.
- Timing state transitions.
- Priority and focus engine.
- Mulligan flow.
- Draw and channel actions.
- Playing cards to the chain.
- Chain lifecycle and resolution.
- Spell and ability resolution.
- Combat and showdown lifecycle.
- Damage resolution.
- State-based effects.
- Victory condition enforcement.
- Complete event log and replay system.
- Persistent database storage.
- Full multiplayer synchronization.
- Full card text runtime.
- AI players.
- User-facing game client.

The current architecture is being prepared for these systems, but they are not fully implemented yet.

## Architectural Boundaries

The project documentation defines clear boundaries between major responsibilities.

### Game Engine

The engine should own rules and state transitions.

It should be deterministic, replayable, and independent of UI or transport concerns.

### Match Server

The match server should orchestrate matches, expose APIs, coordinate sessions, persist logs in the future, and call into the engine.

It should not implement rules directly when those rules belong in the engine.

### Card Runtime

The card runtime will eventually interpret card text, abilities, keywords, targeting, triggers, and effects.

This layer is important because individual card text can override base rules through Riftbound's Golden Rule behavior.

### Web Client

The future client should render state, send player intents, and animate outcomes.

It should not decide action legality, resolve effects, mutate authoritative state, or reveal hidden information.

## Design Direction

The project is moving toward an intent-driven engine.

Instead of exposing low-level mutation operations to clients, the eventual gameplay API should accept high-level player intents such as:

- Advance step.
- End action phase.
- Draw.
- Channel.
- Play card.
- Pass priority.
- Select target.
- Move unit.
- Commit to combat.
- Resolve showdown.
- Activate ability.

The engine should validate these intents, resolve them deterministically, update game state, and append events to the match log.

This direction keeps the server authoritative and makes match replay possible.

## Why Determinism Matters

Determinism is central to the project.

For the same initial state and the same ordered list of accepted inputs, the engine should always produce the same resulting state.

That property enables:

- Replay viewers.
- Debugging exact match histories.
- Automated rules tests.
- AI simulations.
- Tournament integrity.
- Desync detection between server and clients.

Random effects should eventually use seeded RNG, and random choices should be represented in the event log so matches can be reconstructed.

## Future Use Cases

Once the core engine is complete, Hextech can support several products or tools:

- A multiplayer Riftbound client.
- A local rules simulator.
- A replay viewer.
- Deck testing and matchup analysis.
- AI agents that play games through legal intents.
- Automated regression tests for rule changes.
- Debug tools for inspecting game state.
- Tournament or match management systems.

These use cases all depend on the same foundation: a trustworthy server-side rules engine.

## Summary

Hextech is building the backend core for digital Riftbound simulation.

The current project already handles deck validation, match creation, setup flow, zone modeling, visibility projection, and early match/game lifecycle behavior. The next major work is to expand this foundation into a true gameplay engine with deterministic turn progression, legal gameplay intents, priority/focus handling, card play, combat, showdown resolution, event logging, and replay support.

The long-term value of the project is that all future clients and tools can rely on one authoritative rules engine instead of duplicating game logic across separate applications.
