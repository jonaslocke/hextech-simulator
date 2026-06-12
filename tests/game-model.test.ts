import assert from "node:assert/strict";
import { test } from "node:test";
import { createGame, gameSchema } from "../src/server/match";

test("creates a setup-pending game with initial setup state", () => {
  const game = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    now: "2026-06-12T00:00:00.000Z",
    playerIds: ["player-a", "player-b"]
  });

  assert.equal(game.id, "game-1");
  assert.equal(game.matchId, "match-1");
  assert.equal(game.gameNumber, 1);
  assert.equal(game.status, "setup_pending");
  assert.equal(game.stateVersion, 0);
  assert.equal(game.winnerPlayerId, null);
  assert.deepEqual(game.canonicalState.setup.playerIds, ["player-a", "player-b"]);
  assert.equal(game.canonicalState.setup.startingPlayerChooserId, null);
  assert.equal(game.canonicalState.setup.startingPlayerId, null);
  assert.doesNotThrow(() => gameSchema.parse(game));
});

test("creates unlocked battlefield choice slots for both players", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  assert.deepEqual(game.canonicalState.setup.battlefieldChoices, {
    "player-a": {
      playerId: "player-a",
      status: "unlocked",
      cardInstanceId: null,
      lockedAt: null,
      revealedAt: null
    },
    "player-b": {
      playerId: "player-b",
      status: "unlocked",
      cardInstanceId: null,
      lockedAt: null,
      revealedAt: null
    }
  });
});

test("rejects a game with duplicate player ids", () => {
  assert.throws(
    () =>
      createGame({
        matchId: "match-1",
        gameNumber: 1,
        playerIds: ["player-a", "player-a"]
      }),
    /same playerId/
  );
});

test("rejects unsupported game numbers", () => {
  assert.throws(() =>
    createGame({
      matchId: "match-1",
      gameNumber: 4,
      playerIds: ["player-a", "player-b"]
    })
  );
});
