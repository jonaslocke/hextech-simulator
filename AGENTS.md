# AGENTS.md

## Project Instructions

This repository is a single fullstack Next.js application using a feature-based architecture.

When writing, modifying, or refactoring code, follow the project architecture described in:

- `docs/architecture.md`

## Core Architecture

Use this top-level structure:

```txt
src/
  app/
  features/
  server/
  shared/
```

### Folder responsibilities

- `src/app` is for Next.js routing and route-level composition.
- `src/features` is for product/domain features.
- `src/server` is for backend-only logic.
- `src/shared` is for generic reusable code.

Do not organize the project as a separate `frontend/` and `backend/` split unless explicitly requested.

## Required Conventions

Use:

- kebab-case for file names.
- PascalCase for React component names.
- camelCase for functions and variables.
- UPPER_CASE for fixed constants.

Example:

```txt
File name: project-list.tsx
Component: ProjectList
```

## Component Rules

Use one file per meaningful exported component.

Small private subcomponents may stay in the same file when they are only used by that component.

Move private components to their own file when they become:

- reused;
- large;
- independently meaningful;
- client-only;
- testable on their own.

## Next.js Server and Client Rules

Components are Server Components by default.

Only add `"use client"` when the component needs browser-only behavior, such as:

- `useState`;
- `useEffect`;
- event handlers;
- browser APIs;
- drag and drop;
- client-side form state.

Prefer isolating client behavior into the smallest possible component.

## Backend Boundaries

Keep pages, route handlers, and Server Actions thin.

Use this flow when possible:

```txt
UI Component
  -> Server Action or Route Handler
    -> Service
      -> Policy
      -> Repository
        -> Database
```

Use:

- `features/<feature>/actions.ts` for UI-driven mutations.
- `features/<feature>/queries.ts` for server-side reads.
- `server/services` for business logic.
- `server/repositories` for database access.
- `server/policies` for authorization logic.

## Import Rules

Use absolute imports for cross-feature and root-level imports:

```ts
import { Button } from "@/shared/components/button";
import { getProjects } from "@/features/projects/queries";
```

Use relative imports inside the same feature when clearer:

```ts
import { ProjectCard } from "./project-card";
import type { Project } from "../types";
```

Avoid importing from another feature's internal files unless necessary.

## Avoid

Avoid:

- large `page.tsx` files;
- large `route.ts` files;
- putting all components in `shared`;
- putting backend logic directly in `app/api`;
- making everything a Client Component;
- creating abstractions before they are needed;
- deeply importing unrelated feature internals.

## Rules Authority

For game rules, use only the repository’s local rules documentation and card corpus.
Do not browse or use online sources to determine, validate, or supplement rules.
If the local rules do not answer a question, stop and ask the user for direction.

## Gameplay Validation and Tests

Manual in-game validation is the authoritative acceptance gate for gameplay behavior.
Do not create, update, repair, or expand automated gameplay integration,
end-to-end, or regression tests for card behavior changes.

Automated tests are permitted only while building a reusable gameplay primitive,
where they directly validate that primitive's isolated contract. Do not treat
those tests as evidence that a card or behavior family is accepted.

For ordinary gameplay work, run only structural verification such as typecheck
and lint. Do not run the full automated test suite by default.

If an existing gameplay integration or regression test fails, do not spend time
repairing it. Skip or remove it unless the user explicitly requests automated
test work.

## Test Decision Rules

The purpose of an automated test is to protect a durable contract, not to record
that a one-time implementation once worked. Before adding a test, identify the
contract it protects and keep the test only if that contract will remain useful
after the current task is finished.

Use this classification:

| Change area | Automated test policy | Fixture policy |
| --- | --- | --- |
| Card text, one card, a card family, or a particular deck | Do not add gameplay acceptance tests. Validate manually in-game. | No canonical card names, codes, or decklists. |
| Reusable game primitive or engine kernel | Add focused unit or primitive-contract tests. | Use synthetic cards and minimal state; assert the primitive's observable contract. |
| Match service, persistence, projection, authorization, or transport boundary | Add synthetic service/integration tests for lifecycle, privacy, retries, idempotency, and malformed input. | Use in-memory repositories and synthetic match/deck documents. |
| Catalog, deck parser, approval, import, or synchronization tooling | Add tests for the tooling/data contract, not for gameplay acceptance. | Synthetic card documents are preferred; canonical identities are allowed only when the identity/synchronization contract itself is what is being tested. |
| Pure UI, formatting, parsing, or presentation utility | Add focused unit tests for the pure input/output contract. | Use representative anonymous data. |

### Tests that are not allowed by default

Do not create tests that:

- prove that a named card, named deck, or card-specific rules text is accepted;
- use a real card as a convenient example for a reusable primitive;
- replay a full game to validate a card, keyword, behavior family, or balance rule;
- snapshot a broad catalog or gameplay scenario merely because an implementation
  was completed once;
- assert implementation details such as private helper calls, incidental event
  ordering, or exact fixture internals when the public contract does not require
  them;
- add a permanent test or `package.json` script for a one-time migration,
  approval batch, import, cleanup, or investigation.

If a test needs a card-like object, use identifiers such as `SYN-001` and names
such as `Synthetic Draw Spell`. Keep the fixture to the smallest state needed
for the contract. A test must not be interpreted as evidence that a card or
card family is gameplay-approved.

### When a gameplay change touches a primitive

A card implementation may expose a missing or broken reusable primitive. In
that case:

1. Extract the primitive contract from the engine behavior.
2. Add or update a synthetic primitive test for that contract only.
3. Validate the card manually in-game.
4. Run `npm run typecheck` and `npm run lint`; run only the focused primitive
   tests relevant to the change.

Do not turn the triggering card into a permanent fixture. The card is the reason
the gap was found, not the subject of the automated test.

### Test maintenance and execution

Prefer a small number of durable matrix tests over many historical scenario
tests. A matrix test should cover meaningful boundary combinations such as
numeric operators, selector locations, zone operations, timing transitions,
trigger ordering, scoring, privacy, or persistence retries.

When an existing test violates these rules, remove or rewrite it around the
reusable contract instead of repairing its card-specific assertions. Do not
expand the automated suite during ordinary gameplay implementation. The normal
verification command for gameplay work is:

```text
npm run typecheck
npm run lint
```

Run `npm test` only when explicitly requested or when a broad non-gameplay change
requires full-suite verification. Manual in-game validation remains the final
acceptance gate for all gameplay behavior.
