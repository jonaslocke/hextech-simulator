# Structured Bug Report Capture for Hextech Simulator

**Status:** Proposed product/technical design  
**Implementation strategy:** Isolated branch from `main`  
**Primary purpose:** Turn manual gameplay defects into deterministic, Codex-ready reproduction evidence with minimal tester effort and minimal prompt/context overhead.

## 1. Objective

Replace the current **Copy state** workflow with a structured **Report bug** workflow that captures enough deterministic evidence for a repository-connected coding agent to investigate a gameplay defect without requiring the tester to manually reconstruct the game state.

The intended workflow is:

```text
manual gameplay
    ↓
Report bug
    ↓
capture exact viewer-safe state
    ↓
describe actual vs expected behavior
    ↓
optionally identify involved cards
    ↓
produce structured bug-report artifact
    ↓
store/export into .agent-work/bug-reports/
    ↓
Codex investigates the reusable owner
```

The simulator is responsible for **capturing evidence**. It is not responsible for diagnosing the defect with an LLM.

## 2. Branching and isolation strategy

This feature must be implemented independently from the current Ornn work in PR #3.

Create a new branch from the current `main` branch:

```text
main
  │
  ├── feat/structured-bug-report
  │
  └── feat/ornn-fire-below-mountain   ← current PR #3
```

The structured bug-report branch must not be created from PR #3.

The purpose of this separation is to allow the feature to be:

- implemented independently;
- reviewed independently;
- manually validated independently;
- integrated into PR #3 only after acceptance.

### 2.1 Required prerequisite extraction

The existing Copy State diagnostic foundation currently exists on PR #3 rather than `main`.

The original introduction is contained in commit:

```text
5dc0fb357fcd9ec99ec9008191e9d31f649b88e1
```

That commit contains many unrelated changes and **must not be cherry-picked as a whole**.

Port only the minimum reusable diagnostic foundation required by this feature:

```text
src/features/game-board/components/copy-game-state-button.tsx
src/features/game-board/game-state-diagnostic.ts
tests/game-state-diagnostic.test.ts
```

and only the minimal `src/features/game-board/game-board.tsx` wiring necessary to render the diagnostic control.

Do not bring across unrelated PR #3 behavior such as:

- Ornn-specific implementation;
- card-corpus expansion;
- Chain/Focus corrections;
- Temporary/game-object changes;
- public-reveal behavior;
- unrelated decision UI changes;
- deck/catalog changes;
- harness changes;
- other gameplay fixes.

Treat the Copy State extraction as prerequisite infrastructure, not as authorization to move other PR #3 behavior into the branch.

### 2.2 Integration after validation

After this branch is independently reviewed and manually accepted, integrate it into PR #3 through a controlled integration step.

Preferred integration flow:

```text
main
  ↓
feat/structured-bug-report
  ↓
independent review + manual acceptance
  ↓
temporary integration branch from current PR #3 head
  ↓
apply validated bug-report implementation
  ↓
resolve/omit duplicated Copy State prerequisite
  ↓
review integration diff
  ↓
merge integration into PR #3
```

The implementation branch itself must not merge into PR #3 automatically.

## 3. Existing foundation

The current diagnostic design uses a `CopyGameStateButton` that receives the current `GameProjection`.

The diagnostic formatter serializes the viewer-safe projection together with state metadata such as:

- `stateVersion`;
- `viewerPlayerId`.

The new feature should extend this diagnostic path rather than create an independent game-state representation.

The report path must preserve the current hidden-information boundary: only viewer-safe projected information may be captured in browser-facing report data.

## 4. Product behavior

The existing **Copy state** control should evolve into **Report bug**.

Clicking **Report bug** must immediately capture the current diagnostic projection. That captured state is immutable for the report even if the live match changes while the tester describes the defect.

The reporting UI should allow:

1. **Actual behavior** — required.
2. **Expected behavior** — required.
3. **Related cards** — optional.
4. **Additional notes** — optional.

The board should remain visible while the report is being authored. Prefer a side panel, inspector, or lightweight overlay rather than a modal that obscures the board.

## 5. Report lifecycle

```text
tester clicks Report bug
        ↓
capture viewer-safe projection at stateVersion N
        ↓
open report-authoring mode
        ↓
tester describes actual and expected behavior
        ↓
tester optionally marks relevant visible card instances
        ↓
finalize report
        ↓
produce one versioned structured artifact
        ↓
save to .agent-work/bug-reports/ when supported
or export/copy the same payload
        ↓
return to normal gameplay
```

The report must always describe the state captured when reporting began, not the state at form submission time.

## 6. Related-card selection

The tester should be able to mark one or more visible cards as relevant to the defect.

This is particularly useful for interaction defects involving multiple cards.

Do not store only card names. Preserve enough projected identity for Codex to locate the exact consumers quickly.

Recommended information per related card:

```json
{
  "instanceId": "runtime-card-instance-id",
  "publicCode": "OGN-...",
  "name": "Card Name",
  "ownerPlayerId": "player-1",
  "location": {
    "kind": "battlefield",
    "battlefieldId": "..."
  }
}
```

