import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignGameOneStartingPlayerChooser,
  assignPreviousGameLoserStartingPlayerChooser,
  chooseStartingPlayer,
  commitMulligan,
  createGame,
  drawOpeningHands,
  lockBattlefieldChoice,
  placeStartingObjects,
  revealBattlefieldChoices,
  shuffleMainDecks,
  shuffleRuneDecks,
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
  assert.deepEqual(game.canonicalState.battlefields, []);
  assert.deepEqual(game.canonicalState.rng, {
    seed: "test-seed",
    rngAlgorithm: "seedrandom",
    rngStep: 0
  });
  assert.deepEqual(game.canonicalState.players, {
    "player-a": {
      playerId: "player-a",
      zones: {
        legend: null,
        champion: null,
        mainDeck: [],
        runeDeck: [],
        hand: [],
        trash: [],
        banishment: [],
        base: []
      }
    },
    "player-b": {
      playerId: "player-b",
      zones: {
        legend: null,
        champion: null,
        mainDeck: [],
        runeDeck: [],
        hand: [],
        trash: [],
        banishment: [],
        base: []
      }
    }
  });
  assert.deepEqual(game.canonicalState.setup.playerIds, ["player-a", "player-b"]);
  assert.equal(game.canonicalState.setup.startingPlayerChooserId, null);
  assert.equal(game.canonicalState.setup.startingPlayerId, null);
  assert.deepEqual(game.canonicalState.setup.battlefieldPools, {
    "player-a": {
      playerId: "player-a",
      registeredCardInstanceIds: [],
      usedCardInstanceIds: []
    },
    "player-b": {
      playerId: "player-b",
      registeredCardInstanceIds: [],
      usedCardInstanceIds: []
    }
  });
  assert.deepEqual(game.canonicalState.setup.mulliganChoices, {
    "player-a": {
      playerId: "player-a",
      status: "unlocked",
      selectedCardInstanceIds: [],
      lockedAt: null
    },
    "player-b": {
      playerId: "player-b",
      status: "unlocked",
      selectedCardInstanceIds: [],
      lockedAt: null
    }
  });
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

test("locks a registered battlefield choice for a player", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    battlefieldCardInstanceIdsByPlayer: {
      "player-a": ["player-a:battlefield:one", "player-a:battlefield:two"],
      "player-b": ["player-b:battlefield:one", "player-b:battlefield:two"]
    }
  });

  const result = lockBattlefieldChoice(game, {
    actorPlayerId: "player-a",
    cardInstanceId: "player-a:battlefield:two",
    now: "2026-06-12T04:00:00.000Z"
  });

  assert.equal(result.stateVersion, 1);
  assert.equal(result.updatedAt, "2026-06-12T04:00:00.000Z");
  assert.deepEqual(result.canonicalState.setup.battlefieldChoices["player-a"], {
    playerId: "player-a",
    status: "locked",
    cardInstanceId: "player-a:battlefield:two",
    lockedAt: "2026-06-12T04:00:00.000Z",
    revealedAt: null
  });
  assert.equal(
    result.canonicalState.setup.battlefieldChoices["player-b"]?.status,
    "unlocked"
  );
});

test("rejects battlefield choice from non-player", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(
    () =>
      lockBattlefieldChoice(game, {
        actorPlayerId: "player-c",
        cardInstanceId: "player-c:battlefield:one"
      }),
    /Only game players/
  );
});

test("rejects unregistered battlefield choice", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    battlefieldCardInstanceIdsByPlayer: {
      "player-a": ["player-a:battlefield:one"]
    }
  });

  assert.throws(
    () =>
      lockBattlefieldChoice(game, {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:battlefield:two"
      }),
    /registered battlefields/
  );
});

test("rejects previously used battlefield choice", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 2,
    playerIds: ["player-a", "player-b"],
    battlefieldCardInstanceIdsByPlayer: {
      "player-a": ["player-a:battlefield:one", "player-a:battlefield:two"]
    },
    usedBattlefieldCardInstanceIdsByPlayer: {
      "player-a": ["player-a:battlefield:one"]
    }
  });

  assert.throws(
    () =>
      lockBattlefieldChoice(game, {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:battlefield:one"
      }),
    /already been used/
  );
});

