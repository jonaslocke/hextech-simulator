# Hextech Simulator — Eight-Deck Card Corpus Expansion Plan

**Status:** Canonical execution plan  
**Purpose:** Source of truth for implementation agents, pull-request reviewers, manual validation, and acceptance of this corpus-expansion program.  
**Project baseline:** `project-context.md`, snapshot 2026-09-05.

---

## 1. Objective

Expand Hextech Simulator's executable Riftbound card corpus through eight complete tournament decks, delivered as eight sequential pull requests.

The decks are the **scope boundaries**, not the architecture boundaries. The implementation must continue the project's card-corpus model: card behavior is expressed through reusable primitives, canonical card models, server-authoritative rules, persisted player decisions where needed, and normal deck publication. No behavior may be implemented only because a specific deck or card name is being played.

At the end of this program:

1. All eight supplied decks are permanent playable decks in Hextech Simulator.
2. Each deck is fully playable with its Legend, Champion, Main Deck, Battlefields, Rune Pool, Sideboard, and all required runtime dependencies.
3. Best-of-three and sideboarding work with each deck through the existing match lifecycle.
4. Every card and reusable behavior introduced by the eight PRs becomes part of the general executable card corpus.
5. Any otherwise legal deck built from the already accepted corpus plus the cards introduced by these eight decks must use the same canonical card definitions and reusable engine behavior. Runtime behavior must not depend on one of the eight deck IDs being selected.
6. The existing `master-yi` deck remains available. The new Master Yi deck is added separately as **Master Yi — Vendetta**, using the permanent deck ID `master-yi-vendetta`.

This program expands the playable corpus. It does **not** claim complete implementation of every card in any set unless those cards are included by the scope below or are required runtime dependencies of them.

---

## 2. Normative Sources and Authority

Different sources control different parts of the work.

### 2.1 Workflow and architecture

This document defines the workflow, sequencing, PR gates, scope, and completion criteria for this program.

`project-context.md` defines the current project architecture, runtime ownership, existing BO3/sideboarding foundation, card-ingestion model, validation philosophy, and current technical baseline.

Existing repository instructions such as `AGENTS.md`, `docs/architecture.md`, and applicable project skills remain binding unless this plan explicitly changes the workflow for this program.

### 2.2 Gameplay behavior

Gameplay behavior must be derived from:

1. `docs/riftbound_core_rules_reference.md` for Riftbound core rules.
2. The authoritative card text in the local set data for card-specific behavior and Golden Rule overrides.
3. Existing accepted implementation only as implementation precedent, never as authority over the rules or card text.

When the rules reference and card text are insufficient to determine a behavior, the agent must not invent a ruling. The affected behavior must be escalated for a rules decision before implementation continues.

### 2.3 Deck contents

The eight supplied deck files are the normative deck definitions for this program. Their exact Legend, Champion, Main Deck, Battlefields, Rune Pool, and Sideboard contents define the required playable scope.

No agent may silently substitute cards, remove difficult cards, change quantities, or simplify a deck in order to pass validation.

### 2.4 Card/set data

The repository's set JSON data, including Vendetta, is the canonical source data used by the existing ingestion and publication pipeline. Print-identity treatment must follow the project's existing canonicalization rules and must not create separate gameplay implementations for equivalent print variants.

---

## 3. Fixed PR Sequence

The program consists of exactly eight sequential, cumulative pull requests.

| Order | Pull request scope | Permanent deck ID | Normative deck source |
| --- | --- | --- | --- |
| PR 01 | Ornn, Fire Below the Mountain | `ornn` | `Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt` |
| PR 02 | Kennen, Heart of the Tempest | `kennen` | `Kennen, Heart of the Tempest , a deck by CTCG Koko Lopez.txt` |
| PR 03 | Fiora, Grand Duelist | `fiora` | `Fiora, Grand Duelist , a deck by Ricemаster.txt` |
| PR 04 | Rengar, Pridestalker | `rengar` | `Rengar, Pridestalker , a deck by Prismаticismism.txt` |
| PR 05 | Azir, Emperor of the Sands | `azir` | `Azir, Emperor of the Sands , a deck by MICE Squirtle.txt` |
| PR 06 | Irelia, Blade Dancer | `irelia` | `Irelia, Blade Dancer , a deck by аsiptofu.txt` |
| PR 07 | Master Yi, Wuju Bladesman | `master-yi-vendetta` | `Master Yi, Wuju Bladesman , a deck by Shаßßаt Shаlom.txt` |
| PR 08 | Akali, Rogue Assassin | `akali` | `Akali, Rogue Assassin , a deck by ASC HаruKаze.txt` |

