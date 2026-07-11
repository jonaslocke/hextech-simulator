# Riftbound Full Card Corpus Ingestion Plan

Snapshot date: 2026-07-11

## 1. Objective

Expand Hextech Simulator from its current playable-card baseline into complete,
set-by-set Riftbound card corpus support.

This plan starts from the system that already exists after the Garen ingestion,
BO3 implementation, sideboarding implementation, and their follow-up fixes. It
does not preserve those implementation sessions as separate planning eras.
Their durable outcomes are expressed here as current engine contracts.

The program succeeds when every gameplay-distinct card and every required token
in the active set:

- exists in the card catalog;
- has an approved executable behavior model;
- is supported through reusable runtime primitives;
- can participate in valid permanent deck configurations;
- works through fresh full matches, including BO3 and sideboarding where
  applicable; and
- is explicitly accepted by the user after manual validation.

The work remains incremental by set, but each set is treated as part of one
cumulative corpus. Later sets extend the same primitive catalog and game engine;
they do not create independent implementations.

## 2. Current Baseline

The following capabilities are established foundations for this plan and are not
milestones to implement again:

- the existing Lux, Annie, Master Yi, and Garen playable decks;
- the card-set import, behavior review, and canonical card approval workflow;
- reusable behavior primitives and server-authoritative game execution;
- viewer-safe game projections and server-validated player intents;
- BO3 match state, game results, between-games flow, and sideboarding;
- permanent selectable deck persistence;
- fresh per-game runtime card instances created from stable registered card
  copies; and
- manual fresh-match validation as the final gameplay authority.

When future ingestion exposes a flaw in this baseline, the fix belongs in the
shared primitive, catalog, deck, match, projection, or persistence layer that
owns the behavior. The plan must not create card-name-specific or set-specific
engine branches to preserve an old implementation.

## 3. Corpus Roadmap

The remaining corpus is ingested in this order:

| Order | Set                  | Scope                                | Input gate                                            |
| ----: | -------------------- | ------------------------------------ | ----------------------------------------------------- |
|     1 | Origins (`OGN`)      | Complete set and all required tokens | Set JSON and two user-provided validation decks       |
|     2 | Spiritforged (`SFD`) | Complete set and all required tokens | Set JSON and two user-provided validation decks       |
|     3 | Unleashed (`UNL`)    | Complete set and all required tokens | Set JSON and two user-provided validation decks       |
|     4 | Vendetta (`VEN`)     | Complete set and all required tokens | Final set JSON and two user-provided validation decks |

A set does not open until the preceding set is accepted. Vendetta must wait for
final JSON; prerelease or unstable data is not an accepted input.

## 4. Authorities and Repository Locations

### 4.1 Rules authority

Gameplay behavior must be derived only from:

1. `docs/riftbound_core_rules_reference.md`
2. the card text in the provided set JSON

Codex must not search online for rulings, errata, Discord discussions,
prerelease interpretations, or unofficial examples.

When the rules reference and card text do not determine one implementation,
Codex must stop and request a user ruling. The user will update the local rules
reference before implementation continues.

### 4.2 Set source data

Set JSON source files must be read from:

```text
data/sets
```

These files are the source of truth for card ingestion. Generated catalog or
tracking artifacts must not replace them.

### 4.3 Validation decks

The user will provide two validation decks for each full-set milestone under:

```text
docs/full-ingestion-decks/<SET_CODE>/
```

Expected folders are:

```text
docs/full-ingestion-decks/OGN/
docs/full-ingestion-decks/SFD/
docs/full-ingestion-decks/UNL/
docs/full-ingestion-decks/VEN/
```

Codex must not invent or select the decklists. Once implemented, these decks are
permanent selectable decks, not temporary test fixtures.

### 4.4 Program documentation

This plan lives at:

```text
docs/full-card-ingestion/plan.md
```

Any companion tracking, analysis, or handoff file created specifically for this
program must be created under:

```text
docs/full-card-ingestion/
```

## 5. Non-Negotiable Program Decisions

### 5.1 Definition of done

