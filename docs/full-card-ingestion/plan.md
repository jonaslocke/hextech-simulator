# Riftbound Full Card Ingestion Plan

Snapshot date: 2026-07-10

## 1. Purpose

Plan the next card-ingestion work for Hextech Simulator in a controlled,
resumable, and trackable way.

The ingestion strategy is intentionally incremental:

1. Ingest the active milestone scope.
2. Detect and implement reusable primitive behavior.
3. Upload the set or scoped cards into the card catalog.
4. Approve executable behavior models.
5. Expose the validation decks permanently.
6. Validate through manual full matches.
7. Fix behavior gaps.
8. Accept the milestone manually.
9. Only then move to the next milestone.

The long-term direction is broader than deck ingestion, but the validation model
remains gameplay-first. Full-set milestones are not complete until every card and
required token in the set has executable behavior and the user accepts the
manual gameplay result.

## 2. Core Decisions

These decisions define the plan and should not be changed by Codex without an
explicit user decision.

### 2.1 Definition of done

A milestone is done only after the user manually validates full matches and
accepts the behavior.

Catalog upload, behavior approval, passing tests, and successful builds are
necessary checkpoints, but they are not final acceptance.

### 2.2 Full-set completeness

For full-set milestones, Codex must block milestone completion until every card
and every required token in that set has executable behavior.

Cards may temporarily sit in unsupported, ambiguous, or runtime-pending states
during implementation, but the milestone cannot be marked complete while any
card or required token remains non-executable.

### 2.3 Normal ingestion flow

Codex must follow this flow for each milestone:

```text
primitive discovery
  -> primitive delta review
  -> rule blocker resolution, if needed
  -> reusable primitive implementation
  -> upload set or scoped cards into card catalog
  -> approve executable behavior models
  -> expose permanent validation decks
  -> manual full-match testing
  -> fixes and retesting
  -> user acceptance
```

“Block the milestone” means:

```text
Do not move to the next milestone.
Do not call the milestone accepted.
Do not treat partial executable coverage as complete.
```

It does not mean Codex should invent a separate publication model outside the
existing card-catalog workflow.

### 2.4 Deck validation per set

For each full set, the user will provide two playable decks that contain cards
with behaviors tied to that set.

Deck files will be placed under:

```text
docs/full-ingestion-decks/<SET_CODE>/
```

Expected set folders:

```text
data/decks/full-ingestion-decks/OGN/
data/decks/full-ingestion-decks/SFD/
data/decks/full-ingestion-decks/UNL/
data/decks/full-ingestion-decks/VEN/
```

The user will decide the decklists later. Codex must not invent or select those
decks.

The validation decks are permanent selectable decks, not temporary test-only
fixtures.

### 2.5 Set JSON source path

All set JSON files used for ingestion must be read from:

```text
data/sets
```

Codex must not assume set JSON files live under `docs/` or any generated catalog
folder. Generated artifacts may be produced by the implementation, but the set
JSON source of truth for ingestion is `data/sets`.

This plan lives in the repository as `docs/full-card-ingestion/plan.md`. If Codex
needs to create any companion files, work notes, tracking ledgers, or generated
planning artifacts for this ingestion program, those files must be created under
`docs/full-card-ingestion/`.

### 2.6 Rules authority

Codex must use only:

1. `docs/riftbound_core_rules_reference.md`
2. The card text from the provided set JSON

If a required rule is missing, unclear, or contradicted by a card, Codex must
stop and ask the user for a ruling. The user will update
`docs/riftbound_core_rules_reference.md`, and only then should implementation
continue.

Codex must not search online for rulings, errata, Discord discussions, prerelease
interpretations, or unofficial examples.

### 2.7 Tracking priority

Track progress first by primitive behavior, then by card.

Primitive behaviors are the key planning unit because they are reusable. Card
coverage is the completeness layer that proves every card in the milestone has a
valid executable behavior model.

### 2.8 Card identity and variant policy

Alternate art, showcase, overnumbered, star cards, and equivalent printed
variants collapse into one gameplay definition, as already done by the current
project.

Codex must preserve this identity policy unless the user explicitly changes it.

### 2.9 Token policy

Tokens are part of set completeness.

If a card in the milestone creates, plays, references, or requires a token, then
that token must have card data and executable behavior coverage.

Missing token data blocks the milestone. If required token data is not present in
`data/sets`, Codex must stop and ask the user to provide it.

For full-set milestones, Codex should build a token inventory before modeling
individual cards. The inventory must cross-reference:

