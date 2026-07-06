# Player Decision System — Implementation and Refactor Plan

## Purpose

The project currently prompts players for gameplay choices through several separate UI components and conditional branches inside the game board flow. This creates repeated decision handling, repeated card-choice UI decisions, and makes every new effect feel like a new local exception.

This refactor introduces the **Player Decision System**.

The Player Decision System centralizes how the game detects an active player decision, chooses the correct prompt surface, and converts the player response into the intent already sent to the server.

This is a refactor of decision orchestration. It is not a rewrite of the game engine, the server action contract, or every visual prompt.

## Current project status

The project already has several choice/prompt components:

```text
setup-choice-dialog.tsx
choice-dialog.tsx
combat-damage-dialog.tsx
pending-choice-status.tsx
```

Their current responsibilities are:

```text
setup-choice-dialog.tsx
  Current behavior: card/grid-oriented choice dialog.
  Important capabilities: card presentation, multiple selection, min/max selected, initial selection, dynamic confirm labels.
  Problem: the name is no longer semantic. It is not only for setup.

choice-dialog.tsx
  Current behavior: generic option dialog.
  Important capabilities: list/card presentation, renderOption escape hatch, single selection, ordered selection.
  Problem: it does not represent the full player-decision system and currently supports only single/ordered selections.

combat-damage-dialog.tsx
  Current behavior: specialized combat damage assignment prompt.
  Important capabilities: CardTile rendering, click/right-click assignment, lethal validation, Tank/Backline ordering, auto assign, damage meter.
  Decision: keep it specialized. Combat damage is not a normal card-selection prompt.

pending-choice-status.tsx
  Current behavior: waiting banner shown when another player must act.
  Important capabilities: compact glass banner with cyan/amber tones.
  Decision: keep it as the waiting-state renderer inside the Player Decision System.
```

The current `GameBoard` also contains branching logic that identifies pending choices, maps projection data to UI options, renders prompts, and submits the resulting action intent. That is the part being changed now.

## Naming definitions

Use the following vocabulary consistently:

```text
Decision
  The gameplay decision the active player must make.

Prompt
  The UI surface that asks the player to make the decision.

Intent
  The payload produced by the prompt and sent to the server.

Host
  The mounted component responsible for rendering the active decision prompt.
```

The system name is:

```text
Player Decision System
```

The main component is:

```text
PlayerDecisionHost
```

The main input type is:

```text
PlayerDecisionRequest
```

The output payload type is:

```text
PlayerDecisionIntent
```

The card-choice prompt is:

```text
CardSelectionPrompt
```

This replaces the semantic role currently handled by `SetupChoiceDialog`.

## Final architecture

The intended direction is:

```text
GameBoard
  adapts the projection and board state
  renders the board
  renders one PlayerDecisionHost
  submits PlayerDecisionIntent to the existing server action flow

usePlayerDecisionRequest
  reads the current projection/actions
  detects the active player decision
  maps it to a PlayerDecisionRequest

PlayerDecisionHost
  receives one PlayerDecisionRequest
  chooses the correct prompt renderer
  converts prompt output into PlayerDecisionIntent

Prompt components
  collect local UI input only
  do not inspect the full game projection
  do not call the server directly
```

The new flow is:

```text
projection/actions
  → usePlayerDecisionRequest
  → PlayerDecisionRequest
  → PlayerDecisionHost
  → prompt renderer
  → PlayerDecisionIntent
  → existing onPerformAction contract
```

The server remains the source of truth. The Player Decision System does not create choices independently. It only renders choices that are already authorized by the current projection/actions.

## Existing action contract

The project already sends player decisions to the server using this shape:

```ts
export type PlayerDecisionIntent = {
  actionId: string;
  selectedIds?: string[];
  allocations?: Array<{ targetUnitId: string; amount: number }>;
};
```

This matches the existing `onPerformAction` shape:

```ts
onPerformAction({
  actionId,
  selectedIds,
  allocations,
});
```

Do not change the server action payload as part of this refactor.

## PlayerDecisionRequest type

Create a decision request union that covers the existing prompt surfaces:

```ts
export type PlayerDecisionRequest =
  | CardSelectionDecisionRequest
  | OptionDecisionRequest
  | OrderedDecisionRequest
  | CombatDamageDecisionRequest
  | PendingDecisionRequest;

export type CardSelectionDecisionRequest = {
  kind: "cardSelection";
  actionId: string;
  title: string;
  description?: string;
  cards: PlayerDecisionCard[];
  minSelected: number;
  maxSelected: number;
  confirmLabel?: string | ((selectedIds: string[]) => string);
  cancelLabel?: string;
  canCancel?: boolean;
};

export type OptionDecisionRequest = {
  kind: "optionDecision";
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  confirmLabel?: string;
  canCancel?: boolean;
};

export type OrderedDecisionRequest = {
  kind: "orderedDecision";
  actionId: string;
  title: string;
  description?: string;
  options: PlayerDecisionOption[];
  confirmLabel?: string;
};

export type CombatDamageDecisionRequest = {
  kind: "combatDamage";
  actionId: string;
  choice: CombatDamageChoice;
};

export type PendingDecisionRequest = {
  kind: "pendingDecision";
  title: string;
  message: React.ReactNode;
  tone?: "cyan" | "amber";
};

export type PlayerDecisionCard = {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  disabled?: boolean;
};

export type PlayerDecisionOption = {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  disabled?: boolean;
};
```

Adjust field names only as needed to match the existing project types.

## Prompt component names

Use these semantic names for decision prompt components:

```text
CardSelectionPrompt
OptionDecisionPrompt
OrderedDecisionPrompt
CombatDamagePrompt
PendingDecisionStatus
```

Implementation mapping:

```text
CardSelectionPrompt
  Created from the current setup-choice-dialog.tsx implementation.
  This component is the reusable card-selection prompt for mulligan, Vision, discard-from-hand, choose-from-trash, and similar effects.

OptionDecisionPrompt
  Uses or wraps the current choice-dialog.tsx single-selection behavior.

OrderedDecisionPrompt
  Uses or wraps the current choice-dialog.tsx ordered-selection behavior.

CombatDamagePrompt
  Uses the current combat-damage-dialog.tsx behavior.
  It remains specialized.

PendingDecisionStatus
  Uses the current pending-choice-status.tsx behavior.
```

Do not create a single mega-dialog that tries to visually handle every decision.

## What changes now

This implementation changes the orchestration layer first.

The current visual components are reused. The refactor does not extract a shared `CardFace` component now. The refactor does not rewrite `CardTile` now. The refactor does not merge combat damage into a generic card-selection prompt.

The current `setup-choice-dialog.tsx` behavior becomes the basis for `CardSelectionPrompt` because it already supports the behavior required by mulligan and Vision-style card selection.

The current `choice-dialog.tsx` remains useful for option and ordered decisions.

The current `combat-damage-dialog.tsx` remains the specialized renderer for combat damage.

The current `pending-choice-status.tsx` remains the waiting-state renderer.

## What does not change now

Do not change the server-side game engine.

Do not change the action intent shape.

Do not introduce an imperative global prompt API that can open decisions without projection support.

Do not extract a shared `CardFace` component in this refactor.

Do not rewrite `CardTile` in this refactor.

Do not create new raw card-image grids outside the Player Decision System.

Do not move target selection into this refactor unless it is already low-risk in the current code. `TargetSelectionPrompt` can remain separate for now because it is a movable board overlay and has interaction concerns beyond the uploaded choice components.

## Testing strategy for this implementation

This refactor must keep automated testing intentionally small.

The project is still actively changing around decision prompts, effect selection, Vision behavior, card selection surfaces, and combat-damage UX. Broad integration tests created against the current implementation tend to encode temporary behavior and are frequently discarded immediately after implementation changes. That creates unnecessary churn and consumes more implementation context than it returns.

For this plan, do not build a large integration-test suite around the current UI structure. Do not create tests whose main purpose is to snapshot or preserve the pre-refactor GameBoard branching, temporary prompt layout, or uncertain implementation details.

Automated tests are still allowed, but they must be limited to the smallest stable surface that protects the refactor:

```text
Allowed minimal tests
  Pure mapper tests for usePlayerDecisionRequest when the projection fixture is small and stable.
  Intent conversion tests when PlayerDecisionHost maps prompt output into PlayerDecisionIntent.
  A narrow Vision test proving empty selection submits selectedIds: [] instead of a synthetic keep-on-top id.
  A narrow combat-damage host test proving allocations are forwarded without changing the server payload shape.

Avoid
  Full GameBoard integration tests for every prompt.
  Tests that duplicate manual gameplay scenarios before the feature is manually validated.
  Tests that assert CSS classes, exact glass styling, or current layout structure.
  Tests that encode current uncertain implementation details as if they were engine rules.
  Throwaway integration tests created only to support a temporary refactor step.
```

Manual testing is the main validation path for this plan. The most likely issues will appear while playing through real game flows, because the Player Decision System is an orchestration refactor around server-authorized game state. After the refactor is manually validated and decision behavior stabilizes, additional integration tests can be added around stable gameplay outcomes rather than around temporary UI implementation details.

The implementation should prefer clear types, small pure mapping functions, and low-risk wrappers over broad integration tests. The goal is to reduce prompt churn first, then add stronger automated coverage only where the behavior has become stable enough to justify it.

## Folder structure

Create a feature-level decisions folder:

```text
features/game-board/decisions/
  player-decision-types.ts
  use-player-decision-request.ts
  player-decision-host.tsx
  card-selection-prompt.tsx
  option-decision-prompt.tsx
  ordered-decision-prompt.tsx
  pending-decision-status.tsx
```

For combat damage, either move the existing file or wrap it:

```text
features/game-board/components/combat-damage-dialog.tsx
  existing specialized implementation

features/game-board/decisions/combat-damage-prompt.tsx
  thin wrapper or renamed version
```

Use the lower-risk option first. A wrapper is acceptable if moving the file creates too much churn.

## Milestone 1 — Add the Player Decision System skeleton

Create:

```text
player-decision-types.ts
player-decision-host.tsx
use-player-decision-request.ts
```

The first version of `PlayerDecisionHost` must support:

```text
cardSelection
optionDecision
orderedDecision
combatDamage
pendingDecision
```

The first version of `usePlayerDecisionRequest` can return `null` until individual decisions are migrated.

Add `PlayerDecisionHost` to `GameBoard` once, near the existing prompt rendering area:

```tsx
const playerDecision = usePlayerDecisionRequest({
  sourceProjection,
  projection,
  cardsByInstanceId,
  board,
});

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

Keep existing prompt branches in place until each branch is migrated and verified.

## Milestone 2 — Rename setup choice behavior into CardSelectionPrompt

Create `card-selection-prompt.tsx` from the current `setup-choice-dialog.tsx` behavior.

The component must keep these capabilities:

```text
card presentation
multiple selection
single selection
ordered selection if still needed
minSelected
maxSelected
initialSelectedIds
dynamic confirmLabel
confirmOnSelect when needed
cardSize
cancel support
```

The semantic name is now `CardSelectionPrompt`.

If existing imports still use `SetupChoiceDialog`, leave a temporary compatibility export:

```ts
export { CardSelectionPrompt as SetupChoiceDialog } from "./card-selection-prompt";
```

Remove the compatibility export only after all imports have moved to the semantic name.

## Milestone 3 — Implement Vision through cardSelection

Vision must not use a synthetic `keep-on-top` option.

Vision is represented as a card selection decision where an empty selection means the player keeps the revealed card or cards on top.

Use this behavior:

```text
Title: Vision
Description: Choose cards to recycle. Unselected cards stay on top.
Selection mode: multiple
minSelected: 0
maxSelected: number of revealed cards
```

Confirm label behavior:

```ts
(selectedIds) =>
  selectedIds.length === 0
    ? "Keep on top"
    : selectedIds.length === 1
      ? "Recycle selected card"
      : `Recycle ${selectedIds.length} cards`