A set is complete only after the user manually validates fresh full matches and
explicitly accepts the set.

Catalog upload, behavior approval, typecheck, build, lint, automated checks, and
successful deck creation are implementation checkpoints. They are not final
acceptance.

Until acceptance, the only valid completion-facing status is:

```text
Awaiting Manual Acceptance
```

### 5.2 Full-set completeness

A full-set milestone is blocked while any gameplay-distinct card or required
token remains:

- unreviewed;
- unsupported;
- ambiguously modeled;
- missing required source data;
- unapproved;
- non-executable; or
- affected by an unresolved manual gameplay defect.

Partial catalog coverage or successful validation of only the two provided decks
does not prove full-set completeness.

### 5.3 Card identity and printed variants

Alternate art, showcase, overnumbered, signature-printing, star, and equivalent
printed variants collapse into one gameplay definition when they represent the
same card behavior.

Coverage and executability are measured by gameplay definition, while the
existing catalog may retain the printed source entries and media needed to
represent those variants.

Codex must preserve the project's established identity policy and must not
create separate runtime behavior solely because a printing has a different
collector treatment.

### 5.4 Behavior change detection

Rules-text-focused hashing remains the behavior-change gate.

Cards are stable real objects for this ingestion program. Codex must not add a
metadata-drift, broad full-definition-diff, or backward-compatible reimport
system unless the user explicitly requests one in the future.

### 5.5 Required tokens are corpus dependencies

Token completeness is evaluated across the cumulative corpus, not only inside
the active set file.

Before behavior modeling, Codex must build a token dependency inventory that
connects:

- each card that creates, copies, replaces, moves, modifies, counts, or
  references a token;
- the canonical token definition already available anywhere in `data/sets`;
- the token's gameplay identity and printed variants;
- its card type, stats, tags, rules text, and media;
- placement rules, controller, ownership, readiness, and quantity;
- copy or transformation behavior;
- continuous modifiers that must apply immediately; and
- board-leave behavior, including tokens ceasing to exist when required by the
  rules.

A token definition does not need to be duplicated in every set that references
it. It must, however, exist somewhere in the available corpus and be executable.
If no sufficient token definition exists, the active milestone is blocked and
Codex must ask the user to provide the missing token data.

### 5.6 Primitive-first implementation

Runtime behavior must be implemented through reusable primitives and generic
game systems.

Card-name-specific runtime branches are not acceptable. A card name may be used
for import diagnostics, migration reporting, or temporary discovery analysis,
but not as the condition that executes gameplay behavior.

### 5.7 Regression approval

A new primitive that does not alter existing behavior may be implemented within
the active milestone.

An extension or correction that can change already accepted behavior requires
user approval before implementation. Codex must first report:

- the primitive being changed;
- why the current primitive is insufficient;
- the affected existing cards and permanent decks;
- the behavior before and after the proposed change;
- the regression risk; and
- the smallest useful manual regression scope.

Codex must not silently broaden the user's manual validation burden.

### 5.8 Testing discipline

Manual gameplay is the acceptance authority.

Codex should prefer zero new automated tests during ingestion defect loops.
Automated checks are appropriate only when they are narrow, deterministic, and
cheap to maintain, such as:

- set-schema, parser, repository, or catalog validation;
- a focused primitive unit check;
- a deterministic mapper or intent-builder check; or
- a small regression test that would have caught the exact confirmed defect.

Broad gameplay integration suites, component-structure tests, and large
card-by-card test matrices must not be used as the proof that a set works.

### 5.9 Old matches and database cleanup

Old persisted matches do not require backward compatibility after ingestion or
runtime changes. Manual validation must use fresh matches created from the
current catalog, deck configuration, and runtime.

Codex must not wipe the database. The user owns database cleanup when needed.

### 5.10 Accepted milestone commits

After user acceptance, Codex must commit the accepted set work before starting
the next set.

The commit must contain only the accepted milestone and the tracking updates
that record its acceptance. Unrelated user changes must not be included.

## 6. Engine Contracts the Corpus Must Preserve

