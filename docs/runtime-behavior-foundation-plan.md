# Runtime Behavior Foundation Plan

## Purpose

This plan is the backend/engine companion to the existing **Runtime Keyword Annotations and Card Preview Expansion** UI plan.

The UI plan remains the consumer contract and should not be rewritten as part of this work. This plan changes the Hextech project so the authoritative game engine and viewer projection can deliver the information that the UI contract requires.

The implementation must preserve Hextech's existing server-authoritative architecture:

```text
approved card behavior
→ canonical match/game state
→ authoritative runtime evaluation
→ viewer-safe projection
→ client adaptation
→ card tile / card preview
```

The client must not interpret card rules text, calculate keyword stacking, infer effect expiration, reconstruct provenance, or determine gameplay legality.

---

# 1. Primary Goals

## 1.1 Deliver Authoritative Runtime Keyword Information

The engine must be able to answer, for a specific game object:

> What keywords does this object effectively have right now?

That answer must account for all supported sources that can materially affect the object, including:

- printed/native keyword characteristics;
- attached/effect-text keyword characteristics;
- resolved runtime keyword grants;
- supported continuous keyword grants;
- supported conditional keyword characteristics;
- keyword-specific composition rules;
- expiration and game-object incarnation.

The same authoritative result must be consumed by gameplay rules and viewer projection.

## 1.2 Deliver Authoritative Runtime Granted Rules/Abilities

When an effect grants non-keyword rules text to another game object, that grant must be executable game behavior rather than display-only text.

The engine must be able to represent:

- the granted behavior;
- its affected game object;
- its lifecycle;
- its source/provenance;
- the player-facing granted text;
- its participation in normal trigger/ability evaluation where supported.

The card preview must never claim that a game object has an ability that the engine does not actually execute.

## 1.3 Preserve All Previously Accepted Gameplay

Previously accepted and manually validated gameplay is protected behavior.

Manual validation is expensive and must not become the mechanism used to rediscover regressions caused by this architecture change.

This work must therefore create the new foundation **without changing the previously accepted outcomes of existing supported gameplay**.

---

# 2. Non-Regression Contract

Non-regression is a primary acceptance condition of this plan.

A generalized implementation is **not** considered correct merely because the new keyword-grant scenarios work.

It must also preserve the existing accepted consumers of every shared semantic owner it replaces or extends.

This work must not unintentionally change:

- gameplay legality;
- timing;
- Chain behavior;
- targeting;
- payment;
- movement;
- combat;
- Might calculation;
- attachment behavior;
- keyword behavior;
- expiration/cleanup;
- existing viewer-safe projection;
- existing Might provenance;
- existing card preview data.

## 2.1 Protect Before Refactoring

Before an accepted semantic path is redirected through the new foundation:

1. identify its current reusable contract;
2. identify existing automated PASS_TO_PASS protection;
3. add reusable characterization coverage if protection is insufficient;
4. prove the baseline is GREEN;
5. only then replace or redirect the implementation;
6. rerun the protected expectations unchanged.

If an existing behavior was previously validated manually but is insufficiently protected by automation, the relevant reusable behavior must acquire automated regression protection **before** its semantic owner is changed.

The durable test belongs to the reusable contract, not to the card/deck that originally exposed it.

## 2.2 Do Not Rewrite Accepted Expectations

Existing accepted PASS_TO_PASS expectations must not be deleted, weakened, broadened, or rewritten to accommodate the new architecture.

If the new common evaluator breaks an accepted behavior, first treat that as a defect in the new implementation.

Do not compensate by changing:

- unrelated card definitions;
- accepted authored behavior;
- existing tests;
- downstream UI logic;
- unrelated gameplay subsystems.

If evidence suggests the accepted semantic contract itself is wrong, stop and follow the repository semantic-contract change gate rather than silently redefining it.

## 2.3 Parity Before New Capability

The project must first consolidate existing keyword evaluation while preserving current behavior.

Only after the new shared evaluator has demonstrated parity may runtime keyword grants and runtime granted behavior be enabled.

Required sequence:

```text
existing accepted keyword behavior
        ↓
shared effective-keyword evaluator in parity mode
        ↓
existing consumers migrated incrementally
        ↓
accepted behavior remains unchanged
        ↓
new runtime-grant capabilities
```

---

# 3. Existing Foundation to Reuse

The project already contains important parts of the required architecture.

Do not replace them unnecessarily.

## 3.1 Numeric Modifier and Might Provenance Pattern

The current Might path already establishes the desired server-authoritative pattern:

```text
authoritative evaluation
→ individual contributions
→ public-safe source presentation
→ viewer projection
→ preview
```

Existing Might provenance includes concepts such as:

- contribution amount;
- source card;
- duration;
- presentation label.

Runtime keyword/effect provenance should follow this pattern where appropriate.

The current Might implementation must remain intact unless a narrowly required shared extraction is proven safe.

## 3.2 Behavior Models and Primitive Catalog

Approved canonical behavior models remain the gameplay source of truth.

Raw card text must not become runtime interpretation logic.

New runtime-grant behavior must be represented through reusable primitive/behavior contracts and approved models.

## 3.3 Game-Object Incarnation

The project already distinguishes:

- runtime card instance identity;
- game-object incarnation;
- mutable object version.

Runtime grants that are tied to the current game object must use this existing identity model rather than treating `cardInstanceId` alone as sufficient identity.

## 3.4 Viewer-Safe Projection

The server already owns information visibility and public-safe projection.

New provenance must pass through the same boundary.

The client must not receive hidden/private source identity merely because it needs to explain an effect.

## 3.5 Disposable Match Policy

Matches created before relevant project changes are not a compatibility target.

Do not introduce:

- old-match migrations;
- compatibility branches;
- ruleset pinning;
- backfills;
- recovery logic.

This does not authorize deletion of persisted data.

New matches/snapshots use the new contract.

---

# 4. Locked Semantic Decisions

## 4.1 Runtime Keyword Grants Belong to the Modifier Family

A card **having** a keyword and an effect **granting** a keyword are different semantics.

Example:

```text
[Deflect]
```

on a Unit is a keyword characteristic of that object.

By contrast:

```text
Give a unit [Deflect 2].
```

is a modifier effect whose payload is a keyword.

Introduce a reusable keyword-grant modifier capability.

Recommended semantic identifier:

```text
modifier.grant_keyword
```

The implementation must remain reusable and must not branch on card name, set, deck, Champion, Legend, or public code.

## 4.2 Native Keyword Declaration and Keyword Grant Must Be Modeled Separately

The behavior pipeline must preserve the difference between:

```text
object has keyword
```

and:

```text
effect grants keyword to target
```

This distinction must exist in:

- behavior discovery/suggestion where applicable;
- canonical model authoring;
- validation;
- runtime execution;
- projection.

Do not model a spell that grants `Assault 3` as though the spell itself simply has the `Assault 3` keyword.

## 4.3 Resolved Grants and Continuous Grants Use Different Runtime Models

### Applied/resolved grant

When a spell, ability, choice, or resolving effect grants a keyword and that grant must survive after the resolving source leaves the Chain or changes zone, persist an authoritative runtime grant.

Example shape:

```text
Cleave resolves
→ target receives Assault 3 this turn
→ spell may leave Chain
→ grant remains on target until its own lifetime ends
```

### Continuous grant

For semantics equivalent to:

```text
Your token units have Tank.
```

do not stamp permanent grant records onto every affected object.

The effective-keyword evaluator derives the contribution while:

- the source is active;
- the target matches;
- applicable conditions remain true.

New eligible objects must automatically participate without requiring copied state.

---

# 5. Effective Keyword Evaluator

Create one authoritative shared semantic owner that answers the current effective keyword state of a game object.

Conceptually:

```text
evaluateEffectiveKeywords(game, cardInstanceId, runtimeIndex)
```

The exact implementation/API name may follow nearby project conventions, but there must be a single shared owner.

The evaluator combines supported contributions from:

1. printed/native keyword characteristics;
2. attached/effect behavior;
3. persisted runtime grants;
4. active continuous grants;
5. supported conditional characteristics.

Gameplay and projection must consume the same evaluator.

## 5.1 Existing Consumers Must Converge on the Shared Owner

