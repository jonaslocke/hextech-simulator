# Project Handoff

Snapshot date: 2026-07-09

## 1. Project Overview

Hextech Simulator is a server-authoritative simulator for the Riftbound trading
card game.

The server owns canonical game state, legal actions, hidden information, game
transitions, and persisted events. The client receives a viewer-specific
projection and submits player intents rather than mutating game state directly.

The application currently has three main product areas:

1. A local two-player match simulator using the Lux and Annie decks.
2. An online matchmaking flow for connecting independent players into a shared persisted match.
3. An admin card-catalog workflow for importing card data, reviewing suggested
   behavior models, and publishing approved canonical cards.

Important domain concepts include:

- Unique runtime instances for every physical card.
- Separate printed card definitions and runtime card state.
- Server-projected legal actions.
- Distinct Focus and Priority systems.
- Reusable behavior primitives instead of card-name-specific engine branches.
- Persisted pending choices for player selections and ordering.
- Viewer-specific projection of private and secret information.
- Riftbound's Golden Rule: card text supersedes base rules.

## 2. Current Implementation Status

The repository currently implements:

- MongoDB persistence for matches, games, deck snapshots, game events,
  canonical cards, and behavior definitions.
- Player-token hashing and viewer authorization.
- State-version checks for stale action requests.
- Match creation with Lux or Annie assigned independently to each seat.
- Battlefield selection, starting-player selection, and mulligan.
- Turn phases and start/end-of-turn processing.
- Rune resources, payment calculation, discounts, conditional Energy, and
  Deflect costs.
- Unit and spell play, target validation, Chains, Focus, and Priority.
- Combat and non-combat Showdowns.
- Combat damage assignment, Tank ordering, Assault, Shield, control, scoring,
  and victory.
- Trigger collection, simultaneous trigger ordering, delayed effects, and
  resumable effect resolution.
- Card selection from visible non-board zones such as Hand and Trash.
- Vision with private reveal and empty-selection "Keep on top" behavior.
- Viewer-safe projections for zones, pending choices, legal actions, and logs.
- Card text presentation for keywords and resource notation.
- Board-location drag-and-drop for viewer-controlled Units and Champion-zone
  cards, resolved from server-projected legal actions.
- Drag-to-Battlefield Unit movement drafts that preselect the dragged Unit,
  allow additional eligible Units to be clicked, and submit through the existing
  move or moveMany action path only after confirmation.
- Staged movement feedback and destination highlighting while a movement draft
  is open, without optimistic board mutation.
- Champion drag-to-play from the Champion zone to legal Base or Battlefield
  destinations through the existing play and target-selection flow.
- Admin card-set JSON import, behavior suggestion, behavior editing,
  validation, and canonical card publication.

The current match model contains one game. `gameNumber` is projected as `1`,
and the match document does not contain best-of-three score or sideboarding
state.

The browser simulator receives both player seats and allows the user to switch
viewpoints. It does not provide independent player sessions or automatic
realtime synchronization.

### Player Decision System

Player decisions are represented by the `PlayerDecisionRequest` union in
`src/features/game-board/decisions/player-decision-types.ts`.

The supported request kinds are:

- `cardSelection`
- `optionDecision`
- `orderedDecision`
- `combatDamage`
- `pendingDecision`

`src/features/game-board/decisions/use-player-decision-request.ts` maps the
current projection and active interaction into one decision request.

`src/features/game-board/decisions/player-decision-host.tsx` selects the prompt
component and returns a `PlayerDecisionIntent` through the existing action
submission contract.

The following decisions currently pass through this system:

- Vision.
- Hand and Trash card choices.
- Other visible non-board card selections.
- Trigger ordering.
- Combat damage assignment.
- Waiting feedback for opponent-owned choices.

Setup decisions use `CardSelectionPrompt` directly from
`src/features/match-simulator/components/match-simulator.tsx`.

`GameBoard` also directly renders:

- `TargetSelectionPrompt` for specialized board-card targeting.
- `ChoiceDialog` for Battlefield target selection.
- `ChoiceDialog` for Unit destination selection.

`OptionDecisionPrompt` is available in the host, but the current decision
mapper does not produce an `optionDecision` request.

### GameBoard Feature Architecture