These contracts consolidate the durable outcomes of the Garen, BO3, and
sideboarding work.

### 6.1 Server authority

The server remains the source of truth for:

- legal actions;
- card and ability costs;
- targets and selections;
- pending choices and ordering;
- deck legality;
- sideboard submission;
- game and match transitions;
- hidden information; and
- persisted state.

The client consumes projections and submits intents. It must not recreate
legality or resolve gameplay independently.

### 6.2 Card identity layers

The implementation must preserve the distinction between:

1. source card or canonical gameplay definition;
2. imported or persisted deck configuration;
3. stable registered card-copy identity for a match;
4. fresh opaque runtime `instanceId` for each game; and
5. runtime-created objects such as tokens, copies, or generated cards.

Ownership, controller, side, zone, and role must come from explicit state fields.
They must never be inferred from the text or shape of an ID.

Active deck cards must not be duplicated into created-card storage. Created-card
state is reserved for objects that are actually generated during gameplay.

### 6.3 Match scope and game scope

Game state and `GameProjection` remain game-scoped. BO3 score, completed-game
summaries, between-games readiness, and sideboarding remain match-scoped.

Gameplay UI must not receive match-level responsibilities merely because a new
card primitive needs additional state.

### 6.4 Current deck configuration

New games in a match must be built from the accepted current deck configuration,
not from the original imported deck source.

Sideboard drafts may temporarily be illegal while the user edits them. Final
submission must validate all applicable construction rules, copy conservation,
Chosen Champion eligibility, sideboard limits, and fixed-section constraints.

Runes and Battlefields remain fixed across the match according to the established
sideboarding product decision.

Deck legality must still follow the local rules reference:

- the Champion Legend determines the Main Deck's Domain Identity;
- the Rune Deck must be legal for the active Chosen Champion; and
- any Chosen Champion selected after sideboarding must remain compatible with
  the fixed Rune Deck.

Chosen Champion eligibility and the legal registered-card IDs must remain
server-projected and server-validated.

### 6.5 BO3 lifecycle and stale state

Between-games actions must be tied to the active between-games state and rejected
or refreshed after the match moves forward.

Projection and polling behavior must preserve version ordering:

- a stale or equal response must not overwrite newer intent results;
- polling must stop after match completion;
- completed-game acknowledgement must not be confused with match completion;
- each next game must create fresh runtime instances from the current accepted
  configuration; and
- state from one game must not leak into later games.

### 6.6 Behavior state and reusable systems

New cards may require extensions to selectors, pending choices, effects,
triggers, replacements, continuous modifiers, cost calculation, movement,
attachments, tokens, or visibility.

Those extensions must live in the generic subsystem that owns the concept. They
must preserve:

- viewer-safe projections;
- server-side target validation;
- resumable pending decisions;
- explicit object versioning where selections can become stale;
- immediate recomputation of relevant continuous modifiers; and
- existing player intent contracts unless the user approves a contract change.

### 6.7 Runtime size and latency

Full-corpus support must not grow match documents by copying immutable catalog
or deck data into runtime state, repeatedly reload immutable data on common
projection paths, or route ordinary gameplay intents through unnecessarily heavy
match-level persistence work.

Before manual acceptance, Codex must perform a short sanity check that common
projection reads and ordinary actions remain suitable for interactive play. An
obvious latency or document-growth regression introduced by the milestone is a
blocker.

## 7. Unified Set Ingestion Workflow

Every full set follows this workflow. Set sections must not redefine it.

### Phase 1 — Input readiness

Codex must:

1. read this plan and the current tracking state;
2. read `docs/riftbound_core_rules_reference.md`;
3. read the active set JSON from `data/sets`;
4. read the two user-provided validation decks;
5. validate the set JSON shape and required identity fields;
6. confirm all records belong to the expected set;
7. identify gameplay-equivalent printed variants; and
8. confirm that the milestone is not blocked by missing source files.

No runtime implementation starts before input readiness is complete.

### Phase 2 — Corpus analysis and implementation proposal

