# Riftbound Simulator — Follow-up Fixes After Annie Implementation

This document describes the new defects found after the first round of card implementation fixes. These are follow-up issues, not a replacement for the previous defect document.

The main pattern across these issues is that several systems are partially fixed, but the implementation is still using the wrong shared path in specific cases:

- Showdown/Chain state restoration works in normal cases, but loses Focus after a move-trigger Chain.
- Annie, Fiery bonus damage works for targeted spell damage, but not for triggered ability damage.
- Trash selection works only for the visually top card, but Trash should be treated as an unordered selectable zone.
- Firestorm is still being validated like a unit-targeting spell instead of a battlefield-selection spell with automatic affected units.

## Image index

| Reference | Purpose |
| --- | --- |
| `image(114).png` | Move-trigger Chain resolves, but the attacking/actor player loses Focus afterward. |
| `image(115).png` | Annie, Fiery bonus damage applies to Disintegrate but not Tibbers. |
| `image(116).png` | Morbid Return can only select the top Trash card instead of any unit in Trash. |
| `image(117).png` | Firestorm is still not playable and shows “Selected targets are not legal for this action.” |

---

## 1. Move-trigger Chain resolves, but attacking player loses Focus afterward

**Screenshot:** `image(114).png`

### Title

Move-trigger Chain resolves correctly, but the attacking player loses Showdown Focus afterward.

### Observed behavior

A unit with a “when this moves to a battlefield” trigger moves to or attacks a battlefield.

The trigger is detected and placed on the Chain. Players exchange priority for that Chain, and the triggered effect resolves correctly. In the tested case, the move-trigger sequence can now discard and draw as expected.

However, after the Chain finishes resolving, the attacking or actor player no longer has Focus. The game returns to a Showdown state, but the next Showdown action is assigned to the wrong player or the actor is shown as waiting for the opponent.

In `image(114).png`, the board is in a Showdown state at Targon’s Peak, but the prompt says the game is waiting for `player-2` to act even though the flow started from `player-1` moving/attacking into the battlefield.

### Expected behavior

Resolving the move-trigger Chain must not corrupt or lose the surrounding Showdown state.

Expected sequence:

1. Player moves or attacks with a unit into a battlefield.
2. The unit’s “when this moves to a battlefield” trigger is detected.
3. The trigger is placed on the Chain.
4. Both players exchange priority normally.
5. The Chain resolves.
6. The trigger’s effects are applied correctly, such as discard and draw.
7. The game returns to the correct Showdown state.
8. The actor / attacking player has the correct Focus and Priority state for the next Showdown decision.
9. The UI allows the actor to continue the Showdown flow or pass Focus.

### Actual problematic sequence

1. Player moves or attacks with a unit into a battlefield.
2. The move trigger goes on the Chain.
3. Both players pass priority.
4. The Chain resolves correctly.
5. The engine transitions back to Showdown.
6. Focus is assigned to the wrong player.
7. The actor / attacking player is blocked from continuing the Showdown flow.

### Rule basis

Relevant rules to validate against:

- Rule 508–510: the turn can be Neutral/Open, Neutral/Closed, Showdown/Open, or Showdown/Closed.
- Rule 512: Priority is the permission to take discretionary actions.
- Rule 513: Focus applies during Showdown Open, and a player who gains Focus also gains Priority.
- Rule 548–549: a Showdown begins when a battlefield becomes contested, and the player who applied the contested status gains Focus.
- Rule 551–552: when the last item on a Chain resolves during a Showdown, Focus passes to the next relevant player.
- Rule 553: during a Showdown, the player with Focus may play legal spells, activate legal abilities, invite a player, or pass.

The important distinction is whether this move-trigger Chain is modeled as:

1. a Chain created during move/attack setup before the Showdown action window fully resumes; or
2. a Chain created inside an already-open Showdown.

The implementation should not use one generic post-chain behavior for both cases.

### Important clarification

This is not a defect in the trigger effect resolution anymore. The discard/draw sequence is working after the previous fixes.

The remaining defect is state restoration after a Chain created by a move-trigger during a battlefield attack/move flow.

The engine appears to be resolving the Chain correctly, but then incorrectly restoring or recalculating:

- `focusPlayerId`
- `priorityPlayerId`
- `activePlayerId`
- `relevantPlayers`
- showdown pass state
- pending showdown continuation

### Likely implementation cause

The Chain resolver may be treating the post-chain transition as a generic “pass to next relevant player” case, or it may be losing the parent Showdown context that existed before the Chain was opened.

The fix should preserve enough context when the move-trigger Chain is opened, so that after the Chain resolves the engine can resume the correct parent flow instead of recalculating Focus from incomplete state.

