import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseStartingPlayerIntentSchema,
  commitMulliganIntentSchema,
  lockBattlefieldChoiceIntentSchema,
  matchIntentRequestBodySchema
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

test("validates HTTP match intent request body without route match id", () => {
  const result = matchIntentRequestBodySchema.parse({
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: 3,
    intent: {
      type: "setup.commitMulligan",
      payload: {
        selectedCardInstanceIds: []
      }
    }
  });

  assert.equal(result.gameId, "game-1");
  assert.equal(result.playerToken, "token-a");
  assert.equal(result.stateVersion, 3);
});

test("rejects HTTP match intent request body with malformed intent", () => {
  assert.equal(
    matchIntentRequestBodySchema.safeParse({
      playerToken: "token-a",
      stateVersion: 3,
      intent: {
        payload: {}
      }
    }).success,
    false
  );
});
