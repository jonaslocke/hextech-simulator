# Riftbound Simulator – Card Implementation Fixes

This document consolidates the defects found after the new card implementation pass. Each fix references the screenshots provided by the tester and describes the expected gameplay behavior, UI flow, and engine/client implementation expectation.

> **Image reference note:** the screenshots are referenced by filename, using the names from the attached evidence images. If this document is moved outside the current workspace, keep the image files next to the Markdown file so the image links continue to resolve.

## Screenshot index

| Image                            | Evidence summary                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`image-53.png`](./image-53.png) | Deflect target selected; cost/payment behavior is unclear and appears automatic.                               |
| [`image-54.png`](./image-54.png) | Generic `Choose spell from trash` prompt instead of a trash card picker.                                       |
| [`image-55.png`](./image-55.png) | Trigger ordering prompt shows Targon's Peak separately from Dark Child timing.                                 |
| [`image-56.png`](./image-56.png) | Vision asks whether to recycle the top card without showing the card first.                                    |
| [`image-57.png`](./image-57.png) | Firestorm catalog implementation uses enemy-unit selector plus battlefield selector.                           |
| [`image-58.png`](./image-58.png) | Firestorm gameplay state where target selection fails.                                                         |
| [`image-59.png`](./image-59.png) | Error toast: `Selected targets are not legal for this action.`                                                 |
| [`image-60.png`](./image-60.png) | Discard prompt asks for one card but hand cards are not selectable.                                            |
| [`image-61.png`](./image-61.png) | Mystic Poro preview shows Vision keyword, but play does not trigger Vision flow.                               |
| [`image-62.png`](./image-62.png) | Annie, Fiery is present, but spell/ability damage modifier is not applied.                                     |
| [`image-63.png`](./image-63.png) | Tibbers asks for effect targets even though the ability should affect all units at battlefields automatically. |

## Scope

These fixes apply to card behavior around Deflect, trash selection, simultaneous triggered ability grouping, Vision, battlefield-scoped damage, discard from hand, play triggers, Bonus Damage, and automatic group effects.

The recurring implementation problem is that the simulator is mixing four different interaction concepts:

- **Targets:** objects or locations explicitly chosen as part of playing a card or adding an ability to the Chain.
- **Choices:** player decisions made while resolving an effect, such as choosing whether to recycle the top card.
- **Source-zone selections:** choosing a card from a specific zone, such as Hand or Trash.
- **Automatic affected groups:** effects that apply to all objects matching a condition, without individual target selection.

The implementation should preserve this separation.

---

## 1. Deflect additional cost should warn before committing the play intent

### Evidence

- Screenshot: [`image-53.png`](./image-53.png)

![image-53 — Deflect cost/payment behavior](./image-53.png)

### Defect title

Deflect additional cost is paid silently instead of warning the player before committing the play intent.

### Observed behavior

When a player chooses an opposing unit or permanent with Deflect as the target of a spell or ability, the game appears to include the Deflect cost automatically. The player does not get a clear warning that the selected target increased the total cost, and the additional Power can be paid without the player intentionally adding resources to the Rune Pool.

### Expected behavior

When the player selects a target with Deflect, the play intent must not be committed immediately.

Before the spell or ability is finalized, the game should calculate the updated total cost and show a warning explaining that Deflect increased the cost.

The player should then be required to manually add the necessary resources to their Rune Pool before confirming the play. The Confirm / Play button should remain disabled until the Rune Pool contains enough resources to pay the full updated cost.

The player must be able to cancel the play or change targets before committing the intent.

### Suggested UI copy

```text
Deflect increases this cost by +X Power.
```

Example:

```text
Base cost: 2 Energy
Deflect: +1 Power
New cost: 2 Energy + 1 Power

Add resources to your Rune Pool before confirming.
```

### Rules reference

