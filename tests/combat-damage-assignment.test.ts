import assert from "node:assert/strict";
import { test } from "node:test";
import { autoAssignCombatDamage, type CombatDamageAssignmentTarget } from "../src/features/game-board/combat-damage-assignment";

const target = (unitId: string, lethalAmount: number, priorityOrder = 1): CombatDamageAssignmentTarget => ({ unitId, lethalAmount, priorityOrder });

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

test("insufficient damage preserves the first-recipient fallback rather than sorting by Might", () => {
  assert.deepEqual(autoAssignCombatDamage(2, [target("first", 5), target("second", 3)]), [{ targetUnitId: "first", amount: 2 }]);
});

test("lethal ties preserve original recipient order rather than maximizing kills", () => {
  const targets = [target("first", 3), target("second", 2), target("third", 1)];
  assert.deepEqual(autoAssignCombatDamage(3, targets), [{ targetUnitId: "first", amount: 3 }]);
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

test("lethal selection is reconsidered after each assignment and partial damage falls back to the first remaining recipient", () => {
  const targets = [target("first", 3), target("large", 5), target("small", 2)];
  assert.deepEqual(autoAssignCombatDamage(5, targets), [
    { targetUnitId: "first", amount: 3 }, { targetUnitId: "small", amount: 2 },
  ]);
  assert.deepEqual(autoAssignCombatDamage(6, targets), [
    { targetUnitId: "first", amount: 3 }, { targetUnitId: "small", amount: 2 }, { targetUnitId: "large", amount: 1 },
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