Current gameplay checks are fragmented.

Known examples include:

- Ganking movement legality;
- Tank combat-damage assignment;
- Deflect targeting/payment;
- Assault attacker Might;
- Shield defender Might;
- other direct keyword readers discovered during implementation.

Before editing, perform an exhaustive consumer inventory.

Search for:

- `keyword.*` behavior reads;
- `hasKeyword`;
- `hasBehavior`;
- direct `behaviorModel.clauses[].keywords` reads;
- keyword-specific helper logic;
- attachment/effect-text keyword readers.

The inventory must identify:

- semantic owner;
- current consumers;
- accepted tests;
- production cards/models that rely on that owner.

Do not assume the examples listed here are exhaustive.

## 5.2 Migrate Consumers Incrementally

Do not switch every consumer in one large change.

For each migrated semantic consumer:

```text
prove current PASS_TO_PASS baseline
→ redirect to shared evaluator
→ rerun protected tests
→ continue only when parity is proven
```

No new runtime-grant behavior is required during this parity stage.

---

# 6. Keyword Composition Semantics

The generic evaluator must not assume that every keyword combines the same way.

The keyword semantic owner decides composition.

## 6.1 Additive Numeric Keywords

For supported additive numeric keywords, all applicable contributions combine into the current effective amount.

Required examples include the currently supported additive semantics needed by scope, such as:

- Assault;
- Shield;
- Deflect.

Example:

```text
printed Deflect 1
+ runtime Deflect 2
= effective Deflect 3
```

Example:

```text
runtime Assault 3
+ runtime Assault 3
= effective Assault 6
```

## 6.2 Presence/Redundant Keywords

For supported non-numeric keywords whose multiple instances are redundant, effective state is presence rather than a numeric count.

Example:

```text
printed Tank
+ runtime Tank
= effective Tank
```

The redundant runtime grant may remain relevant for provenance/lifecycle, but it does not produce `Tank 2`.

## 6.3 Future Keywords

Do not infer unsupported stacking semantics for new keywords.

A new expansion using an **existing supported keyword** must not require new engine work merely because the expansion is new.

A genuinely new keyword semantic may require an explicit extension of the reusable keyword owner.

Unsupported keyword semantics must remain explicitly unsupported rather than being approximated.

---

# 7. Canonical Runtime Keyword Grant Contract

Persisted runtime keyword grants must retain enough information to support:

- gameplay evaluation;
- expiration;
- target identity;
- projection;
- source provenance;
- deterministic ordering.

The exact schema may follow implementation conventions, but every applied grant requires the semantic equivalent of:

```text
grant identity
target card instance
target game-object incarnation
keyword behavior identity
keyword parameters/value
source card instance when applicable
source behavior/clause identity
runtime lifetime
explicit player-facing duration, if one exists
application ordering/provenance
```

Do not persist preformatted UI strings as the rules source of truth.

---

# 8. Lifetime vs Player-Facing Duration

The engine lifetime and the text displayed to the player are different concepts.

They must be represented separately.

## 8.1 Explicit Duration

Example:

```text
Give a unit Assault 3 this turn.
```

Runtime lifetime:

```text
end of current turn
```

Preview duration:

```text
This turn
```

## 8.2 No Explicit Duration

Example:

```text
Give a unit Assault 2.
```

without explicit duration:

- the rules engine must still know when that grant ceases according to the applicable game-object/zone rules;
- the preview must not invent `Permanent`, `Forever`, `Indefinite`, or `Until zone change`;
- source provenance remains available when viewer-safe.

Conceptually:

```text
runtime lifetime: bound to current game object / rules-defined zone lifetime
display duration: none
```

---

# 9. Game-Object Incarnation Safety

Applied grants tied to the current game object must not follow a later incarnation simply because the runtime card instance ID is reused.

Required invariant:

```text
same cardInstanceId
+ new gameObjectIncarnation
≠ same granted effect
```

When a rules-defined zone transition creates a new game object:

- grants tied to the previous incarnation cease;
- granted executable behavior tied to the previous incarnation ceases;
- provenance tied to the previous object cannot affect the new object;
- projection must not expose stale runtime annotations.