test("rejects locking battlefield choice twice", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    battlefieldCardInstanceIdsByPlayer: {
      "player-a": ["player-a:battlefield:one", "player-a:battlefield:two"]
    }
  });

  const result = lockBattlefieldChoice(game, {
    actorPlayerId: "player-a",
    cardInstanceId: "player-a:battlefield:one"
  });

  assert.throws(
    () =>
      lockBattlefieldChoice(result, {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:battlefield:two"
      }),
    /already been locked/
  );
});

test("rejects battlefield choice outside setup", () => {
  const game = gameSchema.parse({
    ...createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"],
      battlefieldCardInstanceIdsByPlayer: {
        "player-a": ["player-a:battlefield:one"]
      }
    }),
    status: "in_progress"
  });

  assert.throws(
    () =>
      lockBattlefieldChoice(game, {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:battlefield:one"
      }),
    /during setup/
  );
});

test("reveals battlefield choices after both players lock", () => {
  const game = lockBattlefieldChoice(
    lockBattlefieldChoice(
      createGame({
        matchId: "match-1",
        gameNumber: 1,
        playerIds: ["player-a", "player-b"],
        battlefieldCardInstanceIdsByPlayer: {
          "player-a": ["player-a:battlefield:one", "player-a:battlefield:two"],
          "player-b": ["player-b:battlefield:one", "player-b:battlefield:two"]
        }
      }),
      {
        actorPlayerId: "player-a",
        cardInstanceId: "player-a:battlefield:one"
      }
    ),
    {
      actorPlayerId: "player-b",
      cardInstanceId: "player-b:battlefield:two"
    }
  );

  const result = revealBattlefieldChoices(game, "2026-06-12T05:00:00.000Z");

  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.equal(result.updatedAt, "2026-06-12T05:00:00.000Z");
  assert.equal(
    result.canonicalState.setup.battlefieldChoices["player-a"]?.status,
    "revealed"
  );
  assert.equal(
    result.canonicalState.setup.battlefieldChoices["player-b"]?.status,
    "revealed"
  );
  assert.equal(
    result.canonicalState.setup.battlefieldChoices["player-a"]?.revealedAt,
    "2026-06-12T05:00:00.000Z"
  );
  assert.deepEqual(
    result.canonicalState.setup.battlefieldPools["player-a"]?.usedCardInstanceIds,
    ["player-a:battlefield:one"]
  );
  assert.deepEqual(
    result.canonicalState.setup.battlefieldPools["player-b"]?.usedCardInstanceIds,
    ["player-b:battlefield:two"]
  );
});

test("rejects battlefield reveal before both players lock", () => {
  const game = lockBattlefieldChoice(
    createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"],
      battlefieldCardInstanceIdsByPlayer: {
        "player-a": ["player-a:battlefield:one"],
        "player-b": ["player-b:battlefield:one"]
      }
    }),
    {
      actorPlayerId: "player-a",
      cardInstanceId: "player-a:battlefield:one"
    }
  );

  assert.throws(() => revealBattlefieldChoices(game), /Both players must lock/);
});

test("rejects battlefield reveal outside setup", () => {
  const game = gameSchema.parse({
    ...lockBattlefieldChoice(
      lockBattlefieldChoice(
        createGame({
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"],
          battlefieldCardInstanceIdsByPlayer: {
            "player-a": ["player-a:battlefield:one"],
            "player-b": ["player-b:battlefield:one"]
          }
        }),
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:battlefield:one"
        }
      ),
      {
        actorPlayerId: "player-b",
        cardInstanceId: "player-b:battlefield:one"
      }
    ),
    status: "in_progress"
  });

  assert.throws(() => revealBattlefieldChoices(game), /during setup/);
});

