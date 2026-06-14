import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DocumentRepository,
  GameDocument,
  GameEventDocument,
  GameEventRepository,
  MatchDocument
} from "../src/server/db";
import { gameEventTypes } from "../src/server/events";
import {
  createBestOfThreeMatch,
  createGame,
  gameSchema,
  handleMatchIntent,
  lockBattlefieldChoice,
  matchSchema,
  type Game,
  type Match
} from "../src/server/match";
import { hashPlayerToken } from "../src/server/match/tokens";

test("intent service accepts setup intents, persists game, appends event, and returns projection", async () => {
  const { repositories, game } = createIntentFixture({
    game: withStartingPlayerChooser(
      createGame({
        id: "game-1",
        matchId: "match-1",
        gameNumber: 1,
        playerIds: ["player-a", "player-b"]
      }),
      "player-a"
    )
  });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: game.stateVersion,
      intent: {
        type: "setup.chooseStartingPlayer",
        payload: {
          startingPlayerId: "player-b"
        }
      }
    },
    {
      now: () => "2026-06-14T04:00:00.000Z"
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(result.game.canonicalState.setup.startingPlayerId, "player-b");
  assert.deepEqual(await repositories.games.findById("game-1"), result.game);
  assert.equal(result.projection.viewerPlayerId, "player-a");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, gameEventTypes.playerIntentAccepted);
  assert.equal(result.events[0]?.actorPlayerId, "player-a");
  assert.deepEqual(
    result.logEntries.map((entry) => entry.message),
    ["You chose the starting player."]
  );
  assert.deepEqual(result.events[0]?.payload, {
    intent: {
      type: "setup.chooseStartingPlayer",
      payload: {
        startingPlayerId: "player-b"
      }
    }
  });
});

test("intent service rejects invalid player tokens without mutation", async () => {
  const { repositories, game } = createIntentFixture();

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "wrong-token",
    stateVersion: game.stateVersion,
    intent: {
      type: "setup.chooseStartingPlayer",
      payload: {
        startingPlayerId: "player-a"
      }
    }
  });

  assert.equal(result.accepted, false);
  assert.deepEqual(await repositories.games.findById("game-1"), game);
  assert.deepEqual(await repositories.gameEvents.findByGameId("game-1"), []);
});

test("intent service rejects stale state versions without mutation", async () => {
  const { repositories, game } = createIntentFixture();

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: game.stateVersion + 1,
    intent: {
      type: "setup.chooseStartingPlayer",
      payload: {
        startingPlayerId: "player-a"
      }
    }
  });

  assert.equal(result.accepted, false);
  assert.deepEqual(await repositories.games.findById("game-1"), game);
  assert.deepEqual(await repositories.gameEvents.findByGameId("game-1"), []);
});

test("intent service reveals battlefields after both players lock", async () => {
  const lockedByPlayerA = lockBattlefieldChoice(
    createGame({
      id: "game-1",
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"],
      battlefieldCardInstanceIdsByPlayer: {
        "player-a": ["battlefield-a"],
        "player-b": ["battlefield-b"]
      }
    }),
    {
      actorPlayerId: "player-a",
      cardInstanceId: "battlefield-a",
      now: "2026-06-14T04:00:00.000Z"
    }
  );
  const { repositories } = createIntentFixture({
    game: lockedByPlayerA
  });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-b",
      stateVersion: lockedByPlayerA.stateVersion,
      intent: {
        type: "setup.lockBattlefieldChoice",
        payload: {
          cardInstanceId: "battlefield-b"
        }
      }
    },
    {
      now: () => "2026-06-14T05:00:00.000Z"
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(
    result.game.canonicalState.setup.battlefieldChoices["player-a"]?.status,
    "revealed"
  );
  assert.equal(
    result.game.canonicalState.setup.battlefieldChoices["player-b"]?.status,
    "revealed"
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.serverDecision]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "setup.revealBattlefieldChoices"
    }
  });
});

test("intent service rejects unsupported intents without mutation", async () => {
  const { repositories, game } = createIntentFixture();

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: game.stateVersion,
    intent: {
      type: "game.unsupported",
      payload: {}
    }
  });

  assert.equal(result.accepted, false);

  if (result.accepted) {
    return;
  }

  assert.equal(result.error.code, "unsupported_intent");
  assert.deepEqual(await repositories.games.findById("game-1"), game);
  assert.deepEqual(await repositories.gameEvents.findByGameId("game-1"), []);
});

test("intent service starts the game after both mulligans are committed", async () => {
  const game = createOneMulliganCommittedGame();
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-b",
      stateVersion: game.stateVersion,
      intent: {
        type: "setup.commitMulligan",
        payload: {
          selectedCardInstanceIds: []
        }
      }
    },
    {
      now: () => "2026-06-14T06:00:00.000Z"
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(result.game.status, "in_progress");
  assert.equal(result.game.canonicalState.turn?.activePlayerId, "player-a");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.serverDecision]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "game.start"
    }
  });
});

test("intent service accepts draw intents and returns updated projection", async () => {
  const game = createInProgressIntentGame();
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: game.stateVersion,
    intent: {
      type: "game.draw",
      payload: {
        count: 1
      }
    }
  });

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.hand, [
    "a-hand-1",
    "a-main-1"
  ]);
  assert.equal(result.projection.players["player-a"]?.zones.hand.count, 2);
  assert.equal(result.events[0]?.type, gameEventTypes.playerIntentAccepted);
});

