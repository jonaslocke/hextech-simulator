# Hextech Coding-Agent Benchmark

**Version:** 1.0
**Status:** Ready for use
**Visibility:** Project-safe / agent-readable
**Purpose:** Evaluate and evolve the coding-agent harness used by Hextech Simulator.

## 1. What this benchmark measures

Hextech's game rules are unusually domain-specific. This benchmark therefore does **not** test whether a coding agent can independently infer Riftbound rules. Rules remain repository authority.

The benchmark tests engineering behaviors that are portable and measurable:

1. **Corpus Capability Boundary** — implement only capabilities required by the approved card corpus.
2. **Reusable Owner Selection** — fix/extend the shared behavior or subsystem, not the card/deck that exposed it.
3. **Accepted Contract Preservation** — previously accepted behavior remains protected history.
4. **FAIL_TO_PASS Discipline** — new behavior is proven missing/broken before the implementation is changed.
5. **Shared-Consumer Impact** — changes to a shared owner account for previously accepted consumers.
6. **Alternate Execution-Path Analysis** — a fix works through all meaningful paths, not only the reported reproduction.
7. **Semantic Abstraction Selection** — existing fields/helpers are reused only when their semantics actually match.
8. **Single Source of Truth** — validation and configuration derive from canonical production registries rather than duplicated lists.

The benchmark originated from the PR 01 Ornn corpus-expansion cycle, but none of these competencies is Ornn-specific.

## 2. Core model

### Approved corpus

The exact cards, Battlefields, Sideboard cards, tokens, generated dependencies, and other data explicitly included in the current delivery slice.

### Capability dependency set

The keywords, behavior families, selectors, payment modes, timing contracts, rules subsystems, projections, tokens, and other engine capabilities required to execute the approved corpus.

The implementation scope must satisfy:

> **implemented capabilities ⊆ approved corpus capability dependency set**

unless the task explicitly expands scope.

A rule example, test fixture, or convenient adjacent card is not authorization to implement a new capability.

### Reusable owner

The primitive, behavior family, engine subsystem, compiler, projection layer, persistence contract, or validation pipeline that owns the behavior independently of the card that revealed it.

### Accepted contract

A reusable behavior expectation already accepted through project validation and/or relied upon by previously manually accepted gameplay.

Accepted contracts are protected history until an explicit authoritative rules or product decision changes them.

### PASS_TO_PASS

A contract that passes before the requested change and must continue passing afterward.

Existing accepted regression expectations are PASS_TO_PASS evidence. They must not be rewritten merely because a new implementation makes them fail.

### FAIL_TO_PASS

A new generic regression/capability check that fails before the correction and passes after it.

This demonstrates that the requested behavior was genuinely missing or broken.

## 3. Test lifecycle contract

For reusable behavior or subsystem changes, the default lifecycle is:

1. identify the reusable owner;
2. identify accepted consumers and applicable PASS_TO_PASS contracts;
3. run the relevant baseline before changing production behavior;
4. add focused generic regression coverage for the missing requirement;
5. demonstrate the new case fails for the intended reason when practical;
6. implement the generic change;
7. prove the new case passes;
8. prove prior PASS_TO_PASS contracts still pass unchanged;
9. run proportional consumer coverage and project technical gates.

### Existing-test modification gate

An existing passing expectation may be changed only when all are true:

- an authoritative rules/product source changes the accepted semantic contract;
- the change is explicitly classified as a semantic-contract change;
- affected accepted consumers are inventoried;
- regression scope is defined;
- the semantic change is approved before the old expectation is rewritten.

A coding agent must not update production behavior and normalize old tests in the same step merely to return the suite to green.

### Manual versus automated acceptance

Complete card/deck gameplay remains manual acceptance.

Automation protects the reusable engine knowledge that makes those cards work.

> **Cards discover gaps; reusable owners acquire tests.**

## 4. Scenario model

The benchmark contains eight competencies. Seven are directly executable repository scenarios; HXB-004 is a process/evidence dimension scored on applicable scenario runs.

Every executable scenario pins:

- a repository start SHA;
- a visible task prompt;
- allowed normal project authorities;
- hidden evaluator checks;
- PASS_TO_PASS requirements;
- expected FAIL_TO_PASS behavior where applicable;
- forbidden outcomes;
- a known historical passing reference when available.

Hidden evaluator material must not be present in the repository under test.

## 5. Benchmark scenarios

### HXB-001 — Corpus Capability Boundary

A generic attachment/Cleanup correction is requested from a historical Ornn-scope snapshot. The rules contain an adjacent Hidden-Gear example, creating a realistic temptation to implement Hidden.

Pass requires the generic Cleanup/Recall contract without adding the unrelated Hidden lifecycle.

### HXB-002 — Reusable Owner Selection

A named card exposes a look/select/recycle defect.

Pass requires extension/reuse of the generic search/top-deck/player-decision behavior. A card-specific runtime implementation or permanent card-owned gameplay suite fails.

### HXB-003 — Accepted Contract Preservation

A historical scoring regression is presented from the state that broadened previously accepted final-point semantics.

Pass requires restoring the accepted contract without weakening or rewriting accepted expectations.

### HXB-004 — FAIL_TO_PASS Discipline

This is scored on any scenario that changes reusable behavior.