Before changing runtime code, Codex must produce:

- a primitive delta grouped by reusable behavior;
- full card coverage counts by gameplay definition;
- a corpus-wide token dependency inventory;
- missing rule or token blockers;
- primitives that are already executable;
- new primitives required;
- existing primitives that need extension;
- regression-risking changes requiring user approval;
- engine subsystems affected by the set;
- the proposed implementation order; and
- manual scenarios needed for unique behavior not exercised by the two decks.

This phase is analysis, not behavior approval. Heuristic primitive discovery may
suggest a model, but it must not silently publish or certify behavior.

If a rule, token, contract change, or regression decision is blocked, Codex must
stop with a precise request before implementing the blocked work.

### Phase 3 — Full set catalog intake

After input readiness and blocker review, upload the complete set into the
existing card-catalog workflow.

Catalog intake must:

- preserve the source JSON as the source of truth;
- map printed variants to the established gameplay identity policy;
- retain imported-but-unapproved cards as non-gameplay-ready;
- surface unsupported or ambiguous behavior explicitly; and
- avoid inventing a new publication path outside the existing catalog workflow.

Catalog intake does not mean the cards are executable.

### Phase 4 — Primitive implementation and behavior approval

Codex must implement or extend the reusable runtime primitives approved for the
milestone, then approve exact behavior models through the existing catalog
workflow.

For each gameplay definition:

1. every rules-text clause must be accounted for;
2. every referenced selector, condition, cost, timing, choice, trigger,
   replacement, modifier, or effect must map to executable runtime support;
3. all token dependencies must resolve to executable definitions;
4. unsupported and ambiguous clauses must remain unapproved; and
5. approval must be based on the current rules-text hash.

Primitive implementation and card approval may progress in batches, but the
milestone remains incomplete until coverage reaches 100 percent.

### Phase 5 — Full corpus completeness gate

Before deck integration, Codex must report:

| Coverage measure                        | Required result |
| --------------------------------------- | --------------- |
| Gameplay-distinct cards reviewed        | 100%            |
| Behavior clauses modeled                | 100%            |
| Required primitives executable          | 100%            |
| Required tokens defined and executable  | 100%            |
| Rule blockers                           | 0               |
| Unsupported or ambiguous approved cards | 0               |

A card outside the two validation decks still blocks the set if its behavior is
not executable.

### Phase 6 — Permanent deck integration

For each user-provided deck, Codex must:

- parse and validate the deck;
- validate Champion Legend, Chosen Champion, domain, Rune, Battlefield,
  signature, copy-limit, and sideboard rules;
- persist it as a new permanent selectable deck;
- expose it through the existing data-driven local and online deck selectors;
- preserve registered card-copy identity through sideboarding; and
- confirm fresh games are built from the current accepted configuration.

Codex must not replace an existing selectable deck merely to add the new
validation deck.

### Phase 7 — Technical readiness

Before asking for manual validation, Codex must complete only the technical
checks relevant to the work performed:

- set/catalog validation;
- behavior-definition synchronization;
- typecheck;
- build and lint when the touched code requires them;
- narrow deterministic checks justified by this plan;
- fresh local and online match creation;
- ordinary projection/action latency sanity; and
- fresh runtime startup when backend hot reload cannot be trusted.

Passing these checks moves the milestone to manual validation. It does not
complete the milestone.

### Phase 8 — Manual gameplay validation

Manual validation must use fresh matches and must include:

1. full matches using both provided decks;
2. at least one complete BO3 path for the active set, including sideboarding and
   next-game creation;
3. a scenario for every new primitive;
4. a scenario for each approved extension of an existing primitive;
5. explicit scenarios for unique behavior not naturally exercised by the two
   decks; and
6. only the focused earlier-deck regression scope approved by the user.

Validation should exercise the actual player-facing path, including projected
legal actions, target and choice UI, chain/focus/priority behavior, game result,
between-games state, and match completion when relevant.

### Phase 9 — Defect correction

When manual validation exposes a defect, Codex must first inspect the exact
failing state instead of guessing from the card name or screenshot alone.

