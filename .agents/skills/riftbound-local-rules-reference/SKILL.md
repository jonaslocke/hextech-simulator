# Riftbound Local Rules Reference Skill

## Purpose

Use this skill whenever validating, implementing, debugging, or discussing Riftbound game rules in this repository.

The local rules reference is the only authority for core rules validation:

```text
docs/riftbound_core_rules_reference.md
```

Do not search online for Riftbound rules. Do not use external websites, fan wikis, memory, card databases, Discord comments, or unofficial rulings as rules authority.

## When to Use

Use this skill for any task involving:

* Gameplay rule validation.
* Engine behavior.
* Legal action validation.
* Turn structure.
* Showdowns.
* Combat damage.
* Scoring.
* Unit movement.
* Card play timing.
* Keywords.
* Zone behavior.
* Damage, killing, healing, recalling, banishing, recycling, or cleanup.
* Bug reports where the expected behavior depends on Riftbound rules.
* Tests that assert rules behavior.
* Refactors that may affect rules behavior.

## Mandatory Rule Source

Always inspect and validate against:

```text
docs/riftbound_core_rules_reference.md
```

Use local search tools such as `rg`, editor search, or direct file reading to find the relevant numbered rules.

Prefer citing exact rule numbers in notes, bug explanations, code comments, test names, or implementation summaries when the behavior depends on a rule.

Example:

```text
Validated against rules 139.3.b.1 and 139.3.b.2: damage is removed at the end of each player's turn and at the end of combat after resolving the winner.
```

## Forbidden Behavior

Never validate rules by searching online.

Never rely on:

* Official websites.
* Fan-maintained rule summaries.
* Card databases as rule references.
* Reddit, Discord, or forum discussions.
* Prior model memory.
* Assumptions from other TCGs.
* Magic: The Gathering, Legends of Runeterra, or other card game rules.

If the local rules reference does not answer the question, say that the local rules reference does not currently define the behavior clearly. Do not fill the gap with online research.

## Authority Order

For core gameplay rules, use this order:

1. `docs/riftbound_core_rules_reference.md`
2. Explicit card text from local set data, only when resolving how a specific card modifies the rules.
3. Existing engine behavior, only as implementation context, not as rules authority.

Card text may supersede base rules through the Golden Rule, but the interpretation of card text must still be validated against the local rules reference.

## Workflow

When handling a rules-related task:

1. Identify the exact gameplay question.
2. Search `docs/riftbound_core_rules_reference.md` for the relevant rule terms.
3. Read the surrounding numbered rules, not only the first matching line.
4. Determine the rule-backed expected behavior.
5. Compare the current implementation or requested change against that behavior.
6. Explain the result using rule numbers when possible.
7. If implementing code, keep the rule logic server-side and avoid moving legality or rule validation into React.
8. If adding tests, add focused deterministic tests for the specific rule behavior instead of broad UI integration tests.

## Handling Missing or Ambiguous Rules

If the local rules reference is incomplete or ambiguous:

* State that the local reference does not clearly define the behavior.
* Do not search online.
* Do not invent a ruling.
* Prefer a small implementation note or TODO that marks the rules gap.
* Ask for a project decision only when implementation cannot safely proceed without one.

Suggested wording:

```text
I could not find a clear rule for this behavior in docs/riftbound_core_rules_reference.md. I will not use online sources for this ruling. This needs a local rules-reference update or an explicit project decision before implementation.
```

## Implementation Guidance

When changing the simulator:

* Keep rules, legality, payment, target validation, and effect resolution in server-side game modules.
* Do not encode rules as UI-only behavior.
* Do not trust client-submitted targets without server validation.
* Do not add card-name-specific branches when reusable rule or behavior primitives can represent the effect.
* Preserve viewer-safe projections and hidden information boundaries.
* Use card text only to determine how a card modifies or invokes rules, not as a replacement for the core rules reference.

## Definition of Done

A rules-related Codex task is only complete when:

* The relevant local rule sections were checked.
* The expected behavior is stated from the local reference.
* Any implementation change follows the local rule interpretation.
* Any uncertainty is explicitly called out as a local rules gap.
* No online rule source was used.