`src/features/game-board/game-board.tsx` has been refactored into a board
orchestrator. It remains the main integration point for `GameProjection`, board
layout rendering, overlay wiring, root action submission, and player-decision
host wiring, but most derived model building and interaction-state ownership now
lives in feature-local modules.

Current game-board responsibilities are split as follows:

- `game-board.tsx`: orchestrates projection adaptation, hook composition,
  action submission, overlays, prompts, and board layout rendering.
- `board-view-model.ts`: adapts the transport `GameProjection` into a
  board-oriented projection.
- `board-model.ts`: builds board-facing player, battlefield, zone, and card
  models from the adapted projection.
- `board-animation-model.ts`: derives card-zone transfer placements and zone
  counts for movement animation overlays.
- `components/*`: renders board-specific UI, including player boards,
  battlefields, zones, hand fan, overlays, prompts, `CardActionMenu`, and
  `RunePoolBar`.
- `interactions/*`: owns UI interaction subsystems such as card action menu
  state, chain overlay state, board-location drag state, board target selection,
  and game-board action orchestration.
- `decisions/*`: owns the Player Decision System prompts, mapper, request
  types, and intent conversion.
- `drag-and-drop/*`: owns board-location drag primitives, DnD provider wiring,
  draggable wrappers, semantic board-location helpers, legal-drop resolution,
  drop-status helpers, and droppable registration helpers.

### Board-location drag/drop architecture

Board-location drag/drop is an interaction layer over projected legal actions.
It must not mutate board state optimistically and must not invent a client-side
movement or play contract.

The current drag/drop model is:

```text
LocationDragProvider
  -> DraggableLocationCard source data
  -> useBoardLocationDragState
  -> location-drag-actions.ts legal drop resolution
  -> useGameBoardActions submit handler
  -> submitProjectedAction(action.id, selectedIds)
  -> server validation and projection refresh
```

Important ownership boundaries:

- `CardTile` remains visual. It can display drag-related visual states such as
  staged movement, but it should not own DnD registration or action resolution.
- `DraggableLocationCard` owns `useDraggable` registration and the source data
  for board-location drags.
- `useBoardLocationDroppable` owns `useDroppable` registration for a semantic
  board location. Multiple visual surfaces may map to the same semantic
  location.
- `location-drag-actions.ts` owns source type guards, semantic location IDs,
  action-kind detection, legal-drop extraction, drop-status calculation, and
  source/destination action resolution.
- `use-location-drag-state.tsx` owns active drag state, overlay rendering,
  hovered drop state, and drag-end dispatch to accepted move/play handlers.
- `use-game-board-actions.tsx` owns the accepted drop handlers and translates a
  resolved projected action into the existing play, move, moveMany, or target
  selection submission path.

Supported source/destination behavior:

- Unit from Base or Battlefield to Base submits a single projected move action
  when legal.
- Unit from Base or Battlefield to a Battlefield starts the existing movement
  draft when a simultaneous moveMany action is available. The dragged Unit is
  preselected, additional legal Units are added or removed by clicking, and the
  draft submits only when the player confirms.
- The movement draft keeps Units in their current rendered zones, shows staged
  movement feedback on selected Units, and keeps the destination location
  highlighted. This is visual feedback only; the server has not moved the Units
  until confirmation.
- Additional Units are intentionally selected by click during a movement draft.
  Starting a second drag while a movement draft or another blocking interaction
  is active should be disabled or ignored.
- Champion-zone cards may be dragged to legal Base or Battlefield play
  destinations. The resolved projected play action continues through the
  existing play or target-selection flow.
- Champion drag does not currently solve the multiple-payment-modes-for-the-same
  destination case. If that appears in real gameplay, treat it as a future
  refinement instead of expanding the current drag/drop contract.
- Invalid drops are visual only and must submit nothing.

Base is visually split into Unit and Rune surfaces, but both surfaces resolve to
`{ kind: "base" }`. This decouples visual hit areas from semantic game
locations and should be preserved for future spatial interactions.

The current refactor direction is to keep `game-board.tsx` as an orchestrator,
not to split files for line count alone. Future extractions should be based on
plausible concerns with a clear owner, and should preserve the existing server
action contract.

## 3. Repository Structure