Useful evidence includes:

- match and game identifiers;
- match and game state versions;
- active between-games identifier when relevant;
- viewer/player;
- endpoint and request payload;
- response or projected legal actions;
- canonical behavior model;
- registered card and runtime instance identities;
- pending choices, selected targets, chain entries, and object versions;
- current deck configuration; and
- expected versus actual behavior.

The fix must be applied to the reusable owner of the defect. After catalog or
runtime changes, validation restarts from a fresh match. Old-match compatibility
must not be added unless the user explicitly requests it.

### Phase 10 — Acceptance and closeout

After implementation and manual testing, Codex must report:

- final primitive coverage;
- final card and token coverage;
- permanent deck status;
- manual scenarios completed;
- focused regressions completed;
- remaining blockers, if any; and
- milestone status.

The milestone remains `Awaiting Manual Acceptance` until the user accepts it.
After acceptance, Codex updates tracking, commits the accepted work, and only
then opens the next set.

## 8. Tracking Model

Use one companion tracking file unless the volume of data makes a split clearly
necessary. The default location is:

```text
docs/full-card-ingestion/tracking.md
```

Tracking is updated throughout the milestone, not reconstructed at the end.

### 8.1 Set status

| Set | Input               | Primitive analysis | Catalog intake | Executable coverage | Decks | Manual validation | User acceptance |
| --- | ------------------- | ------------------ | -------------- | ------------------- | ----- | ----------------- | --------------- |
| OGN | Pending/Ready       | Pending            | Pending        | 0%                  | 0/2   | Pending           | Pending         |
| SFD | Pending/Ready       | Pending            | Pending        | 0%                  | 0/2   | Pending           | Pending         |
| UNL | Pending/Ready       | Pending            | Pending        | 0%                  | 0/2   | Pending           | Pending         |
| VEN | Final JSON required | Pending            | Pending        | 0%                  | 0/2   | Pending           | Pending         |

Recommended set statuses:

```text
Waiting for input
Input ready
Analysis in progress
Blocked by rule
Blocked by token data
Regression approval required
Catalog intake
Primitive implementation
Behavior approval
Completeness validation
Deck integration
Manual validation
Awaiting Manual Acceptance
Accepted
```

### 8.2 Primitive ledger

| Primitive | First card in active set | Active-set cards | Existing status | Proposed change | Rule status | Regression approval | Manual scenario | Final status |
| --------- | ------------------------ | ---------------: | --------------- | --------------- | ----------- | ------------------- | --------------- | ------------ |
| TBD       | TBD                      |              TBD | TBD             | TBD             | TBD         | TBD                 | TBD             | TBD          |

### 8.3 Card coverage ledger

| Set | Gameplay identity | Representative source code | Printed variants | Clauses | Primitive coverage | Token dependencies | Approval | Executable | Manual issue |
| --- | ----------------- | -------------------------- | ---------------: | ------: | ------------------ | ------------------ | -------- | ---------- | ------------ |
| TBD | TBD               | TBD                        |              TBD |     TBD | TBD                | TBD                | TBD      | TBD        | TBD          |

### 8.4 Token dependency ledger

| Token identity | Definition source | Referencing sets/cards | Behavior executable | Placement/lifecycle coverage | Missing data | Final status |
| -------------- | ----------------- | ---------------------- | ------------------- | ---------------------------- | ------------ | ------------ |
| TBD            | TBD               | TBD                    | TBD                 | TBD                          | TBD          | TBD          |

### 8.5 Deck and BO3 ledger

| Set | Deck | Permanent ID | Construction valid | Local selector | Online selector | Full match | BO3 + sideboard | Accepted |
| --- | ---- | ------------ | ------------------ | -------------- | --------------- | ---------- | --------------- | -------- |
| TBD | TBD  | TBD          | TBD                | TBD            | TBD             | TBD        | TBD             | TBD      |

### 8.6 Regression approval ledger

