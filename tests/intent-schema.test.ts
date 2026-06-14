import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseStartingPlayerIntentSchema } from "../src/shared/intents";

test("validates choose starting player intent payload", () => {
  const result = chooseStartingPlayerIntentSchema.parse({
    type: "setup.chooseStartingPlayer",
    payload: {
      startingPlayerId: "player-a"
    }
  });

  assert.equal(result.type, "setup.chooseStartingPlayer");
  assert.equal(result.payload.startingPlayerId, "player-a");
});

test("rejects malformed choose starting player intent payload", () => {
  assert.equal(
    chooseStartingPlayerIntentSchema.safeParse({
      type: "setup.chooseStartingPlayer",
      payload: {}
    }).success,
    false
  );
});
