## Master Yi deck regressions / behavior gaps

After implementing the Master Yi deck, I found three issues that need investigation and fixes. Please validate using only `docs/riftbound_core_rules_reference.md` and the local card data. Do not search online.

### 1. Highlander sometimes recall replacement keeps damage on the protected unit

**Card involved:** Highlander  
**Current behavior:** When Highlander replaces a unit death, the unit is recalled exhausted, but the damage state appears to remain on the unit after it returns to base.

**Expected behavior:** When Highlander prevents the death and recalls the unit exhausted, the unit should no longer keep the damage that caused the lethal state. The recalled unit should not remain in a state where the same marked damage can immediately kill it again or continue being displayed as damaged.

**Why this matters:** Highlander is a death replacement effect. Once it replaces the death and moves the unit back to base exhausted, the protected unit should be stable after resolution.

**Please check:**

- The Highlander replacement effect resolution.
- Whether recall execution clears damage correctly for this replacement path.
- Whether lethal-death bookkeeping is still being tracked after the replacement is consumed.
- Whether the projection still shows stale damage after the server state was corrected.

---

### 2. Meditation optional-cost selector is too generic

**Card involved:** Meditation  
**Current behavior:** When Meditation asks for its optional cost, the board selector feels too generic. It is not clear enough that the selected unit is being chosen as an optional cost, not as the spell target/effect target.

**Expected behavior:** The prompt should clearly communicate the optional-cost decision:

- The player may decline the optional cost and draw 1.
- Or the player may choose one ready friendly unit to exhaust as the optional cost and draw 2.
- Only legal optional-cost candidates should be selectable/highlighted.
- The UI should not look like a generic “choose a card on board” target prompt.

**Suggested prompt wording:**
`Meditation — Optional Cost: Exhaust a ready friendly unit to draw 2. Decline to draw 1 instead.`

**Please check:**

- Whether Meditation’s selector is projected with enough metadata to distinguish `optionalCost` from a normal `target`.
- Whether `CardSelectionPrompt` / board selection UI can display the selection purpose.
- Whether enemy units, exhausted friendly units, and invalid board objects are excluded from selection.
- Whether the submit/decline actions are clear to the player.

---

### 3. Stupefy is not reducing Stalwart Poro’s combat Might under Wuju Bladesman

later note: this is happening in more cases, basically whenever Wuju Blademaster would add might to a unit it reset to the base might.

**Cards involved:** Stalwart Poro, Wuju Bladesman - Starter, Stupefy  
**Scenario:**

1. Player 1 controls Wuju Bladesman - Starter.
2. Player 1 has Stalwart Poro at a battlefield.
3. Player 2 plays Stupefy targeting Stalwart Poro.
4. Player 2 attacks that same battlefield.
5. Stalwart Poro is the only defending friendly unit.

**Expected Might calculation:**

- Stalwart Poro base Might: `2`
- Shield while defending: `+1`
- Wuju Bladesman while friendly unit defends alone: `+2`
- Stupefy this turn: `-1`
- Expected current Might: `2 + 1 + 2 - 1 = 4`

**Current behavior:** The UI shows Stalwart Poro as `5` Might during the showdown, as if Stupefy’s `-1` modifier was not applied.

**Expected behavior:** Stalwart Poro should show and contribute `4` Might during combat.

**Please check:**

- Whether Stupefy’s temporary Might modifier is being persisted on the selected unit.
- Whether combat Might recomputation includes negative temporary modifiers after the reaction chain resolves.
- Whether the Showdown locks combat totals before Stupefy is applied.
- Whether the UI projection is reading a stale or pre-modifier Might value.
- Whether modifier ordering/minimum handling is incorrectly ignoring the `-1` modifier.

### 4. Yi, Meditative 8+ rune Might bonus is not recalculated immediately

**Card involved:** Yi, Meditative

**Current behavior:** Yi, Meditative does not immediately receive its `+4 Might` bonus when its controller reaches `8+` runes on the board/base.

In state `86`, Player 2 has `9/9` runes on board, but Yi, Meditative is still displayed as `4` Might.

Later, in state `91`, after the board changed and there were fewer units on the battlefield, Yi, Meditative correctly displays as `8` Might.