```text
src/
  app/          Next.js pages, layouts, and HTTP route adapters
  features/     Product and domain UI
  server/       Framework-free backend and game engine
  shared/       Generic UI, shared schemas, and utilities

data/
  catalog/      Generated MVP catalog data
  decks/        Text deck fixtures
  sets/         Local Riftbound card-set JSON

scripts/        Catalog synchronization and runtime reset tools
tests/          Node test-runner tests
docs/           Rules, architecture, audits, and project documentation
skills/         Repository-specific implementation instructions
```

### Application routes

- `src/app/page.tsx` renders the online matchmaking experience.
- `src/app/local/page.tsx` renders the local match simulator.
- `src/app/admin/card-catalog/page.tsx` renders the catalog admin.
- `src/app/api/matches/route.ts` lists playable decks and creates matches.
- `src/app/api/matches/[matchId]/route.ts` returns a viewer projection.
- `src/app/api/matches/[matchId]/intents/route.ts` accepts game actions.
- `src/app/api/admin/card-catalog/preview/route.ts` previews an uploaded set.
- `src/app/api/admin/card-catalog/approve/route.ts` publishes an approved card.

### Feature boundaries

- `src/features/game-board`: board rendering, board-oriented projection/model
  adaptation, interaction subsystems, decisions, prompts, card movement,
  board-location drag/drop, and game-board orchestration.
- `src/features/online-matchmaking`: deck selection, room creation/joining, socket client, and matchmaking UI.
- `src/features/match-simulator`: local match creation, seat switching, API calls,
  and result presentation.
- `src/features/card-catalog`: admin import, review, editing, and publication
  UI.
- `src/features/card-presentation`: domain-aware card text and resource
  rendering.

### Server boundaries

- `src/server/game`: authoritative state, actions, transitions, projections,
  payment, effects, triggers, combat, scoring, and victory.
- `src/server/card-catalog`: behavior discovery, primitive definitions, import
  preview, and canonical publication.
- `src/server/catalog`: source card schemas and local card data.
- `src/server/deck`: deck parsing and validation.
- `src/server/online-matchmaking`: room registry, socket handlers, presence, and matchmaking services.
- `src/server/db`: MongoDB connection and repositories.

Shared transport schemas and DTO types live in `src/shared/game.ts`.

Tests are stored as `tests/*.test.ts`. There is no browser or E2E test
framework.

## 4. Project Instructions and Skills

Repository-specific instruction files:

- `AGENTS.md`
- `docs/architecture.md`
- `skills/player-decision-system-SKILL.md`
- `skills/player-decision-system-plan.md`
- `skills/minimal-testing-discipline-skill.md`
- `skills/shadcn-first-ui-development-SKILL.md`
- `skills/refactor-to-feature-architecture/refactor-to-feature-architecture-SKILL.md`
- `docs/game_definition.md`
- `docs/riftbound_core_rules_reference.md`

No `README.md`, `CONTRIBUTING.md`, or `SKILLS.md` exists. The `.agents`
directory is empty.

### Architecture rules

- Use `src/app`, `src/features`, `src/server`, and `src/shared`.
- Keep pages and route handlers thin.
- Keep business rules and persistence out of UI and route files.
- Server modules must not import React, Next.js, or feature UI modules.
- Put domain-specific UI in its feature.
- Put only generic reusable code in `shared`.
- Use absolute imports across root-level boundaries.
- Use relative imports within a feature when clearer.
- Avoid speculative abstractions and unnecessary barrel files.

### Naming and component rules

- Use kebab-case file names.
- Use PascalCase React component names.
- Use camelCase functions and variables.
- Use UPPER_CASE for fixed constants.
- Prefer one meaningful exported component per file.
- Keep components as Server Components unless browser behavior requires
  `"use client"`.
- Isolate client behavior to the smallest practical component.

### Player decision rules

- New gameplay choices must be represented as `PlayerDecisionRequest`.
- Render decisions through `PlayerDecisionHost`.
- Submit results as `PlayerDecisionIntent`.
- Preserve the current server action payload.
- Keep combat damage specialized.
- Use an empty selected-ID list for Vision's "Keep on top" result.
- Use `CardSelectionPrompt` for general card choices.
- Keep the server projection and projected legal actions as the source of truth.

### UI rules

- Use existing shadcn/Radix primitives for standard application UI.
- Custom UI is appropriate for board, card, spatial, animation, and other
  game-specific interactions.
- Use Tailwind and existing design tokens.
- Preserve accessible labels, focus behavior, and semantic controls.