- printed token definitions in the set JSON;
- cards that create, play, move, modify, count, or reference those tokens;
- token variants that collapse to one gameplay identity;
- token placement requirements, including fixed destination, chosen destination,
  base, battlefield, "here", split counts, and controller/source ownership;
- token lifecycle requirements, including entering ready, recomputing continuous
  modifiers immediately, and ceasing to exist when leaving board zones.

Token support must be implemented as reusable runtime behavior. Codex must not
solve token cards through card-name-specific branches.

### 2.10 Behavior change detection policy

Rules-text-focused hashing remains the behavior-change gate.

Cards are treated as stable real objects for this ingestion program. Codex does
not need to plan for metadata drift, full-definition drift, or broad reimport
comparison outside the current rules-text-focused behavior workflow.

Codex must not replace the current behavior-change model with a metadata-driven
or full-card-definition-driven model unless the user explicitly requests that
change later.

### 2.11 Primitive regression policy

Primitive changes are allowed when they improve the game engine or make broader
card coverage possible.

However, every primitive change with regression potential must be approved by the
user before implementation. Codex must identify:

- the primitive being changed;
- the reason the change is needed;
- existing cards/decks affected;
- expected behavior before and after;
- suggested manual regression focus.

Codex must not silently expand the user’s manual testing burden.

### 2.12 Persistence and old-match policy

Do not plan for backward compatibility of old persisted matches.

Any match created before a new card-ingestion implementation is considered
outdated and not relevant for future validation. The user will handle database
cleanup manually when needed.

Codex must not wipe the database and must not treat runtime reset planning as a
milestone concern. Manual validation should use fresh matches created after the
current milestone implementation is ready.

### 2.13 Vendetta policy

Vendetta ingestion waits for final JSON only.

No prerelease Vendetta ingestion should begin unless the user explicitly changes
this decision. When the final JSON is available, the user will provide it under
`data/sets`.

### 2.14 M1 lessons for full-set ingestion

M1 produced durable workflow lessons. The transient bug notes and screenshots are
not part of this plan and should not be treated as permanent source material.
The lessons that matter for future milestones are:

- manual fresh-match validation is the primary proof of gameplay correctness;
- catalog approval, behavior-model approval, typecheck, build, and automated
  tests are useful checkpoints but did not catch the runtime issues found in M1;
- after catalog or runtime fixes, validation should use newly created matches,
  freshly synced deck snapshots, and the current runtime;
- old persisted matches can be discarded and should not drive compatibility work;
- when a manual issue is reported, Codex should inspect the canonical card data,
  deck snapshot, persisted game state, pending choices, chain entries, selected
  targets, token placements, and exact action payload before changing code;
- fixes should land in reusable primitives, selectors, token handling,
  continuous modifiers, chain/priority handling, or intent validation paths;
- tests should be minimal or omitted unless they directly protect a narrow,
  deterministic parser, schema, catalog, or primitive behavior.

Full-set ingestion should spend tokens on reusable primitive discovery, database
inspection, exact manual reproduction, and clear handoff notes instead of broad
automated gameplay tests.

## 3. Milestone Sequence

```text
M0  Operating model and tracking baseline
M1  Garen Proving Grounds deck ingestion
M2  Origins full set ingestion
M3  Spiritforged full set ingestion
M4  Unleashed full set ingestion
M5  Vendetta full set ingestion
```

Each milestone has the same gate structure:

```text
Input readiness
  -> primitive discovery
  -> rule-blocker resolution
  -> primitive implementation
  -> catalog upload
  -> behavior approval
  -> full card/token executability check
  -> permanent deck exposure
  -> manual deck/full-match validation
  -> user acceptance
  -> commit accepted milestone changes
  -> next milestone opens
```

## 4. Global Codex Operating Rules

Codex must follow these rules for every milestone.

### 4.1 Before implementation

- Read `docs/riftbound_core_rules_reference.md` before making gameplay behavior
  changes.
- Read the relevant set JSON from `data/sets` and deck files for the active milestone.
- Compare new rules text against existing canonical cards and behavior
  definitions using the current behavior-change workflow.
- Build a primitive delta before implementing card behavior.
- Identify blockers before writing runtime code.
- Identify any primitive change with regression potential and request user
  approval before implementing that change.

### 4.2 During implementation

- Implement reusable primitive behavior, not card-specific runtime branches.
- Keep route handlers thin and game behavior inside server/game modules.
- Keep imported-but-unapproved behavior out of gameplay-ready state.
- Preserve viewer-safe projections and server-side target validation.
- Preserve existing player intent contracts unless explicitly approved.
- Keep setup, card choices, targeting, and pending choices server-authoritative.
- Preserve the established card identity policy that collapses gameplay-equivalent
  variants into one definition.