Do not use mutable `objectVersion` as a substitute for game-object incarnation.

---

# 10. Source Lifecycle Semantics

Different effect types must preserve their own lifecycle.

## 10.1 Resolved Applied Grant

Once a resolved effect has created an independent grant:

```text
source leaving Chain
```

must not automatically remove that grant.

Example:

```text
spell resolves
→ grants Assault this turn
→ spell moves to Trash
→ target keeps Assault until end of turn
```

## 10.2 Continuous Grant

A continuous grant that depends on an active source ends when its source or condition stops applying.

Example:

```text
active source says tokens have Tank
→ token effectively has Tank
→ source stops applying
→ Tank contribution disappears
```

Do not conflate these two lifecycles.

---

# 11. Runtime Keyword Activation Ordering

The UI contract requires:

```text
first runtime keyword activated → top
last runtime keyword activated → bottom
```

Changing the value of an already active annotation must not reorder it.

Required behavior:

```text
1. Assault becomes runtime-active
2. Ganking becomes runtime-active
3. another Assault contribution is added
```

Order remains:

```text
Assault
Ganking
```

If one Assault contribution later expires but Assault remains runtime-active because another contribution still exists, Assault keeps its existing position.

Only when the effective keyword returns fully to its printed baseline does that runtime activation end.

A future grant begins a new activation occurrence.

The authoritative side must provide a stable ordering value sufficient for projection to preserve this behavior across normal rerenders/reloads.

The implementation may choose the smallest canonical metadata necessary to represent this activation order, but it must not make the client reconstruct historical grant timing.

---

# 12. Granted Non-Keyword Rules / Abilities

Introduce a reusable capability for an effect to grant executable behavior to another game object.

Recommended semantic concept:

```text
modifier.grant_behavior
```

The implementation may choose the final primitive name according to repository conventions, but the semantic contract is fixed.

A granted behavior must contain or reference:

- executable reusable behavior clauses;
- the affected target game object;
- the target incarnation;
- lifetime;
- source/provenance;
- player-facing granted text.

## 12.1 Never Implement Granted Rules Text as Display-Only State

This is prohibited:

```text
store text
→ show in card preview
→ engine does not execute it
```

Instead:

```text
grant executable behavior
├─ runtime behavior evaluation
├─ lifetime
├─ provenance
└─ preview presentation
```

## 12.2 Trigger Discovery Must See Active Granted Behavior

Where the supported granted behavior contains a triggered ability, normal trigger collection must treat the affected object as possessing that active granted trigger for the grant's lifetime.

The first implementation should support only the behavior forms required by the approved scope.

Do not attempt to implement arbitrary free-form card-text mutation.

---

# 13. Catalog and Behavior-Model Changes

This is not only a runtime-state change.

The reusable authoring pipeline must be able to represent the new semantics.

## 13.1 Primitive Catalog

Add/extend the reusable modifier capabilities required for:

- keyword grants;
- granted behavior fragments.

Their catalog definitions must describe:

- required parameters;
- target semantics;
- duration semantics;
- engine-support status.

## 13.2 Discovery / Suggestion

Where automated discovery is responsible for a card, distinguish:

```text
native keyword characteristic
```

from:

```text
effect that grants a keyword
```

Do not broaden the task into a full-corpus remodeling campaign.

The goal is to make the generic pipeline capable of expressing the correct contract and update only approved/current consumers required by this work.

## 13.3 Approved Canonical Models

Cards remain declarative consumers of reusable semantics.

No runtime branches based on:

- card name;
- set;
- public code;
- Champion;
- Legend;
- deck ID.

If a card cannot be represented faithfully by the reusable vocabulary, stop and use Moe to classify whether the owner must be extended or a new capability is genuinely required.

---

# 14. Viewer-Safe Projection Contract

The UI must receive **resolved presentation semantics**, not raw engine internals.

Do not send enough raw modifier state for the client to reproduce keyword rules.

The projection must provide two new categories of information.

## 14.1 Effective Keyword Annotations

For each visible card, provide annotation-ready effective runtime keyword information.

Conceptually:

