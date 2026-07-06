# Project Handoff

Snapshot date: 2026-07-06

## 1. Project Overview

Hextech Simulator is a server-authoritative simulator for the Riftbound trading
card game.

The server owns canonical game state, legal actions, hidden information, game
transitions, and persisted events. The client receives a viewer-specific
projection and submits player intents rather than mutating game state directly.

The application currently has two main product areas:

1. A local two-player match simulator using the Lux and Annie decks.
2. An admin card-catalog workflow for importing card data, reviewing suggested
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

- `src/app/page.tsx` renders the match simulator.
- `src/app/admin/card-catalog/page.tsx` renders the catalog admin.
- `src/app/api/matches/route.ts` lists playable decks and creates matches.
- `src/app/api/matches/[matchId]/route.ts` returns a viewer projection.
- `src/app/api/matches/[matchId]/intents/route.ts` accepts game actions.
- `src/app/api/admin/card-catalog/preview/route.ts` previews an uploaded set.
- `src/app/api/admin/card-catalog/approve/route.ts` publishes an approved card.

### Feature boundaries

- `src/features/game-board`: board rendering, interaction state, decisions,
  prompts, card movement, and projection adaptation.
- `src/features/match-simulator`: match creation, seat switching, API calls,
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
- MongoDB native driver
- Zod schemas and payload validation
- React hooks and local component state
- Node's built-in test runner through `tsx`
- ESLint with Next.js Core Web Vitals and TypeScript rules
- npm with `package-lock.json`

The repository does not use:

- Mongoose
- Redux or another external client state manager
- Socket.IO or another realtime transport
- Jest, Vitest, Playwright, or Cypress

No deployment-platform configuration is present.

## 6. Architecture and Data Flow

The gameplay request flow is:

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
  -> board view-model adaptation
  -> GameBoard and PlayerDecisionHost
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
  board-oriented UI data.

The server persists a deck snapshot for each player. The snapshot contains the
approved card definitions and unique runtime instances used by the match.

The browser stores the currently loaded match and viewer projection in React
state. It does not own rules state.

## 7. Current Feature Capabilities

### Match simulator

Users can:

- Select Lux or Annie for each player.
- Create a persisted match.
- Switch between Player 1 and Player 2.
- Submit projected actions.
- See the winner when a game completes.

The simulator does not provide independent sessions, matchmaking, automatic
realtime refresh, reconnect handling, or best-of-three progression.

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
- Treat imported but unapproved card behavior as gameplay-ready.
- Add broad UI integration tests for unstable decision surfaces.

## 10. Risks, Gaps, and Open Questions

- `src/features/game-board/game-board.tsx` is approximately 1,800 lines and
  contains substantial board interaction state.
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
- The second viewer does not receive automatic updates after the other player
  acts.
- The event log is persisted and displayed, but there is no complete replay
  reconstruction feature.
- There are no automated browser interaction or visual regression tests.
- The canonical behavior catalog and approved cards must be initialized in
  MongoDB before match deck snapshots can load.
- Full Riftbound card coverage is not implied by the current Lux and Annie
  acceptance coverage.

Questions to answer before major product work:

- Is the next target still a local two-seat simulator or independent
  multiplayer clients?
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

### Safe implementation work

- Centralize remaining ordinary player-choice dialogs one flow at a time.
- Keep specialized board targeting separate until its interaction requirements
  are explicitly represented.
- Preserve the existing intent and projection contracts.
- Split large files only through incremental, behavior-preserving changes.

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

The safest continuation is to validate the current gameplay flows manually,
then centralize remaining ordinary choices incrementally while preserving the
server action contract and adding only narrow tests for stable behavior.