- Treat missing required token data as a blocker.

### 4.3 When a rule is missing

Codex must stop and produce a ruling request with:

```text
Card(s):
Primitive or mechanic:
Missing/unclear rule:
Why the current rules reference is insufficient:
Possible interpretations, if any:
Implementation impact:
```

The user will update `docs/riftbound_core_rules_reference.md`. Codex may continue
only after the reference is updated.

### 4.4 Testing discipline

Automated tests are optional checkpoints, not acceptance proof.

Codex should prefer zero new tests during ingestion defect loops unless a test
is clearly worth its maintenance and token cost. Acceptable cases are narrow:

- parser, schema, repository, or catalog checks that are cheap and deterministic;
- a focused primitive unit check when a reusable runtime primitive is changed;
- a small deterministic regression check for a confirmed bug, only when it would
  have caught the exact class of failure.

Codex must not add broad gameplay integration tests as proof of correctness for a
milestone. Manual full-match validation remains the required proof.

### 4.5 Manual acceptance gate

Every milestone must end in this state until the user accepts it:

```text
Status: Awaiting Manual Acceptance
```

Codex must not mark a milestone complete based only on code completion, test
success, build success, or catalog approval.

### 4.6 Post-acceptance commit

After the user accepts a milestone, Codex must commit the accepted milestone
changes before starting the next milestone.

The commit should include only the accepted milestone work and any tracking
updates needed to record that acceptance. Codex must not include unrelated user
changes in that commit.

### 4.7 Approval handoff clarity

Whenever Codex stops implementation to wait for user approval, a user ruling, or
manual validation, Codex must state the exact expectation from the user before
ending the turn.

The handoff must include:

- what the user should review or decide;
- the acceptable forms of response, such as approve, reject, or provide a
  ruling;
- whether implementation is blocked or can continue on a different task;
- what Codex will do next after the user responds.

### 4.8 Manual-first defect workflow

When manual validation finds a behavior issue, Codex should use this order before
making more changes:

1. Record the match ID, state version, endpoint, request payload, response, and
   expected behavior when the user provides them.
2. Inspect canonical card behavior, deck snapshots, persisted match state,
   pending choices, chain entries, selected targets, token placements, and object
   versions.
3. Replay or reason from the exact persisted state when possible.
4. Identify whether the issue is catalog data, behavior modeling, selector
   legality, pending-choice validation, chain/priority timing, continuous
   modifier recomputation, token lifecycle, or stale-match data.
5. Fix the reusable runtime or catalog path. Do not add old-match compatibility
   unless the user explicitly asks for it.
6. Resync catalog/decks or restart the dev server when the fix requires fresh
   runtime data.
7. Ask the user to validate in a fresh match and state exactly what scenario must
   be checked.

Manual issue notes should be summarized into durable process lessons only. Do
not preserve transient screenshot evidence or one-off bug documents in this plan
unless the user explicitly asks.

### 4.9 Integration risk checklist

Future full-set milestones should explicitly check these integration points:

- set JSON import -> canonical catalog -> behavior approval -> deck snapshot;
- deck selector exposure -> match creation -> fresh runtime data;
- card playability projection vs server-side intent validation;
- pending choices, selected target locks, token placements, and allocation
  payloads;
- simultaneous triggers, target choice timing, chain ordering, focus, and
  priority return;
- object version changes that should invalidate locked targets;
- continuous modifiers after unit play, token placement, movement, attack,
  defend, showdown, and location changes;
- token identity normalization, image/media projection, entering ready, split
  placement counts, and board-leave cleanup.

## 5. Tracking Model

This plan is meant to be resumed after interruptions. The following ledgers
should be maintained in the milestone work notes or in a companion tracking file.

### 5.1 Milestone Status Ledger

| Milestone | Scope | Status | Current blocker | Next action | User acceptance |
|---|---|---|---|---|---|
| M0 | Operating model | Not started | None | Confirm tracking files | Pending |
| M1 | Garen Proving Grounds deck | Not started | Need Garen decklist and OGS data in `data/sets` | Discover primitive delta | Pending |
| M2 | Origins full set | Not started | Need OGN JSON in `data/sets` + 2 decks | Wait for inputs | Pending |
| M3 | Spiritforged full set | Not started | Need SFD JSON in `data/sets` + 2 decks | Wait for inputs | Pending |
| M4 | Unleashed full set | Not started | Need UNL JSON in `data/sets` + 2 decks | Wait for inputs | Pending |
| M5 | Vendetta full set | Not started | Need final VEN JSON in `data/sets` + 2 decks | Wait for final data | Pending |