Where execution tracing is available, the evaluator verifies baseline → red new case → implementation → green new case → unchanged PASS_TO_PASS.

If the execution environment cannot capture reliable command/edit order, HXB-004 is reported as **N/A**, never inferred from a final green diff.

### HXB-005 — Shared-Consumer Impact

A Showdown Focus regression is reported through one current-corpus interaction.

Pass requires correcting the shared Chain/Focus timing owner while preserving previously accepted consumers of the same timing semantics.

### HXB-006 — Alternate Execution-Path Analysis

The historical start state correctly preserves `cardPlay` origin in the simple Quick-Draw path but loses it when simultaneous triggers require ordering.

The alternate ordering path is hidden from the coding agent.

Pass requires semantic Chain origin to survive both paths.

### HXB-007 — Semantic Abstraction Selection

The historical start state prevents a stale Temporary trigger from following a source after it leaves play by using `objectVersion`.

Hidden evaluation applies nonlethal damage to the same game object.

Pass requires distinguishing game-object incarnation identity from mutable-state versioning without silently redefining the established `objectVersion` contract.

### HXB-008 — Single Source of Truth

The historical start state has a generic permanent-deck validation test, but its permanent-deck list is manually duplicated from production synchronization/configuration.

Pass requires one canonical permanent-deck definition registry that drives production IDs/synchronization and generic validation.

## 6. Correctness gates

A scenario is **FAIL** if any applicable hard gate fails:

- requested behavior remains incorrect;
- a hidden evaluator case fails;
- an accepted PASS_TO_PASS contract regresses;
- an existing accepted test expectation is changed without an approved semantic-contract change;
- a card/deck/set-specific runtime branch implements reusable engine behavior;
- production capability outside the approved corpus dependency set is added;
- an existing abstraction is semantically redefined without impact analysis/approval;
- duplicated registries permit silent validation drift;
- a material previously accepted consumer breaks.

Correctness is non-compensatory: lower token use cannot offset a failed correctness gate.

## 7. Secondary metrics

Only compare efficiency among correctness-passing runs.

Record:

- first-pass technical approval;
- blocking review findings;
- correction rounds;
- human interventions;
- production files touched;
- test files touched;
- existing accepted expectations modified;
- out-of-scope files touched;
- temporary artifacts left in final diff;
- total model tokens when available;
- wall-clock duration;
- tool-call count when available;
- verification commands executed.

At harness level report:

- scenario pass rate;
- first-pass pass rate;
- regression-free rate;
- scope-discipline rate;
- accepted-contract-preservation rate;
- median correction rounds;
- median tokens for passing runs;
- median duration for passing runs.

## 8. Baseline versus candidate protocol

Use the benchmark to evaluate changes to `AGENTS.md`, scoped instructions, skills, or deterministic helper scripts.

For each comparison:

1. keep the repository snapshot, visible task, hidden evaluator, model/configuration, and verification commands fixed;
2. run the baseline harness;
3. run the candidate harness;
4. use multiple runs when practical because agent behavior is stochastic;
5. compare correctness first;
6. compare cost/variance only after correctness is equal or better.

A rule or skill should remain only if it improves correctness, reduces variance/review rounds, or lowers cost without weakening correctness.

## 9. Artifact visibility

### Safe to keep in the project

- this benchmark contract;
- concise root `AGENTS.md`;
- path-scoped `AGENTS.md` files;
- `docs/testing.md`;
- approved agent skills;
- deterministic verification helpers.

### Never expose to the coding agent during benchmark execution

- exact scenario answer keys;
- hidden checks;
- historical failure map;
- evaluator mutations;
- expected implementation names;
- scoring notes tied to a specific trap;
- benchmark run outputs.

Evaluator-only material should live outside the repository under test.

## 10. Recommended harness artifacts

The benchmark is designed to evaluate the following minimal harness:

- root `AGENTS.md` — authority map and universal repository rules;
- `src/server/game/AGENTS.md` — engine-specific non-negotiables;
- `tests/AGENTS.md` — test ownership and accepted-contract lifecycle;
- `docs/testing.md` — durable detailed testing authority;
- `.agents/skills/engine-change-impact/SKILL.md`;
- `.agents/skills/behavior-change-tdd/SKILL.md`;
- `.agents/skills/technical-pr-review/SKILL.md`;
- a deterministic `verify:pr` command;
- `.agent-work/` as a gitignored ephemeral workspace.

Do not add more skills until repeated benchmark or production evidence justifies them.

## 11. Research basis

The benchmark adapts ideas from:

- OpenAI — agent-first repository harnesses and concise `AGENTS.md` as a map rather than a manual;
- SWE-bench Verified — PASS_TO_PASS / FAIL_TO_PASS separation;
- Anthropic `skill-creator` — baseline-versus-candidate evaluation with correctness and cost metrics;
- Matt Pocock `skills` — predictable process, diagnosis, TDD at stable seams, and review separation;
- `obra/superpowers` — root-cause discipline and fresh verification evidence.

The Hextech-specific constraints in this document come from the project's own PR 01 history and architecture.

## 12. Completion status

The benchmark definition is complete at v1.0.

Exact visible prompts, historical start SHAs, hidden evaluator checks, and reference states are intentionally stored in evaluator-only material outside the project repository.