test("shuffles main decks deterministically with seeded RNG", () => {
  const firstGame = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "shuffle-seed",
    mainDeckCardInstanceIdsByPlayer: {
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    }
  });
  const secondGame = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "shuffle-seed",
    mainDeckCardInstanceIdsByPlayer: {
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    }
  });

  const first = shuffleMainDecks(firstGame, "2026-06-12T06:00:00.000Z");
  const second = shuffleMainDecks(secondGame, "2026-06-12T06:00:00.000Z");

  assert.deepEqual(
    first.game.canonicalState.players["player-a"]?.zones.mainDeck,
    second.game.canonicalState.players["player-a"]?.zones.mainDeck
  );
  assert.deepEqual(
    first.game.canonicalState.players["player-b"]?.zones.mainDeck,
    second.game.canonicalState.players["player-b"]?.zones.mainDeck
  );
  assert.notDeepEqual(
    first.game.canonicalState.players["player-a"]?.zones.mainDeck,
    ["a1", "a2", "a3", "a4"]
  );
  assert.deepEqual(first.game.canonicalState.players["player-a"]?.zones.runeDeck, []);
  assert.equal(first.game.stateVersion, 1);
  assert.equal(first.game.updatedAt, "2026-06-12T06:00:00.000Z");
  assert.equal(first.randomOperations.length, 2);
  assert.equal(first.randomOperations[0]?.purpose, "shuffle-main-deck:player-a");
  assert.equal(first.randomOperations[1]?.purpose, "shuffle-main-deck:player-b");
  assert.equal(first.game.canonicalState.rng.rngStep, 6);
});

test("shuffles rune decks deterministically after current RNG step", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "shuffle-seed",
    runeDeckCardInstanceIdsByPlayer: {
      "player-a": ["ar1", "ar2", "ar3"],
      "player-b": ["br1", "br2", "br3"]
    }
  });

  const result = shuffleRuneDecks(game);

  assert.equal(result.randomOperations.length, 2);
  assert.equal(result.randomOperations[0]?.purpose, "shuffle-rune-deck:player-a");
  assert.equal(result.randomOperations[1]?.purpose, "shuffle-rune-deck:player-b");
  assert.equal(result.game.canonicalState.rng.rngStep, 4);
  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.mainDeck, []);
  assert.equal(
    result.game.canonicalState.players["player-a"]?.zones.runeDeck.length,
    3
  );
});

test("rejects deck shuffling outside setup", () => {
  const game = gameSchema.parse({
    ...createGame({
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    status: "in_progress"
  });

  assert.throws(() => shuffleMainDecks(game), /during setup/);
  assert.throws(() => shuffleRuneDecks(game), /during setup/);
});

test("places revealed battlefields, legends, and champions into starting zones", () => {
  const game = revealBattlefieldChoices(
    lockBattlefieldChoice(
      lockBattlefieldChoice(
        createGame({
          id: "game-1",
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"],
          mainDeckCardInstanceIdsByPlayer: {
            "player-a": ["a1", "a2"],
            "player-b": ["b1", "b2"]
          },
          runeDeckCardInstanceIdsByPlayer: {
            "player-a": ["ar1", "ar2"],
            "player-b": ["br1", "br2"]
          },
          battlefieldCardInstanceIdsByPlayer: {
            "player-a": ["player-a:battlefield:one"],
            "player-b": ["player-b:battlefield:one"]
          }
        }),
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:battlefield:one"
        }
      ),
      {
        actorPlayerId: "player-b",
        cardInstanceId: "player-b:battlefield:one"
      }
    )
  );

  const result = placeStartingObjects(game, {
    legendCardInstanceIdsByPlayer: {
      "player-a": "player-a:legend:one",
      "player-b": "player-b:legend:one"
    },
    championCardInstanceIdsByPlayer: {
      "player-a": "player-a:champion:one",
      "player-b": "player-b:champion:one"
    },
    now: "2026-06-12T07:00:00.000Z"
  });

  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.equal(result.updatedAt, "2026-06-12T07:00:00.000Z");
  assert.equal(
    result.canonicalState.players["player-a"]?.zones.legend,
    "player-a:legend:one"
  );
  assert.equal(
    result.canonicalState.players["player-b"]?.zones.champion,
    "player-b:champion:one"
  );
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.mainDeck, [
    "a1",
    "a2"
  ]);
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.runeDeck, [
    "ar1",
    "ar2"
  ]);
  assert.deepEqual(result.canonicalState.battlefields, [
    {
      battlefieldId: "game-1:battlefield:player-a",
      selectedByPlayerId: "player-a",
      cardInstanceId: "player-a:battlefield:one",
      units: [],
      facedownSlot: null
    },
    {
      battlefieldId: "game-1:battlefield:player-b",
      selectedByPlayerId: "player-b",
      cardInstanceId: "player-b:battlefield:one",
      units: [],
      facedownSlot: null
    }
  ]);
});

test("rejects starting object placement before battlefield reveal", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(
    () =>
      placeStartingObjects(game, {
        legendCardInstanceIdsByPlayer: {
          "player-a": "player-a:legend:one",
          "player-b": "player-b:legend:one"
        },
        championCardInstanceIdsByPlayer: {
          "player-a": "player-a:champion:one",
          "player-b": "player-b:champion:one"
        }
      }),
    /Battlefields must be revealed/
  );
});