The PRs are not parallel workstreams.

Each PR begins only after the previous PR has completed review, manual acceptance, and merge. Its implementation plan must be recalculated against that newly accepted baseline because earlier PRs may already have introduced primitives, behavior families, card models, UI decision support, or other capabilities needed by the next deck.

The deck scope is fixed. The implementation delta is intentionally **not** fixed in advance.

---

## 4. Scope of a Deck PR

A deck PR is responsible for everything required to make its exact supplied deck playable through the normal product.

### 4.1 Mandatory card/deck scope

For the current deck, scope includes:

- Champion Legend.
- Chosen Champion.
- Every Main Deck card.
- Every Battlefield.
- Exact Rune Pool configuration and validation.
- Every Sideboard card.
- All generated cards, tokens, or other runtime definitions required by those cards.
- Any cross-set dependency required to execute those cards correctly.
- Any generic primitive, selector, trigger, condition, modifier, replacement effect, timing behavior, decision type, or other engine capability required by those cards.
- Any projection or client interaction needed to expose a required player decision through the project's existing server-authoritative contracts.
- Canonical publication/behavior models required for runtime compilation.
- Permanent deck integration required for the deck to appear as a selectable playable deck.
- Focused regression coverage required by the implementation delta.

A card being present in source JSON, imported into the catalog, or recognized by behavior discovery does not make it playable. Every dependency used by the deck must reach executable canonical runtime support.

### 4.2 Sideboard is first-class scope

The Sideboard is not a later enhancement or a validation convenience. It is part of the deck's required implementation.

A PR cannot be accepted if Game 1 works but one or more Sideboard cards are unsupported, if the registered-copy pool cannot represent the supplied list, or if the deck fails through the existing between-games/sideboarding lifecycle.

### 4.3 General-corpus requirement

A behavior implemented for a deck must be implemented for the card corpus.

The following are prohibited:

- engine branches keyed by card name;
- engine branches keyed by one of the eight deck IDs;
- a special deck-only rules path;
- duplicating an existing reusable primitive because it is easier for the current card;
- treating an imported or modeled card as executable when its behavior cannot compile or run;
- implementing a card only for the exact interaction sequence exercised during manual validation.

If multiple cards use the same semantic behavior family, the PR should extend or reuse the same primitive family when the rules support doing so.

---

## 5. Out of Scope

Unless required as a direct runtime dependency of one of the eight decks, this program does not require:

- full implementation of Origins, Spiritforged, Unleashed, Vendetta, or any other entire set;
- cards that do not appear in the eight deck definitions;
- speculative primitives for possible future cards;
- a new card-modeling architecture;
- a new player-decision framework;
- a new deck/sideboarding architecture;
- replacing the existing `master-yi` permanent deck;
- a new automated browser/E2E test framework;
- broad engine, GameBoard, or catalog refactors unrelated to a concrete dependency exposed by the current deck;
- backward compatibility for already persisted matches whose snapshots predate accepted corpus changes;
- destructive database cleanup as part of routine implementation validation.

---

## 6. Cumulative Delivery Contract

Every merged PR becomes part of the baseline for the next PR.

### 6.1 Sequential rule

The branch for PR N must start from the accepted and merged result of PR N-1.

The next deck must not be planned against the program's original baseline if earlier accepted work has changed the available corpus.

### 6.2 Reuse rule

At the beginning of each PR, the implementer must determine whether each required behavior is:

- already accepted and reusable as-is;
- already represented by a primitive but missing the required parameterization or semantic coverage;
- already modeled but not executable;
- a genuine primitive/runtime gap;
- a core rules/mechanics gap rather than a card-specific gap;
- a publication/deck integration gap only;
- dependent on a generated/token definition;
- dependent on client/projection support for a player decision.

Existing accepted behavior must be reused when correct.

### 6.3 No premature planning of later implementation deltas

This plan fixes what each PR must make playable, but it deliberately does not pre-assign a list of primitive changes to PRs 02–08.

After each merge, the next PR's dependency analysis must be regenerated against the new executable corpus. This prevents duplicated implementations and recognizes that an earlier deck can solve a behavior family used by multiple later decks.

---

## 7. Per-PR Workflow and Gates