- Choices are made before total cost is determined: rules `559` through `560`.
- Deflect is a mandatory additional cost: rule `560.2.a.2`.
- Deflect adds Power equal to its Deflect value when an opponent-controlled spell or ability chooses the permanent: rule `721.1.c`.
- The Power used for Deflect may be of any Domain: rule `721.1.c.1`.
- Multiple Deflect sources stack by summing their values: rule `721.2`.

### Implementation expectation

This should be handled as a **cost-preview step** between target selection and play intent submission.

Do not auto-pay Deflect from available runes.

The engine/client should expose a preview result after target selection, including:

- base cost;
- additional Deflect cost;
- total cost;
- current Rune Pool;
- missing resources;
- Deflect sources that caused the increase.

Only after the player manually adds resources and confirms should the actual play intent be committed.

### Expected flow

```text
1. Player starts playing a spell or ability.
2. Player chooses targets.
3. One or more chosen targets have Deflect.
4. Engine returns updated cost preview.
5. UI warns the player before committing.
6. Player manually adds resources to Rune Pool.
7. UI enables Confirm only when the full updated cost is payable.
8. Player confirms.
9. Play intent is committed.
```

---

## 2. Choose spell from trash should use a trash card picker

### Evidence

- Screenshot: [`image-54.png`](./image-54.png)

![image-54 — Choose spell from trash generic prompt](./image-54.png)

### Defect title

Choosing a spell from trash is shown as a generic prompt instead of a trash-specific card picker.

### Observed behavior

The game opens a generic `Choose spell from trash` dialog, but the interaction does not clearly present the Trash as the source zone and does not provide a proper card-selection UI.

### Expected behavior

The game should open a trash-specific card picker showing the eligible spell cards from the correct player's Trash.

Valid spell cards should be selectable. Invalid cards should either be hidden or disabled with a simple reason.

The confirm button should only become available after the required spell is selected.

### Rules reference

- Each player has a separate Trash: rule `107.1.c`.
- Cards in any player's Trash are public information: rule `107.1.f`.
- Cards in Trash are front-face/public information even while stacked: rule `129.6`.

### Implementation expectation

This should not use board targeting. The source zone is Trash, and the selectable objects are spell cards in that zone.

Suggested prompt model:

```ts
type ChooseFromTrashPrompt = {
  kind: "chooseFromTrash";
  playerId: string;
  sourceZone: "trash";
  allowedCardTypes: ["spell"];
  minimumCount: 1;
  maximumCount: 1;
};
```

### Expected flow

```text
1. Effect asks the player to choose a spell from Trash.
2. UI opens the player's Trash picker.
3. Only eligible spell cards are selectable.
4. Player chooses one spell.
5. Player confirms.
6. Effect continues with the selected card.
```

---

## 3. Simultaneous triggered abilities should be grouped into one ordering window

### Evidence

- Screenshot: [`image-55.png`](./image-55.png)

![image-55 — Trigger ordering shown separately](./image-55.png)

### Defect title

Simultaneous triggered abilities are resolved in separate chains instead of being grouped into one trigger-ordering window.

### Observed behavior

Dark Child and Targon's Peak both trigger, but they are not collected together.

Current sequence:

```text
1. Dark Child trigger appears on the Chain.
2. Players exchange priority.
3. Dark Child chain resolves.
4. After that chain is completed, Targon's Peak trigger is detected.
5. A second trigger-ordering step / second Chain appears for Targon's Peak.
```

This makes the triggers behave as if they happened at different timings, even though they were caused by the same game event/window.

### Expected behavior

When Dark Child and Targon's Peak trigger from the same timing event, the engine should collect both triggered abilities before creating the Chain.

If the same player controls both triggered abilities, the player should see one ordering prompt containing both:

- Dark Child;
- Targon's Peak.

After the player submits the order, both triggered abilities should be placed on the same Chain in the chosen order.

Players should exchange priority only once for that Chain window, not once for Dark Child and again later for Targon's Peak.

### Rules reference