| Primitive | Existing cards/decks affected | Proposed behavior change | Risk | Approved scope | User decision | Result |
| --------- | ----------------------------- | ------------------------ | ---- | -------------- | ------------- | ------ |
| TBD       | TBD                           | TBD                      | TBD  | TBD            | Pending       | TBD    |

## 9. User Decision and Handoff Contract

Whenever Codex stops for a ruling, approval, missing token, or manual validation,
it must state exactly:

- what is blocked;
- what evidence was found;
- what the user must decide or provide;
- the acceptable response forms;
- whether any independent work can continue; and
- what Codex will do after the response.

### 9.1 Rule request format

```text
Card(s):
Primitive or mechanic:
Missing or unclear rule:
Why the local rules reference and card text are insufficient:
Possible interpretations, if any:
Implementation and regression impact:
Required user decision:
```

### 9.2 Regression approval format

```text
Primitive:
Current behavior:
Proposed behavior:
Why the extension is required:
Existing cards/decks affected:
Regression risk:
Proposed minimum manual regression scope:
Required user decision: Approve / Reject / Change scope
```

### 9.3 Manual validation handoff

```text
Set:
Status: Awaiting Manual Acceptance
Permanent decks:
Scenarios to validate:
Complete BO3 path required:
Focused earlier-deck regressions:
Known limitations or blockers:
Expected user response: Accept / Report defects / Provide ruling
```

## 10. Stop Conditions

Codex must stop the blocked work when:

- a required rule is missing or supports multiple valid implementations;
- required token data is unavailable anywhere in the current corpus;
- a gameplay-distinct card still has unsupported or ambiguous behavior;
- a primitive extension has regression potential and lacks user approval;
- implementation would change a public player-intent or projection contract
  without user approval;
- deck legality cannot be determined from the local rules and current product
  decisions;
- a manual defect contradicts the expected behavior and the exact state has not
  been investigated;
- the active set cannot reach complete executable coverage; or
- Vendetta final JSON is not available.

A stop condition blocks the dependent work. Codex may continue only with clearly
independent work that cannot prejudge the missing decision.

## 11. Set Acceptance Criteria

A set is accepted only when all of the following are true:

- the complete set has passed catalog intake;
- every gameplay-distinct card has approved executable behavior;
- every required token dependency is defined and executable;
- there are no unresolved rule blockers;
- there are no unapproved regression-risking primitive changes;
- both user-provided decks are valid permanent selectable decks;
- manual full matches have completed;
- at least one complete BO3 and sideboarding path has completed;
- unique primitive behavior outside the validation decks has been exercised;
- approved focused regressions have completed;
- no unresolved gameplay or interactive-latency blocker remains; and
- the user explicitly accepts the milestone.

Technical completion without user acceptance is not completion.

## 12. Codex Milestone Execution Prompt

Use this template to begin a set milestone.

```text
You are implementing the <SET_CODE> full card corpus milestone for Hextech
Simulator.

Read and follow:
- docs/full-card-ingestion/plan.md
- docs/full-card-ingestion/tracking.md, if it exists
- docs/riftbound_core_rules_reference.md
- the <SET_CODE> source JSON in data/sets
- the two user-provided decks in docs/full-ingestion-decks/<SET_CODE>/

Do not search online for Riftbound rules or rulings.

First, complete the input-readiness and corpus-analysis phases. Before changing
runtime behavior, report:
- primitive delta;
- card coverage summary by gameplay identity;
- corpus-wide token dependency inventory;
- missing rules or token data;
- regression-risking primitive extensions requiring user approval;
- affected engine subsystems;
- proposed implementation order; and
- manual scenarios, including unique behavior outside the two decks.

Then follow the existing flow:
primitive discovery -> full set catalog intake -> reusable primitive support ->
behavior approval -> 100% card/token executability -> permanent deck integration
-> fresh manual full matches and BO3 -> user acceptance.

Preserve the established server-authoritative, identity, match/game,
sideboarding, projection-version, and old-match policies in this plan.

Do not mark the milestone complete. End implementation handoff with:
Status: Awaiting Manual Acceptance
and state exactly what the user must validate.
```
