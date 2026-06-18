# Project Architecture Guide

## Purpose

This document defines how code should be organized in this project.

The project is a **single fullstack Next.js application** using a feature-based architecture. The goal is to keep the codebase understandable, scalable, and easy to maintain while avoiding unnecessary abstraction.

When generating or modifying code, follow these rules unless the user explicitly requests a different structure.

---

# 1. Architecture Style

Use a **single fullstack Next.js application** structure.

The project should be organized around:

- `app/` for routing and route-level composition.
- `features/` for business/domain features.
- `server/` for backend-only logic.
- `shared/` for generic reusable code.

Preferred structure:

```txt
src/
  app/
  features/
  server/
  shared/
```

Do not organize the project as a generic “frontend” and “backend” split unless the user explicitly asks for that.

---

# 2. Folder Responsibilities

## `src/app`

Use `app/` only for Next.js routing and route-level files.

Examples:

```txt
src/app/
  layout.tsx
  page.tsx
  loading.tsx
  error.tsx
  not-found.tsx

  dashboard/
    page.tsx

  api/
    projects/
      route.ts
```

The `app/` folder should contain:

- Pages
- Layouts
- Route handlers
- Loading states
- Error boundaries
- Route groups
- Minimal route composition

Avoid putting complex business logic directly inside `page.tsx` or `route.ts`.

Pages should usually import feature-level components and server queries.

Good:

```tsx
import { ProjectList } from "@/features/projects/components/project-list";
import { getProjects } from "@/features/projects/queries";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return <ProjectList projects={projects} />;
}
```

Bad:

```tsx
export default async function ProjectsPage() {
  const projects = await db.project.findMany();

  return (
    <div>
      {/* Large amount of business-specific UI directly here */}
    </div>
  );
}
```

---

## `src/features`

Use `features/` for domain-specific application functionality.

A feature represents a meaningful business or product area.

Examples:

```txt
src/features/
  auth/
  users/
  projects/
  dashboard/
  billing/
  reports/
```

Each feature may contain:

```txt
features/
  projects/
    components/
    actions.ts
    queries.ts
    schemas.ts
    types.ts
```

Use this structure when applicable:

```txt
features/feature-name/
  components/
  actions.ts
  queries.ts
  schemas.ts
  types.ts
```

### Feature folder responsibilities

```txt
components/
Feature-specific React components.

actions.ts
Server Actions for mutations related to this feature.

queries.ts
Server-side read functions for this feature.

schemas.ts
Validation schemas, usually Zod schemas.

types.ts
Feature-specific TypeScript types.
```

Do not place feature-specific components in `shared/components`.

Example:

```txt
features/projects/components/project-status-badge.tsx
```

is better than:

```txt
shared/components/project-status-badge.tsx
```

because `ProjectStatusBadge` knows about the project domain.

---

## `src/server`

Use `server/` for backend-only code.

This folder should contain logic that must not run in the browser.

Recommended structure:

```txt
src/server/
  db/
    client.ts
    schema.ts

  services/
    project-service.ts
    user-service.ts

  repositories/
    project-repository.ts
    user-repository.ts

  policies/
    project-policy.ts
```

### `server/services`

Use services for business use cases.

Example:

```txt
server/services/project-service.ts
```

Services may:

- Validate business rules
- Coordinate multiple repositories
- Apply application rules
- Handle use case logic

### `server/repositories`

Use repositories for database access.

Example:

```txt
server/repositories/project-repository.ts
```

Repositories should be responsible for persistence concerns only.

### `server/policies`

Use policies for authorization and permission rules.

Example:

```txt
server/policies/project-policy.ts
```

Policies should answer questions such as:

```txt
Can this user update this project?
Can this user delete this record?
Can this user access this resource?
```

---

## `src/shared`

Use `shared/` for generic reusable code that does not belong to a specific feature.

Recommended structure:

```txt
src/shared/
  components/
  hooks/
  utils/
  constants/
  types/
```

Good shared components:

```txt
button.tsx
dialog.tsx
input.tsx
select.tsx
pagination.tsx
empty-state.tsx
data-table.tsx
```

Bad shared components:

```txt
project-card.tsx
user-role-badge.tsx
billing-plan-selector.tsx
```

Those belong inside their respective feature folders because they contain domain-specific meaning.

---

# 3. Component Organization

Use a **file per meaningful exported component**.

This is the preferred convention:

```txt
features/projects/components/
  project-list.tsx
  project-list-item.tsx
  project-card.tsx
  project-form.tsx
  project-status-badge.tsx
```

Each exported component should generally have its own file.

Good:

```tsx
// features/projects/components/project-card.tsx

import type { Project } from "../types";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article>
      <h2>{project.name}</h2>
    </article>
  );
}
```