```ts
type ProjectedKeywordAnnotation = {
  keywordId: string;
  displayName: string;
  effectiveAmount: number | null;
  activationOrder: number;
};
```

The exact TypeScript shape may follow project conventions.

Required properties:

- only annotation-worthy runtime differences are included;
- additive numeric values are already resolved;
- redundant keyword instances are already collapsed;
- ordering is already resolved;
- the client does not compare printed vs effective state itself.

Example:

```text
Irelia printed Deflect 1
+ runtime Deflect 2
```

Projection annotation:

```text
Deflect 3
```

## 14.2 Runtime Preview Effects

Provide viewer-safe provenance entries for the preview.

The projection should keep effect, duration, and source as separate semantic values so the UI can apply its three typographic roles.

Conceptually:

```ts
type ProjectedRuntimeEffect =
  | {
      kind: "keyword";
      keywordId: string;
      displayName: string;
      contributionAmount: number | null;
      displayDuration: string | null;
      sourceName: string;
    }
  | {
      kind: "grantedBehavior";
      text: string;
      displayDuration: string | null;
      sourceName: string;
    };
```

Exact naming is implementation-owned.

The required contract is:

- runtime keyword contribution/effect;
- granted rules text;
- explicit duration when present;
- source name when publicly safe;
- no invented duration when absent.

## 14.3 Source Privacy

Reuse the existing public-source presentation policy used by numeric provenance.

If the source identity is not viewer-safe, projection must not expose it merely to explain the effect.

Use a safe generic source presentation where necessary.

## 14.4 Existing Might Provenance Remains

Do not replace the current `mightModifiers` contract as part of this work.

The new runtime-effect data must coexist with it.

Any shared extraction of source/duration presentation helpers must preserve current Might output exactly unless separately approved.

---

# 15. Client Boundary

This backend plan stops at delivering the authoritative projection contract.

The UI implementation remains governed by the existing UI plan.

The client may:

- render keyword icons;
- render text;
- render `3 + N` overflow;
- apply CSS tokens;
- apply typography;
- mechanically format provided numeric values.

The client must not:

- parse printed rules text to find native keywords;
- count grants;
- sum Assault/Deflect/Shield;
- decide whether Tank instances are redundant;
- determine expiration;
- infer source provenance;
- determine grant order;
- decide whether granted rules text is active;
- re-evaluate game legality.

---

# 16. Delivery Strategy

Deliver this foundation in controlled stages.

Each stage must be independently reviewable and must preserve all protected behavior.

## Stage / PR 1 — Effective Keyword Parity Foundation

### Goal

Introduce the shared effective-keyword semantic owner and migrate current consumers without adding new gameplay semantics.

### Work

1. inventory every existing keyword reader/consumer;
2. inventory accepted tests and production consumers;
3. add missing characterization/PASS_TO_PASS protection;
4. implement the effective-keyword evaluator using only existing supported sources;
5. migrate existing consumers incrementally;
6. prove parity after each migration.

### Hard Gate

Do not start runtime keyword grants until:

- known existing consumers use the shared owner where applicable;
- all affected PASS_TO_PASS tests remain unchanged and GREEN;
- no new card behavior has been enabled accidentally.

## Stage / PR 2 — Runtime Keyword Grants and Provenance

### Goal

Add reusable runtime keyword-grant semantics on top of the proven evaluator.

### Work

1. add the reusable keyword-grant modifier primitive;
2. model applied/resolved grants;
3. support required continuous grants;
4. bind grants to target game-object incarnation;
5. implement explicit lifetime vs display duration;
6. implement keyword-specific composition;
7. implement stable runtime activation ordering;
8. extend catalog/modeling support;
9. expose viewer-safe keyword annotations;
10. expose viewer-safe runtime keyword provenance.

### Required new FAIL_TO_PASS coverage

At minimum:

- native numeric keyword + runtime numeric grant;
- two additive grants aggregate;
- redundant non-numeric grant does not become a numeric count;
- applied grant survives source leaving Chain;
- explicit `thisTurn` grant expires correctly;
- no-explicit-duration grant follows game-object lifetime;
- zone transition/new incarnation removes old grant;
- continuous grant disappears with source/condition;
- annotation ordering remains stable while value changes;
- all grants ending resets the activation occurrence;
- projection is viewer-safe.