Recommended statuses:

```text
Not started
Input ready
Primitive discovery
Rule blocked
Regression approval needed
Primitive implementation
Catalog upload
Behavior approval
Card executability validation
Deck integration
Manual validation
Awaiting manual acceptance
Accepted
```

### 5.2 Primitive Behavior Ledger

Track this first. It is the main resumability layer.

| Primitive / mechanic | First seen in | Cards using it | Rule status | Runtime status | Tests | Manual scenario | Blocker |
|---|---|---:|---|---|---|---|---|
| Example: modifier.enter_ready | Existing | TBD | Covered | Executable | Existing/TBD | Play unit after effect | None |
| TBD | OGS/OGN/SFD/UNL/VEN | TBD | TBD | TBD | TBD | TBD | TBD |

Recommended primitive statuses:

```text
Existing executable
Existing needs approved extension
New primitive needed
Rule blocked
Regression approval needed
Implemented pending validation
Executable
Rejected / not applicable
```

Rule status values:

```text
Covered by rules reference
Covered by card text + Golden Rule
Needs user ruling
User ruling added to rules reference
```

### 5.3 Card Coverage Ledger

Track this after primitive discovery. A card is complete only when every behavior
clause is modeled and executable.

| Set | Card code | Name | Type | Behavior clauses | Primitive coverage | Executable | In deck validation | Notes |
|---|---|---|---|---:|---|---|---|---|
| OGS | TBD | TBD | TBD | TBD | TBD | No | TBD | TBD |

Recommended card statuses:

```text
Not reviewed
Vanilla / no executable text needed
Uses existing primitives
Needs approved primitive extension
Needs new primitive
Rule blocked
Missing required token data
Modeled pending approval
Approved executable
Manual issue found
Accepted
```

### 5.4 Token Coverage Ledger

Track tokens separately when a milestone contains or references tokens.

| Set | Token name | Source card(s) | Token data present | Behavior executable | Blocker | Notes |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD | No | No | Missing data | TBD |

A required token is complete only when:

- token data exists in `data/sets` or has been provided by the user;
- token identity is normalized;
- token behavior is executable;
- token placement count validation works for fixed and chosen destinations;
- split placement across base and battlefields works when rules allow it;
- continuous modifiers apply immediately to placed tokens;
- enter-ready modifiers apply to tokens when the rules say the token is played;
- tokens cease to exist when they would move to non-board zones;
- token image/media projection works in hand, board, trash, dialogs, and
  inspection surfaces;
- cards that create or reference the token can resolve correctly.

### 5.5 Deck Validation Ledger

For each provided deck, track whether the deck can be selected, loaded, and used
in full matches.

| Set | Deck file | Deck ID | Catalog valid | Permanent selector exposure | Match loads | Full match completed | Issues found | Accepted |
|---|---|---|---|---|---|---|---|---|
| OGN | docs/full-ingestion-decks/OGN/TBD | TBD | No | No | No | No | TBD | No |

Deck validation must include:

- deck parsing;
- domain identity;
- champion pairing;
- signature count;
- copy limits;
- required tokens or generated cards;
- local selector exposure;
- online selector exposure, if applicable;
- complete-match manual validation.

### 5.6 Primitive Regression Approval Ledger

Track this whenever a primitive extension may affect already accepted behavior.

| Primitive | Proposed change | Existing cards/decks affected | Regression risk | User approved? | Manual regression focus |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | No | TBD |

Codex must not implement regression-risking primitive changes until the user
approves them.

### 5.7 Manual Match Acceptance Ledger

Manual match testing is the final acceptance surface.

| Milestone | Matchup | Scenario focus | Result | Issue link / note | Accepted by user |
|---|---|---|---|---|---|
| M1 | Garen vs Lux | Baseline interaction | Pending | TBD | No |
| M1 | Garen vs Annie | Damage/removal interaction | Pending | TBD | No |
| M1 | Garen vs Master Yi | Combat modifier interaction | Pending | TBD | No |

Manual result statuses:

```text
Not run
Passed
Failed
Needs retest
Accepted
```

## 6. Milestone M0 — Operating Model and Tracking Baseline

### Goal

Prepare the project for resumable full-card ingestion before adding more cards.

### Inputs

- Current repository state.
- Existing canonical cards.
- Existing behavior definitions.
- Existing rules reference.
- Existing playable decks: Lux, Annie, Master Yi.
- This plan.