## Private subcomponents

Small private subcomponents may stay in the same file when they are only used by that component.

Good:

```tsx
export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article>
      <ProjectCardHeader project={project} />
      <p>{project.description}</p>
    </article>
  );
}

function ProjectCardHeader({ project }: ProjectCardProps) {
  return <h2>{project.name}</h2>;
}
```

Move a private component to its own file when:

- It becomes large.
- It is reused elsewhere.
- It has its own meaningful responsibility.
- It needs to become a Client Component.
- It needs its own tests.

---

# 4. File Naming Conventions

Use **kebab-case** for file names.

Good:

```txt
project-list.tsx
project-card.tsx
project-status-badge.tsx
create-project-form.tsx
```

Avoid PascalCase file names:

```txt
ProjectList.tsx
ProjectCard.tsx
ProjectStatusBadge.tsx
```

Use **PascalCase** for React component names.

Good:

```tsx
export function ProjectList() {}
export function ProjectCard() {}
export function ProjectStatusBadge() {}
```

Use this convention:

```txt
File name: project-list.tsx
Component name: ProjectList
```

Use **camelCase** for functions and variables.

```ts
const projectStatus = "active";

function getProjectStatus() {}
```

Use **UPPER_CASE** for constants when they represent fixed values.

```ts
const MAX_PROJECTS_PER_PAGE = 20;
```

---

# 5. Client and Server Component Boundaries

By default, components should be Server Components.

Only add `"use client"` when the component needs browser-only behavior, such as:

- `useState`
- `useEffect`
- Event handlers
- Browser APIs
- Client-side form state
- Drag and drop
- Interactive UI behavior

Prefer isolating client behavior into the smallest possible component.

Good:

```txt
features/projects/components/
  project-list.tsx
  project-filters.tsx
```

```tsx
// project-list.tsx
// Server Component by default

import { ProjectFilters } from "./project-filters";

export function ProjectList() {
  return (
    <>
      <ProjectFilters />
      {/* server-rendered content */}
    </>
  );
}
```

```tsx
// project-filters.tsx

"use client";

import { useState } from "react";

export function ProjectFilters() {
  const [query, setQuery] = useState("");

  return (
    <input value={query} onChange={(event) => setQuery(event.target.value)} />
  );
}
```

Do not mark a large parent component as `"use client"` if only a small child requires interactivity.

---

# 6. Route Handlers

Use route handlers for HTTP endpoints.

Example:

```txt
src/app/api/projects/route.ts
```

Route handlers should be thin.

They should:

- Parse the request.
- Validate input.
- Call services.
- Return a response.

Good:

```ts
import { createProject } from "@/server/services/project-service";

export async function POST(request: Request) {
  const body = await request.json();

  const project = await createProject(body);

  return Response.json(project);
}
```

Avoid putting business logic directly inside route handlers.

---

# 7. Server Actions

Use Server Actions for mutations that are directly connected to UI workflows.

Example:

```txt
features/projects/actions.ts
```

Good use cases:

- Create form
- Update form
- Delete button
- Toggle state
- Submit user interaction

Example:

```ts
"use server";

import { createProjectService } from "@/server/services/project-service";
import { createProjectSchema } from "./schemas";

export async function createProjectAction(input: unknown) {
  const data = createProjectSchema.parse(input);

  await createProjectService(data);
}
```

Server Actions should also stay thin.

They may:

- Validate input.
- Check session if needed.
- Call server services.
- Revalidate paths or redirect.

They should not become large business logic containers.

---

# 8. Queries

Use `queries.ts` inside a feature for server-side read operations related to that feature.

Example:

```txt
features/projects/queries.ts
```

```ts
import { getProjectsForCurrentUser } from "@/server/services/project-service";

export async function getProjects() {
  return getProjectsForCurrentUser();
}
```

Queries may call services or repositories depending on project complexity.

Prefer services when business rules or permissions are involved.

---

# 9. Schemas and Types

Use `schemas.ts` for validation schemas.

Example:

```ts
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
```

Use `types.ts` for feature-specific TypeScript types.

Example:

```ts
export interface Project {
  id: string;
  name: string;
  status: "active" | "archived";
}
```

Avoid duplicating types when they can be inferred from schemas.

Prefer schema inference when the type represents validated input.

---

# 10. Import Rules

Use absolute imports for cross-feature or root-level imports.

Good:

```ts
import { Button } from "@/shared/components/button";
import { getProjects } from "@/features/projects/queries";
```

Use relative imports inside the same feature when it improves readability.

Good:

```ts
import { ProjectCard } from "./project-card";
import type { Project } from "../types";
```

Avoid importing from another feature's internal files unless explicitly necessary.