### Implementation expectation

When a move-trigger Chain is created during a move/attack into a battlefield, store the surrounding flow context before entering the Chain.

That context should include:

- whether this Chain was created before the Showdown fully opened or during an active Showdown;
- the battlefield involved;
- the actor / attacking player;
- the current Focus player before the Chain;
- the relevant players for the upcoming or current Showdown;
- whether this is a combat Showdown or non-combat Showdown.

After the Chain resolves, resume the correct parent flow:

- If the trigger Chain belongs to move/attack setup before the Showdown action window resumes, return Focus to the actor / attacking player.
- If the trigger Chain is already inside an active Showdown Chain, apply the normal Showdown focus-passing rule.

Do not let the Chain resolver blindly overwrite the Showdown Focus state without knowing which parent flow created the Chain.

### Regression checks

1. A unit moves to a contested battlefield and creates a move-trigger Chain.
   - Expected: Chain resolves and the correct player has Focus afterward.
2. The move-trigger effect discards and draws.
   - Expected: effect resolution still works.
3. The move-trigger Chain happens before the Showdown action window resumes.
   - Expected: actor / attacking player keeps or regains correct Focus.
4. A Chain is created inside an already-open Showdown.
   - Expected: after the last Chain item resolves, Focus passes according to normal Showdown rules.
5. No player should be stuck waiting when they are the player expected to act.

---

## 2. Annie, Fiery bonus damage applies to Disintegrate but not to Tibbers

**Screenshot:** `image(115).png`

### Title

Annie, Fiery bonus damage applies to Disintegrate but not to Tibbers’ triggered ability.

### Observed behavior

Annie, Fiery’s damage modifier is now working for Disintegrate.

When Disintegrate deals damage, the expected +1 bonus damage is applied correctly:

- Disintegrate base damage: 3
- Annie, Fiery bonus damage: +1
- Final damage dealt: 4

However, the same bonus damage is not applied when Tibbers’ triggered ability resolves.

Tibbers’ ability still deals only its printed/base damage:

- Tibbers base damage: 3
- Annie, Fiery bonus damage: not applied
- Final damage dealt: 3

### Expected behavior

Annie, Fiery should modify damage from both:

- spells controlled by Annie’s controller;
- abilities controlled by Annie’s controller.

Tibbers’ “when you play me” ability is an ability controlled by the player who played Tibbers, so it should receive the same Annie, Fiery bonus damage modifier that Disintegrate receives.

Expected Tibbers result:

- Tibbers base damage: 3
- Annie, Fiery bonus damage: +1
- Final damage dealt to each affected unit: 4

### Important clarification

This is no longer a general “Annie, Fiery bonus damage is not working” defect.

The modifier works for at least one spell damage path, proven by Disintegrate dealing 4.

The remaining defect is that the bonus damage modifier is not applied consistently across all damage sources. It appears to be applied to targeted spell damage, but not to triggered ability damage or automatic affected-group damage.

### Rule basis

Relevant rules to validate against:

- Rule 139.3: when spells, abilities, or other game effects deal damage, units mark that damage.
- Rule 151: spells resolve by executing their rules text.
- Rule 564+ / triggered ability rules: abilities are game effects and can resolve from the Chain.
- Bonus Damage rules: Bonus Damage should modify Deal actions from eligible sources. If the Deal action affects multiple targets or affected objects, each affected object should receive the modified damage amount individually.

### Likely implementation cause

The damage modifier is probably attached to one narrow damage-resolution path, such as:

- spell damage only;
- targeted damage only;
- card text action from a spell;
- single-target damage actions.

Tibbers likely uses a different damage path because its effect is:

- a triggered ability;
- created by a unit/permanent;
- resolved from the Chain as an ability;
- applied to an automatic affected group, not manually selected targets.

Because of that, Tibbers bypasses the Annie, Fiery damage modifier.

### Implementation expectation

Bonus damage should be applied in the shared `deal damage` resolution layer, not only inside spell-specific or target-specific code.

The damage resolver should receive enough source context to answer:

- who controls this damage source;
- whether the source is a spell or ability;
- whether Annie, Fiery or other bonus-damage modifiers apply;
- what objects are affected;
- how much damage each affected object receives.

The modifier should apply before damage is marked on units.

For Tibbers, the resolver should collect all units at battlefields, then apply the final damage amount to each affected unit:

- base amount: 3
- applicable bonus damage: +1
- final amount per affected unit: 4

Do not fix Tibbers by hardcoding Tibbers to deal 4. Fix the shared damage modifier pipeline so Annie, Fiery modifies any eligible damage source controlled by the player.