### Testing rules

- Prefer type safety, focused validation, and manual gameplay testing while
  decision UI is changing.
- Add small deterministic tests for stable mappers, intent builders, type
  guards, and confirmed regressions.
- Do not add broad `GameBoard` integration tests, styling snapshots, or tests
  that encode temporary component structure.
- Preserve existing tests unless a behavior contract has intentionally changed.

### Rules authority

For gameplay behavior, use this authority order:

1. `docs/riftbound_core_rules_reference.md`
2. `docs/deck_validation.md`
3. `data/sets/*.json`
4. `docs/game_definition.md`

## 5. Technical Stack

- Next.js 15 App Router
- React 19
- TypeScript 5.7 with strict mode
- Node.js ES modules
- Tailwind CSS 4
- Radix UI and shadcn-style shared components
- Lucide icons
- Motion for card and zone animations
- Socket.IO for realtime matchmaking and presence
- MongoDB native driver
- Zod schemas and payload validation
- React hooks and local component state
- Node's built-in test runner through `tsx`
- ESLint with Next.js Core Web Vitals and TypeScript rules
- npm with `package-lock.json`

The repository does not use:

- Mongoose
- Redux or another external client state manager
- Jest, Vitest, Playwright, or Cypress

No deployment-platform configuration is present.

## 6. Architecture and Data Flow

The gameplay request flow remains unchanged for both local and online play:

```text
React UI
  -> POST /api/matches/:matchId/intents
    -> performMatchAction
      -> setupActions or gameplayActions
      -> performSetupAction or performGameplayTransition
      -> game subsystems and primitive handlers
      -> MongoDB repositories
      -> projectGame(viewerPlayerId)
    -> viewer-safe GameProjection
  -> board view-model and board model adaptation
  -> GameBoard orchestrator
  -> interaction hooks and PlayerDecisionHost
```

The online matchmaking flow is:

```text
React UI
  -> Socket.IO
    -> room lifecycle
    -> existing Match Service
      -> persisted match
    -> gameCreated(gameId)
  -> navigate to match
  -> existing gameplay HTTP flow
```

Key responsibilities:

- `src/server/game/actions.ts` discovers legal gameplay actions and dispatches
  accepted actions.
- `src/server/game/state.ts` defines canonical state using Zod.
- `src/server/game/projection.ts` produces viewer-safe client projections.
- `src/server/game/behavior-runtime.ts` compiles and executes behavior models.
- `src/server/game/primitive-handlers.ts` implements reusable engine effects.
- `src/server/game/effect-resolution.ts` persists and resumes selections.
- `src/server/game/match-service.ts` coordinates repositories and persistence.
- `src/features/game-board/board-view-model.ts` adapts transport projections to
  board-oriented projection data.
- `src/features/game-board/board-model.ts` builds board-facing player,
  battlefield, zone, and card models.
- `src/features/game-board/board-animation-model.ts` derives card-zone transfer
  animation placements and zone counts.
- `src/features/game-board/game-board.tsx` orchestrates board rendering,
  overlays, interaction hooks, root action submission, and decision host wiring.
- `src/features/game-board/interactions/*` owns feature-local UI interaction
  state and action orchestration without moving legality or validation into
  React.

The server persists a deck snapshot for each player. The snapshot contains the
approved card definitions and unique runtime instances used by the match.

The browser stores the currently loaded match and viewer projection in React
state. It does not own rules state.

## 7. Current Feature Capabilities

### Online matchmaking

Users can:

- Load playable decks from `GET /api/matches`.
- Select any supported deck.
- Create a room.
- Join a room using a room code.
- Start a persisted match when the second player joins.
- Play from independent browser sessions.

Rooms are in-memory matchmaking objects and are not persisted.

### Local match simulator

Users can:

- Select Lux or Annie for each player.
- Create a persisted match.
- Switch between Player 1 and Player 2.
- Submit projected actions.
- See the winner when a game completes.

The local simulator continues to support seat switching for development and testing. Independent multiplayer is provided by the Online Matchmaking feature.

### Setup

Users can:

- Select and lock Battlefields.
- Wait for both Battlefield choices to be revealed.
- Select the starting player when authorized.
- Mulligan zero, one, or two opening-hand cards.

The server rejects unauthorized actions and illegal selected IDs.

### Board and interaction UI