Every PR uses the same lifecycle.

```text
Accepted previous baseline
  -> current-deck dependency discovery
  -> Codex implementation
  -> technical readiness
  -> independent agent PR review
  -> Codex addresses review findings
  -> reviewer approves
  -> complete manual deck validation
  -> defects return to Codex
  -> technical checks + re-review of changed code
  -> reviewer approves again when required
  -> manual validation continues/restarts as appropriate
  -> explicit user acceptance
  -> merge
  -> next PR dependency discovery
```

The PR remains open until manual acceptance. Reviewer approval alone is not permission to merge.

### Gate A — Current-deck dependency discovery

Before implementing the current PR, Codex must analyze the exact deck against the current merged executable corpus.

The discovery must identify:

1. Every unique gameplay definition required by the Legend, Champion, Main Deck, Battlefields, and Sideboard.
2. Which required cards are already canonical and executable without changes.
3. Which required cards have an existing primitive family that can be reused.
4. Which cards expose missing primitive behavior or missing parameter coverage.
5. Any required tokens/generated game objects and whether their definitions already exist.
6. Any core mechanic gap exposed by the deck.
7. Any required persisted choice/effect-continuation behavior.
8. Any required projection or UI decision support.
9. Any permanent-deck contract or deck-ID changes.
10. Which already accepted behavior families could be affected by the proposed changes.

The result is the implementation delta for that PR.

This analysis is not a new approval gate for ordinary reuse or new isolated primitives. It is mandatory planning evidence for the implementer and reviewer.

#### Accepted primitive change exception

If the current deck requires changing the semantics of an already accepted primitive, Codex must first document:

- why the existing primitive is semantically insufficient or incorrect;
- the proposed generic change;
- all known accepted cards/decks using that primitive;
- the regression scenarios required to prove those consumers remain correct or intentionally change.

That impact/regression proposal must be approved before dependent implementation proceeds. Extending a primitive with a new independent parameterization that does not alter existing accepted semantics does not require artificial interruption, but it still requires regression coverage appropriate to the shared code being changed.

### Gate B — Codex implementation

Codex implements the smallest coherent generic change that makes the full current deck executable.

Implementation must follow existing subsystem ownership:

- rules legality, payment, targeting, effect execution, timing, triggers, combat, modifiers, and replacements stay server-owned;
- card behavior continues through canonical behavior models and reusable primitives;
- required player choices use canonical pending decisions/effect frames and existing projection/intent contracts;
- viewer-private information remains enforced by server projection;
- registered-copy identity remains distinct from runtime instance identity, especially across sideboarding and later games;
- permanent deck loading continues through the persisted deck-definition/canonical-card pipeline;
- routes remain thin and UI must not become the rules engine.

If the deck exposes a missing reusable mechanic, the implementation must solve that mechanic at the appropriate generic layer rather than patch only the first card that revealed it.

Cards already executable and correct should not be rewritten merely because they occur in the deck.

### Gate C — Technical readiness

Before requesting independent review, Codex must establish that the PR is technically ready for review.

At minimum, the PR must demonstrate:

- every card required by the exact deck and Sideboard can resolve to an approved/executable canonical definition;
- no required model is stale, unsupported, malformed, or dependent on an unimplemented binding;
- required token/generated definitions are present and executable;
- the exact registered deck configuration validates under the existing deck rules;
- the permanent deck definition can be synchronized/loaded through the normal catalog path;
- a fresh match can be constructed from the updated canonical/deck data;
- focused deterministic tests cover new primitive behavior and confirmed regressions where appropriate;
- existing relevant regression suites pass;
- `npm run typecheck` passes;
- the full existing automated test suite passes unless a known unrelated baseline failure is explicitly documented;
- `npm run lint` passes;
- `npm run build` passes;
- `git diff --check` passes;
- applicable catalog/deck consistency checks pass.

Do not use destructive reset commands as a routine validation step.

Technical readiness means the PR is ready for code review. It is **not** deck acceptance.

### Gate D — Independent pull-request review

A different agent from the implementation agent performs the PR review.

The reviewer must evaluate the complete diff against this plan, the current project architecture, the local rules authority, and the exact deck scope.

The reviewer must challenge at least the following:

#### Rules and behavior

- Does each new/changed card behavior match its card text and applicable local rules?
- Are trigger timing, target locking, object identity, resolution, replacement effects, numeric values, and duration handled at the correct rule checkpoint?
- Are mandatory, optional, automatic-group, and player-selected effects distinguished correctly?
- Are hidden/private-information rules preserved?