### Codex tasks

1. Confirm the current card-catalog ingestion flow still works.
2. Confirm the current behavior definition sync flow still works.
3. Confirm existing playable decks still load in fresh matches after any baseline changes.
4. Create or update tracking documents for:
   - milestone status;
   - primitive behavior coverage;
   - card coverage;
   - token coverage;
   - deck validation;
   - primitive regression approvals;
   - manual match acceptance.
5. Document the exact commands used for:
   - catalog validation;
   - behavior definition sync;
   - typecheck;
   - lint;
   - build.
6. Confirm that rules-text-focused behavior change detection remains the
   behavior gate for this ingestion program.

### Exit criteria

- Tracking files exist or this plan is updated with active tracking sections.
- Current decks load in fresh matches.
- Codex can list existing executable primitives.
- Codex confirms the current rules-text-focused behavior workflow remains in use.
- User accepts the operating model.

### Completion state

```text
M0 is complete only after user acceptance.
```

## 7. Milestone M1 — Garen Proving Grounds Deck Ingestion

### Goal

Ingest and validate the Garen Proving Grounds deck as the bridge between
single-deck ingestion and full-set ingestion.

This milestone is deck-scoped, not full Proving Grounds set-scoped.

### Inputs

- Garen Proving Grounds decklist.
- Proving Grounds set JSON/card data from `data/sets` needed for that deck.
- Existing Lux, Annie, and Master Yi cards/decks.
- `docs/riftbound_core_rules_reference.md`.

### Codex tasks

1. Normalize the Garen deck fixture.
2. Validate the deck construction rules.
3. Compare Garen cards against the existing catalog through the current
   rules-text-focused behavior workflow.
4. Build a primitive delta for Garen cards.
5. Identify rule blockers before implementation.
6. Identify regression-risking primitive changes and request user approval before
   implementation.
7. Implement or extend reusable primitives.
8. Upload the required Garen cards into the card catalog.
9. Create and approve exact executable behavior models for all unique Garen deck cards.
10. Validate every Garen deck card is executable.
11. Expose the Garen deck as a permanent selectable deck in local and online selectors.
12. Keep selectors data-driven where possible.
13. Run minimal deterministic checks only when justified by section 4.4.
14. Prepare manual validation scenarios.

### Required primitive-first output

Codex must produce a Garen primitive delta before implementing card behavior:

| Primitive / mechanic | Existing? | Needs extension? | Cards affected | Rule status | Regression approval needed? | Blocker |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Manual validation focus

At minimum, manually validate:

- Garen vs Lux;
- Garen vs Annie;
- Garen vs Master Yi;
- Garen mirror, if useful after deck exposure;
- Garen cards that introduce new or extended primitives;
- interaction with combat, damage, modifiers, Chain, Focus/Priority, and scoring;
- online room schema acceptance with Garen selected.

### Exit criteria

- Every unique Garen deck card is approved and executable.
- Garen deck can be selected locally and online as a permanent deck option.
- Full matches complete without unresolved behavior blockers.
- User manually accepts the behavior.

### Completion state

```text
M1 is complete only after user acceptance.
```

## 8. Milestone M2 — Origins Full Set Ingestion

### Goal

Ingest the complete Origins set and make every Origins card and required token
executable.

### Inputs

- Full Origins JSON from `data/sets`.
- Two user-provided Origins decklists under:

```text
docs/full-ingestion-decks/OGN/
```

- `docs/riftbound_core_rules_reference.md`.

### Codex tasks

1. Validate the full Origins JSON schema.
2. Normalize all Origins card identities using the established variant-collapse policy.
3. Build the Origins token inventory and block if required token data is missing.
4. Build the Origins primitive inventory, grouped by reusable behavior and token
   interaction instead of by card name.
5. Classify primitives as existing, extension-needed, new, or rule-blocked.
6. Identify high-risk integration paths from section 4.9 before implementation.
7. Identify regression-risking primitive changes and request user approval before
   implementation.
8. Resolve all rule blockers through user-updated rules reference entries.
9. Implement primitive behavior in reusable runtime handlers.
10. Upload Origins into the card catalog.
11. Model and approve executable behavior for every Origins card and required token.
12. Validate full Origins card/token executability.
13. Validate and expose the two Origins decks as permanent selectable decks.
14. Prepare manual validation scenarios by primitive, token behavior, and deck.
15. Run minimal deterministic checks only when justified by section 4.4.
16. Wait for manual full-match acceptance.

### Required primitive-first output