- If one or more actions, effects, or triggered abilities activate simultaneously, turn order is referenced to organize sequencing: rule `503.2.a`.
- Triggered abilities happen when their condition is met: rule `583`.
- If more than one triggered ability is triggered simultaneously, the controller selects the order to place them on the Chain: rule `583.3.b`.
- If multiple players control simultaneous triggers, players order their controlled triggers in turn order: rule `583.3.b.1`.

### Important clarification

This is not a missing-trigger defect. Both triggers are currently firing. The defect is that the trigger collector is flushing the first detected trigger too early, before all triggers from the same event/timing window have been discovered.

### Implementation expectation

The engine should not immediately create or resolve a Chain as soon as the first triggered ability is found.

Instead, it should use a trigger collection step:

```text
1. Collect all triggered abilities caused by the completed event.
2. Group them by timing window.
3. Ask for ordering when multiple controlled triggers need ordering.
4. Create the Chain from the complete ordered trigger batch.
```

Targon's Peak should not be discovered only after the Dark Child chain finishes if both were caused by the same triggering event.

### Expected flow

```text
1. Game event occurs.
2. Engine detects all triggered abilities caused by that event/timing window.
3. Engine opens one ordering prompt if ordering is needed.
4. Player orders Dark Child and Targon's Peak together.
5. Both triggers are placed onto the same Chain.
6. Players exchange priority.
7. The Chain resolves normally.
```

---

## 4. Vision should reveal the top card before asking for the recycle decision

### Evidence

- Screenshot: [`image-56.png`](./image-56.png)

![image-56 — Vision prompt without revealed top card](./image-56.png)

### Defect title

Vision prompt does not show the top card of the Main Deck before the recycle decision.

### Observed behavior

The game asks `Recycle the top card?`, but it does not show the top card to the player. The UI also looks like a generic selection or target prompt instead of a Vision-specific decision.

### Expected behavior

When Vision resolves, the controller should see the top card of their Main Deck, then choose either to recycle it or keep it on top.

The UI should show the card preview and provide explicit actions:

```text
Recycle
Keep on top
```

This should not use a target-selection prompt.

### Rules reference

- Vision is a triggered ability keyword: rule `729.1`.
- Vision means: “When this is played, look at the top card of your Main Deck. You may recycle it.”: rule `729.1.b`.
- The trigger is the permanent entering the Board: rule `729.1.c`.
- Multiple Vision instances trigger separately: rule `729.2`.

### Implementation expectation

Vision should be represented as a specific choice prompt, not as a target prompt.

Suggested prompt model:

```ts
type VisionPrompt = {
  kind: "vision";
  playerId: string;
  revealedCard: PrivateCardView;
  source: {
    zone: "mainDeck";
    position: "top";
  };
  options: ["keepOnTop", "recycle"];
};
```

### Expected flow

```text
1. Vision trigger resolves.
2. Engine reveals the top card only to the controller.
3. UI shows the revealed card.
4. Player chooses Recycle or Keep on top.
5. Engine applies the selected option.
```

---

## 5. Firestorm should target a battlefield, then affect enemy units automatically

### Evidence

- Catalog screenshot: [`image-57.png`](./image-57.png)
- Gameplay screenshot: [`image-58.png`](./image-58.png)
- Error toast screenshot: [`image-59.png`](./image-59.png)

![image-57 — Firestorm catalog implementation](./image-57.png)

![image-58 — Firestorm gameplay target failure](./image-58.png)

![image-59 — Illegal target error toast](./image-59.png)

### Defect title

Firestorm incorrectly requires selecting enemy units instead of selecting only a battlefield.

### Observed behavior

Firestorm is implemented with:

```text
selector_enemy_unit
selector_battlefield
action_deal_damage
```

In game, the card reports:

```text
Selected targets are not legal for this action.
```

This makes the card effectively unplayable.

### Expected behavior

Firestorm should ask the player to choose one battlefield, then automatically deal 3 damage to all enemy units at that battlefield.

The player should not select each enemy unit manually.

If there is no battlefield with enemy units, then Firestorm should not be playable.

### Rules reference

