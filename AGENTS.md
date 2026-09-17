# Agent Instructions

## Precedence

The task defines the requested outcome; repository instructions define how to
perform it. Before changing a file, read this file and any more-specific
`AGENTS.md` that applies to the target path. More-specific instructions win.

If a task conflicts with a durable authority or requires an unresolved product,
rules, security, persistence, or accepted-semantic decision, surface the
conflict before making the behavior-changing or irreversible choice.

## Start with repository evidence

Before implementation:

1. inspect Git state and applicable instructions;
2. locate the authority for the affected concern;
3. search for the existing owner, consumers, and tests before creating anything;
4. inspect actual scripts/tooling rather than assuming commands.

Keep the change to the smallest coherent scope and preserve unrelated working
behavior and working-tree changes.

## Authority routing

| Concern | Authority |
| --- | --- |
| Architecture and code boundaries | `docs/architecture.md` |
| Product and engine contracts | `docs/game_definition.md` |
| Project map | `docs/project-overview.md` |
| Riftbound rules | `docs/riftbound_core_rules_reference.md` |
| Deck construction | `docs/deck_validation.md` |
| Card behavior/publication | `docs/card_behavior.md` |
| Showdown decisions | `docs/showdown-rules-decision-ledger.md` |
| Full-corpus ingestion | `docs/full-card-ingestion/plan.md`, `tracking.md` |
| Testing | `docs/testing.md` |
| Active verified issues | `docs/BETA-ISSUES.md` |

`docs/coding-agent-benchmark.md` is for harness design/evaluation only. Do not
load it for ordinary product, gameplay, UI, or backend implementation.

For gameplay rules, use the local rules-reference skill. Local rules and local
card/set data are authoritative; online rulings are not project rules authority.

## Universal constraints

- Preserve established `src/app`, `src/features`, `src/server`, and `src/shared`
  ownership; keep routes/actions thin and server game rules authoritative.
- Treat external/persisted input as untrusted and use established schemas.
- Do not hand-edit generated catalog outputs. Do not run mutating catalog/reset
  scripts without explicit authorization.
- Follow nearby naming/import conventions and durable architecture guidance;
  avoid unrelated cleanup or refactors.
- Only durable project artifacts belong in Git.

## Context discipline

Use progressive retrieval by default:

```text
search -> locate -> inspect the smallest useful range -> reason -> expand if needed
```

Do not routinely load complete large JSON/set data, rules references, generated
files, logs, or command output when filtered evidence is sufficient. Expand
context whenever lifecycle, semantics, consumers, or architecture cannot be
understood safely from the smaller range.

Use focused checks while investigating. Use `npm run verify:pr` for final PR
readiness when full validation is warranted. Keep verbose temporary evidence,
logs, plans, and investigation notes under `.agent-work/`.

For dependent task handoffs, preserve only: Changed, Validated, Important
semantic decisions, Remaining work, Relevant files, and Relevant authorities.

## Adaptive specialist routing

Moe, Curly, and Larry are optional specialist skills used inside the primary
implementation context. They are not a mandatory pipeline and should not all be
loaded by default.

- **Moe (`moe`)** — use for new or changed gameplay/card semantics when deciding
  whether existing reusable behaviors can be reused, composed, extended, or a
  genuinely new capability is required.
- **Curly (`curly`)** — use first for reported/manual defects or cross-layer
  disagreements. Locate the first incorrect boundary and classify whether the
  correction is code, authored data, publication/snapshot freshness, a product
  decision, or no change.
- **Larry (`larry`)** — use only after the semantic owner/defect is understood and
  a shared change has meaningful combinatorial state/sequence risk. Load only the
  relevant Larry reference file; do not preload his whole verification catalog.

Route from evidence, not task labels: Curly may route a semantic/model defect to
Moe; Moe or Curly may route a high-risk shared change to Larry. Routine
parameter-only reuse or a localized low-risk correction should skip specialists
that add no information.

For substantial specialist work, keep at most one compact ephemeral task record
under `.agent-work/<task>/` rather than separate specialist reports. Preserve only
requested outcome, verified BASE/HEAD, reusable owner, protected behavior,
first-incorrect-boundary/disposition when applicable, specialist conclusions,
scope exclusions, and unresolved decisions.

## Workflow routing

- Changes under `src/server/game/**`: read `src/server/game/AGENTS.md`; use
  `engine-change-impact` for shared engine/corpus work.
- Tests under `tests/**`: read `tests/AGENTS.md`; use
  `behavior-change-tdd` for reusable behavior fixes/extensions.
- Independent review: use `technical-pr-review`.
- Player decisions: `player-decision-system`; gameplay action buttons:
  `game-action-buttons`; standard UI: `shadcn-first-ui-development`; rules lookup:
  `riftbound-local-rules-reference`; architecture migrations:
  `refactor-to-feature-architecture`.

Skills define procedures; durable docs define what is true.

## Independent review

For shared engine/reusable-behavior changes, cross-boundary gameplay fixes, or
other changes where a regression would be expensive, prefer a fresh reviewer
context after implementation when the execution environment supports it. The
reviewer uses `technical-pr-review` and starts from the requested outcome,
compact task record, BASE/HEAD, actual diff, relevant authorities, and validation
evidence; do not preload the implementation investigation transcript.

The implementation agent's self-review is useful diff hygiene but is not an
independent review. If a fresh reviewer context is unavailable, state that
independent review was not performed rather than treating self-review as one.

## Completion

Review the final diff for scope, durable ownership, accidental generated output,
secrets, and temporary artifacts. Report only validation actually run and any
remaining risk. A green suite is evidence, not proof that scope, architecture,
or semantics are correct.

### Commit and push

Unless the user explicitly requests local-only work or no push, push completed
commits to the task branch's remote before reporting completion or handing work
to a reviewer. Creating a commit is not a complete handoff until it is available
on the remote. This instruction authorizes the push without another confirmation.

- Run the required validation and review the committed scope before pushing.
- Use the branch's configured upstream. For a new task branch, establish an
  upstream on the repository's intended remote; do not push unrelated branches.
- Use a normal push. Do not force-push or rewrite shared history without explicit
  authorization.
- Verify the remote branch contains the completed local HEAD after pushing.
- If a push fails, investigate and retry when safe. If blocked by credentials,
  permissions, remote divergence, or an unclear destination, report the blocker
  and identify the unpushed commits; do not claim the reviewer can access them.
- Include the pushed branch and commit in the final handoff.