| Primitive / mechanic | First Origins card | Total Origins cards | Runtime status | Rule status | Regression approval needed? | Manual scenario |
|---|---|---:|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Required card coverage output

| Origins card status | Count |
|---|---:|
| Total cards | TBD |
| Required tokens | TBD |
| Approved executable | TBD |
| Uses existing primitives | TBD |
| Needs approved primitive extension | TBD |
| Needs new primitive | TBD |
| Rule blocked | TBD |
| Missing required token data | TBD |
| Manual issue found | TBD |

### Manual validation focus

- Each provided Origins deck must complete full matches.
- Each new Origins primitive should have at least one manual scenario, even if
  that scenario is not naturally emphasized by the two decks.
- Any card not represented by the two decks but introducing a unique primitive
  must be explicitly called out in the manual validation notes.

### Exit criteria

- Every Origins card and required token is approved and executable.
- Both Origins decks are valid and permanently selectable.
- Manual full matches are accepted by the user.
- No unresolved Origins primitive blocker remains.

### Completion state

```text
M2 is complete only after user acceptance.
```

## 9. Milestone M3 — Spiritforged Full Set Ingestion

### Goal

Ingest the complete Spiritforged set and make every Spiritforged card and
required token executable.

### Inputs

- Full Spiritforged JSON from `data/sets`.
- Two user-provided Spiritforged decklists under:

```text
docs/full-ingestion-decks/SFD/
```

- `docs/riftbound_core_rules_reference.md`.

### Codex tasks

1. Validate the full Spiritforged JSON schema.
2. Normalize all Spiritforged card identities using the established variant-collapse policy.
3. Detect required tokens and block if token data is missing.
4. Build the Spiritforged primitive inventory.
5. Compare Spiritforged primitives against existing OGS/OGN primitive coverage.
6. Identify mechanics that require new runtime state, new selectors, new pending
   choices, or new replacement/continuous-effect logic.
7. Identify regression-risking primitive changes and request user approval before
   implementation.
8. Stop for user rulings whenever rules are missing or unclear.
9. Implement reusable primitive behavior.
10. Upload Spiritforged into the card catalog.
11. Model and approve executable behavior for every Spiritforged card and required token.
12. Validate full Spiritforged card/token executability.
13. Validate and expose the two Spiritforged decks as permanent selectable decks.
14. Prepare manual validation scenarios by primitive and by deck.
15. Run minimal deterministic checks only when justified by section 4.4.
16. Wait for manual full-match acceptance.

### Required primitive-first output

| Primitive / mechanic | First Spiritforged card | Total Spiritforged cards | Runtime status | Rule status | Regression approval needed? | Manual scenario |
|---|---|---:|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Required card coverage output

| Spiritforged card status | Count |
|---|---:|
| Total cards | TBD |
| Required tokens | TBD |
| Approved executable | TBD |
| Uses existing primitives | TBD |
| Needs approved primitive extension | TBD |
| Needs new primitive | TBD |
| Rule blocked | TBD |
| Missing required token data | TBD |
| Manual issue found | TBD |

### Manual validation focus

- Both Spiritforged decks must complete full matches.
- Any new equipment, attachment, cost-modification, replacement, repeat,
  temporary, token, or continuous-effect behavior must be validated through
  manual scenarios when present in the set data.
- Codex must not infer missing equipment or attachment rules from outside
  sources.

### Exit criteria

- Every Spiritforged card and required token is approved and executable.
- Both Spiritforged decks are valid and permanently selectable.
- Manual full matches are accepted by the user.
- No unresolved Spiritforged primitive blocker remains.

### Completion state

```text
M3 is complete only after user acceptance.
```

## 10. Milestone M4 — Unleashed Full Set Ingestion

### Goal

Ingest the complete Unleashed set and make every Unleashed card and required
token executable.

### Inputs

- Full Unleashed JSON from `data/sets`.
- Two user-provided Unleashed decklists under:

```text
docs/full-ingestion-decks/UNL/
```

- `docs/riftbound_core_rules_reference.md`.

### Codex tasks

1. Validate the full Unleashed JSON schema.
2. Normalize all Unleashed card identities using the established variant-collapse policy.
3. Detect required tokens and block if token data is missing.
4. Build the Unleashed primitive inventory.
5. Compare Unleashed primitives against existing OGS/OGN/SFD primitive coverage.
6. Identify new or extended primitives.
7. Identify regression-risking primitive changes and request user approval before
   implementation.