### Regression checks

1. Annie, Fiery + Disintegrate.
   - Expected: selected unit receives 4 damage.
2. Annie, Fiery + Tibbers.
   - Expected: each affected unit at battlefields receives 4 damage.
3. Tibbers without Annie, Fiery.
   - Expected: each affected unit at battlefields receives 3 damage.
4. Annie, Fiery should not change source behavior.
   - Expected: Tibbers still does not ask for targets; it affects the automatic group and only changes the damage amount.
5. Multi-unit battlefield state.
   - Expected: if Tibbers affects multiple units, each affected unit receives 4 damage, not a shared total of 4 split between units.

---

## 3. Morbid Return only allows selecting the top Trash card

**Screenshot:** `image(116).png`

### Title

Morbid Return only allows selecting the top Trash card instead of any eligible unit in Trash.

### Observed behavior

When Morbid Return resolves, the Player Trash overlay is visible and contains multiple cards.

However, the selection behavior appears to only allow the top / first visible Trash card to be selected, and only if that top card is a unit.

If the top Trash card is not the unit the player wants, or if other valid units are deeper in the Trash, those valid unit cards cannot be selected.

### Expected behavior

Morbid Return should allow the player to choose any eligible unit card from their Trash, regardless of its visual position in the Trash overlay.

The Trash should be treated as an unordered public zone, not as a stack where only the top card is accessible.

Expected sequence:

1. Morbid Return resolves.
2. The game opens a Trash card picker for the correct player.
3. Every unit card in that player’s Trash is shown as eligible.
4. Non-unit cards may be hidden or shown disabled.
5. The player can select any eligible unit from the Trash.
6. After confirmation, the selected unit is returned/resolved according to Morbid Return’s effect.

### Actual problematic behavior

1. Morbid Return resolves.
2. The Trash overlay opens.
3. Only the top / first Trash card can be selected.
4. Other unit cards in Trash are not selectable.
5. The effect becomes dependent on Trash visual order, which should not matter.

### Rule basis

Relevant rules to validate against:

- Rule 107.1.c: each player has a separate Trash.
- Rule 107.1.e: cards in Trash are unordered; their sequence does not matter, and they may be reorganized.
- Rule 107.1.f: cards in Trash are public information.
- Rule 138.1.b: units in Trash retain their properties as unit cards and can be affected by spells and game effects that target units in Trash.

### Important clarification

This should not use the same interaction model as drawing from the top of a deck.

Trash is not a top-card-only zone. Morbid Return should query all cards in the relevant Trash zone and filter by eligibility.

### Likely implementation cause

The current picker is probably reading only:

- the first card in the trash array;
- the visually top card in the Trash stack;
- or the currently previewed card in the temporary Trash overlay.

The fix should separate the visual Trash overlay from the effect-selection source.

### Implementation expectation

Morbid Return should create a source-zone choice with:

- source zone: controller’s Trash;
- eligibility filter: unit cards;
- selection count: 1;
- ordering: irrelevant;
- selectable cards: all eligible unit cards in that Trash.

The selection UI may reuse the Trash overlay visually, but the effect must not depend on the card’s stack position.

### Regression checks

1. Trash has one unit on top.
   - Expected: that unit can be selected.
2. Trash has one unit not on top.
   - Expected: that unit can still be selected.
3. Trash has multiple units.
   - Expected: any unit can be selected.
4. Trash has no units.
   - Expected: Morbid Return should not offer a valid selection, or should resolve with no eligible choice according to the card implementation.
5. Trash has spells, gear, and units.
   - Expected: only units are selectable; other card types are hidden or disabled.

---

## 4. Firestorm is still not playable

**Screenshot:** `image(117).png`

### Title

Firestorm is still not playable because the engine validates selected unit targets instead of the selected battlefield.

### Observed behavior

Firestorm is still not playable.

When attempting to play Firestorm, the game shows the error:

```text
Selected targets are not legal for this action.
```

The board state has enemy units at a battlefield, so Firestorm should have at least one legal battlefield selection. However, the game still rejects the play intent.

### Expected behavior

Firestorm should be playable when there is at least one battlefield containing one or more enemy units.

The player should select the battlefield, not the individual enemy units.

After the battlefield is selected and the spell resolves, Firestorm should automatically collect all enemy units at that selected battlefield and deal 3 damage to each of them.

Expected sequence:

1. Player chooses Firestorm from hand.
2. Game asks the player to choose one battlefield.
3. A valid battlefield is a battlefield that contains at least one enemy unit affected by Firestorm.
4. Player selects that battlefield.
5. Game validates the selected battlefield as the target/choice.
6. Firestorm goes on the Chain.
7. Players exchange priority.
8. Firestorm resolves.
9. Engine finds all enemy units at the selected battlefield.
10. Each affected enemy unit is dealt 3 damage.

### Actual problematic sequence

1. Player chooses Firestorm from hand.
2. The UI or engine still expects selected unit targets, or validates affected units as if they were chosen targets.
3. The play intent is rejected with “Selected targets are not legal for this action.”
4. Firestorm cannot be played.

### Important clarification

This is not a damage-resolution problem yet. Firestorm is failing before it can be committed to the Chain.

The remaining issue is in the play intent / legality validation layer:

- the selected object should be the battlefield;
- enemy units at that battlefield are affected objects;
- affected units should not be submitted or validated as selected targets.

### Rule basis

Relevant rules to validate against:

- Rule 163.5: Battlefields are Locations.
- Rule 163.7: Battlefields can be targeted by spells or game effects.
- Rule 559.3: if a card requires choosing one or more specific game objects, that choice is made when the card is played.
- Rule 559.3.a: this does not include cards that affect game objects based on criteria. The rules distinguish choosing a specific object from affecting objects by criteria.

Firestorm’s “all enemy units at a battlefield” should therefore choose the battlefield/location and then derive the affected units by criteria during resolution, rather than requiring individual enemy-unit targets.

### Likely implementation cause

The catalog or resolver may have been partially updated, but one of these paths still treats Firestorm as unit-targeted:

- playability check;
- target-selection prompt;
- target legality validator;
- play intent payload builder;
- `action.deal_damage` resolver;
- `selector_enemy_unit` clause;
- “all enemy units at selected battlefield” expansion.

The current error suggests that the client/engine is still submitting or validating selected units instead of validating only the selected battlefield.

### Implementation expectation

Firestorm should be modeled as:

```text
source choice:
- choose 1 battlefield

battlefield legality:
- battlefield contains at least 1 enemy unit for the spell controller

resolution:
- collect all enemy units at the selected battlefield
- deal 3 damage to each collected unit
```

It should not require:

- choosing enemy units one by one;
- `minimumCount` / `maximumCount` over enemy units;
- a selected unit target payload;
- target validation for individual enemy units before the spell is committed.

Do not patch the error message or make Firestorm bypass validation. Fix the target model so the only selected target/choice is the battlefield, and affected units are expanded from that battlefield during resolution.

### Regression checks

1. Enemy unit at one battlefield.
   - Expected: Firestorm can select that battlefield and is playable.
2. Enemy units at both battlefields.
   - Expected: player chooses one battlefield; only enemy units at that battlefield are affected.
3. Battlefield has only friendly units.
   - Expected: that battlefield is not a legal Firestorm choice.
4. Battlefield has no units.
   - Expected: that battlefield is not a legal Firestorm choice.
5. Selected battlefield has multiple enemy units.
   - Expected: each enemy unit receives 3 damage.
6. Selected battlefield has friendly and enemy units.
   - Expected: only enemy units are affected.
7. No battlefield has enemy units.
   - Expected: Firestorm is not playable.

---

## Suggested milestone split

### Milestone 1 — Showdown/Chain state restoration

Fix the parent-flow restoration issue for move-trigger Chains so Focus returns to the correct player after Chain resolution.

Commit message suggestion:

```text
fix: preserve showdown focus after move-trigger chain resolution
```

### Milestone 2 — Shared damage modifier pipeline

Move Annie, Fiery bonus damage application into the shared damage resolver so it applies to eligible spell and ability damage sources, including Tibbers.

Commit message suggestion:

```text
fix: apply bonus damage to triggered ability damage sources
```

### Milestone 3 — Trash source-zone selection

Fix Morbid Return and any similar source-zone choices so they query every eligible card in Trash instead of only the top/visible card.

Commit message suggestion:

```text
fix: allow selecting any eligible unit from trash
```

### Milestone 4 — Firestorm target model

Fix Firestorm playability by treating the selected object as the battlefield and expanding affected enemy units during resolution.

Commit message suggestion:

```text
fix: model firestorm as battlefield selection with derived affected units
```

---

## Cross-cutting implementation warning

Do not fix these with card-specific shortcuts unless the current architecture has no shared mechanism available.

These defects point to shared engine responsibilities:

- Chain resolution must restore the correct parent state.
- Damage modifiers must apply in the shared damage pipeline.
- Zone selections must query the full logical zone, not the visual stack.
- Targeting must distinguish selected targets from automatically affected objects.

A correct fix should make future cards safer to implement instead of only making these four visible cases pass.