```

Submit intent:

```ts
{
  actionId,
  selectedIds,
}
```

For current Vision 1, this still works. For a future Vision 3-style effect, the same prompt scales without changing the UI model.

## Milestone 4 — Migrate card-selection decisions

Move existing card-selection prompt logic from `GameBoard` into `usePlayerDecisionRequest`.

Migrate:

```text
mulligan/setup card choices, if currently handled in this area
choose/discard from hand
choose from trash
Vision recycle choice
any effectSelection with cardSelection presentation
```

Each migrated choice becomes a `cardSelection` request.

Card-based prompts must use `CardSelectionPrompt`. Do not create one-off raw image grids in `GameBoard`.

## Milestone 5 — Migrate option and ordered decisions

Move generic option and ordering prompt logic into `usePlayerDecisionRequest`.

Migrate:

```text
trigger ordering
non-card effect options
single option decisions
```

Use:

```text
orderedDecision → OrderedDecisionPrompt
optionDecision  → OptionDecisionPrompt
```

These prompts may wrap the existing `choice-dialog.tsx` behavior.

## Milestone 6 — Route combat damage through PlayerDecisionHost

Keep the current combat damage UI behavior.

The mapper returns:

```ts
{
  kind: "combatDamage",
  actionId: combatDamageAction.id,
  choice: combatDamageAction.choice,
}
```

The host renders `CombatDamagePrompt` and converts allocations to intent:

```ts
{
  actionId,
  selectedIds: [],
  allocations,
}
```

Do not convert combat damage into a generic card-selection prompt.

## Milestone 7 — Route waiting states through PlayerDecisionHost

Move waiting banners into `pendingDecision` requests.

Examples:

```text
Waiting for trigger ordering
Waiting for effect selection
Waiting for combat damage assignment
```

Use:

```text
PendingDecisionStatus
```

Keep the board visible while waiting.

## Milestone 8 — Remove migrated branches from GameBoard

After each migrated decision is verified, remove its old direct rendering branch from `GameBoard`.

The final `GameBoard` should no longer manually decide which choice dialog to render for the migrated cases. It should render a single `PlayerDecisionHost`.

## Decision precedence

When more than one possible decision is detectable, `usePlayerDecisionRequest` must return only one active request.

Use this precedence:

```text
1. Active viewer-owned blocking decisions
2. Active viewer-owned combat damage assignment
3. Active viewer-owned card/option/order choices
4. Waiting state for another player's blocking decision
5. null
```

Do not render multiple blocking player-decision prompts at the same time.

## Card rendering rule

Card-based decisions must not duplicate card-face UX in local branches.

For this refactor, reuse the existing card-selection prompt behavior. Do not introduce another raw card-image grid.

Combat damage continues to use the existing `CardTile`-based renderer because it is a specialized card-board interaction.

A shared `CardFace` extraction is explicitly out of scope for this refactor. Revisit it only after the Player Decision System is stable and duplication remains painful.

## Acceptance checklist

The refactor is complete when:

```text
PlayerDecisionHost is mounted once by GameBoard.
PlayerDecisionRequest and PlayerDecisionIntent are defined in one place.
Vision uses cardSelection with minSelected 0 and no synthetic keep-on-top option.
Card-selection effects use CardSelectionPrompt.
Trigger ordering uses OrderedDecisionPrompt or the existing ChoiceDialog through the host.
Combat damage is rendered through the host while keeping its specialized behavior.
Waiting states are rendered through the host.
Migrated prompt branches are removed from GameBoard.
No new prompt bypasses the Player Decision System.
Automated tests stay limited to stable mapper/intent behavior and do not encode temporary UI implementation details.
The server action payload remains unchanged.
```

## Manual regression checks

After implementation, manually verify these gameplay flows before adding broader automated coverage:

```text
Mulligan still supports selecting up to the allowed number of cards.
Vision 1 can recycle the revealed card.
Vision 1 can keep the revealed card on top by confirming with no selection.
Choosing a card from hand still submits the selected card id.
Choosing a card from trash still shows all legal cards and submits the selected card id.
Trigger ordering still preserves ordered ids.
Combat damage still submits allocations.
Combat damage still validates lethal assignment, Tank first, and Backline last.
Waiting banners still appear for opponent-owned decisions.
No stale prompt remains after the projection updates.
```