## Stage / PR 3 — Runtime Granted Behavior

### Goal

Support executable granted non-keyword rules text and project it for preview presentation.

### Work

1. add the reusable granted-behavior modifier capability;
2. author/validate behavior-fragment payloads;
3. bind granted behavior to target incarnation;
4. make trigger/behavior discovery consume active granted fragments;
5. expire fragments using the same lifecycle contract;
6. project player-facing effect text, duration, and safe source.

### Required new FAIL_TO_PASS coverage

At minimum:

- granted triggered behavior becomes executable;
- granted behavior uses target game-object identity correctly;
- source leaving does not incorrectly remove an independent resolved grant;
- expiration removes the granted behavior;
- new incarnation does not inherit old granted behavior;
- preview projection contains the same active behavior the engine executes;
- hidden/private source information does not leak.

## Stage 4 — UI Consumption

This is governed by the existing UI plan and is **not part of this backend foundation plan**.

The UI work starts only when the projection contract is ready.

---

# 17. Specialist and Agent Workflow

Follow the repository's adaptive specialist routing.

Do not treat Moe, Larry, and Curly as a mandatory sequential pipeline.

## 17.1 Moe — Required for New Semantic Capabilities

Use Moe before implementing the new keyword-grant and granted-behavior semantics.

Expected classifications:

### Effective keyword evaluation

**Extend / consolidate existing reusable keyword ownership.**

The engine already has keyword semantics and consumers; the missing piece is a shared effective-state owner.

### Keyword grant

**New reusable modifier capability** unless repository inspection discovers an existing faithful owner.

Moe must record the closest existing candidates and why they cannot already express a resolved keyword grant.

### Granted behavior

**New reusable modifier/behavior capability** unless an existing faithful composition is discovered.

Do not create the capability without Moe's non-similarity proof.

Moe's output is a compact semantic decision, not a second implementation plan.

## 17.2 Engine Change Impact — Required

This is shared engine/corpus-capability work.

Before implementation:

- identify semantic owners;
- identify writers/readers;
- identify accepted consumers;
- identify current paths;
- establish PASS_TO_PASS baseline;
- bound scope to approved requirements.

## 17.3 Behavior Change TDD — Required

Use the repository FAIL_TO_PASS / PASS_TO_PASS workflow.

For every reusable extension:

```text
accepted GREEN
→ new generic RED
→ smallest reusable implementation
→ new GREEN
→ accepted GREEN unchanged
```

Do not claim RED unless it was actually observed.

## 17.4 Larry — Use for the High-Risk State Dimensions

Larry is appropriate after the shared owner is understood because this change has meaningful sequence/state risk.

Primary Larry focus:

### Identity / incarnation

Protect:

- same instance/same incarnation;
- same instance/new incarnation;
- source present vs departed;
- target zone transition;
- attachment lifecycle.

### Lifecycle sequences

Protect combinations such as:

```text
grant
→ second grant
→ source leaves
→ one contribution expires
→ another remains
→ end turn
→ zone transition
```

### Projection

Verify:

```text
authoritative state
→ viewer-safe projection
→ client adaptation
```

without leaking private sources or losing public runtime state.

Do not build a second whole-game engine.

Use bounded reusable-owner properties and deterministic traces.

## 17.5 Curly — Use When a Regression or Boundary Disagreement Appears

Curly is not a required initial phase because this task starts from a known capability gap.

Use Curly whenever observed behavior diverges during implementation or manual verification.

Trace:

```text
authored source/model
→ canonical behavior
→ snapshot
→ runtime state
→ execution/evaluator
→ projection
→ client adaptation
→ component input
```

Fix the first incorrect boundary.

Do not patch downstream symptoms.

## 17.6 Independent Technical Review

Each shared engine PR should receive fresh technical review where the environment supports it.

The reviewer should start from:

- requested outcome;
- BASE/HEAD;
- compact `.agent-work` task record;
- actual diff;
- relevant durable authorities;
- validation evidence.

Do not preload the full implementation investigation transcript.

---

# 18. Automated Regression Strategy