#### Reusability

- Is new behavior implemented as an appropriate reusable primitive/family?
- Is existing correct behavior reused instead of duplicated?
- Is any card-name or deck-ID-specific gameplay logic present?
- Would another legal deck using the same canonical cards receive the same behavior?

#### Architecture

- Are server/client boundaries preserved?
- Are canonical pending choices used where resolution must pause?
- Do projection and intents remain authoritative rather than trusting UI state?
- Are registered-copy/runtime-instance boundaries preserved through BO3 and sideboarding?
- Are routes, UI, repositories, and game-engine modules still respecting ownership boundaries?

#### Corpus and publication

- Does every deck and Sideboard dependency actually reach executable canonical support?
- Are equivalent print variants treated consistently?
- Are required token/generated definitions covered?
- Can the permanent deck load through the normal deck catalog rather than a special fixture-only path?

#### Regression quality

- Are shared primitive changes evaluated against accepted consumers?
- Are narrow deterministic tests added for stable behavior that changed?
- Are tests validating behavior contracts rather than mirroring temporary implementation structure?

The reviewer records findings on the PR. Codex addresses them. The review/fix cycle repeats until the reviewer explicitly approves the current revision.

Reviewer approval means **code-review approval only**. The PR remains unmergeable until manual deck acceptance.

### Gate E — Complete manual deck validation

Manual testing begins only after the independent reviewer has approved the current revision.

Manual validation uses fresh matches created from the current canonical/deck data so that stale per-match card snapshots do not hide or invalidate the new behavior.

The current deck must be validated as a complete playable deck, not as isolated card demos only.

Manual validation must cover:

1. **Deck availability and construction**
   - The exact permanent deck is selectable.
   - Its registered card pool matches the supplied Legend, Champion, Main Deck, Battlefields, Rune Pool, and Sideboard.
   - The deck starts a fresh match successfully.

2. **Game 1 gameplay**
   - Normal setup succeeds.
   - Legend and Chosen Champion behavior function correctly.
   - Battlefield behavior required by the deck functions correctly.
   - Newly implemented or modified gameplay-distinct cards are exercised in representative legal situations.
   - Relevant timing windows, targets, choices, Chain interactions, movement, combat, scoring, replacements, hidden information, tokens, and other mechanics introduced/affected by the PR are exercised where applicable.

3. **Sideboarding and subsequent games**
   - Complete Game 1 and enter the existing between-games flow.
   - Perform at least one legal sideboard reconfiguration using cards from the supplied Sideboard.
   - Start Game 2 with the accepted configuration.
   - Verify registered-copy conservation and the correct active Champion/configuration behavior.
   - Exercise Sideboard cards whose executable behavior was introduced or changed by this PR.
   - Continue into Game 3 when needed to validate further sideboard/configuration behavior or to complete the match scenarios required by the deck.

4. **Previously accepted behavior affected by the PR**
   - If the PR changes a shared accepted primitive, execute the approved manual regression scenarios for affected previous cards/decks in addition to the current deck.

Manual validation does not require forcing every copy of every vanilla/reused card into play. It must, however, provide direct evidence for every gameplay-distinct behavior introduced or modified by the PR and demonstrate that the complete deck can progress through real matches and sideboarding.

### Gate F — Defect loop during manual validation

A manual defect reopens implementation.

The flow is:

```text
manual defect
  -> reproduce and define expected rule-backed behavior
  -> Codex fixes the generic cause
  -> focused technical checks
  -> independent reviewer reviews the changed revision
  -> reviewer approves
  -> manual validation resumes from the appropriate scenario
```

A fix discovered during manual validation must not bypass the independent reviewer simply because the original PR had already been approved.

The reviewer may scope re-review to the new revision/diff, but the resulting PR must again be approved before manual acceptance.

### Gate G — Explicit manual acceptance and merge

The PR can merge only when all of the following are true:

- technical readiness is green;
- the independent reviewer approves the final revision;
- all required manual scenarios pass;
- no unresolved defect affects the deck or a changed accepted behavior;
- the user explicitly accepts the deck/PR.

After acceptance:

- record manual acceptance and relevant validation notes in the PR/program tracking artifact;
- merge the PR;
- treat the merged implementation as accepted corpus baseline;
- begin dependency discovery for the next deck.

---