The UI supports:

- Hands, Main Decks, Rune Decks, Trash, Banishment, Champion and Legend zones,
  Bases, Battlefields, facedown slots, and the Chain.
- Card previews and hand fan behavior.
- Movable temporary-zone overlays.
- Context actions and target highlighting.
- Card movement animations.
- Unit play to Base or a controlled Battlefield.
- Unit movement and Showdown initiation.
- Rune actions, payment previews, and target selection.
- Board-location drag state and drop feedback built around projected legal
  actions.
- Drag/drop movement of viewer-controlled Units between Base and legal
  Battlefields, including Battlefield-to-Base returns and legal
  Battlefield-to-Battlefield movement.
- Drag-to-Battlefield movement drafts that preselect the dragged Unit and allow
  additional eligible Units to be clicked before confirming the moveMany flow.
- Staged movement visual feedback for selected Units during an unsubmitted
  movement draft.
- Champion-zone drag to legal Base or Battlefield play destinations through the
  existing play flow.
- Viewer-specific hidden information.

### Game engine

The engine supports:

- Action and Reaction timing.
- LIFO Chain resolution.
- Focus and Priority.
- Trigger batching and player-selected ordering.
- Resumable card selections.
- Vision, drawing, discarding, readying, damage, killing, returning cards, and
  moving Units.
- Numeric and duration-based modifiers.
- Combat assignment and core combat keywords.
- Hold and Conquer scoring.
- Variable victory requirements.

Runtime availability is limited to cards whose approved snapshots compile
against executable primitives.

### Card catalog admin

The admin can:

- Upload a set JSON file.
- Preview normalized card identities.
- Generate suggested behavior clauses.
- Compare uploaded cards with persisted canonical cards.
- Edit clauses, primitive assignments, parameters, and notes.
- Publish approved canonical cards.

Unsupported, ambiguous, stale, or malformed behavior definitions are rejected.
The admin endpoints currently have no authentication or authorization.

## 8. Important Existing Patterns

### Thin route adapters

Route handlers parse and validate requests, call server services, and translate
errors into HTTP responses. They do not implement game rules.

Example:

- `src/app/api/matches/[matchId]/intents/route.ts`

### Shared Zod contracts

`src/shared/game.ts` defines transport schemas and inferred TypeScript types for:

- Actions
- Targets
- Intents
- Card projections
- Player projections
- Pending choices
- Full game projections

### Legal-action projection

The server projects opaque action IDs and legal target IDs. The client renders
those actions without knowing card-specific rules.

### Canonical pending choices

Selections and ordering windows live in canonical game state. They are not
represented only by browser modal state.

### Data-driven card behavior

Canonical cards reference ordered reusable behavior bindings. Runtime handlers
execute those bindings without card-name checks.

### Decision mapper and host

The pure `buildPlayerDecisionRequest` function maps current state to one
decision. The host converts prompt results into the existing intent shape.

### GameBoard orchestrator pattern

`GameBoard` should compose feature-local subsystems rather than own every board
concern directly. Model derivation belongs in `board-view-model.ts`,
`board-model.ts`, or similarly focused pure modules. Visual UI belongs in
`components/*`. Transient UI behavior belongs in `interactions/*`. Gameplay
legality, payment, target validation, and effect resolution remain server-owned.

### Board-location drag/drop pattern

Drag/drop is a UI shortcut for choosing already projected actions. The source of
truth remains the server projection.

When adding or changing drag/drop behavior:

- Resolve drops by matching source card, source location, and semantic
  destination to a projected action.
- Submit only the projected action ID and selected IDs expected by the existing
  intent contract.
- Keep visual hit surfaces independent from semantic board locations.
- Keep DnD registration in `drag-and-drop/*` helpers and component wrappers, not
  inside `CardTile`.
- Use target selection for staged or multi-card decisions instead of submitting
  partial client-side state.
- Disable or ignore new drags while target selection, player decisions, pending
  choices, unit-destination dialogs, chain-locked windows, or action submission
  are active.
- Preserve hover-preview suppression while a location drag is active.
- Preserve animation snapshot capture before submissions that move or play
  cards, including target-selection confirmations.

The current extracted interaction hooks are:

- `use-card-action-menu.ts`
- `use-chain-overlay-state.ts`
- `use-location-drag-state.tsx`
- `use-board-target-selection.ts`
- `use-game-board-actions.tsx`

