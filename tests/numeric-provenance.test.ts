import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveNumericValue, type NumericContribution } from "../src/server/game/numeric-modifiers";
import { gameFixture } from "./helpers/game-fixture";

test("numeric provenance preserves each applied instance and operation order", async () => {
  const { game } = await gameFixture();
  game.state.modifiers = [
    { id: "first", sourceCardInstanceId: "source", targetCardInstanceId: "unit", attribute: "might", targetScope: "source", operation: "increase", amount: 2, minimum: null, duration: "thisTurn", createdAtTurn: 1 },
    { id: "second", sourceCardInstanceId: "source", targetCardInstanceId: "unit", attribute: "might", targetScope: "source", operation: "multiply", amount: 2, minimum: null, duration: "thisTurn", createdAtTurn: 1 },
  ];
  const contributions: NumericContribution[] = [];
  const value = effectiveNumericValue({ attribute: "might", baseValue: 3, game, targetCardInstanceId: "unit", targetScope: "source", onContribution: (entry) => contributions.push(entry) });
  assert.equal(value, 10);
  assert.deepEqual(contributions.map((entry) => [entry.id, entry.amount]), [["first", 2], ["second", 5]]);
});
