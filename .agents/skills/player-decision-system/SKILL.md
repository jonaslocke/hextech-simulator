---
name: player-decision-system
description: Implement or refactor server-authorized gameplay choice prompts in the Hextech game board through the Player Decision System.
---

# Player Decision System

Use this skill when implementing or changing a player prompt, selection,
ordering step, combat-damage assignment, or waiting state in the game board.

## Core contract

For covered player decisions:

```text
server projection and legal actions
  -> usePlayerDecisionRequest
    -> PlayerDecisionRequest
      -> PlayerDecisionHost
        -> prompt
          -> PlayerDecisionIntent
            -> existing server action submission
```

The server projection and projected legal actions are authoritative. Do not open
a game decision imperatively from arbitrary UI or create a choice that lacks a
server-authorized action.

Do not add a new covered player-choice branch directly to `GameBoard`. Map it to
`PlayerDecisionRequest` and render it through `PlayerDecisionHost`.

## Decision mapping

| Kind | Renderer | Intent result |
| --- | --- | --- |
| `cardSelection` | `CardSelectionPrompt` | `selectedIds` |
| `optionDecision` | `OptionDecisionPrompt` | selected option IDs |
| `orderedDecision` | `OrderedDecisionPrompt` | ordered IDs |
| `combatDamage` | `CombatDamagePrompt` | damage allocations |
| `pendingDecision` | `PendingDecisionStatus` | no player intent |

Combat damage remains specialized. Preserve its allocation behavior, lethal and
Tank ordering, auto-assignment, reset behavior, and board-card rendering.

Vision is card selection: an empty `selectedIds` array means “Keep on top.” Do
not introduce a synthetic keep-on-top option.

General card choices use `CardSelectionPrompt`; do not create one-off raw card
grids. Prompt components collect local UI input and do not inspect the complete
game projection or submit directly to the server.

Board-target staging and other explicitly separate movable-board interactions
may retain their existing path unless the task deliberately expands the Player
Decision System to cover them.

## Extension and validation

If a decision does not fit an existing kind, add a deliberate request type, host
branch, semantic prompt when needed, intent mapping, and focused regression
coverage. Preserve the server payload unless a server-contract change is in
scope.

Avoid coupling this work to unrelated engine, CardTile, animation, layout, or
shared-card-face refactors.
