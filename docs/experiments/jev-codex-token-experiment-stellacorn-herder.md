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

Use the project's current Jev command with the experiment runtime environment defined in Section 5. For this experiment, the effective value of `HEXTECH_JEV_CARD_TRIAGE_MODE` must be `on`. The treatment must not manually override the route or alter routing thresholds for the experiment.

If Jev returns `TARGETED_IMPLEMENTATION`, Codex should use the Jev artifact as the implementation discovery input and avoid running broader semantic discovery that the route is intended to bypass.

If Jev returns `MOE_DISCOVERY`, Codex should follow that route normally. The result must be recorded as observed rather than changing the experiment to force a targeted implementation.

The Jev-assisted branch must not inspect the baseline branch's implementation or result artifact.

---

## 5. Local `.env` Preparation

Environment preparation is part of the frozen experiment protocol. Codex must not improvise different environment values between branches. **Both runs must end environment setup with the same effective `.env` configuration.** The experiment variable is whether Jev is invoked, not whether Jev-related environment variables exist.

The committed `.env.example` remains the project template and must not be changed solely for this experiment. In particular, `.env.example` may continue to use `HEXTECH_JEV_CARD_TRIAGE_MODE=shadow`. The actual local `.env` used by the experiment must use `HEXTECH_JEV_CARD_TRIAGE_MODE=on`.

### 5.1 Required effective local values

Before implementation discovery begins on either branch, the local runtime environment must resolve to:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=hextech_simulator
SOCKET_CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

HEXTECH_ENABLE_LOCAL_BUG_REPORT_ARTIFACTS=false

TYPESAFE_API_KEY=<existing real local key>
HEXTECH_JEV_CARD_TRIAGE_MODE=on