test("rejects starting object placement with missing legend or champion", () => {
  const game = revealBattlefieldChoices(
    lockBattlefieldChoice(
      lockBattlefieldChoice(
        createGame({
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"],
          battlefieldCardInstanceIdsByPlayer: {
            "player-a": ["player-a:battlefield:one"],
            "player-b": ["player-b:battlefield:one"]
          }
        }),
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:battlefield:one"
        }
      ),
      {
        actorPlayerId: "player-b",
        cardInstanceId: "player-b:battlefield:one"
      }
    )
  );

  assert.throws(
    () =>
      placeStartingObjects(game, {
        legendCardInstanceIdsByPlayer: {
          "player-a": "player-a:legend:one"
        },
        championCardInstanceIdsByPlayer: {
          "player-a": "player-a:champion:one",
          "player-b": "player-b:champion:one"
        }
      }),
    /required for each player/
  );
});

test("rejects starting object placement twice", () => {
  const game = revealBattlefieldChoices(
    lockBattlefieldChoice(
      lockBattlefieldChoice(
        createGame({
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"],
          battlefieldCardInstanceIdsByPlayer: {
            "player-a": ["player-a:battlefield:one"],
            "player-b": ["player-b:battlefield:one"]
          }
        }),
        {
          actorPlayerId: "player-a",
          cardInstanceId: "player-a:battlefield:one"
        }
      ),
      {
        actorPlayerId: "player-b",
        cardInstanceId: "player-b:battlefield:one"
      }
    )
  );
  const placed = placeStartingObjects(game, {
    legendCardInstanceIdsByPlayer: {
      "player-a": "player-a:legend:one",
      "player-b": "player-b:legend:one"
    },
    championCardInstanceIdsByPlayer: {
      "player-a": "player-a:champion:one",
      "player-b": "player-b:champion:one"
    }
  });

  assert.throws(
    () =>
      placeStartingObjects(placed, {
        legendCardInstanceIdsByPlayer: {
          "player-a": "player-a:legend:one",
          "player-b": "player-b:legend:one"
        },
        championCardInstanceIdsByPlayer: {
          "player-a": "player-a:champion:one",
          "player-b": "player-b:champion:one"
        }
      }),
    /already been placed/
  );
});

test("draws opening hands from the top four main deck cards", () => {
  const game = createPlacedGameWithMainDecks({
    "player-a": ["a1", "a2", "a3", "a4", "a5"],
    "player-b": ["b1", "b2", "b3", "b4", "b5"]
  });

  const result = drawOpeningHands(game, "2026-06-12T08:00:00.000Z");

  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.equal(result.updatedAt, "2026-06-12T08:00:00.000Z");
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.hand, [
    "a1",
    "a2",
    "a3",
    "a4"
  ]);
  assert.deepEqual(result.canonicalState.players["player-a"]?.zones.mainDeck, [
    "a5"
  ]);
  assert.deepEqual(result.canonicalState.players["player-b"]?.zones.hand, [
    "b1",
    "b2",
    "b3",
    "b4"
  ]);
  assert.deepEqual(result.canonicalState.players["player-b"]?.zones.mainDeck, [
    "b5"
  ]);
});