8. Stop for user rulings whenever rules are missing or unclear.
9. Implement reusable primitive behavior.
10. Upload Unleashed into the card catalog.
11. Model and approve executable behavior for every Unleashed card and required token.
12. Validate full Unleashed card/token executability.
13. Validate and expose the two Unleashed decks as permanent selectable decks.
14. Prepare manual validation scenarios by primitive and by deck.
15. Run minimal deterministic checks only when justified by section 4.4.
16. Wait for manual full-match acceptance.

### Required primitive-first output

| Primitive / mechanic | First Unleashed card | Total Unleashed cards | Runtime status | Rule status | Regression approval needed? | Manual scenario |
|---|---|---:|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Required card coverage output

| Unleashed card status | Count |
|---|---:|
| Total cards | TBD |
| Required tokens | TBD |
| Approved executable | TBD |
| Uses existing primitives | TBD |
| Needs approved primitive extension | TBD |
| Needs new primitive | TBD |
| Rule blocked | TBD |
| Missing required token data | TBD |
| Manual issue found | TBD |

### Manual validation focus

- Both Unleashed decks must complete full matches.
- Primitive reuse should be checked carefully because this milestone comes after
  multiple sets and may reveal earlier primitive assumptions that were too
  narrow.
- Any primitive extension with regression potential must be approved by the user
  before implementation and must include a focused manual regression note for
  affected earlier decks.

### Exit criteria

- Every Unleashed card and required token is approved and executable.
- Both Unleashed decks are valid and permanently selectable.
- User-approved regression-risking primitive changes have focused validation notes.
- Manual full matches are accepted by the user.
- No unresolved Unleashed primitive blocker remains.

### Completion state

```text
M4 is complete only after user acceptance.
```

## 11. Milestone M5 — Vendetta Full Set Ingestion

### Goal

Ingest the complete Vendetta set and make every Vendetta card and required token
executable after final card data is available.

This milestone must not begin from prerelease or unstable Vendetta data.

### Inputs

- Final Vendetta JSON from `data/sets`, when available.
- Two user-provided Vendetta decklists under:

```text
docs/full-ingestion-decks/VEN/
```

- `docs/riftbound_core_rules_reference.md`.

### Codex tasks

1. Confirm the final Vendetta JSON exists in `data/sets`.
2. Validate the full Vendetta JSON schema.
3. Normalize all Vendetta card identities using the established variant-collapse policy.
4. Detect required tokens and block if token data is missing.
5. Build the Vendetta primitive inventory.
6. Compare Vendetta primitives against existing OGS/OGN/SFD/UNL primitive coverage.
7. Identify new or extended primitives.
8. Identify regression-risking primitive changes and request user approval before
   implementation.
9. Stop for user rulings whenever rules are missing or unclear.
10. Implement reusable primitive behavior.
11. Upload Vendetta into the card catalog.
12. Model and approve executable behavior for every Vendetta card and required token.
13. Validate full Vendetta card/token executability.
14. Validate and expose the two Vendetta decks as permanent selectable decks.
15. Prepare manual validation scenarios by primitive and by deck.
16. Run minimal deterministic checks only when justified by section 4.4.
17. Wait for manual full-match acceptance.

### Required primitive-first output

| Primitive / mechanic | First Vendetta card | Total Vendetta cards | Runtime status | Rule status | Regression approval needed? | Manual scenario |
|---|---|---:|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### Required card coverage output

| Vendetta card status | Count |
|---|---:|
| Total cards | TBD |
| Required tokens | TBD |
| Approved executable | TBD |
| Uses existing primitives | TBD |
| Needs approved primitive extension | TBD |
| Needs new primitive | TBD |
| Rule blocked | TBD |
| Missing required token data | TBD |
| Manual issue found | TBD |

### Manual validation focus

- Both Vendetta decks must complete full matches.
- Because this milestone uses only final JSON, unclear text or missing tokens are
  blockers that require user input through the normal rule/token process.
- No online rulings, prerelease assumptions, or unreleased-source assumptions are allowed.

### Exit criteria

- Every Vendetta card and required token is approved and executable.
- Both Vendetta decks are valid and permanently selectable.
- User-approved regression-risking primitive changes have focused validation notes.
- Manual full matches are accepted by the user.
- No unresolved Vendetta primitive blocker remains.

### Completion state

```text
M5 is complete only after user acceptance.
```

## 12. Per-Milestone Codex Prompt Template

Use this template when assigning one milestone to Codex.