PLAYER_TOKEN_SECRET=change-me-for-local-development
```

`TYPESAFE_API_KEY` is a secret. Codex must never invent, echo, log, commit, or copy its value into the result artifact. The requirement is only that the effective runtime environment exposes a non-empty real key when the Jev-assisted run needs it.

### 5.2 Codex setup procedure — run on BOTH branches

At the start of each experiment run, before card implementation/discovery, Codex must perform the following steps in this order:

1. Confirm the current branch and start commit.
2. Confirm `.env.example` exists.
3. Confirm `.env` is excluded from Git tracking/commit scope. Use a non-destructive check such as:

   ```bash
   git check-ignore -q .env
   ```

   If `.env` is not ignored, do not commit it and record the condition as an environment/protocol issue in the result artifact.
4. If `.env` does not exist, create it from the committed template:

   ```bash
   cp .env.example .env
   ```

5. Normalize the non-secret experiment values in `.env` to the exact values listed in Section 5.1. In particular, set:

   ```env
   HEXTECH_JEV_CARD_TRIAGE_MODE=on
   ```

   Do this on **both** the BASELINE and JEV_ASSISTED branches.
6. Preserve an already configured non-empty `TYPESAFE_API_KEY` in `.env`. Do not replace it with a placeholder and do not print it. If `.env` has no key but the launching environment already provides `TYPESAFE_API_KEY`, Codex may rely on that inherited secret instead of writing it into `.env`.
7. Verify that a TypeSafe key is available without printing the secret. A valid check is:

   ```bash
   node --env-file=.env -e "if (!process.env.TYPESAFE_API_KEY) process.exit(1)"
   ```

   If the key is unavailable, record the environment failure. The BASELINE implementation may continue because it must not invoke Jev; the JEV_ASSISTED run cannot execute its assigned treatment until a real key is available. Codex must not fabricate one.
8. Verify the effective Jev mode without exposing secrets:

   ```bash
   node --env-file=.env -e "if (process.env.HEXTECH_JEV_CARD_TRIAGE_MODE !== 'on') process.exit(1); console.log(process.env.HEXTECH_JEV_CARD_TRIAGE_MODE)"
   ```

9. Confirm `.env` itself is not part of the starting Git diff:

   ```bash
   git status --short
   ```

10. After these checks, treat `.env` as frozen for the rest of the run. Codex must not change `.env`, `.env.example`, the Jev mode, the TypeSafe key location, or other experiment environment values while implementing Stellacorn Herder.

### 5.3 Branch-specific environment behavior

#### BASELINE — `experiment/stellacorn-herder-codex`

The local `.env` still uses `HEXTECH_JEV_CARD_TRIAGE_MODE=on`, but **Codex must never invoke the Jev triage command or inspect any Stellacorn Jev artifact**. The presence of the Jev key and mode is intentionally inert on this branch and keeps the runtime environment identical to the treatment branch.

Codex must remove any stale Stellacorn Jev triage artifact before baseline discovery begins. It must not generate a replacement.

#### JEV_ASSISTED — `experiment/stellacorn-herder-jev`

The local `.env` uses the same values, including `HEXTECH_JEV_CARD_TRIAGE_MODE=on`. After environment verification, Codex must run the current per-card Jev triage command for Stellacorn Herder **without passing a CLI mode override**. The command must therefore consume the frozen `on` value from the environment and return the real routing decision rather than shadow routing.

Codex must record the exact triage command and generated Jev artifact path in the result artifact, but must never record the TypeSafe API key.

### 5.4 Environment evidence in the result artifact

Both branch result artifacts must record:

- `.env` present at run start after setup: YES | NO
- `.env` ignored by Git: YES | NO
- effective `HEXTECH_JEV_CARD_TRIAGE_MODE`: expected `on`
- `TYPESAFE_API_KEY` available: YES | NO — **presence only, never the value**
- `.env` modified after setup: NO | YES
- `.env.example` modified for experiment: NO | YES

Any deviation must also appear under `Problems or Deviations`.

---

## 6. Experimental Controls

The two runs must use the same conditions except for whether Jev triage is invoked and its result is supplied to Codex.

Required controls:

- same starting Git commit;
- clean working tree before each run, excluding the ignored local `.env`;
- separate branches as defined above;
- fresh Codex session for each branch;
- same Codex model;
- same Codex reasoning level/configuration;
- exact same `/goal` prompt;
- same repository instructions and skills;
- same dependency state;
- same effective `.env` and environment variables on both branches, including `TYPESAFE_API_KEY` availability and `HEXTECH_JEV_CARD_TRIAGE_MODE=on`;
- same database/catalog starting state when database-backed operations are used;
- same tests and correctness expectations;
- no manual implementation hints supplied to only one branch;
- no copying changes, diffs, conclusions, artifacts, or implementation knowledge from one experiment branch to the other.

Before each run, remove stale experiment artifacts that could disclose the other run's result. The baseline run must also begin without a Stellacorn Jev triage artifact available for inspection.

Do not merge one experiment branch into the other.

---

## 7. What Codex May Optimize

Codex should implement the card correctly using the workflow assigned to its branch.

Codex must not intentionally minimize work by skipping repository-required validation, tests, synchronization, or correctness checks merely to reduce tokens.

The implementation should remain scoped and reuse-first according to the repository's existing architecture and instructions.

The experiment is measuring the natural token consequence of the two discovery paths, not an artificially shortened implementation procedure.

---

## 8. Correctness Gate

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

## 9. Primary Measurement

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

## 10. Diagnostic Measurements

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

## 11. Mandatory Result Artifact

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
- `.env` present after setup: YES | NO
- `.env` ignored by Git: YES | NO
- Effective `HEXTECH_JEV_CARD_TRIAGE_MODE`: expected `on`
- `TYPESAFE_API_KEY` available: YES | NO (presence only; never record the secret)
- `.env` modified after setup: NO | YES
- `.env.example` modified for experiment: NO | YES
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

## 12. Run Procedure

Execute the following procedure independently on each branch.

1. Confirm the branch name.
2. Record the start commit.
3. Prepare and verify the local `.env` exactly as defined in Section 5, including effective `HEXTECH_JEV_CARD_TRIAGE_MODE=on` on both branches.
4. Freeze `.env` for the remainder of the run.
5. Confirm the expected clean starting Git state, excluding the ignored local `.env`.
6. Remove stale experiment artifacts that would contaminate the run; on BASELINE this includes any Stellacorn Jev artifact.
7. Start a fresh Codex session with the common `/goal` prompt.
8. Follow the branch-specific workflow from this document.
9. Implement Stellacorn Herder.
10. Run the repository-required validation and relevant tests.
11. Confirm `.env` and `.env.example` were not modified after setup.
12. Capture token telemetry exactly if exposed.
13. Generate the branch-specific result artifact using the mandatory schema, including environment evidence.
14. Preserve the implementation and artifact for comparison; do not merge the branches into each other before analysis.

---

## 13. Analysis Procedure

After both runs, collect the two result artifacts and the final diffs.

Analysis order:

1. **Protocol validity** — identify any contamination or unequal experimental conditions.
2. **Correctness gate** — confirm whether each branch is valid for token comparison.
3. **Token comparison** — only when both runs pass correctness, compare Codex token consumption using the same telemetry definition.
4. **Diff comparison** — inspect whether the resulting implementation approaches are materially equivalent or whether one introduced unnecessary scope.
5. **Workflow explanation** — use the observable discovery/routing evidence to explain where token differences likely came from.

Do not declare Jev successful merely because it used fewer tokens if its implementation is incorrect or the comparison was contaminated.

---

## 14. Decision Rule

The experiment supports the Jev approach for this card when:

```text
baseline correctness = PASS
Jev-assisted correctness = PASS
Jev-assisted Codex tokens < baseline Codex tokens
```

The measured reduction should be reported as an exact percentage when token telemetry is available.

If both implementations pass but Jev does not reduce Codex tokens, record the result as evidence against the current Jev-assisted workflow for this experiment. Do not change the experiment outcome retroactively by altering thresholds, questions, or prompts after the runs.

This document defines the frozen Stellacorn Herder experiment protocol.