## 18.1 PASS_TO_PASS

Before production semantic changes, protect existing accepted consumers.

Known areas include:

- Ganking movement;
- Tank combat assignment;
- Deflect payment;
- Assault Might;
- Shield Might;
- attachment-derived keyword/Might behavior;
- Might provenance;
- current projection behavior.

Implementation discovery must expand this list if other affected consumers exist.

## 18.2 Characterization of Previously Manual Behavior

When a previously accepted/manual behavior shares a semantic owner being changed but lacks sufficient automated coverage:

1. capture its reusable contract in a deterministic test;
2. observe the test GREEN on the current implementation;
3. treat it as PASS_TO_PASS protection;
4. only then refactor the owner.

Do not create permanent deck/card acceptance suites merely to mirror manual gameplay.

Use production cards only as fixture data where helpful.

## 18.3 New FAIL_TO_PASS Behavior

New runtime-grant requirements get new reusable-owner tests.

Do not rewrite older expectations to make them pass.

## 18.4 Intermediate Checkpoints

For lifecycle-sensitive semantics, assert intermediate state, not only final outcomes.

Examples:

```text
before grant
after grant
after source departure
after one contribution expires
after all contributions expire
after end turn
after zone transition/new incarnation
```

This is required where a final-state-only test could hide an incorrect temporary state.

---

# 19. Reference Semantic Scenarios

These examples define intended semantics.

They must not produce card-specific runtime branches.

Production cards may be used as fixtures only when appropriate and already available within approved scope.

## 19.1 Native Deflect + Runtime Deflect

Given:

```text
printed Deflect 1
runtime grant Deflect 2
```

Then authoritative effective keyword state is:

```text
Deflect 3
```

Gameplay rules using Deflect and viewer projection must agree on `3`.

When the runtime grant ends:

```text
effective Deflect returns to 1
```

and the runtime annotation disappears.

## 19.2 Multiple Assault Grants

Given a Unit with no printed Assault:

```text
grant Assault 3
grant Assault 3
```

Then:

```text
effective Assault = 6
```

The gameplay evaluator and projection must expose the same result.

## 19.3 Redundant Tank

Given:

```text
printed Tank
runtime Tank grant
```

Then effective keyword state remains:

```text
Tank
```

not:

```text
Tank 2
```

## 19.4 Applied Grant Survives Source Resolution

Given a spell grants:

```text
Assault 3 this turn
```

When the spell finishes resolving and leaves the Chain:

Then the target retains Assault until the grant's own end-of-turn lifetime.

## 19.5 No Explicit Duration

Given an effect grants:

```text
Assault 2
```

without explicit duration:

- engine lifetime follows the applicable current-game-object rules;
- preview projection contains no invented duration string;
- source provenance remains available when viewer-safe.

## 19.6 New Incarnation

Given a target has a runtime keyword grant:

When it undergoes a rules-defined zone transition that creates a new game object:

Then the previous incarnation's grant does not apply to the new object.

## 19.7 Stable Annotation Activation Order

Given:

```text
1. Assault becomes runtime-active
2. Ganking becomes runtime-active
3. another Assault contribution is added
```

Then annotation ordering remains:

```text
Assault
Ganking
```

If one Assault contribution expires but Assault remains runtime-active, it does not move.

When all runtime Assault contributions cease and Assault returns to baseline, its activation occurrence ends.

A later Assault grant receives a new ordering position.

## 19.8 Granted Triggered Rules Text

Given a runtime effect grants a target a triggered ability:

Then:

- the target participates in trigger discovery using that ability;
- the ability executes through reusable engine behavior;
- the preview receives its player-facing text;
- expiration removes both execution and presentation;
- the old grant does not follow a new target incarnation.

---

# 20. Durable Artifact Updates

This implementation plan is an execution handoff. It should not automatically become a permanent project artifact.

Durable project truth should be updated in the existing authorities.

## Required Durable Updates When Implementation Is Accepted

### `docs/game_definition.md`

Record:

- authoritative effective keyword evaluation;
- applied runtime grants vs continuous grants;
- target incarnation lifecycle;
- machine lifetime vs player-facing duration;
- viewer projection relationship;
- non-regression requirement for shared semantic migration where appropriate.

