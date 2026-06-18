---
name: refactor-to-feature-architecture
description: Use this skill when refactoring an existing Next.js repository into a single fullstack Next.js application using feature-based architecture.
---

# Refactor to Feature-Based Next.js Architecture

## Purpose

Use this skill when the user asks to refactor an existing Next.js codebase into the target architecture described by the repository instructions.

The goal is to safely move the project toward this structure:

```txt
src/
  app/
  features/
  server/
  shared/
```

This skill is about the **migration process**, not only the final architecture.

The refactor should preserve current behavior while improving project organization.

---

# 1. When to Use This Skill

Use this skill when the user asks for tasks such as:

- refactor the repository architecture;
- migrate to feature folders;
- reorganize components;
- split backend and frontend responsibilities inside Next.js;
- move code into `features`, `server`, or `shared`;
- clean up a messy Next.js project structure;
- prepare the repository for LLM-assisted development;
- apply the architecture described in `AGENTS.md` or `docs/architecture.md`.

Do not use this skill for small isolated fixes unless the user explicitly asks for architecture refactoring.

---

# 2. Target Architecture

The target architecture is a single fullstack Next.js application.

Use:

```txt
src/app
```

for routing and route-level composition.

Use:

```txt
src/features
```

for domain-specific product functionality.

Use:

```txt
src/server
```

for backend-only logic.

Use:

```txt
src/shared
```

for generic reusable code.

Preferred final structure:

```txt
src/
  app/
    layout.tsx
    page.tsx
    api/

  features/
    feature-name/
      components/
      actions.ts
      queries.ts
      schemas.ts
      types.ts

  server/
    db/
    services/
    repositories/
    policies/

  shared/
    components/
    hooks/
    utils/
    constants/
    types/
```

---

# 3. Refactoring Principles

## Preserve behavior

Do not change business behavior during architecture refactors unless the user explicitly asks.

Architecture refactors should focus on:

- moving files;
- updating imports;
- improving boundaries;
- renaming files to match conventions;
- extracting thin wrappers where useful.

Avoid changing:

- UI behavior;
- API behavior;
- validation rules;
- permission rules;
- data-fetching behavior;
- styling behavior;
- database behavior.

## Refactor incrementally

Do not refactor the entire project in one pass.

Prefer small, safe steps:

```txt
1. Identify one feature or route.
2. Move its components and logic.
3. Update imports.
4. Validate.
5. Continue to the next feature.
```

## Avoid mixed-purpose changes

Avoid mixing architecture refactoring with unrelated changes.

Do not combine:

```txt
file movement + behavior rewrite + styling update + dependency upgrade
```

in the same step unless required.

## Keep the project buildable

After each meaningful refactor step, the project should remain buildable.

Prioritize changes that can be validated with:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Use the commands available in the repository.

---

# 4. Initial Repository Inspection

Before moving files, inspect the current repository.

Identify:

```txt
- Current Next.js router style: App Router or Pages Router.
- Current source root: src/ or root-level app/.
- Existing component folders.
- Existing API routes or route handlers.
- Existing backend/server logic.
- Existing data-fetching patterns.
- Existing validation schemas.
- Existing type definitions.
- Existing shared utilities.
- Existing aliases in tsconfig.json.
- Existing test setup.
- Existing lint/build/typecheck commands.
```

Look for files such as:

```txt
package.json
tsconfig.json
next.config.js
next.config.mjs
src/app
src/pages
components
lib
utils
services
hooks
types
api
server
```

Do not assume the repository already follows the target structure.

---

# 5. Feature Identification Process

When identifying features, group code by product/domain meaning, not by technical type.

Good feature names:

```txt
auth
users
projects
dashboard
reports
billing
settings
notifications
```

Avoid creating features based only on technical categories:

```txt
components
hooks
forms
tables
api
services
```

A feature should represent a real area of the product.

## How to identify a feature

A route usually indicates a feature.

Example:

```txt
src/app/projects/page.tsx
```

likely maps to:

```txt
src/features/projects/
```

A set of related components may also indicate a feature.

Example:

```txt
components/projects/project-card.tsx
components/projects/project-form.tsx
components/projects/project-list.tsx
```

should likely move to:

```txt
src/features/projects/components/
```

---

# 6. File Movement Rules

## Components

Move domain-specific components to:

```txt
src/features/<feature>/components/
```

Example:

```txt
components/project-card.tsx
```

becomes:

```txt
src/features/projects/components/project-card.tsx
```

Generic components should move to:

```txt
src/shared/components/
```

Example:

```txt
components/button.tsx
components/dialog.tsx
components/input.tsx
```