## 8. Pull Request Responsibilities

### 8.1 Codex implementation agent

Codex is responsible for:

- current-deck dependency analysis;
- rule/card-text investigation using local project sources;
- implementation of new or extended reusable behavior;
- canonical card-model work;
- token/generated dependency work;
- permanent deck integration;
- appropriate UI/projection work when a rules decision requires player input;
- focused automated tests and regression updates;
- technical readiness checks;
- addressing every valid reviewer finding;
- fixing confirmed manual-validation defects at the generic owning layer.

Codex must not self-approve the PR.

### 8.2 Independent reviewer agent

The reviewer is responsible for:

- reviewing the actual PR diff rather than only the implementation summary;
- validating scope completeness against the exact deck file;
- challenging rules correctness and reusable primitive design;
- protecting previously accepted behavior from regressions;
- checking architecture, server authority, hidden-information boundaries, identity, and persistence implications;
- verifying that tests and technical evidence are appropriate;
- requesting changes until the PR meets the review gate;
- explicitly approving only the revision that is ready for manual validation/acceptance.

The reviewer does not lower the bar because manual testing will happen later. Manual testing is an additional gate, not a substitute for code review.

### 8.3 Manual validator / user

Manual validation is responsible for proving the complete deck works through the actual product and game lifecycle.

Manual findings are authoritative defect input for the PR. Explicit user acceptance is the final completion gate.

---

## 9. Required PR Description / Evidence

Each PR must maintain a concise but complete execution record so the reviewer and next implementation agent can understand the accepted corpus delta.

The PR description or linked durable tracking artifact must include:

1. **Deck scope** — PR number, permanent deck ID, and exact source deck file.
2. **Baseline** — previous accepted PR/commit on which discovery was performed.
3. **Dependency inventory** — already executable cards, reused families, new/extended primitive families, tokens/generated dependencies, and integration-only work.
4. **Behavior changes** — summary of reusable rules capabilities introduced or changed.
5. **Canonical card changes** — cards added or corrected for the current deck.
6. **Architecture/contracts changed** — state, primitives, actions, projections, decisions, persistence, deck IDs, or UI changes, if any.
7. **Accepted primitive impact** — required impact/regression proposal and its approval when an accepted primitive changed semantics.
8. **Automated validation** — focused tests and standard technical gates run.
9. **Independent review status** — findings addressed and final reviewer approval.
10. **Manual validation record** — scenarios executed, defects found/fixed, regression scenarios, and final result.
11. **User acceptance** — explicit acceptance before merge.

Do not leave temporary discovery/request documents in the repository merely because they were useful during implementation. Durable project documentation should record the accepted outcome and reusable project state.

---

## 10. Regression Policy

Corpus expansion is cumulative. A later deck may exercise or extend behavior first introduced for an earlier deck.

### 10.1 When no accepted behavior changes

If a PR only adds new cards using already accepted semantics, regression scope should remain focused. The agent should prove the current deck and relevant shared contracts without replaying every previously accepted deck.

### 10.2 When shared implementation changes without semantic change

If shared code is refactored or parameterized while preserving existing semantics, run the relevant existing automated regression suites and focused representative manual regression where the risk warrants it.

### 10.3 When accepted primitive semantics change

Changing the meaning of an already accepted primitive is high impact.

Before dependent implementation:

1. document the semantic change;
2. inventory known accepted consumers;
3. define automated and manual regression scenarios;
4. obtain approval for that impact/regression proposal;
5. implement the change;
6. execute the approved regression scope before the PR can be accepted.

A later deck's correctness cannot be achieved by silently breaking an earlier accepted deck.

---

## 11. Rules, Data, and Dependency Escalation

The implementation agent must resolve issues according to the following fixed policy.

### 11.1 Rules ambiguity

If local core rules plus authoritative card text do not determine expected behavior, stop that behavior's implementation and request a ruling. Do not infer a convenient simulator behavior.

### 11.2 Required generated object or token

If a card creates or references another game object, that dependency is part of the current PR. Use the authoritative corpus definition and the project's generic token/generated-object model. Do not approximate the object with UI-only state or invent missing characteristics.

### 11.3 Existing implementation contradicts rules

The accepted code is precedent, not rules authority. If current behavior contradicts the local rules/card text and the current deck depends on that behavior, treat it as a shared behavior correction and apply the accepted-primitive regression policy when applicable.

### 11.4 Unrelated pre-existing failure