- A card that affects objects based on criteria is not necessarily making a choice for each object. Example: `Kill all gear` is not a choice: rule `559.3.a`.
- Battlefields can be targeted by spells or game effects: rule `163.7`.
- Units mark damage when spells, abilities, or game effects deal damage: rule `139.3.a`.

### Implementation expectation

Firestorm needs a battlefield target and an automatic affected group derived from the selected battlefield.

Suggested catalog direction:

```text
selector_battlefield
- controller: any
- locationRelation: any
- mustContain: enemy_unit

action.deal_damage
- amount: 3
- affectedGroup: all_enemy_units_at_selected_battlefield
- requiresTargetSelection: false for units
```

### Expected flow

```text
1. Player chooses Firestorm.
2. UI highlights legal battlefields.
3. Player selects one battlefield.
4. Engine validates the selected battlefield has at least one enemy unit.
5. Player pays costs and confirms.
6. On resolution, engine collects all enemy units at that battlefield.
7. Engine deals 3 damage to each collected enemy unit.
```

---

## 6. Discard from hand should make hand cards selectable

### Evidence

- Screenshot: [`image-60.png`](./image-60.png)

![image-60 — Discard from hand prompt cannot select hand cards](./image-60.png)

### Defect title

Discard prompt does not make hand cards selectable.

### Observed behavior

The game asks the player to `Choose 1 card to discard`, but the player cannot select a card from hand. The prompt remains at `0/1 selected`.

### Expected behavior

When an effect or cost requires discarding from hand, the acting player's hand should become the selection source.

The player should be able to select the required number of cards from their own hand, confirm, and then those cards should move directly to their Trash.

### Rules reference

- Discarding moves a card from a player's hand directly into their Trash: rule `598.1`.
- The player performing the discard chooses which cards to send to Trash and may use private information to do so: rule `598.1.a`.
- A player must discard cards when instructed by effects or costs: rule `598.2.a`.
- If Discarding is a cost, the action must be able to be completed for the cost to be paid: rule `598.3`.

### Implementation expectation

This should not use board targeting. It is a private source-zone selection owned by the acting player.

Suggested prompt model:

```ts
type DiscardFromHandPrompt = {
  kind: "discardFromHand";
  playerId: string;
  sourceZone: "hand";
  minimumCount: 1;
  maximumCount: 1;
};
```

### Expected flow

```text
1. Effect or cost asks player to discard 1 card.
2. UI makes the acting player's hand selectable.
3. Player selects one hand card.
4. Player confirms.
5. Selected card moves from hand to Trash.
6. Effect continues.
```

---

## 7. Mystic Poro should trigger Vision when played

### Evidence

- Screenshot: [`image-61.png`](./image-61.png)

![image-61 — Mystic Poro has Vision but does not trigger it](./image-61.png)

### Defect title

Mystic Poro's Vision keyword does not create a Vision trigger on play.

### Observed behavior

Mystic Poro has the Vision keyword, but after it is played the Vision flow does not trigger.

### Expected behavior

After Mystic Poro is successfully played and enters the Board, Vision should trigger.

The game should create a pending triggered ability and resolve it using the Vision UI:

```text
Show the top card of the controller's Main Deck.
Allow the player to recycle it or keep it on top.
```

### Rules reference

- Vision is a triggered ability keyword: rule `729.1`.
- Vision triggers when the permanent enters the Board: rule `729.1.c`.

### Implementation expectation

The keyword parser and runtime trigger registry should treat Vision as a triggered keyword on permanents.

Suggested behavior model:

```text
keyword.vision
trigger.when_played_or_enters_board
choice.look_at_top_card_of_main_deck
optional_action.recycle_that_card
```

### Expected flow

```text
1. Mystic Poro is played.
2. Mystic Poro enters the Board.
3. Vision trigger is registered.
4. Vision trigger is placed on the Chain at the correct timing.
5. When it resolves, the Vision prompt appears.
```

---

## 8. Annie, Fiery should increase spell and ability damage