`use-game-board-actions.tsx` centralizes card, rune, board-card, and global
action orchestration. It should be monitored so it does not become a new
monolithic replacement for `game-board.tsx`.

### Testing

Tests use:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
```

Fixtures are direct TypeScript objects. Tests focus on deterministic engine,
schema, mapper, and repository behavior.

### Styling

The UI uses Tailwind classes, a dark tabletop theme, glass-like overlays, cyan
for general decisions, and amber for combat or urgent waiting states.

## 9. Constraints and Non-Negotiables

Future work must not:

- Move legality, payment, target validation, or effect resolution into React.
- Trust submitted targets or allocations without server validation.
- Expose canonical hidden state in client projections.
- Add card-name-specific branches to the game engine.
- Put business logic directly in `app/api`.
- Put game-specific components in `shared`.
- Bypass the Player Decision System for new gameplay decisions.
- Convert combat damage into generic card selection.
- Add a synthetic Vision "keep-on-top" option.
- Change the player intent payload without an explicit contract change.
- Implement drag/drop as a client-side board mutation or custom action payload.
- Add drag/drop behavior that bypasses projected legal actions or server
  validation.
- Make `CardTile` own DnD registration or action resolution.
- Replace the movement draft click-to-add flow with speculative multi-card drag
  semantics without an explicit UX and rules contract.
- Treat imported but unapproved card behavior as gameplay-ready.
- Collapse extracted game-board concerns back into `game-board.tsx` without a
  clear reason.
- Split game-board files only to reduce line count when the extracted concern
  does not have a clear owner.
- Add broad UI integration tests for unstable decision surfaces.

## 10. Risks, Gaps, and Open Questions

- `src/features/game-board/game-board.tsx` has been reduced to an orchestrator
  of roughly 680 lines in the current refactor baseline. Future game-board
  changes should preserve the orchestrator direction and avoid artificial
  extraction.
- `src/features/game-board/interactions/use-game-board-actions.tsx` is the
  largest board interaction hook. It is a valid action-orchestration concern,
  but it should not grow into a second monolith.
- `src/server/game/actions.ts`,
  `src/features/card-catalog/components/card-catalog-import-preview.tsx`, and
  `CardSelectionPrompt` are also large files.
- Some choices are centralized through `PlayerDecisionHost`, while specialized
  board targets, Battlefield targets, Unit destinations, and setup decisions
  use separate rendering paths.
- Match updates use a state-version check followed by repository upserts rather
  than an atomic compare-and-update transaction. Concurrent multiplayer
  requests require additional protection.
- Both player tokens are returned to the creating browser.
- Admin publication routes are unauthenticated.
- Reconnect is not yet supported for online matchmaking.
- The event log is persisted and displayed, but there is no complete replay
  reconstruction feature.
- There are no automated browser interaction or visual regression tests.
- Board-location drag-and-drop now covers Unit movement, movement drafts, and
  Champion drag-to-play. Future drag/drop work must continue to submit
  projected actions and rely on server validation instead of mutating client
  state optimistically.
- Champion drag intentionally does not handle multiple payment modes for the
  same destination. If that case becomes important, add a scoped future
  refinement rather than broadening the current drag/drop contract.
- Drag/drop should be manually regression-tested around blocking UI states,
  invalid drops, edge-of-zone drops, staged movement cleanup, animation snapshot
  capture, and prompt cleanup after projection updates.
- The canonical behavior catalog and approved cards must be initialized in
  MongoDB before match deck snapshots can load.
- Full Riftbound card coverage is not implied by the current Lux and Annie
  acceptance coverage.

Questions to answer before major product work:

- Authentication model for online matchmaking.
- Should setup, Battlefield choices, and Unit destinations all move through
  `PlayerDecisionHost`?
- Is best-of-three progression required next?
- What authentication model should protect catalog publication?
- Is broader card coverage or multiplayer infrastructure the current priority?

## 11. Recommended Next Steps

### Immediate validation

- Run a Mongo-backed match and manually validate the current player-decision
  flows.
- Verify the canonical Lux and Annie cards are approved and available.
- Confirm prompt cleanup after every projection update.
- When changing game-board interactions, manually validate hand card actions,
  board card actions, rune actions, target selection, unit destination choices,
  chain pass/resolve behavior, and animation cleanup.
- Manually validate Unit drag from Base to Battlefield, Battlefield to Base, and
  legal Battlefield to Battlefield movement.
- Manually validate drag-to-Battlefield movement drafts: dragged Unit
  preselected, additional Units toggled by click, staged movement feedback,
  destination highlight, cancel cleanup, and confirm submission.
- Manually validate Champion drag from the Champion zone to legal Base and
  Battlefield destinations.
- Manually validate invalid drops, edge-of-zone drops, and drag-disabled states
  while target selections, player decisions, pending choices, unit-destination
  dialogs, locked chain windows, or action submissions are active.

### Safe implementation work

- Centralize remaining ordinary player-choice dialogs one flow at a time.
- Keep specialized board targeting separate until its interaction requirements
  are explicitly represented.
- Preserve the existing intent and projection contracts.
- Continue game-board work through concern-driven, behavior-preserving changes.
  Do not continue extracting only because a file is large.
- If more game-board refactor work is needed, prefer small plausible concerns
  such as pure chain-card derivation or choice-dialog presentation before broad
  layout extraction.
- Keep future drag/drop work aligned with projected legal actions,
  `submitProjectedAction`, and server validation.
- Keep movement draft behavior as the multi-Unit movement model: drag starts the
  draft, clicks adjust selected Units, confirmation submits.
- Treat new drag/drop capabilities as interaction shortcuts over existing play,
  move, moveMany, and target-selection flows.

### Areas requiring confirmation

- Setup ownership within the Player Decision System.
- Realtime multiplayer requirements.
- Best-of-three and sideboarding scope.
- Admin access control.
- Required card-set coverage.

### Validation checklist

- Mulligan with zero, one, and two selected cards.
- Vision recycle and Keep on top.
- Hand and Trash selections.
- Trigger ordering.
- Combat damage assignment.
- Tank-first and lethal-damage validation.
- Opponent waiting feedback.
- Battlefield target selection.
- Unit destination selection.
- Unit drag/drop movement between Base and Battlefields.
- Drag-to-Battlefield movement draft, including staged visual feedback and
  click-to-add selection.
- Champion drag-to-play to Base and Battlefields.
- Invalid and edge-of-zone drops.
- Drag-disabled states during blocking prompts and submissions.
- Hand card action menu and direct play.
- Board card context menu and primary action.
- Rune primary/context action.
- Chain pass priority and pass-and-resolve flow.
- No stale prompt after a successful action.

Automated additions should remain limited to stable mapper, intent, schema, and
confirmed regression behavior.

## 12. Handoff Summary for the Next Chat

Hextech is a server-authoritative Next.js and MongoDB Riftbound simulator. It
supports Lux and Annie matches, setup, turns, resources, card play, Chains,
Showdowns, combat, effects, scoring, victory, viewer-safe projections, and a
card behavior catalog admin.

The client renders projected legal actions and submits intents. Rules, target
validation, payment, state transitions, and hidden information remain in
framework-free server modules.

Player choices use the Player Decision System:

```text
projection/actions
  -> usePlayerDecisionRequest
  -> PlayerDecisionRequest
  -> PlayerDecisionHost
  -> PlayerDecisionIntent
  -> existing action submission
```

`GameBoard` has been refactored into a feature-level orchestrator. Its current
architecture is:

```text
source GameProjection
  -> board-view-model.ts
  -> board-model.ts / board-animation-model.ts
  -> game-board.tsx orchestrator
  -> interactions/* hooks
  -> components/* rendering
  -> decisions/* prompts and intent mapping
```

Board-location drag/drop now lives inside this structure. DnD primitives and
legal-drop helpers live in `drag-and-drop/*`, active drag state lives in
`use-location-drag-state.tsx`, submission orchestration lives in
`use-game-board-actions.tsx`, and visual feedback is passed into board
components. Unit drag/drop resolves move or moveMany actions, Champion drag
resolves play actions, and all final submissions still use projected action IDs
and server validation.

Continue from this structure. Keep extracted concerns in the `game-board`
feature, avoid artificial splits, and do not move server-owned legality,
payment, target validation, or effect resolution into React. The safest
continuation is to validate the current gameplay flows manually, then centralize
remaining ordinary choices incrementally while preserving the server action
contract and adding only narrow tests for stable behavior.
