# Jev-Assisted Codex Token Reduction Experiment — Stellacorn Herder

## 1. Purpose

This experiment measures whether the Hextech per-card Jev triage path reduces **Codex token consumption** during new-card implementation while preserving implementation correctness.

The experiment compares two Codex runs implementing the same target card from the same repository state:

- **Baseline:** the existing repository workflow without Jev assistance.
- **Jev-assisted:** the same implementation task, but Jev performs the per-card triage first and Codex follows the resulting Hextech route.

The experiment optimizes one metric only:

> **Codex token consumption.**

Correctness is a hard gate. Time, Jev token usage, Jev request size, number of deterministic scans, and total non-Codex LLM usage are not optimization metrics for this experiment.

---

## 2. Target

Implement exactly one card:

**Stellacorn Herder**

The implementation must be derived from the repository's authoritative card source and existing engine/card-modeling contracts. This experiment document intentionally does not state the expected primitive composition or Jev classification so that the baseline run is not given information produced by the treatment path.

No unrelated card, engine, UI, architecture, cleanup, refactor, or documentation work belongs in the implementation scope unless it is strictly required for Stellacorn Herder to work correctly.

---

## 3. Hypothesis

For a card that can be implemented using capabilities already present in Hextech, per-card Jev triage can start Codex farther down the implementation decision tree and reduce the amount of repository discovery and semantic exploration Codex must perform.

The experiment succeeds only if:

1. both implementations satisfy the same correctness gate; and
2. the Jev-assisted run consumes fewer Codex tokens than the baseline run.

If either implementation fails the correctness gate, token totals must still be recorded, but no token-efficiency conclusion should be drawn from that pair.

---

## 4. Branches

Create both branches from the **exact same starting commit** after the Jev infrastructure and final routing policy are available:

```text
experiment/stellacorn-herder-codex
experiment/stellacorn-herder-jev
```

The branch name is the experiment-mode selector.

### `experiment/stellacorn-herder-codex`

This is the **baseline** run.

Codex must follow the repository's normal card-implementation discovery and specialist-routing workflow.

It must **not**:

- run the Jev card-triage command;
- inspect a Stellacorn Herder Jev artifact;
- use Jev-derived primitive selections, probabilities, disposition, gap classification, or route information;
- inspect the result artifact produced by the Jev branch;
- use knowledge from a previous Stellacorn implementation attempt outside the current repository state and prompt.

### `experiment/stellacorn-herder-jev`

This is the **Jev-assisted** run.

Before implementation discovery, Codex must run the project's per-card Jev triage for Stellacorn Herder and follow the route produced by the current Hextech routing policy.

Use the project's current Jev command and current default configuration. The treatment must not manually override the route or alter routing thresholds for the experiment.

If Jev returns `TARGETED_IMPLEMENTATION`, Codex should use the Jev artifact as the implementation discovery input and avoid running broader semantic discovery that the route is intended to bypass.

If Jev returns `MOE_DISCOVERY`, Codex should follow that route normally. The result must be recorded as observed rather than changing the experiment to force a targeted implementation.

The Jev-assisted branch must not inspect the baseline branch's implementation or result artifact.

---

## 5. Experimental Controls

The two runs must use the same conditions except for Jev assistance.

Required controls:

- same starting Git commit;
- clean working tree before each run;
- separate branches as defined above;
- fresh Codex session for each branch;
- same Codex model;
- same Codex reasoning level/configuration;
- exact same `/goal` prompt;
- same repository instructions and skills;
- same dependency state;
- same environment variables except values inherently required by Jev on the treatment branch;
- same database/catalog starting state when database-backed operations are used;
- same tests and correctness expectations;
- no manual implementation hints supplied to only one branch;
- no copying changes, diffs, conclusions, artifacts, or implementation knowledge from one experiment branch to the other.

Before each run, remove stale experiment artifacts that could disclose the other run's result. The baseline run must also begin without a Stellacorn Jev triage artifact available for inspection.

Do not merge one experiment branch into the other.

---

## 6. What Codex May Optimize

Codex should implement the card correctly using the workflow assigned to its branch.

Codex must not intentionally minimize work by skipping repository-required validation, tests, synchronization, or correctness checks merely to reduce tokens.

The implementation should remain scoped and reuse-first according to the repository's existing architecture and instructions.

The experiment is measuring the natural token consequence of the two discovery paths, not an artificially shortened implementation procedure.

---

## 7. Correctness Gate

Both branches are evaluated against the same gate.

A run passes only when all of the following are true:

1. Stellacorn Herder is represented through the repository's normal canonical card/behavior-modeling path.
2. The implementation faithfully represents the authoritative card source in the repository.
3. Existing shared behavior semantics are preserved; no existing primitive may be changed merely to make the target card fit.
4. Relevant automated tests pass.
5. Required catalog/behavior synchronization checks pass if the implementation changes data that requires synchronization.
6. Any new target-card tests required by the repository's established pattern are present and pass.
7. No unrelated behavior regression is knowingly introduced.
8. The final working tree contains only changes reasonably required by the target implementation plus the mandatory experiment result artifact.

The two branches do **not** need identical diffs. They need behaviorally correct implementations under the same repository contracts.

---

## 8. Primary Measurement

The primary measurement is **Codex token consumption for the complete run**.

Capture token telemetry exactly as exposed by the Codex environment/harness. Do not estimate missing token counts and do not reconstruct them from character counts.

When available, preserve all raw counters, including:

- input tokens;
- output tokens;
- cached input tokens;
- reasoning tokens or equivalent separately reported counters;
- total tokens as reported by the environment;
- any run/session usage identifier useful for verifying the measurement.

If Codex cannot access its own token telemetry, the result artifact must explicitly say `not_exposed_to_agent` rather than inventing a value. Raw telemetry may then be added externally before final analysis.

For the final comparison, use the same token accounting definition for both branches.

Primary calculation:

```text
reduction % =
  (baseline Codex tokens - Jev-assisted Codex tokens)
  / baseline Codex tokens
  * 100
```

Do not include Jev tokens in this formula.

---

## 9. Diagnostic Measurements

The following may be recorded to help explain the result, but they are not success metrics:

- elapsed time, if available;
- number of observable tool/command invocations, if available;
- specialists invoked;
- repository areas inspected;
- number of files changed;
- test commands run;
- Jev request statistics on the treatment branch;
- Jev route, selected primitives, probabilities, and routing reasons on the treatment branch.

Do not record or expose private chain-of-thought. The artifact should contain only observable actions, commands, decisions, outputs, and concise factual summaries.

---

## 10. Mandatory Result Artifact

Each Codex run must finish by generating one Markdown result artifact.

Paths:

### Baseline

```text
.agent-work/experiments/stellacorn-herder-codex-result.md
```

### Jev-assisted

```text
.agent-work/experiments/stellacorn-herder-jev-result.md
```

The files are experiment evidence and do not need to be committed if `.agent-work` is ignored. They must remain available for collection after the run.

The artifact must use the structure below.

```markdown
# Stellacorn Herder Codex Experiment Result

## Run Identity

- Variant: BASELINE | JEV_ASSISTED
- Branch:
- Start commit:
- End commit / working-tree commit state:
- Codex model:
- Codex reasoning/configuration:
- Result artifact generated at:

## Protocol Compliance

- Started from required branch: YES | NO
- Clean working tree at start: YES | NO
- Fresh Codex session: YES | NO | UNKNOWN
- Other branch inspected: NO | YES
- Jev used: NO | YES
- Deviations from experiment protocol: NONE | <details>

## Codex Token Usage

- Telemetry source:
- Input tokens:
- Output tokens:
- Cached input tokens:
- Reasoning tokens or equivalent:
- Total tokens:
- Raw usage identifier / raw telemetry:

Use `not_exposed_to_agent` for fields that cannot be observed. Do not estimate.

## Discovery and Routing Evidence

Record only observable workflow evidence, not hidden reasoning.

- Specialists invoked:
- Important commands executed:
- Main repository areas inspected:
- Route followed:

### Jev Evidence

For BASELINE write `NOT USED`.

For JEV_ASSISTED record:

- triage command;
- Jev artifact path;
- route;
- disposition;
- primary gap;
- selected primitives and runtime coverage;
- non-executable primitive risks;
- routing reasons;
- request question count / serialized size if available.

## Implementation Result

- Summary of implemented behavior:
- Files changed:
- Shared primitives changed: YES | NO
- New shared capability introduced: YES | NO
- Unrelated changes: NONE | <details>

## Correctness Evidence

For every validation command include the command and outcome.

- Typecheck:
- Relevant automated tests:
- Catalog/behavior synchronization checks:
- Target-card-specific tests:
- Other validation:

## Git Evidence

- `git status --short`:
- `git diff --stat`:
- Final changed-file list:

## Problems or Deviations

Document failures, retries, unavailable telemetry, environment problems, or protocol deviations. Write `NONE` when there are none.

## Final Run Status

- Correctness gate: PASS | FAIL
- Implementation complete: YES | NO
- Result artifact complete: YES | NO
```

---

## 11. Run Procedure

Execute the following procedure independently on each branch.

1. Confirm the branch name.
2. Record the start commit.
3. Confirm the expected clean starting state.
4. Remove stale experiment artifacts that would contaminate the run.
5. Start a fresh Codex session with the common `/goal` prompt.
6. Follow the branch-specific workflow from this document.
7. Implement Stellacorn Herder.
8. Run the repository-required validation and relevant tests.
9. Capture token telemetry exactly if exposed.
10. Generate the branch-specific result artifact using the mandatory schema.
11. Preserve the implementation and artifact for comparison; do not merge the branches into each other before analysis.

---

## 12. Analysis Procedure

After both runs, collect the two result artifacts and the final diffs.

Analysis order:

1. **Protocol validity** — identify any contamination or unequal experimental conditions.
2. **Correctness gate** — confirm whether each branch is valid for token comparison.
3. **Token comparison** — only when both runs pass correctness, compare Codex token consumption using the same telemetry definition.
4. **Diff comparison** — inspect whether the resulting implementation approaches are materially equivalent or whether one introduced unnecessary scope.
5. **Workflow explanation** — use the observable discovery/routing evidence to explain where token differences likely came from.

Do not declare Jev successful merely because it used fewer tokens if its implementation is incorrect or the comparison was contaminated.

---

## 13. Decision Rule

The experiment supports the Jev approach for this card when:

```text
baseline correctness = PASS
Jev-assisted correctness = PASS
Jev-assisted Codex tokens < baseline Codex tokens
```

The measured reduction should be reported as an exact percentage when token telemetry is available.

If both implementations pass but Jev does not reduce Codex tokens, record the result as evidence against the current Jev-assisted workflow for this experiment. Do not change the experiment outcome retroactively by altering thresholds, questions, or prompts after the runs.

This document defines the frozen Stellacorn Herder experiment protocol.