test("rejects opening draw before starting objects are placed", () => {
  const game = createGame({
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  assert.throws(() => drawOpeningHands(game), /Starting objects must be placed/);
});

test("rejects opening draw twice", () => {
  const game = createPlacedGameWithMainDecks({
    "player-a": ["a1", "a2", "a3", "a4", "a5"],
    "player-b": ["b1", "b2", "b3", "b4", "b5"]
  });
  const result = drawOpeningHands(game);

  assert.throws(() => drawOpeningHands(result), /already been drawn/);
});

test("rejects opening draw when a main deck has fewer than four cards", () => {
  const game = createPlacedGameWithMainDecks({
    "player-a": ["a1", "a2", "a3"],
    "player-b": ["b1", "b2", "b3", "b4"]
  });

  assert.throws(() => drawOpeningHands(game), /at least four cards/);
});

test("rejects opening draw outside setup", () => {
  const game = gameSchema.parse({
    ...createPlacedGameWithMainDecks({
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    }),
    status: "in_progress"
  });

  assert.throws(() => drawOpeningHands(game), /during setup/);
});

test("commits zero-card mulligan after opening hand draw", () => {
  const game = drawOpeningHands(
    createPlacedGameWithMainDecks({
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    })
  );

  const result = commitMulligan(game, {
    actorPlayerId: "player-a",
    selectedCardInstanceIds: [],
    now: "2026-06-12T09:00:00.000Z"
  });

  assert.equal(result.stateVersion, game.stateVersion + 1);
  assert.equal(result.updatedAt, "2026-06-12T09:00:00.000Z");
  assert.deepEqual(result.canonicalState.setup.mulliganChoices["player-a"], {
    playerId: "player-a",
    status: "locked",
    selectedCardInstanceIds: [],
    lockedAt: "2026-06-12T09:00:00.000Z"
  });
  assert.equal(
    result.canonicalState.setup.mulliganChoices["player-b"]?.status,
    "unlocked"
  );
});

test("rejects non-zero mulligan until recycle support exists", () => {
  const game = drawOpeningHands(
    createPlacedGameWithMainDecks({
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    })
  );

  assert.throws(
    () =>
      commitMulligan(game, {
        actorPlayerId: "player-a",
        selectedCardInstanceIds: ["a1"]
      }),
    /Only zero-card mulligans/
  );
});

test("rejects mulligan commit before opening hand draw", () => {
  const game = createPlacedGameWithMainDecks({
    "player-a": ["a1", "a2", "a3", "a4"],
    "player-b": ["b1", "b2", "b3", "b4"]
  });

  assert.throws(
    () =>
      commitMulligan(game, {
        actorPlayerId: "player-a",
        selectedCardInstanceIds: []
      }),
    /Opening hand must be drawn/
  );
});

test("rejects mulligan commit twice", () => {
  const game = drawOpeningHands(
    createPlacedGameWithMainDecks({
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    })
  );
  const result = commitMulligan(game, {
    actorPlayerId: "player-a",
    selectedCardInstanceIds: []
  });

  assert.throws(
    () =>
      commitMulligan(result, {
        actorPlayerId: "player-a",
        selectedCardInstanceIds: []
      }),
    /already been committed/
  );
});

test("rejects mulligan commit from non-player", () => {
  const game = drawOpeningHands(
    createPlacedGameWithMainDecks({
      "player-a": ["a1", "a2", "a3", "a4"],
      "player-b": ["b1", "b2", "b3", "b4"]
    })
  );

  assert.throws(
    () =>
      commitMulligan(game, {
        actorPlayerId: "player-c",
        selectedCardInstanceIds: []
      }),
    /Only game players/
  );
});

test("rejects mulligan commit outside setup", () => {
  const game = gameSchema.parse({
    ...drawOpeningHands(
      createPlacedGameWithMainDecks({
        "player-a": ["a1", "a2", "a3", "a4"],
        "player-b": ["b1", "b2", "b3", "b4"]
      })
    ),
    status: "in_progress"
  });

  assert.throws(
    () =>
      commitMulligan(game, {
        actorPlayerId: "player-a",
        selectedCardInstanceIds: []
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

function createPlacedGameWithMainDecks(
  mainDeckCardInstanceIdsByPlayer: Record<string, string[]>
): Game {
  return placeStartingObjects(
    revealBattlefieldChoices(
      lockBattlefieldChoice(
        lockBattlefieldChoice(
          createGame({
            id: "game-1",
            matchId: "match-1",
            gameNumber: 1,
            playerIds: ["player-a", "player-b"],
            mainDeckCardInstanceIdsByPlayer,
            battlefieldCardInstanceIdsByPlayer: {
              "player-a": ["player-a:battlefield:one"],
              "player-b": ["player-b:battlefield:one"]
            }
          }),
          {
            actorPlayerId: "player-a",
            cardInstanceId: "player-a:battlefield:one"
          }
        ),
        {
          actorPlayerId: "player-b",
          cardInstanceId: "player-b:battlefield:one"
        }
      )
    ),
    {
      legendCardInstanceIdsByPlayer: {
        "player-a": "player-a:legend:one",
        "player-b": "player-b:legend:one"
      },
      championCardInstanceIdsByPlayer: {
        "player-a": "player-a:champion:one",
        "player-b": "player-b:champion:one"
      }
    }
  );
}
