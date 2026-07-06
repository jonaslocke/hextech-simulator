Player Decision System

## Purpose

Use this skill whenever implementing or refactoring a player prompt, choice, selection, ordering step, or decision in the Riftbound simulator.

The project uses a **Player Decision System**. All gameplay decisions presented to a player must pass through this system.

A player decision is any UI flow where the player must choose, order, select, assign, keep, recycle, confirm, or otherwise produce an intent that is sent to the server.

## Core rule

Do not add new player-choice prompt branches directly inside `GameBoard` or another board render loop.

Every player decision must be represented as a `PlayerDecisionRequest` and rendered by `PlayerDecisionHost`.

The result must be submitted as a `PlayerDecisionIntent`.

## Vocabulary

Use these names consistently:

```text
Decision
  The gameplay decision the active player must make.

Prompt
  The UI surface that asks for the decision.

Intent
  The payload produced by the prompt and sent to the server.

Host
  The mounted component responsible for rendering the active prompt.
```

Use these system names:

```text
Player Decision System
PlayerDecisionHost
PlayerDecisionRequest
PlayerDecisionIntent
```

Use these prompt names:

```text
CardSelectionPrompt
OptionDecisionPrompt
OrderedDecisionPrompt
CombatDamagePrompt
PendingDecisionStatus
```

Do not use vague or obsolete names for new code:

```text
SetupChoiceDialog
UnifiedChoiceDialog
ChoiceManager
IntentDialog
GamePrompt
```

`SetupChoiceDialog` may exist only as a temporary compatibility export while old imports are migrated.

## Intent shape

The server action payload is already supported by the project. Preserve it.

```ts
export type PlayerDecisionIntent = {
  actionId: string;
  selectedIds?: string[];
  allocations?: Array<{ targetUnitId: string; amount: number }>;
};
```

Do not change the server contract unless the user explicitly asks for a server contract change.

## Request kinds

Before adding UI, map the gameplay situation into one of these request kinds:

```text
cardSelection
  The player chooses zero, one, or more cards from a visible/legal set.
  Examples: mulligan, Vision, discard from hand, choose from trash.

optionDecision
  The player chooses one non-card option.
  Examples: choose a mode, choose a keyword option, choose a non-card effect option.

orderedDecision
  The player orders options.
  Examples: order simultaneous triggers.

combatDamage
  The player assigns combat damage.
  This remains specialized and must not be reduced to a generic card-selection prompt.

pendingDecision
  The viewer is waiting for another player to make a decision.
```

If the existing request kinds cannot represent a new gameplay decision, extend `PlayerDecisionRequest` deliberately. Do not bypass the system.

## Component selection rules

Use this mapping:

```text
cardSelection     → CardSelectionPrompt
optionDecision    → OptionDecisionPrompt
orderedDecision   → OrderedDecisionPrompt
combatDamage      → CombatDamagePrompt
pendingDecision   → PendingDecisionStatus
```

Reuse existing prompt behavior when possible.

The current card/grid behavior from `setup-choice-dialog.tsx` is the basis for `CardSelectionPrompt`.

The current generic behavior from `choice-dialog.tsx` is the basis for option and ordered prompts.

The current `combat-damage-dialog.tsx` behavior is the basis for `CombatDamagePrompt`.

The current `pending-choice-status.tsx` behavior is the basis for `PendingDecisionStatus`.

## GameBoard rule

`GameBoard` should render one decision host:

```tsx
<PlayerDecisionHost
  decision={playerDecision}
  cardsByInstanceId={cardsByInstanceId}
  onIntent={(intent) =>
    submitProjectedAction(
      intent.actionId,
      intent.selectedIds ?? [],
      intent.allocations,
    )
  }
/>
```

Do not add new local branches like this for player decisions:

```tsx
{
  someChoice && <SomeNewDialog />;
}
```

Instead, update the mapper:

```ts
usePlayerDecisionRequest(...)
```

and return the correct `PlayerDecisionRequest`.

## Projection authority rule