This suggests the effect is not necessarily missing from the behavior model. Instead, the conditional Might modifier appears to be stale and only recalculated after some later unrelated board-state update.

**Expected behavior:** Yi, Meditative should immediately show and calculate as `8` Might as soon as its controller has 8 or more runes on board.

**Expected Might calculation:**

- Yi, Meditative base Might: `4`
- Yi, Meditative condition: `+4` while controller has `8+` runes
- Expected current Might with 9 runes: `8`

**Observed behavior:**

- State `86`: Player 2 has `9/9` runes, but Yi shows `4` Might.
- State `91`: Player 2 still has `9/9` runes, and Yi now shows `8` Might.
- The change from `4` to `8` happened later, after other board changes, not immediately when the rune threshold was already satisfied.

**Please check:**

- Whether conditional Might modifiers are recomputed when rune count changes.
- Whether board rune count changes invalidate any cached/computed Might values.
- Whether Yi’s condition is only recomputed when units move, enter, leave, or when combat state changes.
- Whether the projection is memoizing `currentMight` without including the player’s rune count as a dependency.
- Whether the condition is checking the correct player: Yi’s controller, not the active player, viewer, or opponent.
- Whether the card preview and the board badge use the same computed Might source.
- Whether there is a difference between printed/base Might and projected/current Might in the UI.

**Acceptance criteria:**

- With 0–7 runes on board, Yi, Meditative shows `4` Might.
- As soon as the controller reaches 8+ runes, Yi immediately shows `8` Might without requiring any unrelated board change.
- If the controller drops below 8 runes, Yi immediately returns to `4` Might.
- The result is consistent in the board badge, card preview, combat calculation, and any legal-action calculation that depends on Might.
- This works whether Yi is in base or at a battlefield.

### 5. Triggered ability Chain priority starts with the wrong player

**Card involved:** Lady of Luminosity - Starter

**Scenario:**

1. There is at least one unit at a battlefield, but no showdown is happening.
2. Lux player casts a spell that costs 5 or more.
3. Lady of Luminosity - Starter triggers from that spell.
4. Opponent reacts to the spell.
5. Both players pass priority until the reaction resolves.
6. The Chain reaches Lady of Luminosity’s triggered ability.

**Expected behavior:**
When Lady of Luminosity’s triggered ability is the next item on the Chain, the Lux player should receive priority first, because the Lux player controls the next / most recent Chain item.

After the Lux player passes, priority should move to the opponent.

**Current behavior:**
The opponent receives priority first while Lady of Luminosity’s triggered ability is the next Chain item.

In the screenshot, Lady of Luminosity is controlled by the Lux player, but the opponent side has the active `Pass and Resolve` button while the Lux player side is waiting.

**Rules basis:**

- Lady of Luminosity triggers when its controller plays a spell that costs 5 or more.
- Triggered abilities are added to the Chain after the triggering card resolves or while the Chain is progressing.
- After resolving a Chain item, the player who controls the most recent item on the Chain becomes the Active Player.
- In a Closed State, the player who controls the next item on the Chain receives priority.

**Why this is wrong:**
The implementation appears to continue priority from the previous passer / next relevant player instead of resetting priority to the controller of the next Chain item after a triggered ability is added.

**Please check:**

- The path that adds `card.played` triggered abilities after a spell resolves.
- The path that creates a new Chain when the resolved spell was the only remaining Chain item.
- Whether `priorityPlayerId` is set before or after queued triggered abilities are drained.
- Whether new triggered Chain items inherit priority from the previous player instead of using the triggered ability controller.
- Whether `priorityPlayerId` should always be reset to `chain.items.at(-1).controllerPlayerId` after triggered abilities are added to the Chain.
- Whether the projection is showing stale priority even if server state is correct.

**Acceptance criteria:**

- When Lady of Luminosity’s triggered ability is next on the Chain, the Lux player receives priority first.
- The opponent receives priority only after the Lux player passes.
- This works whether the trigger is added to an existing Chain or creates a new Chain after the original spell resolves.
- This works outside showdown and inside showdown, without breaking Focus rules.
