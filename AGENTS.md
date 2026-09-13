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

## Workflow routing

- Changes under `src/server/game/**`: read `src/server/game/AGENTS.md`; use
  `skills/engine-change-impact-SKILL.md` for shared engine/corpus work.
- Tests under `tests/**`: read `tests/AGENTS.md`; use
  `skills/behavior-change-tdd-SKILL.md` for reusable behavior fixes/extensions.
- Independent review: use `skills/technical-pr-review-SKILL.md`.
- Player decisions, UI, action buttons, rules lookup, and architecture migrations:
  use the existing matching repository skill.

Skills define procedures; durable docs define what is true.

## Completion

Review the final diff for scope, durable ownership, accidental generated output,
secrets, and temporary artifacts. Report only validation actually run and any
remaining risk. A green suite is evidence, not proof that scope, architecture,
or semantics are correct.
