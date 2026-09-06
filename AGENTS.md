# Agent Instructions

## Purpose and precedence

This file defines repository-wide operating rules for agents. The current task
defines the requested outcome; these instructions define how to perform it.

Before changing a file, read this file and any more-specific `AGENTS.md` that
applies to the target path. A more-specific instruction takes precedence. If a
task conflicts with a durable contract or requires an unresolved product,
rules, security, or persistence decision, explain the conflict before making a
behavior-changing or irreversible choice.

## Understand before changing

Use repository evidence rather than assumptions. Before implementation, inspect:

1. Git state and applicable instructions.
2. The durable source of truth for the affected concern.
3. Existing implementation, contracts, and tests.
4. Actual scripts and tooling in `package.json`.

Preserve behavior unless the task explicitly requests a change. Keep work to
the smallest coherent scope. Do not mix unrelated cleanup, dependency upgrades,
formatting, renames, or architecture refactors into a feature or defect fix.
Preserve unrelated working-tree changes.

## Sources of truth

Read the authority that owns the concern; do not duplicate its detailed rules
in this file.

| Concern | Authority |
| --- | --- |
| Code organization and boundaries | `docs/architecture.md` |
| Current product and engine contracts | `docs/game_definition.md` |
| Project map and technology summary | `docs/project-overview.md` |
| Core Riftbound rules | `docs/riftbound_core_rules_reference.md` |
| Deck construction and legality | `docs/deck_validation.md` |
| Card behavior and canonical approval | `docs/card_behavior.md` |
| Showdown-specific recorded decisions | `docs/showdown-rules-decision-ledger.md` |
| Full-corpus ingestion work | `docs/full-card-ingestion/plan.md` and `tracking.md` |
| Active, verified issue tracking | `docs/BETA-ISSUES.md` |

For rules work, use the local rules-reference skill. Core rules come from the
local reference and card-specific behavior comes from local set data; do not use
online rulings as rules authority.

## Architecture and ownership

This is one fullstack Next.js application. Use the established top-level
boundaries:

```text
src/app       Next.js routes, layouts, and thin HTTP adapters
src/features  Product UI and client workflows
src/server    Framework-free backend domain logic and persistence
src/shared    Generic UI, utilities, and transport contracts
```

Keep feature-specific code with its owning feature. Move code to `shared` only
when it is independent of feature language, reusable by unrelated features, and
improves ownership rather than obscuring it.

Keep pages, route handlers, and Server Actions thin. Server modules own rules,
legality, payment, authorization, persistence, hidden-information handling, and
viewer projections. They must not import React, Next.js, or feature UI modules.

Use services, repositories, and policies where their responsibilities are
distinct. Do not mechanically create layers or disrupt coherent backend domains
such as `server/game`, `server/deck`, `server/card-catalog`, and
`server/online-matchmaking`.

## Code conventions

- Use kebab-case for ordinary authored file names; retain framework-required,
  generated, configuration, dynamic-route, and source-data names.
- Use PascalCase for React components, camelCase for functions and variables,
  and UPPER_CASE for fixed constants.
- Prefer one file per meaningful exported component. Extract private components
  for distinct responsibility, reuse, independent testing, client runtime, or
  clearer readability—not merely file length.
- Components are Server Components by default. Add `"use client"` only where
  browser behavior is needed and isolate that behavior as narrowly as practical.
- Use absolute imports across root or feature boundaries and relative imports
  within a feature when clearer. Avoid deep cross-feature internals and cycles.

## Data, generated output, and persistence

Treat external, browser, imported, and persisted data as untrusted until it is
validated through the established schemas and contracts. Do not invent fallback
values that hide invalid durable data.

`data/catalog/mvp.json` and
`src/server/catalog/fixed-mvp-cards.generated.ts` are generated outputs. Change
their inputs, then use the catalog build/check script; never hand-edit them.

Catalog synchronization and reset scripts can mutate MongoDB or generated data.
Do not run them during unrelated work or without explicit task authorization.

## Testing and validation

The current Node test-runner convention is `tests/**/*.test.ts`; do not relocate
tests merely to colocate them. Add focused tests for stable behavior, contracts,
and deterministic regressions. Do not delete valid tests to make a change pass.

Validate in proportion to risk using actual scripts, normally progressing from
focused checks to `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run build` as applicable. Manually validate gameplay and interactive UI
when automated checks cannot prove the affected workflow. Report only commands
actually run and any remaining risk.

The full-card-ingestion program has its own explicit manual-acceptance gates;
do not apply those program gates to unrelated tasks.

## Skills and durable artifacts

Use the repository skills when their scope applies:

- local rules reference for gameplay-rule work;
- Player Decision System for eligible player-choice work;
- shadcn-first UI development for UI work;
- Game Action Buttons for gameplay CTA/keybind work; and
- feature-architecture refactor for intentional architecture migrations.

Only add repository files that provide ongoing project value. Do not retain
one-off plans, discovery notes, temporary validation files, screenshots, reports,
debugging scripts, or generated exports unless they have been deliberately
promoted into a maintained authority.

## Completion

Before completion, review the diff and confirm that it contains only the
requested durable changes, appropriate tests and documentation, no accidental
generated output or secrets, and no temporary artifacts. Report what changed,
what was validated, manual validation when applicable, and unresolved risks.
