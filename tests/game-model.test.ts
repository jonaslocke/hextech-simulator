import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignGameOneStartingPlayerChooser,
  createGame,
  gameSchema
} from "../src/server/match";

test("creates a setup-pending game with initial setup state", () => {
  const game = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    now: "2026-06-12T00:00:00.000Z",
    playerIds: ["player-a", "player-b"],
    rngSeed: "test-seed"
  });

  assert.equal(game.id, "game-1");
  assert.equal(game.matchId, "match-1");
  assert.equal(game.gameNumber, 1);
  assert.equal(game.status, "setup_pending");
  assert.equal(game.stateVersion, 0);
  assert.equal(game.winnerPlayerId, null);
  assert.deepEqual(game.canonicalState.rng, {
    seed: "test-seed",
    rngAlgorithm: "seedrandom",
    rngStep: 0
  });
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

test("assigns game 1 starting-player chooser by seeded RNG", () => {
  const firstGame = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "chooser-seed"
  });
  const secondGame = createGame({
    id: "game-2",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "chooser-seed"
  });

  const first = assignGameOneStartingPlayerChooser(
    firstGame,
    "2026-06-12T01:00:00.000Z"
  );
  const second = assignGameOneStartingPlayerChooser(
    secondGame,
    "2026-06-12T01:00:00.000Z"
  );

  assert.equal(
    first.game.canonicalState.setup.startingPlayerChooserId,
    second.game.canonicalState.setup.startingPlayerChooserId
  );
  assert.equal(first.game.stateVersion, 1);
  assert.equal(first.game.updatedAt, "2026-06-12T01:00:00.000Z");
  assert.equal(first.game.canonicalState.rng.rngStep, 1);
  assert.equal(first.randomOperation.seed, "chooser-seed");
  assert.equal(first.randomOperation.rngAlgorithm, "seedrandom");
  assert.equal(first.randomOperation.rngStep, 0);
  assert.equal(first.randomOperation.purpose, "game-1-starting-player-chooser");
  assert.ok(
    ["player-a", "player-b"].includes(
      first.game.canonicalState.setup.startingPlayerChooserId!
    )
  );
});

test("rejects assigning game 1 starting-player chooser twice", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "chooser-seed"
  });

  const result = assignGameOneStartingPlayerChooser(game);

  assert.throws(
    () => assignGameOneStartingPlayerChooser(result.game),
    /already been assigned/
  );
});

test("rejects RNG chooser assignment outside game 1", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 2,
    playerIds: ["player-a", "player-b"],
    rngSeed: "chooser-seed"
  });

  assert.throws(() => assignGameOneStartingPlayerChooser(game), /Only game 1/);
});
