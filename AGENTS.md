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

## Canonical Card Printing and Images

For every current or future card implementation, resolve the card's canonical
printing from the complete local printing group before publishing behavior or
creating a deck snapshot. Use the shared selector in
`src/server/card-catalog/printing-selection.ts`; do not select a corpus entry by
array order, last-write-wins maps, card name alone, or UI-specific image logic.

The canonical default must be a standard printing whose
`metadata.alternate_art`, `metadata.overnumbered`, and `metadata.signature`
flags are all false. Among standard printings, prefer the lowest numeric
`collector_number`, then an unsuffixed public code, then the selector's stable
code tie-breakers. `metadata.signature` is a presentation flag;
`classification.supertype: "Signature"` is gameplay data and must not exclude a
printing.

Always carry `media.image_url` from the selected canonical card definition into
canonical publication and deck snapshots. Keep alternate printings in the
source corpus, but never let them overwrite the default gameplay identity. If a
printing group has no standard candidate, leave it unpublished and surface it
for explicit catalog review. When changing ingestion or card-resolution code,
group duplicates before building maps and preserve corpus-order independence.

## Gameplay Validation and Tests

Manual in-game validation is the authoritative acceptance gate for gameplay behavior.
Do not create, update, repair, or expand automated gameplay integration,
end-to-end, or regression tests for card behavior changes.

When the user explicitly reports that one or more cards have passed manual
gameplay validation, persist that result in the corresponding set ledger under
`data/implementation-status/<set-code>.json` in the same task. Use
`npm run catalog:update-implementation-status` rather than editing the ledger by
hand, include the validated card codes, a stable behavior-family identifier,
and a concise note describing the accepted manual gate. Use
`manual_family_passed` for acceptance of the tested behavior family. Use
`accepted` only when the user explicitly accepts the complete gameplay identity
or applicable completion scope, rather than inferring it from a narrower
scenario. Group cards by set when an acceptance spans multiple ledgers, then run
`npm run catalog:check-implementation-status` and include the ledger changes in
the next commit. Do not copy milestone-specific card lists or acceptance results
into `AGENTS.md`; those belong in the set ledger and relevant family handoff.

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

### Synthetic fixtures are not renamed card tests

Changing a canonical card's name and code to `SYN-*` does not make its test a
primitive test. A test is still card-specific when it reproduces the card's
complete trigger, conditions, selectors, effects, thresholds, and outcome in
one scenario. Do not create synthetic equivalents of complete card rules text.

Decompose the behavior by engine responsibility. Test these independently when
they are the contracts at risk:

- an event producer emits the correct event type, subject, actor, and metadata;
- a trigger routes matching event types and subject relationships and rejects
  non-matches;
- a condition evaluates operators, ownership, locations, and boundary values;
- a selector returns exactly the eligible objects, including exclusion rules;
- an effect mutates only its supplied or routed targets;
- turn history records the event under the correct subject owner;
- a one-shot permission is consumed once by its matching engine operation;
- chain priority, simultaneous batching, or decision cleanup follows its engine
  contract.

Use a production transition only when the transition boundary itself is the
primitive under test, such as card play consuming a seeded permission, movement
emitting origin metadata, or Awakening batching ready events. Do not add a
triggered reward to an event-producer test merely to prove that a complete card
composition works. Handler-level execution is preferred for an isolated
selector, condition, cost, or effect contract.

Before keeping a test, ask: **Would this test remain useful if the card that
revealed the problem were removed from the game?** If not, delete or decompose
it and validate the full card manually.

### Primitive boundary and lifecycle coverage

Testing two primitives independently does not establish that their handoff is
correct. When gameplay behavior composes existing primitives, explicitly review
each boundary where ownership, identity, timing, location, or control passes
from one subsystem to another. Add a focused synthetic boundary test when that
handoff is stateful, lossy, deferred, or otherwise capable of changing the
meaning of the data.

Important boundaries include:

- action projection -> submitted action -> server validation;
- selector binding -> declaration cost payment -> effect resolution;
- event producer -> attribution/history -> trigger routing;
- effect execution -> pending decision or replacement -> resumed execution;
- zone movement -> locked target/reference preservation;
- permission creation -> matching operation -> exact-once consumption;
- prevention or replacement -> suppressed/performed event emission;
- chain completion -> continuation, priority, and pending-state cleanup.

Use production transitions only when the handoff itself is the contract under
test. Keep each fixture schema-valid, minimal, synthetic, and limited to the two
or three responsibilities needed to observe that boundary. Do not reproduce a
complete canonical card merely to exercise the composition.

For stateful primitives, cover the applicable lifecycle matrix rather than only
the successful path:

- accept and decline;
- sufficient and insufficient payment;
- valid and invalid or zone-changed references;
- immediate and chain-deferred resolution;
- replacement performed and original action performed;
- first use, repeated use, and cleanup;
- owning player, affected player, and new decision owner when they differ.