### Evidence

- Screenshot: [`image-62.png`](./image-62.png)

![image-62 — Annie, Fiery damage modifier not applied](./image-62.png)

### Defect title

Annie, Fiery does not increase damage dealt by controlled spells and abilities.

### Observed behavior

Annie, Fiery is present, but spell damage appears to resolve using only the printed damage value.

### Expected behavior

While Annie, Fiery is active, spells and abilities controlled by that player should deal 1 Bonus Damage.

For a single-target damage effect, the target should receive +1 damage.

For a multi-target damage effect, each affected target should receive +1 damage.

For a split-damage effect, the total split amount should increase by 1 before distribution.

### Rules reference

- Units mark damage when spells, abilities, or other game effects deal damage: rule `139.3.a`.
- Split damage target count is based on available damage when the spell is played: rule `559.3.d.3`.
- Split damage amount is divided on resolution: rule `559.3.d.5`.

### Implementation expectation

Bonus Damage should be applied inside the damage calculation pipeline, not only inside specific card implementations.

The damage resolver should know:

```ts
type DamageContext = {
  sourceControllerId: string;
  sourceKind: "spell" | "ability" | "unitCombat" | "other";
  baseAmount: number;
  affectedTargets: TargetRef[];
};
```

Then it should apply active Bonus Damage modifiers controlled by the source controller when the source kind is eligible.

### Expected flow

```text
1. Player controls Annie, Fiery.
2. Player resolves a spell or ability that deals damage.
3. Damage pipeline checks active modifiers for the source controller.
4. Annie, Fiery contributes +1 Bonus Damage.
5. Final damage is applied according to the effect shape:
   - single target: base + 1;
   - each target in a group: base + 1 to each;
   - split damage: split pool increases by 1.
```

---

## 9. Tibbers should not ask for targets

### Evidence

- Screenshot: [`image-63.png`](./image-63.png)

![image-63 — Tibbers asks for targets even though none should be selected](./image-63.png)

### Defect title

Tibbers play trigger incorrectly opens a target-selection prompt.

### Observed behavior

After Tibbers is played, the game opens a `Choose effect target` prompt even though Tibbers' effect does not require selecting targets.

The prompt blocks resolution with a `0/0` target-selection state.

### Expected behavior

Tibbers' play ability should trigger after Tibbers enters the Board.

When that ability resolves, it should automatically deal damage to all units at all battlefields.

The player should not select targets.

### Rules reference

- Effects that affect objects based on criteria do not require choosing each object. Example: `Kill all gear` is not a choice: rule `559.3.a`.
- Triggered ability choices for permanents are not made as the permanent is played; they are made when the ability triggers, if the ability actually requires a choice: rule `559.3.b`.
- Units mark damage when spells, abilities, or game effects deal damage: rule `139.3.a`.

### Implementation expectation

Tibbers should be modeled as an automatic affected-group effect, not as a target-selection effect.

Suggested catalog direction:

```text
trigger.when_played

action.deal_damage
- amount: 3
- affectedGroup: all_units_at_battlefields
- requiresTargetSelection: false
```

### Expected flow

```text
1. Tibbers is played.
2. Tibbers enters the Board.
3. Tibbers play trigger is created.
4. Players exchange priority as appropriate.
5. Trigger resolves.
6. Engine collects all units at all battlefields.
7. Engine deals 3 damage to each collected unit.
8. No target-selection prompt appears.
```

---

# Cross-cutting implementation recommendations

## A. Separate prompt kinds

The client should not use the same prompt for every pending decision.

Recommended prompt categories:

```ts
type PendingPrompt =
  | TargetSelectionPrompt
  | ChooseFromTrashPrompt
  | DiscardFromHandPrompt
  | VisionPrompt
  | TriggerOrderingPrompt
  | CostPreviewPrompt;
```

Each prompt should describe the interaction source and purpose clearly.

## B. Separate targets from affected groups

Effects like these require different models:

```text
Choose a unit.
```

