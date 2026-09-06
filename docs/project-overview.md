# Hextech Simulator Overview

## Product

Hextech Simulator is a two-player, server-authoritative Riftbound simulator.
It provides local and online match play, a best-of-three match lifecycle,
sideboarding, an interactive board, and an administrative card-catalog workflow.
Players submit intents; the server validates legality, resolves rules, persists
canonical state, and returns viewer-safe projections.

## Current technology

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, and local
  shadcn-style components.
- Native MongoDB driver, Zod contracts, Socket.IO on the custom Node server,
  Motion, and `@dnd-kit/core`.
- Node's test runner through `tsx`; `package.json` is the command authority.

## Core boundaries

- `src/app` owns routing and thin HTTP adapters.
- `src/features` owns UI and client workflows.
- `src/server` owns framework-free game, catalog, deck, matchmaking, and
  persistence domains.
- `src/shared` owns generic UI, utilities, and transport contracts.

The server owns canonical match and game state, legal actions, payment, rules,
hidden information, persistence, and viewer projections. The browser must not
infer private state or decide legality.

## Essential domain invariants

- Local core rules and local card text are the only rules sources.
- A canonical card definition, registered match copy, runtime game instance,
  and object version are distinct identities.
- BO3 games are fresh game documents. Runtime state and runtime IDs never carry
  between games.
- Sideboarding owns a client-local draft; deck validation owns legality; the
  match layer owns authorization, progression, and persistence.
- Reusable behavior primitives and approved canonical card models take priority
  over card-name-specific engine branches.

## Authority map

| Concern | Authority |
| --- | --- |
| Repository operations and routing | `AGENTS.md` |
| Architecture | `docs/architecture.md` |
| Product and engine contract | `docs/game_definition.md` |
| Core rules | `docs/riftbound_core_rules_reference.md` |
| Deck legality | `docs/deck_validation.md` |
| Card behavior/catalog | `docs/card_behavior.md` |
| Showdown decisions | `docs/showdown-rules-decision-ledger.md` |
| Full-corpus program | `docs/full-card-ingestion/plan.md` and `tracking.md` |
| Active issue tracking | `docs/BETA-ISSUES.md` |

## Operational notes

Use the scripts declared in `package.json`. Catalog synchronization and runtime
reset scripts mutate persistent MongoDB state; run them only when the task
explicitly authorizes that operation. Generated MVP catalog outputs are produced
by `scripts/build-mvp-card-catalog.ts` and checked with
`npm run catalog:check-mvp`.
