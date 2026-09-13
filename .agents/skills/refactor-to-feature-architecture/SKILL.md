---
name: refactor-to-feature-architecture
description: Safely migrate an existing area of this Next.js application toward the repository’s feature-oriented architecture without changing behavior.
---

# Feature-Architecture Refactor

Use this skill only for an intentional architecture refactor, not an isolated
feature or defect fix. Read `AGENTS.md` and `docs/architecture.md` first; they
define the target architecture and project boundaries.

## Refactor method

1. Inspect current behavior, contracts, tests, imports, and Git state.
2. Select one bounded feature or route.
3. Identify its UI, client workflow, server owner, contracts, and tests.
4. Move or extract by ownership while preserving behavior.
5. Update imports and public boundaries.
6. Run focused validation before moving to another area.

Keep pages/routes thin, feature-specific code in its feature, generic code in
`shared`, and framework-free backend code in its server domain. Retain coherent
server domains; do not force every file into service/repository/policy folders.

Do not combine broad movement with product behavior changes, dependency upgrades,
style rewrites, or speculative abstractions. Keep the repository buildable after
each meaningful stage and prefer a safe migration over an idealized end state.