This requires target selection.

```text
Choose a battlefield. Deal 3 to all enemy units there.
```

This targets/selects a battlefield, then automatically derives affected units.

```text
Deal 3 to all units at battlefields.
```

This requires no target selection. It derives all affected units automatically.

## C. Add a target/choice validation layer before intent commit

Before committing a play intent, the client should be able to preview:

```ts
type PlayIntentPreview = {
  baseCost: Cost;
  additionalCosts: AdditionalCost[];
  totalCost: Cost;
  selectedTargets: TargetRef[];
  affectedPreview?: AffectedObjectPreview[];
  warnings: IntentWarning[];
  missingResources: Cost;
  canCommit: boolean;
};
```

This is especially important for Deflect, because the selected targets can change the total cost.

## D. Do not auto-pay extra costs caused by target selection

Automatic payment hides important gameplay decisions.

For Deflect specifically:

```text
Target selection may update the total cost.
The player must see the updated cost.
The player must manually add resources.
The player confirms only after the full cost is available.
```

## E. Trigger collection should be event-scoped

Triggered abilities should be collected from the full completed event before the Chain is created.

The engine should avoid this pattern:

```text
detect first trigger -> create Chain -> resolve Chain -> detect next trigger
```

The engine should use this pattern:

```text
complete event -> collect all triggers -> order if needed -> create Chain
```

## F. Use card/zone pickers for zone-based decisions

Trash and hand selections should use card picker UIs, not board targeting.

- Trash picker: public zone, visible cards, filter by eligible card type.
- Hand picker: private zone, visible only to owning player, supports discard/cost/effect choices.

## G. Keep the shared ChoiceDialog generic

Shared choice components should support render props for card rendering, but should not import game-specific card components directly.

Game-specific rendering such as `CardTile` should be injected by the game feature layer.

---

# Suggested priority order

1. Fix Deflect cost preview before intent commit.
2. Fix Firestorm battlefield targeting and automatic affected group.
3. Fix Tibbers automatic affected group with no target prompt.
4. Fix Vision UI and Vision trigger registration.
5. Fix trigger batching for Dark Child and Targon's Peak.
6. Fix discard-from-hand source-zone selection.
7. Fix choose-spell-from-trash source-zone selection.
8. Fix Annie, Fiery Bonus Damage in the damage pipeline.
9. Regression-test Mystic Poro after Vision fix.

---

# Regression test checklist

## Deflect

- Selecting a Deflect target updates total cost before commit.
- The player sees a warning.
- The player can cancel or change targets.
- The player must manually add resources to the Rune Pool.
- Confirm is disabled until the updated cost is payable.
- Multiple Deflect sources stack correctly.

## Choose spell from trash

- Trash picker opens.
- Only eligible spell cards are selectable.
- Confirm is disabled until one spell is selected.
- Selection resolves using the chosen trash card.

## Trigger batching

- Dark Child and Targon's Peak trigger from the same event.
- Both appear in the same ordering prompt.
- Only one Chain is created for the grouped triggers.
- Players exchange priority once for that Chain window.

## Vision

- Top card is shown to the controller.
- Opponent does not see private revealed information unless rules require it.
- Player can choose Recycle or Keep on top.
- Mystic Poro triggers Vision when played.

## Firestorm

- Player selects a battlefield, not individual enemy units.
- Only battlefields with enemy units are legal.
- All enemy units at the selected battlefield take 3 damage.
- No `Selected targets are not legal for this action` error appears for legal battlefield selection.

## Discard from hand

- The acting player's hand becomes selectable.
- The player can select exactly one card.
- Confirm discards the selected card to Trash.

## Annie, Fiery

- Single-target spell damage gets +1.
- Group damage gets +1 for each affected target.
- Split damage increases the total split pool by +1.

## Tibbers

- Playing Tibbers creates the play trigger.
- Trigger resolves without target selection.
- All units at all battlefields take the correct damage.
- Bonus Damage modifiers are applied if applicable.
