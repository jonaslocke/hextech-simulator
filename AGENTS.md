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