Assert observable invariants at these boundaries. In particular:

- an action exposed by projection must be executable from the same state and
  selections;
- declaration-cost selections that move zones remain available as paid cost
  records but are not revalidated as unresolved effect targets;
- suspended resolution has an explicit continuation and resumes after the last
  completed instruction without repeating prior work;
- a replaced event is suppressed, while an unreplaced event is emitted exactly
  once with its original attribution;
- a consumed one-shot permission cannot apply again;
- completion, decline, invalidation, and cancellation remove pending decisions,
  continuations, temporary permissions, and other transient state they own.

Before publishing a behavior composition, record a small primitive coverage map
in the relevant family or implementation document. Name the producer, consumer,
handoff contract, lifecycle branches, and focused synthetic coverage. Do not
describe this map or its tests as card acceptance. If two primitives are already
tested independently but their shared boundary is not, treat the boundary as
untested.

### Permission, restriction, and scope coverage

A test that proves an operation is allowed does not establish the boundaries of
that permission. Whenever a primitive grants, prevents, replaces, redirects, or
changes the legality of an operation, test both entitlement and containment.
The minimum useful fixture normally contains the intended beneficiary and one
nearby non-beneficiary that differs along exactly one relevant scope axis.

Identify every scope dimension encoded or implied by the primitive, including:

- source versus another object;
- owner, controller, actor, affected player, and opponent;
- selected object versus an unselected object;
- source location, another controlled location, open location, and opposing
  location;
- active zone versus each normally active or nearby inactive zone;
- current event subject versus another object with the same definition;
- current turn, one-shot use, or other duration boundary;
- permission source active, inactive, moved, exhausted, removed, or
  zone-changed.

For each applicable scope dimension, include a paired assertion:

- the intended beneficiary, zone, destination, event, or operation is included;
- the closest non-beneficiary or forbidden alternative is excluded and remains
  unchanged if submitted through a stale or malformed path.

Do not model materially different statements with one unscoped flag. Wording
such as "me," "this," "selected," "friendly," "enemy," "at this location,"
"from this zone," and "this turn" must become explicit primitive parameters or
an equally explicit engine contract. Determine whether a modifier is additive,
exclusive, or replacing, and test that distinction. In particular, an
additional active zone or legal destination must not silently preserve a normal
zone or grant the same permission to other objects unless the contract says so.

When legality is exposed through player actions, exercise the complete boundary
with the same synthetic state:

1. Assert that projection exposes every legal option and omits the nearest
   illegal option.
2. Submit a projected legal option and assert the intended mutation.
3. Submit or directly validate the omitted/stale option at the server boundary
   and assert rejection or an explicit no-op with no resource, zone, history,
   permission, or pending-state corruption.
4. Change or remove the permission source between projection and execution when
   that state can become stale, then repeat the server-side assertion.

When a new parameter gives stricter meaning to previously persisted behavior,
cover both new explicit data and supported legacy data. Legacy compatibility
must infer only what the old approved data actually states; it must not restore
the original over-broad behavior. If safe inference is impossible, reject the
legacy state or require migration rather than silently widening permission.

Before keeping a primitive test, ask both questions:

- What proves that the intended object can receive this behavior?
- What proves that the nearest unintended object cannot receive it?

If the test answers only the first question, its scope coverage is incomplete.

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

## Gameplay Debug Requests

When a user reports an in-game gameplay issue, ask for the JSON produced by the
match simulator's **Copy debug data** button when it is not already included.
Treat that bundle as debugging evidence, not as a permanent test fixture.

The bundle contains the authoritative current game document, both deck
snapshots, and persisted events. It excludes player tokens and token hashes.
Use it to identify the smallest reusable primitive contract that failed.

For a durable automated test:

1. Reduce the reported state to the minimum synthetic state that reproduces the
   primitive failure.
2. Replace canonical codes, names, definitions, and deck contents with `SYN-*`
   cards and anonymous metadata.
3. Build a schema-valid `GameDocument`; do not use an unchecked cast to hide
   missing state fields.
4. Classify the failed responsibility: producer, routing, condition, selector,
   effect, history, permission consumption, chain, or decision orchestration.
5. Test an isolated condition, selector, cost, or effect through its primitive
   handler. Use `gameplayActions` plus `performGameplayTransition` or
   `performGameplayAction` only when action availability or the transition
   boundary is the contract under test.
6. When chain priority, choices, or deferred selections are the contract, drive
   them through public game actions; otherwise do not add those subsystems to
   the fixture.
7. Assert the intended observable state delta, important non-mutations, and
   resolution cleanup. Do not snapshot the entire game document.
8. Keep the test only when it protects a reusable primitive contract. The
   reported card remains subject to manual in-game validation.

Debug bundles capture only the current persisted version. If the failure is
about an action that has not yet been submitted, copy the data before submitting
it. If it has already happened, copy immediately and describe the exact action,
selected targets, observed result, and expected result.
