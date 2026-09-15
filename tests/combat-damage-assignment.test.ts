import assert from "node:assert/strict";
import { test } from "node:test";
import { autoAssignCombatDamage, compareCombatDamageTargets, type CombatDamageAssignmentTarget } from "../src/features/game-board/combat-damage-assignment";

const target = (unitId: string, lethalAmount: number, priorityOrder = 1): CombatDamageAssignmentTarget => ({ unitId, lethalAmount, priorityOrder });

test("auto-assignment deals lethal damage from weakest to strongest and puts excess on the strongest", () => {
  const targets = [target("strongest", 8), target("weakest", 3), target("middle", 5), target("equal-first", 4), target("equal-second", 4)];
  assert.deepEqual(autoAssignCombatDamage(26, targets), [
    { targetUnitId: "weakest", amount: 3 },
    { targetUnitId: "equal-first", amount: 4 },
    { targetUnitId: "equal-second", amount: 4 },
    { targetUnitId: "middle", amount: 5 },
    { targetUnitId: "strongest", amount: 10 },
  ]);
  assert.deepEqual(autoAssignCombatDamage(7, targets), [
    { targetUnitId: "weakest", amount: 3 },
    { targetUnitId: "equal-first", amount: 4 },
  ]);
});

test("auto-assignment selects an available lethal recipient before a nonlethal fallback in the same priority group", () => {
  assert.deepEqual(autoAssignCombatDamage(3, [target("defender-large", 5), target("defender-small", 3)]), [
    { targetUnitId: "defender-small", amount: 3 },
  ]);
});

test("auto-assignment preserves the single-target and empty-combat defaults", () => {
  assert.deepEqual(autoAssignCombatDamage(7, [target("only", 2)]), [{ targetUnitId: "only", amount: 7 }]);
  assert.deepEqual(autoAssignCombatDamage(0, [target("only", 2)]), []);
  assert.deepEqual(autoAssignCombatDamage(0, []), []);
});

test("insufficient damage is assigned to the weakest recipient", () => {
  assert.deepEqual(autoAssignCombatDamage(2, [target("first", 5), target("second", 3)]), [{ targetUnitId: "second", amount: 2 }]);
});

test("weaker recipients receive lethal before stronger recipients", () => {
  const targets = [target("first", 3), target("second", 2), target("third", 1)];
  assert.deepEqual(autoAssignCombatDamage(3, targets), [{ targetUnitId: "third", amount: 1 }, { targetUnitId: "second", amount: 2 }]);
  assert.deepEqual(autoAssignCombatDamage(3, targets), autoAssignCombatDamage(3, targets));
});

test("Tank is exhausted before standard recipients even when bypassing it could kill a unit", () => {
  assert.deepEqual(autoAssignCombatDamage(3, [target("tank", 5, 0), target("standard", 3)]), [{ targetUnitId: "tank", amount: 3 }]);
  assert.deepEqual(autoAssignCombatDamage(5, [target("tank", 3, 0), target("standard", 2)]), [
    { targetUnitId: "tank", amount: 3 }, { targetUnitId: "standard", amount: 2 },
  ]);
});

test("standard recipients precede Backline and excess damage stays on the last recipient", () => {
  assert.deepEqual(autoAssignCombatDamage(3, [target("standard", 5), target("backline", 1, 2)]), [{ targetUnitId: "standard", amount: 3 }]);
  assert.deepEqual(autoAssignCombatDamage(10, [target("tank", 2, 0), target("standard", 3), target("backline", 1, 2)]), [
    { targetUnitId: "tank", amount: 2 }, { targetUnitId: "standard", amount: 3 }, { targetUnitId: "backline", amount: 5 },
  ]);
});

test("auto-assignment uses projected remaining lethal damage without recalculating Might", () => {
  assert.deepEqual(autoAssignCombatDamage(4, [target("damaged", 2), target("undamaged", 3)]), [
    { targetUnitId: "damaged", amount: 2 }, { targetUnitId: "undamaged", amount: 2 },
  ]);
});

test("weakest-first allocation assigns a partial remainder only after weaker recipients receive lethal", () => {
  const targets = [target("first", 3), target("large", 5), target("small", 2)];
  assert.deepEqual(autoAssignCombatDamage(5, targets), [
    { targetUnitId: "small", amount: 2 }, { targetUnitId: "first", amount: 3 },
  ]);
  assert.deepEqual(autoAssignCombatDamage(6, targets), [
    { targetUnitId: "small", amount: 2 }, { targetUnitId: "first", amount: 3 }, { targetUnitId: "large", amount: 1 },
  ]);
});

test("display ordering is weakest-first within priority groups with stable equal-strength ties", () => {
  const targets = [target("backline", 1, 2), target("large-tank", 5, 0), target("equal-first", 4), target("small-tank", 2, 0), target("weak", 3), target("equal-second", 4)];
  assert.deepEqual([...targets].sort(compareCombatDamageTargets).map(({ unitId }) => unitId), [
    "small-tank", "large-tank", "weak", "equal-first", "equal-second", "backline",
  ]);
  assert.deepEqual(autoAssignCombatDamage(4, [target("equal-first", 4), target("equal-second", 4)]), [
    { targetUnitId: "equal-first", amount: 4 },
  ]);
});

test("multiple Tanks may be reordered for lethal but every Tank still precedes standard recipients", () => {
  const targets = [target("large-tank", 5, 0), target("small-tank", 2, 0), target("standard", 1)];
  assert.deepEqual(autoAssignCombatDamage(3, targets), [
    { targetUnitId: "small-tank", amount: 2 }, { targetUnitId: "large-tank", amount: 1 },
  ]);
});

test("auto-assignment respects priority without mutating the display order or its input", () => {
  const targets = Object.freeze([Object.freeze(target("backline", 1, 2)), Object.freeze(target("standard", 2)), Object.freeze(target("tank", 3, 0))]);
  assert.deepEqual(autoAssignCombatDamage(6, targets), [
    { targetUnitId: "tank", amount: 3 }, { targetUnitId: "standard", amount: 2 }, { targetUnitId: "backline", amount: 1 },
  ]);
  assert.deepEqual(targets.map((target) => target.unitId), ["backline", "standard", "tank"]);
});