The server projection/actions are the source of truth.

Do not imperatively open a gameplay decision from arbitrary UI code.

Do not create decisions that are not backed by a legal action or pending choice from the current projection.

The Player Decision System is a rendering/orchestration layer, not a game-rules authority.

## Vision rule

Vision is a card-selection decision.

Do not create a synthetic `keep-on-top` option.

Represent Vision as:

```text
kind: cardSelection
title: Vision
description: Choose cards to recycle. Unselected cards stay on top.
minSelected: 0
maxSelected: number of revealed cards
```

An empty `selectedIds` array means the revealed card or cards stay on top.

Confirm label:

```ts
(selectedIds) =>
  selectedIds.length === 0
    ? "Keep on top"
    : selectedIds.length === 1
      ? "Recycle selected card"
      : `Recycle ${selectedIds.length} cards`;
```

Submit:

```ts
{
  actionId,
  selectedIds,
}
```

This supports current Vision 1 and future multi-card Vision-style effects.

## Card-choice rendering rule

Do not create one-off raw image card grids outside the Player Decision System.

For general card choices, use `CardSelectionPrompt`.

For specialized board-card interactions that already require `CardTile` behavior, such as combat damage, keep using the specialized prompt.

Do not extract a shared `CardFace` component as part of normal choice work. That extraction is out of scope until the Player Decision System is stable and there is repeated duplication that cannot be solved by reusing existing prompts.

## Combat damage rule

Combat damage must remain specialized.

Do not model combat damage as a normal card selection.

Combat damage produces allocations:

```ts
{
  actionId,
  selectedIds: [],
  allocations: [
    { targetUnitId, amount },
  ],
}
```

Preserve:

```text
left click assigns 1 damage
right click removes 1 damage
lethal assignment validation
Tank-first ordering
Backline-last ordering
Auto assign
Reset
Damage meter
CardTile rendering
```

## Waiting-state rule

When the viewer is waiting for another player, return a `pendingDecision` request and render `PendingDecisionStatus`.

The board should remain visible while waiting.

Use tone intentionally:

```text
cyan  → general/non-combat decisions
amber → combat damage or combat-like urgency
```

## Naming rule

Use semantic names based on what the component does now, not where it was first used.

Correct:

```text
CardSelectionPrompt
PlayerDecisionHost
PendingDecisionStatus
```

Incorrect for new code:

```text
SetupChoiceDialog
ChoiceDialogForVision
TrashChoiceModal
VisionDialog
```

Feature-specific names like `VisionDialog` are only allowed if the UI is truly unique to Vision. The current Vision behavior is not unique; it is a card-selection decision.

## Refactor rule

When touching existing choice code:

1. Identify the gameplay decision.
2. Map it to a `PlayerDecisionRequest` kind.
3. Render it through `PlayerDecisionHost`.
4. Produce a `PlayerDecisionIntent`.
5. Remove the old local prompt branch after the new path is verified.

Do not duplicate a prompt just because the wording is different. Wording belongs in the request data.

## Extension rule

When a new decision does not fit the existing request kinds, extend the Player Decision System.

Add:

```text
new request type
host rendering branch
semantic prompt component if needed
intent mapping
regression check
```

Do not bypass the system for speed.

## Out-of-scope rule

Do not combine this work with unrelated refactors.

Out of scope unless explicitly requested:

```text
server engine changes
server action contract changes
CardTile rewrite
shared CardFace extraction
full game-board layout refactor
animation system refactor
styling redesign unrelated to prompts
```

## Checklist before finishing a change

Before submitting a choice-related change, verify:

```text
No new player decision is rendered directly from GameBoard.
The decision has a PlayerDecisionRequest.
The prompt returns a PlayerDecisionIntent.
The server action payload shape is unchanged.
Card choices use CardSelectionPrompt.
Combat damage remains specialized.
Vision uses empty selection for Keep on top.
Waiting states use PendingDecisionStatus.
Old local branches are removed when migrated.
No duplicate raw card grid was introduced.
```