become:

```txt
src/shared/components/button.tsx
src/shared/components/dialog.tsx
src/shared/components/input.tsx
```

## Hooks

Feature-specific hooks should move to the feature.

```txt
src/features/<feature>/hooks/
```

Generic hooks should move to:

```txt
src/shared/hooks/
```

## Utilities

Feature-specific utilities should move to:

```txt
src/features/<feature>/utils/
```

Generic utilities should move to:

```txt
src/shared/utils/
```

## Types

Feature-specific types should move to:

```txt
src/features/<feature>/types.ts
```

Generic types should move to:

```txt
src/shared/types/
```

## Validation schemas

Feature-specific validation schemas should move to:

```txt
src/features/<feature>/schemas.ts
```

Backend-only schemas may live closer to server logic when appropriate.

## Backend logic

Business logic should move to:

```txt
src/server/services/
```

Database access should move to:

```txt
src/server/repositories/
```

Authorization logic should move to:

```txt
src/server/policies/
```

Database clients and schema files should move to:

```txt
src/server/db/
```

---

# 7. Naming Rules During Refactor

Use kebab-case for file names.

Good:

```txt
project-list.tsx
project-card.tsx
project-status-badge.tsx
create-project-form.tsx
```

Avoid:

```txt
ProjectList.tsx
ProjectCard.tsx
projectList.tsx
project_status_badge.tsx
```

Use PascalCase for React components.

Good:

```tsx
export function ProjectList() {}
export function ProjectCard() {}
```

When renaming files, update every import path.

Do not rename exported component names unless needed for clarity or requested by the user.

---

# 8. Component Refactoring Rules

Use one file per meaningful exported component.

Small private subcomponents may remain in the same file.

Example:

```tsx
export function ProjectCard() {
  return (
    <article>
      <ProjectCardHeader />
      <ProjectCardBody />
    </article>
  );
}

function ProjectCardHeader() {
  return <header>...</header>;
}

function ProjectCardBody() {
  return <section>...</section>;
}
```

Move a private component into its own file when it becomes:

```txt
- reused;
- large;
- independently meaningful;
- client-only;
- testable on its own.
```

Do not create folder-per-component by default.

Prefer:

```txt
components/
  project-card.tsx
```

Avoid unless the component is complex:

```txt
components/
  project-card/
    index.ts
    project-card.tsx
    project-card.types.ts
    project-card.styles.ts
```

---

# 9. Server and Client Component Boundaries

By default, keep components as Server Components.

Only add `"use client"` when required by:

```txt
- useState;
- useEffect;
- event handlers;
- browser APIs;
- drag and drop;
- client-side form state;
- interactive UI behavior.
```

When only a small part of a component needs client-side behavior, extract that part into a separate Client Component.

Good:

```txt
project-list.tsx
project-filters.tsx
```

where only `project-filters.tsx` has `"use client"`.

Avoid marking a large parent component as `"use client"` only because one small child needs interactivity.

---

# 10. Route Handler Refactoring Rules

Route handlers should remain in:

```txt
src/app/api/
```

But they should be thin.

A route handler may:

```txt
- parse the request;
- validate input;
- check session if needed;
- call a service;
- return a response.
```

A route handler should not contain:

```txt
- large business rules;
- complex database queries;
- authorization policies embedded inline;
- large data transformation logic;
- reusable domain logic.
```

Move those responsibilities into `src/server`.

Good flow:

```txt
app/api/projects/route.ts
  -> server/services/project-service.ts
    -> server/policies/project-policy.ts
    -> server/repositories/project-repository.ts
```

---

# 11. Server Action Refactoring Rules

Server Actions should usually live in:

```txt
src/features/<feature>/actions.ts
```

They should be thin.

A Server Action may:

```txt
- validate form input;
- check session if needed;
- call a service;
- revalidate paths;
- redirect.
```

A Server Action should not become the main business logic layer.

Move business rules to:

```txt
src/server/services/
```

---

# 12. Query Refactoring Rules

Server-side read functions for a feature should usually live in:

```txt
src/features/<feature>/queries.ts
```

Queries may call:

```txt
src/server/services/
```

or, for simple cases:

```txt
src/server/repositories/
```

Prefer services when reads require:

```txt
- authorization;
- business rules;
- aggregation;
- filtering by current user;
- cross-entity logic.
```

---

# 13. Import Update Rules

Use absolute imports for cross-feature and root-level imports.

Good:

```ts
import { Button } from "@/shared/components/button";
import { getProjects } from "@/features/projects/queries";
```

Use relative imports inside the same feature when clearer.

Good:

```ts
import { ProjectCard } from "./project-card";
import type { Project } from "../types";
```

Avoid deep imports across unrelated features.

Bad:

```ts
import { ProjectCard } from "@/features/projects/components/internal/project-card";
```

If a feature has a public API, prefer importing from:

```txt
@/features/projects
```

instead of internal file paths.

---

# 14. Barrel File Rules

Do not create barrel files everywhere by default.

A feature may have an `index.ts` when other parts of the app need a public feature API.

Example:

```txt
features/projects/
  index.ts
  components/
    project-list.tsx
    project-card.tsx
  types.ts
```

```ts
export { ProjectList } from "./components/project-list";
export { ProjectCard } from "./components/project-card";
export type { Project } from "./types";
```

Avoid long chains of barrel files.

Avoid using barrel files to hide unclear boundaries.

---

# 15. Shared Code Decision Rules

Before moving code into `shared`, ask:

```txt
Is this truly generic?
Can it be reused without knowing the business domain?
Would it make sense in another project?
```

If yes, it can go to `shared`.

If no, keep it inside the feature.

Good shared examples:

```txt
button
input
dialog
select
table
pagination
empty-state
cn utility
date formatting utility
```

Bad shared examples:

```txt
project-status-badge
invoice-card
user-role-selector
simulation-board-event
```

Those are feature-specific.

---

# 16. Safe Migration Sequence

When refactoring a feature, use this sequence.

## Step 1: Select one route or feature

Pick one bounded area.

Example:

```txt
/projects
```

## Step 2: Identify related files

Find:

```txt
- page files;
- components;
- hooks;
- utilities;
- schemas;
- types;
- server actions;
- API routes;
- services;
- database calls.
```

## Step 3: Create the feature folder

Example:

```txt
src/features/projects/
  components/
  actions.ts
  queries.ts
  schemas.ts
  types.ts
```

Only create files that are needed.

## Step 4: Move components

Move domain-specific components to:

```txt
src/features/projects/components/
```

Rename files to kebab-case when appropriate.

## Step 5: Extract queries and actions

Move read functions to:

```txt
src/features/projects/queries.ts
```

Move UI mutations to:

```txt
src/features/projects/actions.ts
```

## Step 6: Extract server logic

Move business logic to:

```txt
src/server/services/
```

Move database access to:

```txt
src/server/repositories/
```

Move authorization rules to:

```txt
src/server/policies/
```

## Step 7: Update imports

Update all import paths.

Prefer absolute imports for cross-folder imports.

## Step 8: Validate

Run available checks.

Examples:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Use the actual commands from `package.json`.

## Step 9: Repeat

Move to the next feature only after the current one is stable.

---

# 17. Anti-Patterns to Avoid

Avoid these during migration:

```txt
- Refactoring the entire repository in one pass.
- Moving files and changing behavior at the same time.
- Creating many abstractions before they are needed.
- Moving domain-specific code into shared.
- Making all components Client Components.
- Putting all server logic in app/api.
- Creating one giant services file.
- Creating one giant types file.
- Renaming everything without a clear reason.
- Breaking routes while reorganizing.
- Ignoring existing conventions before proposing changes.
```

---

# 18. Validation Checklist

After a refactor, verify:

```txt
- Imports are updated.
- File names use kebab-case.
- React components use PascalCase.
- Pages are thin.
- Route handlers are thin.
- Server Actions are thin.
- Business logic lives in services.
- Database access lives in repositories.
- Generic UI lives in shared.
- Domain-specific UI lives in features.
- Client Components are used only when necessary.
- No behavior was intentionally changed unless requested.
```

Also run the available project commands:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

If some commands do not exist, do not invent them. Use the scripts available in `package.json`.

---

# 19. Example Migration

Before:

```txt
src/
  app/
    projects/
      page.tsx
  components/
    ProjectList.tsx
    ProjectCard.tsx
    Button.tsx
  lib/
    db.ts
    projects.ts
```

After:

```txt
src/
  app/
    projects/
      page.tsx

  features/
    projects/
      components/
        project-list.tsx
        project-card.tsx
      queries.ts
      types.ts

  server/
    db/
      client.ts
    services/
      project-service.ts
    repositories/
      project-repository.ts

  shared/
    components/
      button.tsx
```

Page after migration:

```tsx
import { ProjectList } from "@/features/projects/components/project-list";
import { getProjects } from "@/features/projects/queries";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return <ProjectList projects={projects} />;
}
```

---

# 20. Final Rule

When refactoring, prioritize:

```txt
safe migration > perfect architecture
```

The objective is to gradually move the project toward the target structure while preserving behavior and keeping the repository working.