test("intent service appends RNG event for simultaneous main deck recycle", async () => {
  const game = gameSchema.parse({
    ...createInProgressIntentGame(),
    canonicalState: {
      ...createInProgressIntentGame().canonicalState,
      players: {
        ...createInProgressIntentGame().canonicalState.players,
        "player-a": {
          ...createInProgressIntentGame().canonicalState.players["player-a"]!,
          zones: {
            ...createInProgressIntentGame().canonicalState.players["player-a"]!.zones,
            hand: ["a-hand-1", "a-hand-2"]
          }
        }
      }
    }
  });
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: game.stateVersion,
    intent: {
      type: "game.recycle",
      payload: {
        ownerPlayerId: "player-a",
        sourceZone: "hand",
        destinationDeck: "mainDeck",
        cardInstanceIds: ["a-hand-1", "a-hand-2"]
      }
    }
  });

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.rngOperation]
  );
  assert.equal(
    (result.events[1]?.payload as { operation: { purpose: string } }).operation
      .purpose,
    "recycle-main-deck:player-a"
  );
});

function createIntentFixture(input: { game?: Game; match?: Match } = {}) {
  const game =
    input.game ??
    createGame({
      id: "game-1",
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    });
  const match =
    input.match ??
    matchSchema.parse({
      ...createBestOfThreeMatch({
        id: "match-1",
        playerSeats: [
          {
            playerId: "player-a",
            seat: "player-1",
            tokenHash: hashPlayerToken("token-a")
          },
          {
            playerId: "player-b",
            seat: "player-2",
            tokenHash: hashPlayerToken("token-b")
          }
        ]
      }),
      currentGameId: game.id,
      gameIds: [game.id]
    });

  const games = new Map<string, GameDocument>([[game.id, game]]);
  const matches = new Map<string, MatchDocument>([[match.id, match]]);
  const events: GameEventDocument[] = [];

  const gameRepository: DocumentRepository<GameDocument> = {
    async findById(id) {
      return games.get(id) ?? null;
    },

    async insert(document) {
      games.set(document.id, document);
    },

    async upsert(document) {
      games.set(document.id, document);
    }
  };

  const matchRepository: DocumentRepository<MatchDocument> = {
    async findById(id) {
      return matches.get(id) ?? null;
    },

    async insert(document) {
      matches.set(document.id, document);
    },

    async upsert(document) {
      matches.set(document.id, document);
    }
  };

  const eventRepository: GameEventRepository = {
    async findById(id) {
      return events.find((event) => event.id === id) ?? null;
    },

    async insert(document) {
      events.push(document);
    },

    async upsert(document) {
      const index = events.findIndex((event) => event.id === document.id);
      if (index === -1) {
        events.push(document);
      } else {
        events[index] = document;
      }
    },

    async findByMatchId(matchId) {
      return events
        .filter((event) => event.matchId === matchId)
        .sort((left, right) => left.sequence - right.sequence);
    },

    async findByGameId(gameId) {
      return events
        .filter((event) => event.gameId === gameId)
        .sort((left, right) => left.sequence - right.sequence);
    },

    async append(event) {
      events.push(event);
    }
  };

  return {
    game,
    match,
    repositories: {
      games: gameRepository,
      matches: matchRepository,
      gameEvents: eventRepository
    }
  };
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

function createOneMulliganCommittedGame(): Game {
  const base = withStartingPlayerChooser(
    createGame({
      id: "game-1",
      matchId: "match-1",
      gameNumber: 1,
      playerIds: ["player-a", "player-b"]
    }),
    "player-a"
  );

  return gameSchema.parse({
    ...base,
    canonicalState: {
      ...base.canonicalState,
      setup: {
        ...base.canonicalState.setup,
        startingPlayerId: "player-a",
        mulliganChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            selectedCardInstanceIds: [],
            lockedAt: "2026-06-14T05:00:00.000Z"
          },
          "player-b": {
            playerId: "player-b",
            status: "unlocked",
            selectedCardInstanceIds: [],
            lockedAt: null
          }
        }
      },
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: "a-legend",
            champion: "a-champion",
            mainDeck: [],
            runeDeck: [],
            hand: ["a-hand-1"],
            trash: [],
            banishment: [],
            base: []
          }
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: "b-legend",
            champion: "b-champion",
            mainDeck: [],
            runeDeck: [],
            hand: ["b-hand-1"],
            trash: [],
            banishment: [],
            base: []
          }
        }
      }
    }
  });
}

function createInProgressIntentGame(): Game {
  const base = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "intent-gameplay-seed"
  });

  return gameSchema.parse({
    ...base,
    status: "in_progress",
    stateVersion: 8,
    canonicalState: {
      ...base.canonicalState,
      turn: {
        turnNumber: 1,
        activePlayerId: "player-a",
        phase: "action",
        passedPlayerIds: []
      },
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: "a-legend",
            champion: "a-champion",
            mainDeck: ["a-main-1", "a-main-2"],
            runeDeck: ["a-rune-1"],
            hand: ["a-hand-1"],
            trash: [],
            banishment: [],
            base: []
          }
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: "b-legend",
            champion: "b-champion",
            mainDeck: ["b-main-1"],
            runeDeck: ["b-rune-1"],
            hand: [],
            trash: [],
            banishment: [],
            base: []
          }
        }
      }
    }
  });
}
