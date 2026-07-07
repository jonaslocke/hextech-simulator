## Master Yi deck regressions / behavior gaps

After implementing the Master Yi deck, I found three issues that need investigation and fixes. Please validate using only `docs/riftbound_core_rules_reference.md` and the local card data. Do not search online.

### 1. Highlander recall replacement keeps damage on the protected unit

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