Use the actual projection/location structures available in the repository rather than creating a parallel identity model.

Related-card selection is diagnostic UI state only.

Selecting a card for a report must:

- not create a gameplay intent;
- not mutate game state;
- not resolve or alter pending choices;
- not interfere with normal card targeting or selection after report mode closes.

## 7. Recent-state context

A snapshot explains what the game looks like now, but many engine defects depend on how the game reached that state.

Examples include:

- Chain origin;
- Focus and Priority transitions;
- triggered ability ordering;
- Temporary;
- Cleanup;
- movement triggers;
- game-object incarnation;
- attachments;
- replacement effects.

Maintain a small bounded in-memory history of recent viewer-safe projections.

Recommended initial bound:

```text
3–5 state versions
```

Use a fixed-size ring buffer rather than unbounded history.

When a report is captured, include the bounded preceding context together with the explicit primary reported state.

Example:

```text
state 391 — attack initiated
state 392 — defender established
state 393 — damage resolved
state 394 — source moved to Base
state 395 — reported incorrect state
```

Do not implement unrestricted full-match replay merely for bug reporting.

## 8. Structured report artifact

The output of a completed report is a structured artifact inside the project workspace.

Preferred location:

```text
.agent-work/
└── bug-reports/
    └── <timestamp>-<game-id>-v<state-version>.json
```

This artifact is:

- inside the local project workspace;
- readable directly by Codex;
- temporary reproduction/debugging evidence;
- gitignored;
- not durable project documentation;
- not intended to be committed.

The intended Codex handoff should be as small as:

```text
Debug the issue reported at:

.agent-work/bug-reports/2026-09-13-game-123-v395.json
```

## 9. Structured report contract

Use a deterministic, versioned data contract from the first implementation.

Recommended conceptual shape:

```json
{
  "schemaVersion": 1,
  "reportId": "generated-id",
  "capturedAt": "2026-09-13T11:30:00.000Z",
  "match": {
    "matchId": "match-id",
    "gameId": "game-id",
    "gameNumber": 1,
    "stateVersion": 395,
    "viewerPlayerId": "player-1"
  },
  "issue": {
    "actual": "What happened in the game.",
    "expected": "What the tester expected to happen.",
    "notes": "Optional additional context."
  },
  "relatedCards": [],
  "recentStates": [],
  "game": {}
}
```

The implementation agent must derive the exact schema from current repository types and established schema conventions.

### 9.1 Contract requirements

- `schemaVersion` is required from the first implementation.
- `game` must remain viewer-safe.
- `recentStates` must contain only viewer-safe projections.
- `relatedCards` must reference cards available in captured diagnostic data.
- The report must not contain authentication tokens, secrets, database connection information, or canonical hidden game state.
- The format must be deterministic enough for Codex to consume without prose preprocessing.

## 10. Storage and export

The preferred development workflow is for the finalized report artifact to exist under:

```text
.agent-work/bug-reports/
```

A browser cannot directly write arbitrary files into the repository, so the implementation must validate the current runtime architecture before choosing the write mechanism.

Preferred behavior:

### Local/server-supported environment

Submit the validated report through an appropriate existing server route/action and write the JSON artifact under:

```text
.agent-work/bug-reports/
```

### Environment without repository filesystem access

Produce the exact same canonical report payload through **Copy report** or **Export report**.

The tester can then place the artifact into:

```text
.agent-work/bug-reports/
```

before handing it to Codex.

### Storage constraints

Do not introduce for this iteration:

- a database;
- a remote bug-report service;
- external object storage;
- a separate cloud persistence mechanism;

unless repository evidence proves an already-existing mechanism is clearly simpler and appropriate.

The canonical report payload must remain the same regardless of delivery mechanism.

## 11. Codex debugging handoff

After a report exists, Codex should be able to receive only its location.

Example:

```text
Debug:
.agent-work/bug-reports/2026-09-13-game-123-v395.json
```

From there Codex should:

1. inspect the structured report;
2. identify the reported card consumers and relevant state transition;
3. retrieve only the relevant local card/rules data;
4. locate the reusable engine owner;
5. inventory accepted consumers;
6. reproduce the defect at the reusable seam;
7. follow the project's PASS_TO_PASS / FAIL_TO_PASS discipline;
8. implement the smallest generic correction.

The report must not instruct Codex to fix a named card directly.

Cards identify affected consumers. The reusable primitive, behavior family, subsystem, or validation pipeline remains the implementation/test owner.

## 12. No embedded AI debugger

Do not add an LLM/model call to the simulator.

The simulator should produce high-quality deterministic evidence.

Codex owns:

- diagnosis;
- repository exploration;
- rules retrieval;
- reusable-owner discovery;
- test creation;
- code correction.

Avoid:

- model API credentials;
- prompt construction in the game client;
- AI-generated diagnoses;
- AI output persistence;
- model-specific bug-report formats;
- an additional model invocation cost.

## 13. UI requirements

The report UI should:

- replace or supersede the existing **Copy state** action;
- preserve a simple **Copy/export report** fallback;
- clearly show the captured state version;
- provide required Actual and Expected fields;
- allow optional related-card selection;
- keep enough board visibility to identify relevant cards;
- visibly mark diagnostic-selected cards;
- allow canceling without mutating the match;
- return cleanly to gameplay after finalization/cancel.

Do not reuse gameplay card-selection intents when doing so could mutate the game or interfere with a pending decision.

Diagnostic selection should remain UI-local.

## 14. Server-authoritative and privacy boundaries

The feature must preserve the project's server-authoritative model.

Do not request or expose additional canonical hidden state merely because a defect is being reported.

The report captures:

- what the current viewer can legitimately observe;
- existing viewer-safe diagnostic information.

If future debugging requires canonical server state, design that separately with explicit authorization and security rules.

## 15. Automated testing boundary

Automated tests should protect reusable diagnostic/report contracts, not individual card interactions.

Appropriate test ownership includes:

- report schema and serialization;
- viewer-safe projection preservation;
- immutable primary capture;
- bounded recent-state history;
- diagnostic related-card selection;
- report persistence/export behavior;
- filename/path sanitization if filesystem output is implemented.

Do not create automated suites named after the card interaction used during manual discovery.

Manual gameplay remains responsible for confirming complete card interactions.

## 16. Scope

### In scope

- isolated branch from `main`;
- selective extraction of the minimal Copy State prerequisite;
- evolve **Copy state** into **Report bug**;
- immutable capture of current viewer-safe state;
- Actual/Expected report fields;
- optional related-card marking;
- bounded recent-state context;
- versioned report schema;
- `.agent-work/bug-reports/` artifact generation when safely supported;
- copy/export fallback;
- generic automated coverage.

### Out of scope

- importing unrelated PR #3 changes;
- Ornn-specific behavior;
- gameplay defect fixes;
- AI/LLM diagnosis inside the simulator;
- automatic GitHub issue creation;
- automatic Codex invocation;
- remote bug-report database;
- unrestricted full-match replay;
- canonical hidden-state capture;
- card-specific automated regression suites;
- unrelated refactors or harness changes.

## 17. Implementation sequence

### Phase 1 — branch and prerequisite extraction

1. Start from current `main`.
2. Create `feat/structured-bug-report`.
3. Selectively port only the minimal Copy State foundation from PR #3.
4. Verify that the extracted diagnostic foundation compiles and behaves correctly against `main`.

### Phase 2 — repository discovery

Inspect:

- applicable root/scoped `AGENTS.md`;
- relevant repository skills available on `main`;
- current Copy-state extraction;
- diagnostic formatter;
- `GameProjection`;
- board interaction architecture;
- server routes/actions;
- runtime/filesystem constraints;
- shared UI components;
- existing diagnostic tests.

Do not create a new subsystem before locating reusable owners.

### Phase 3 — report contract and capture

Implement:

- versioned report schema;
- immutable primary state capture;
- bounded projection history;
- report serializer;
- generic tests.

### Phase 4 — reporting UI

Implement:

- **Report bug** control;
- report-authoring UI;
- Actual/Expected fields;
- optional notes;
- UI-local related-card selection;
- cancel/finalize behavior.

### Phase 5 — persistence/export

After validating runtime constraints:

- persist under `.agent-work/bug-reports/` through an appropriate server boundary when supported;
- otherwise expose the same payload through copy/export fallback.

### Phase 6 — validation

Run focused tests during implementation.

Because this branch originates from `main`, validate its final diff against its actual `main` base.

If the branch has the durable `verify:pr` command available, use it with the branch's main-base SHA. Otherwise run the equivalent project checks available on `main` and report exactly what was executed.

Do not copy unrelated harness files from PR #3 merely to obtain `verify:pr`.

## 18. Manual acceptance

Before integration into PR #3, manually demonstrate:

1. start a real gameplay state;
2. click **Report bug**;
3. confirm the captured state/version remains fixed while the live game could otherwise change;
4. enter Actual and Expected behavior;
5. mark at least two related cards;
6. finalize the report;
7. confirm the artifact contains:
   - versioned schema;
   - captured state version;
   - related card identities;
   - issue text;
   - recent viewer-safe context;
   - primary viewer-safe game state;
8. confirm reporting did not mutate gameplay;
9. confirm the artifact can be placed/read under `.agent-work/bug-reports/`;
10. confirm a fresh Codex debugging context can understand the issue from the artifact path without requiring a pasted full-state transcript.

## 19. Success condition

The feature is successful when a tester can discover a gameplay defect and produce a self-contained, structured, viewer-safe bug-report artifact in a few interactions, then hand Codex only the artifact location.

The workflow should reduce:

- tester effort;
- ambiguity about exact state/version;
- ambiguity about involved card instances;
- Codex repository-discovery overhead;
- pasted prompt size;
- repeated reproduction questions.

It must do so without weakening hidden-information boundaries, server authority, reusable test ownership, branch isolation, or regression discipline.
