# Agent Instructions

## Purpose and precedence

This file defines repository-wide operating rules for agents. The current task
defines the requested outcome; these instructions define how to perform it.

Before changing a file, read this file and any more-specific `AGENTS.md` that
applies to the target path. More-specific instructions take precedence. If a
task conflicts with a durable contract or requires an unresolved product,
rules, security, persistence, or accepted-semantic decision, explain the
conflict before making a behavior-changing or irreversible choice.

## Understand before changing

Use repository evidence rather than assumptions. Before implementation, inspect:

1. Git state and applicable instructions.
2. The durable source of truth for the affected concern.
3. Existing implementation, contracts, consumers, and tests.
4. Actual scripts and tooling in `package.json`.

Preserve behavior unless the task explicitly requests a change. Keep work to
the smallest coherent scope. Do not mix unrelated cleanup, dependency upgrades,
formatting, renames, speculative capability work, or architecture refactors
into a feature or defect fix. Preserve unrelated working-tree changes.

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
| Testing contracts and automated-test ownership | `docs/testing.md` |
| Coding-agent harness benchmark | `docs/coding-agent-benchmark.md` |
| Active, verified issue tracking | `docs/BETA-ISSUES.md` |

For gameplay-rule work, use the local rules-reference skill. Core rules come
from the local reference and card-specific behavior comes from local set data;
do not use online rulings as rules authority.

## Architecture and ownership

This is one fullstack Next.js application. Use the established boundaries:

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
  browser behavior is needed and isolate that behavior narrowly.
- Use absolute imports across root or feature boundaries and relative imports
  within a feature when clearer. Avoid deep cross-feature internals and cycles.

## Data, generated output, and persistence

Treat external, browser, imported, and persisted data as untrusted until it is
validated through established schemas and contracts. Do not invent fallback
values that hide invalid durable data.

`data/catalog/mvp.json` and
`src/server/catalog/fixed-mvp-cards.generated.ts` are generated outputs. Change
their inputs, then use the catalog build/check script; never hand-edit them.

Catalog synchronization and reset scripts can mutate MongoDB or generated data.
Do not run them during unrelated work or without explicit task authorization.

## Testing and validation

`docs/testing.md` is the detailed testing authority. `tests/AGENTS.md` applies
to authored tests. `src/server/game/AGENTS.md` applies to game-engine changes.

The durable testing boundary is the reusable primitive, behavior family, rules
contract, subsystem, compiler, or generic validation pipeline—not the card or
deck that exposed the need.

Previously accepted passing expectations are protected regression contracts.
Do not delete, weaken, or rewrite them merely because a new implementation
breaks them. A changed accepted expectation requires an authoritative semantic
change and the approval/impact process defined in `docs/testing.md`.

Validate in proportion to risk using actual scripts. Use focused checks during
development and `npm run verify:pr` for the stable non-destructive final gate
when the task warrants full PR readiness. Manually validate complete gameplay
and interactive UI when automated checks cannot prove the composed workflow.
Report only commands actually run and remaining risk.

## Skills

Use repository skills when their scope applies:

- `skills/riftbound-local-rules-reference-SKILL.md` for gameplay-rule work;
- `skills/engine-change-impact-SKILL.md` before changing reusable game-engine
  behavior or implementing card-corpus capabilities;
- `skills/behavior-change-tdd-SKILL.md` for reusable behavior/subsystem fixes
  and extensions;
- `skills/technical-pr-review-SKILL.md` for fresh independent technical review;
- `skills/player-decision-system-SKILL.md` for eligible player-choice work;
- `skills/shadcn-first-ui-development-SKILL.md` for UI work;
- `skills/game-action-buttons-skill.md` for gameplay CTA/keybind work; and
- `skills/refactor-to-feature-architecture` for intentional architecture
  migrations.

Skills are workflows, not additional sources of game rules. When a skill and a
durable project authority overlap, the durable authority defines the contract.

## Working and durable artifacts

Use `.agent-work/` for ephemeral plans, reproduction notes, state captures,
RED/GREEN evidence, review scratch material, and other temporary agent output.

Only add repository files that provide ongoing project value. Do not retain
one-off plans, discovery notes, temporary validation files, screenshots,
reports, debugging scripts, generated investigation exports, benchmark answer
keys, or evaluator traces unless deliberately promoted into maintained
authorities.

## Completion

Before completion, review the diff and confirm that it contains only requested
durable changes, appropriate reusable tests/documentation, no accidental
generated output or secrets, and no temporary artifacts.

Report what changed, what was validated, manual validation when applicable, and
unresolved risks. A green suite is evidence, not proof that scope,
architecture, test ownership, or semantics are correct.