Prefer public feature exports if available.

Good:

```ts
import { ProjectList } from "@/features/projects";
```

Avoid:

```ts
import { ProjectList } from "@/features/projects/components/project-list";
```

This rule applies when the feature has a public `index.ts`.

---

# 11. Barrel Files

Use barrel files carefully.

A feature may expose a public API through `index.ts`.

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

Avoid creating barrel files in every folder by default.

Do not create unnecessary chains of barrel files.

---

# 12. Avoid Overengineering

Do not create complex architecture unless the project needs it.

Avoid this by default:

```txt
components/
  project-card/
    index.ts
    project-card.tsx
    project-card.types.ts
    project-card.styles.ts
    project-card.test.tsx
```

Prefer this:

```txt
components/
  project-card.tsx
```

Use folder-per-component only when the component becomes complex.

Acceptable:

```txt
components/
  project-form/
    project-form.tsx
    project-form-fields.tsx
    project-form-actions.tsx
    project-form.schema.ts
    index.ts
```

---

# 13. Fullstack Responsibility Boundaries

Do not treat `app/api` as the backend architecture.

Use this separation:

```txt
app/api/
Transport layer.

features/
Product-facing UI and feature workflows.

server/services/
Business logic.

server/repositories/
Database access.

server/policies/
Authorization logic.
```

A good flow is:

```txt
UI Component
  -> Server Action or Route Handler
    -> Service
      -> Policy
      -> Repository
        -> Database
```

Example:

```txt
ProjectForm
  -> createProjectAction
    -> createProjectService
      -> canCreateProject
      -> projectRepository.create
```

---

# 14. What to Do When Adding a New Feature

When adding a new feature, create a folder under `src/features`.

Example:

```txt
src/features/tasks/
  components/
    task-list.tsx
    task-card.tsx
    task-form.tsx
  actions.ts
  queries.ts
  schemas.ts
  types.ts
```

Then connect it to routing through `src/app`.

Example:

```txt
src/app/tasks/page.tsx
```

The page should be thin and delegate to the feature.

```tsx
import { TaskList } from "@/features/tasks/components/task-list";
import { getTasks } from "@/features/tasks/queries";

export default async function TasksPage() {
  const tasks = await getTasks();

  return <TaskList tasks={tasks} />;
}
```

---

# 15. What to Do When Adding Shared UI

Only add something to `shared/components` when it is generic.

Good shared UI:

```txt
button
input
dialog
select
badge
table
tooltip
dropdown-menu
empty-state
pagination
```

Do not add business-specific components to shared UI.

Bad:

```txt
project-card
user-permission-badge
invoice-status-chip
```

These belong to their feature folders.

---

# 16. General Code Style Rules

Prefer:

- Simple functions.
- Explicit names.
- Small files.
- Clear props interfaces.
- Server Components by default.
- Thin pages.
- Thin route handlers.
- Thin Server Actions.
- Business logic in services.
- Database access in repositories.
- Domain-specific UI inside features.
- Generic UI inside shared.

Avoid:

- Large `page.tsx` files.
- Large `route.ts` files.
- Putting all components in `shared`.
- Putting all backend logic in `app/api`.
- Creating abstractions before they are needed.
- Making everything a Client Component.
- Mixing database logic directly into UI components.
- Importing deeply across unrelated features.

---

# 17. Default Decision Rules

When unsure, follow these defaults:

```txt
Is it a route?
Put it in app/.

Is it a page-level UI composition?
Put it in app/, but keep it thin.

Is it a domain-specific component?
Put it in features/<feature>/components/.

Is it a generic reusable component?
Put it in shared/components/.

Is it a UI mutation?
Put it in features/<feature>/actions.ts.

Is it a server-side read operation?
Put it in features/<feature>/queries.ts.

Is it business logic?
Put it in server/services/.

Is it database access?
Put it in server/repositories/.

Is it authorization logic?
Put it in server/policies/.

Is it validation?
Put it in features/<feature>/schemas.ts or a server schema if it is backend-only.

Is it a TypeScript type?
Put it in the closest feature-level types.ts unless it is truly shared.
```

---

# 18. Summary

The project follows a feature-based fullstack Next.js architecture.

The preferred structure is:

```txt
src/
  app/
  features/
  server/
  shared/
```

The most important rules are:

```txt
app/ is for routing.
features/ is for product/domain functionality.
server/ is for backend-only logic.
shared/ is for generic reusable code.
```

Use:

```txt
kebab-case for file names.
PascalCase for React components.
One exported component per file.
Private subcomponents may stay in the same file.
Server Components by default.
Client Components only when necessary.
```

Keep route files, pages, and Server Actions thin. Move business rules to services and database access to repositories.