Do not hide or repair unrelated project changes merely to make the PR appear green. Establish whether the failure exists on the accepted baseline, document it, and keep the current PR focused unless the failure blocks this deck's required behavior.

---

## 12. Deck-Specific Milestones

The common workflow above is repeated exactly eight times.

### PR 01 — Ornn, Fire Below the Mountain

**Permanent deck ID:** `ornn`  
**Source:** `Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt`

Start from the accepted project baseline described by `project-context.md`. Perform a complete dependency discovery for the supplied Ornn deck, implement the missing reusable corpus behavior, integrate the permanent deck, pass independent review, validate the complete deck including Sideboard/BO3, obtain explicit acceptance, and merge.

The merged result becomes the baseline for PR 02.

### PR 02 — Kennen, Heart of the Tempest

**Permanent deck ID:** `kennen`  
**Source:** `Kennen, Heart of the Tempest , a deck by CTCG Koko Lopez.txt`

Start from merged PR 01. Recalculate the Kennen deck's implementation delta against the Ornn-expanded corpus. Reuse all correct accepted behavior. Complete the same implementation, review, manual validation, acceptance, and merge gates.

The merged result becomes the baseline for PR 03.

### PR 03 — Fiora, Grand Duelist

**Permanent deck ID:** `fiora`  
**Source:** `Fiora, Grand Duelist , a deck by Ricemаster.txt`

Start from merged PR 02. Recalculate the Fiora deck's implementation delta against the accepted Ornn + Kennen corpus. Complete the common gates and merge only after explicit manual acceptance.

The merged result becomes the baseline for PR 04.

### PR 04 — Rengar, Pridestalker

**Permanent deck ID:** `rengar`  
**Source:** `Rengar, Pridestalker , a deck by Prismаticismism.txt`

Start from merged PR 03. Recalculate the Rengar deck's implementation delta against the current accepted corpus. Complete the common gates and merge only after explicit manual acceptance.

The merged result becomes the baseline for PR 05.

### PR 05 — Azir, Emperor of the Sands

**Permanent deck ID:** `azir`  
**Source:** `Azir, Emperor of the Sands , a deck by MICE Squirtle.txt`

Start from merged PR 04. Recalculate the Azir deck's implementation delta against the current accepted corpus. Complete the common gates and merge only after explicit manual acceptance.

The merged result becomes the baseline for PR 06.

### PR 06 — Irelia, Blade Dancer

**Permanent deck ID:** `irelia`  
**Source:** `Irelia, Blade Dancer , a deck by аsiptofu.txt`

Start from merged PR 05. Recalculate the Irelia deck's implementation delta against the current accepted corpus. Complete the common gates and merge only after explicit manual acceptance.

The merged result becomes the baseline for PR 07.

### PR 07 — Master Yi, Wuju Bladesman / Master Yi — Vendetta

**Permanent deck ID:** `master-yi-vendetta`  
**Source:** `Master Yi, Wuju Bladesman , a deck by Shаßßаt Shаlom.txt`

Start from merged PR 06. Recalculate this deck's implementation delta against the current accepted corpus.

This is a **new permanent deck**, not a replacement for the existing `master-yi` deck. Both must coexist after this PR. The new deck uses the user-facing identity **Master Yi — Vendetta** and the permanent ID `master-yi-vendetta`.

Complete the common gates and merge only after explicit manual acceptance.

The merged result becomes the baseline for PR 08.

### PR 08 — Akali, Rogue Assassin

**Permanent deck ID:** `akali`  
**Source:** `Akali, Rogue Assassin , a deck by ASC HаruKаze.txt`

Start from merged PR 07. Recalculate the Akali deck's implementation delta against the complete seven-PR accepted corpus. Complete the common gates and merge only after explicit manual acceptance.

After merge, run the program-level completion gate below.

---

## 13. Definition of Done — Individual PR

A deck PR is **Done** only when all statements below are true.

### Corpus completeness for the deck

- Every unique required Legend, Champion, Main Deck, Battlefield, and Sideboard gameplay definition is canonical and executable.
- Required generated/token dependencies are executable.
- No required behavior is represented by an unresolved/unsupported primitive binding.
- Existing correct primitive families are reused.
- New behavior is generic and available to any canonical card that binds to it.

### Deck integration

- The exact supplied deck validates as a registered configuration.
- The exact Rune Pool and Sideboard are preserved.
- The permanent deck is available through the normal deck catalog path.
- A fresh match can be created with the deck.