```text
You are working on Hextech Simulator card ingestion.

Active milestone:
<MILESTONE NAME>

Rules authority and source data:
Use only docs/riftbound_core_rules_reference.md and the card text from set JSON files in data/sets.
Do not search online. If a rule is missing or unclear, stop and ask for a user
ruling. The user will update docs/riftbound_core_rules_reference.md before you
continue.

Main objective:
Make every card and required token in the milestone scope executable, then
validate the provided decks through manual gameplay. Do not mark the milestone
complete until the user manually accepts full-match behavior.

Tracking priority:
1. Primitive behavior coverage.
2. Card coverage.
3. Token coverage, when tokens are present or referenced.
4. Deck validation.
5. Manual match acceptance.

Required first output before implementation:
- Primitive delta table.
- Card coverage summary.
- Token coverage summary, when applicable.
- Rule blockers.
- Regression-risking primitive changes that need user approval.
- Proposed implementation order.
- Integration risk checklist entries from section 4.9 that apply to this
  milestone.
- Manual validation scenarios.

Implementation constraints:
- Implement reusable primitives, not card-name-specific runtime branches.
- Keep gameplay rules server-authoritative.
- Keep imported but unsupported cards out of gameplay-ready state.
- Block milestone completion until every scoped card and required token is executable.
- Collapse gameplay-equivalent variants into one gameplay definition.
- Treat missing required token data as a blocker.
- Preserve rules-text-focused behavior change detection.
- Do not add metadata drift or backward-compatibility work unless explicitly requested.
- Do not wipe the database; the user handles cleanup manually.
- Ask for user approval before implementing primitive changes with regression potential.
- Prefer zero new tests during ingestion defect loops.
- Add a deterministic test only when section 4.4 clearly justifies the cost.
- Do not add broad gameplay integration tests as proof of correctness.
- Use fresh matches for manual validation after catalog/runtime changes.

Expected final output:
- Updated primitive ledger.
- Updated card coverage ledger.
- Updated token coverage ledger, when applicable.
- Updated deck validation ledger.
- Known manual test scenarios.
- Remaining blockers, if any.
- Clear status: Awaiting Manual Acceptance, not Complete.
```

## 13. Manual Validation Template

Use this template after Codex finishes implementation for a milestone.

```text
Milestone:
Decks tested:
Matchups tested:
Date:
Tester:

Manual defect evidence, when applicable:
- Match ID:
- State version:
- Endpoint:
- Request payload:
- Response:
- Expected behavior:
- Actual behavior:

Primitive behaviors intentionally exercised:
- [ ] Primitive/mechanic:
      Cards involved:
      Scenario:
      Result:

Full match results:
- [ ] Matchup:
      Completed? Yes/No
      Winner:
      Issues:
      Retest required? Yes/No

Card-specific issues:
- Card:
  Expected behavior:
  Actual behavior:
  Rule reference:
  Decision needed? Yes/No

Regression-risking primitive changes validated:
- Primitive:
  Earlier cards/decks checked:
  Result:

Acceptance decision:
- [ ] Accepted
- [ ] Needs fixes
- [ ] Blocked by missing rule
- [ ] Blocked by missing token data

User notes:
```

## 14. Recommended Implementation Order Inside Each Milestone

Use this order to keep the work resumable.

1. Input validation.
2. Identity normalization using the established variant-collapse policy.
3. Token coverage check.
4. Primitive discovery.
5. Rule blocker report.
6. Regression-risking primitive change report and user approval, if needed.
7. Primitive implementation plan.
8. Primitive implementation.
9. Minimal deterministic checks only when justified by section 4.4.
10. Catalog upload.
11. Card behavior modeling and approval.
12. Full card/token executability report.
13. Deck fixture validation.
14. Permanent deck selector exposure.
15. Manual scenario checklist.
16. User manual validation.
17. Fixes and retests, if needed.
18. User acceptance.
19. Commit accepted milestone changes.

## 15. Stop Conditions

Codex must stop instead of continuing when any of these happens:

- A required rule is missing from `docs/riftbound_core_rules_reference.md`.
- A card can be interpreted in multiple valid ways from current rules/card text.
- A primitive would require changing the public action/intent contract.
- A required token is missing from the set data.
- A full-set milestone has any non-executable card or required token remaining.
- A manual validation failure contradicts Codex's expected behavior.
- A primitive extension has regression potential and has not been approved by the user.
- Vendetta final JSON is not available in `data/sets`.

## 16. Done Means Accepted

For this ingestion program, the final status is not technical completion.

The only valid final status for a milestone is:

```text
Accepted by user after manual full-match validation.
```

Everything before that is an implementation checkpoint.

After acceptance, Codex must commit the accepted milestone changes before moving
to the next milestone.