### `docs/card_behavior.md`

Record:

- native keyword vs keyword-grant modeling distinction;
- reusable keyword-grant modifier;
- reusable granted-behavior capability;
- approved behavior-model expectations;
- unsupported behavior handling.

### `docs/architecture.md`

Update only if the implementation creates a genuinely new durable ownership boundary.

Do not edit it merely to narrate implementation details.

## Non-Durable Evidence

Keep temporary investigation material under:

```text
.agent-work/<task>/
```

Only a compact task record should survive during implementation containing:

- requested outcome;
- verified BASE/HEAD;
- reusable owner;
- protected behavior;
- specialist conclusions;
- scope exclusions;
- unresolved decisions;
- validation evidence.

Do not commit:

- verbose investigation transcripts;
- separate Moe/Larry/Curly reports;
- temporary logs;
- scratch plans;
- generated diagnostic output.

---

# 21. Out of Scope

This backend plan does not include:

- implementing the card-tile badges;
- redesigning the card preview;
- changing the UI plan;
- full-corpus card remodeling;
- automatically supporting every future keyword semantic;
- card-name-specific runtime logic;
- old-match compatibility or migration;
- arbitrary free-form rules-text interpretation at runtime;
- making unsupported keyword semantics silently approximate supported ones;
- replacing the existing Might modifier/provenance system;
- broad unrelated engine refactoring;
- event-log/UI redesign unrelated to the required provenance.

---

# 22. Completion Criteria

This plan is complete only when all of the following are true.

## Existing Behavior Preservation

1. Existing affected semantic consumers were inventoried.
2. Existing affected PASS_TO_PASS baselines were established before refactoring.
3. Missing reusable characterization coverage was added where required.
4. Previously accepted expectations remain unchanged and GREEN.
5. No known previously accepted/manual behavior was intentionally traded away to simplify the new architecture.

## Effective Keyword Foundation

6. A single shared effective-keyword semantic owner exists.
7. Existing applicable gameplay consumers use that owner instead of independent keyword interpretations.
8. Printed, attached, applied, and supported continuous contributions compose correctly.
9. Keyword-specific stacking/redundancy semantics are authoritative and not UI-derived.

## Runtime Grants

10. Resolved keyword grants are canonical runtime state.
11. Continuous grants are derived from active source/conditions rather than incorrectly stamped onto targets.
12. Grants are bound to the correct target game-object incarnation.
13. Explicit end-of-turn grants expire correctly.
14. No-explicit-duration grants use correct machine lifetime without inventing preview duration.
15. Source departure semantics distinguish applied grants from continuous grants.
16. Runtime annotation activation order is stable and authoritative.

## Granted Behavior

17. Supported granted non-keyword rules text is executable behavior.
18. Trigger/behavior discovery sees supported active granted fragments.
19. Expiration removes execution and presentation together.
20. Granted behavior does not follow a new target incarnation incorrectly.

## Projection

21. Viewer projection supplies effective keyword annotations ready for tile consumption.
22. Viewer projection supplies runtime effect, explicit duration, and safe source information for preview consumption.
23. Projection does not disclose hidden/private source information.
24. The client is not required to reproduce keyword or lifetime rules.
25. Existing Might provenance remains correct and unchanged.

## Project Quality

26. New reusable behavior has observed FAIL_TO_PASS → PASS evidence where practical.
27. High-risk lifecycle/identity/projection combinations receive proportional Larry-style bounded verification.
28. Final affected regression suites are GREEN.
29. Final repository PR verification is GREEN.
30. Durable authorities are updated with accepted semantic truth.
31. Temporary agent artifacts are not committed.
32. A fresh independent technical review is performed when the environment supports it.

---

# 23. Final Implementation Principle

The implementation must preserve this invariant:

> **The engine decides what a game object effectively has and can do; the viewer projection explains that authoritative state; the UI only presents it.**

And the delivery must preserve this equally important invariant:

> **Previously accepted gameplay remains protected behavior. New generalized runtime keyword and granted-behavior support must be added without regressing the manual validation that has already been accepted.**
