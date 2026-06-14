import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseStartingPlayerIntentSchema,
  commitMulliganIntentSchema,
  lockBattlefieldChoiceIntentSchema
} from "../src/shared/intents";

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

test("validates lock battlefield choice intent payload", () => {
  const result = lockBattlefieldChoiceIntentSchema.parse({
    type: "setup.lockBattlefieldChoice",
    payload: {
      cardInstanceId: "player-a:battlefield:one"
    }
  });

  assert.equal(result.type, "setup.lockBattlefieldChoice");
  assert.equal(result.payload.cardInstanceId, "player-a:battlefield:one");
});

test("rejects malformed lock battlefield choice intent payload", () => {
  assert.equal(
    lockBattlefieldChoiceIntentSchema.safeParse({
      type: "setup.lockBattlefieldChoice",
      payload: {}
    }).success,
    false
  );
});

test("validates commit mulligan intent payload", () => {
  const result = commitMulliganIntentSchema.parse({
    type: "setup.commitMulligan",
    payload: {
      selectedCardInstanceIds: []
    }
  });

  assert.equal(result.type, "setup.commitMulligan");
  assert.deepEqual(result.payload.selectedCardInstanceIds, []);
});

test("rejects commit mulligan intent with more than two selections", () => {
  assert.equal(
    commitMulliganIntentSchema.safeParse({
      type: "setup.commitMulligan",
      payload: {
        selectedCardInstanceIds: ["a1", "a2", "a3"]
      }
    }).success,
    false
  );
});