### Runtime behavior

- Setup and normal gameplay work.
- Required player decisions are persisted/projected through existing authoritative contracts.
- Card behavior remains server-authoritative.
- Hidden/private data boundaries remain correct.
- BO3 and sideboarding work using registered-copy identity and fresh runtime game instances.

### Quality gates

- Focused automated coverage is appropriate for new/changed behavior.
- Applicable regression checks pass.
- Typecheck, test suite, lint, production build, diff check, and relevant catalog/deck checks satisfy technical readiness.
- Independent reviewer approves the final revision.
- Complete manual deck validation passes.
- Required regression scenarios for accepted shared behavior pass.
- The user explicitly accepts the PR.
- The PR is merged before the next deck begins.

A PR that is code-complete but awaiting manual validation is **Awaiting Manual Acceptance**, not Done.

---

## 14. Program-Level Completion Gate

The eight-deck program is complete only after PR 08 is accepted and merged and the following cumulative conditions hold.

### 14.1 Eight permanent decks

The permanent deck catalog includes and can load:

- `ornn`
- `kennen`
- `fiora`
- `rengar`
- `azir`
- `irelia`
- `master-yi-vendetta`
- `akali`

The existing permanent `master-yi` deck remains separate and available.

### 14.2 Complete supplied configurations

All eight exact deck definitions, including Sideboards, validate and can start fresh matches through the normal product flow.

### 14.3 Reusable cumulative corpus

All cards introduced by the eight PRs are part of the same canonical executable corpus used by existing cards.

The engine must not require one of the eight permanent deck IDs to execute those cards. Therefore, an otherwise legal deck composed from the previously accepted corpus plus any subset of the newly accepted cards must use the same deck-validation, canonical-card, snapshot, action, and behavior-runtime paths.

### 14.4 Accepted shared behavior remains protected

Every semantic change to an already accepted primitive has completed its approved regression scope. No known plan-damaging regression remains open in previously accepted decks/cards.

### 14.5 No unresolved acceptance work

- All eight PRs received independent reviewer approval.
- All eight PRs completed manual deck validation.
- All manual defects were resolved through the implementation/re-review loop.
- All eight PRs received explicit user acceptance before merge.
- Durable corpus/deck tracking reflects the final accepted state.

Completion of this program means the eight deck vertical slices and the reusable corpus they introduce are accepted. It does not imply automatic full-set completeness beyond that scope.

---

## 15. Non-Negotiable Implementation Principles

Throughout all eight PRs:

1. **Server is authoritative.** The client submits intents and selections; it does not implement legality or rules state.
2. **Canonical cards are the gameplay unit of reuse.** Permanent deck definitions do not own card behavior.
3. **Primitives are generic.** No card-name or deck-ID branches in the game engine.
4. **Rules/card text drive behavior.** Existing code cannot override the local rules authority.
5. **Player decisions must survive round trips.** Multi-step effects use canonical pending choices/resolution frames rather than browser-only continuation state.
6. **Hidden information stays protected by projection.** UI hiding alone is not a privacy boundary.
7. **Registered copies and runtime instances stay distinct.** Sideboarding operates on registered copies; each new game creates fresh runtime state.
8. **Fresh matches validate new card models.** Existing deck snapshots are not evidence that newly published definitions work.
9. **Sideboard is part of the deck.** Game 1-only playability is insufficient.
10. **Accepted behavior is cumulative.** Later PRs reuse earlier accepted work and cannot silently regress it.
11. **Review and manual acceptance are separate gates.** Both are mandatory.
12. **No next PR before merge.** The next dependency plan must use the actually accepted corpus, not a hypothetical future baseline.

---

## 16. Execution Summary

For each of the eight decks, the team repeats one controlled vertical slice:

```text
Exact deck file
  -> inventory against current accepted corpus
  -> reuse existing executable behavior
  -> implement only missing generic behavior/dependencies
  -> approve/publish complete canonical card support
  -> integrate permanent deck
  -> technical readiness
  -> independent PR review
  -> Codex fixes until reviewer approval
  -> complete fresh-match + BO3/sideboard manual validation
  -> fix/re-review any manual defects
  -> explicit user acceptance
  -> merge
  -> recalculate next deck against the new corpus
```

The controlling principle for the entire program is:

> **The deck defines what must become playable; the engine implementation must make those cards reusable beyond that deck.**
