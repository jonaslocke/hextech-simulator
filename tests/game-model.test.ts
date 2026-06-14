import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignGameOneStartingPlayerChooser,
  assignPreviousGameLoserStartingPlayerChooser,
  chooseStartingPlayer,
  createGame,
  type Game,
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

test("assigns game 2 starting-player chooser as previous game loser", () => {
  const previousGame = completeGame(
    createGame({
      id: "game-1",
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );
  const game = createGame({
    id: "game-2",
    matchId: "match-1",
    gameNumber: 2,
    playerIds: ["player-a", "player-b"]
  });

  const result = assignPreviousGameLoserStartingPlayerChooser(
    game,
    previousGame,
    "2026-06-12T02:00:00.000Z"
  );

  assert.equal(result.previousGameLoserId, "player-b");
  assert.equal(result.game.canonicalState.setup.startingPlayerChooserId, "player-b");
  assert.equal(result.game.stateVersion, 1);
  assert.equal(result.game.updatedAt, "2026-06-12T02:00:00.000Z");
  assert.equal(result.game.canonicalState.rng.rngStep, 0);
});

test("assigns game 3 starting-player chooser as game 2 loser", () => {
  const previousGame = completeGame(
    createGame({
      id: "game-2",
      matchId: "match-1",
      gameNumber: 2,
      playerIds: ["player-a", "player-b"]
    }),
    "player-b"
  );
  const game = createGame({
    id: "game-3",
    matchId: "match-1",
    gameNumber: 3,
    playerIds: ["player-a", "player-b"]
  });

  const result = assignPreviousGameLoserStartingPlayerChooser(game, previousGame);

  assert.equal(result.previousGameLoserId, "player-a");
  assert.equal(result.game.canonicalState.setup.startingPlayerChooserId, "player-a");
});

test("rejects previous game loser chooser assignment for non-sequential games", () => {
  const previousGame = completeGame(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );
  const game = createGame({
    matchId: "match-1",
    gameNumber: 3,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(
    () => assignPreviousGameLoserStartingPlayerChooser(game, previousGame),
    /immediately precede/
  );
});

test("rejects previous game loser chooser assignment without a completed winner", () => {
  const previousGame = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });
  const game = createGame({
    matchId: "match-1",
    gameNumber: 2,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(
    () => assignPreviousGameLoserStartingPlayerChooser(game, previousGame),
    /complete with a winner/
  );
});

test("rejects previous game loser chooser assignment for different players", () => {
  const previousGame = completeGame(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );
  const game = createGame({
    matchId: "match-1",
    gameNumber: 2,
    playerIds: ["player-a", "player-c"]
  });

  assert.throws(
    () => assignPreviousGameLoserStartingPlayerChooser(game, previousGame),
    /same players/
  );
});

test("lets the assigned chooser choose either player as starting player", () => {
  const game = withStartingPlayerChooser(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );

  const result = chooseStartingPlayer(game, {
    actorPlayerId: "player-a",
    startingPlayerId: "player-b",
    now: "2026-06-12T03:00:00.000Z"
  });

  assert.equal(result.canonicalState.setup.startingPlayerId, "player-b");
  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.equal(result.updatedAt, "2026-06-12T03:00:00.000Z");
});

test("rejects starting player choice before chooser assignment", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(
    () =>
      chooseStartingPlayer(game, {
        actorPlayerId: "player-a",
        startingPlayerId: "player-a"
      }),
    /chooser has not been assigned/
  );
});

test("rejects starting player choice from non-chooser", () => {
  const game = withStartingPlayerChooser(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );

  assert.throws(
    () =>
      chooseStartingPlayer(game, {
        actorPlayerId: "player-b",
        startingPlayerId: "player-b"
      }),
    /Only the assigned/
  );
});

test("rejects starting player choice for a non-player", () => {
  const game = withStartingPlayerChooser(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );

  assert.throws(
    () =>
      chooseStartingPlayer(game, {
        actorPlayerId: "player-a",
        startingPlayerId: "player-c"
      }),
    /one of the game players/
  );
});

test("rejects choosing starting player twice", () => {
  const game = withStartingPlayerChooser(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );
  const result = chooseStartingPlayer(game, {
    actorPlayerId: "player-a",
    startingPlayerId: "player-b"
  });

  assert.throws(
    () =>
      chooseStartingPlayer(result, {
        actorPlayerId: "player-a",
        startingPlayerId: "player-a"
      }),
    /already been chosen/
  );
});

test("rejects starting player choice outside setup", () => {
  const game = gameSchema.parse({
    ...withStartingPlayerChooser(
      createGame({
        matchId: "match-1",
        gameNumber: 1,
        playerIds: ["player-a", "player-b"]
      }),
      "player-a"
    ),
    status: "in_progress"
  });

  assert.throws(
    () =>
      chooseStartingPlayer(game, {
        actorPlayerId: "player-a",
        startingPlayerId: "player-a"
      }),
    /during setup/
  );
});

function completeGame(game: Game, winnerPlayerId: string): Game {
  return gameSchema.parse({
    ...game,
    status: "complete",
    winnerPlayerId,
    stateVersion: game.stateVersion + 1
  });
}

function withStartingPlayerChooser(game: Game, chooserId: string): Game {
  return gameSchema.parse({
    ...game,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        startingPlayerChooserId: chooserId
      }
    }
  });
}
