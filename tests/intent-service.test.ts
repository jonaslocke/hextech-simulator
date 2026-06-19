import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DocumentRepository,
  DeckSnapshotDocument,
  GameDocument,
  GameEventDocument,
  GameEventRepository,
  MatchDocument
} from "../src/server/db";
import type { Card } from "../src/server/catalog";
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
  assert.equal(
    result.game.canonicalState.setup.startingPlayerChooserId !== null,
    true
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      gameEventTypes.playerIntentAccepted,
      gameEventTypes.serverDecision,
      gameEventTypes.rngOperation
    ]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "setup.revealBattlefieldChoices"
    }
  });
  assert.equal(
    (result.events[2]?.payload as { operation: { purpose: string } }).operation
      .purpose,
    "game-1-starting-player-chooser"
  );
});

test("intent service auto-completes setup after battlefield reveal when starting player is chosen", async () => {
  const playerALegend = "a-legend";
  const playerAChampion = "a-champion";
  const playerBLegend = "b-legend";
  const playerBChampion = "b-champion";
  const lockedByPlayerA = lockBattlefieldChoice(
    gameSchema.parse({
      ...createGame({
        id: "game-1",
        matchId: "match-1",
        gameNumber: 1,
        playerIds: ["player-a", "player-b"],
        rngSeed: "auto-start-seed",
        battlefieldCardInstanceIdsByPlayer: {
          "player-a": ["battlefield-a"],
          "player-b": ["battlefield-b"]
        },
        mainDeckCardInstanceIdsByPlayer: {
          "player-a": ["a-main-1", "a-main-2", "a-main-3", "a-main-4", "a-main-5"],
          "player-b": ["b-main-1", "b-main-2", "b-main-3", "b-main-4", "b-main-5"]
        },
        runeDeckCardInstanceIdsByPlayer: {
          "player-a": ["a-rune-1", "a-rune-2"],
          "player-b": ["b-rune-1", "b-rune-2"]
        }
      }),
      canonicalState: {
        ...createGame({
          id: "game-1",
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"]
        }).canonicalState,
        rng: createGame({
          id: "game-1",
          matchId: "match-1",
          gameNumber: 1,
          playerIds: ["player-a", "player-b"],
          rngSeed: "auto-start-seed"
        }).canonicalState.rng,
        setup: {
          ...createGame({
            id: "game-1",
            matchId: "match-1",
            gameNumber: 1,
            playerIds: ["player-a", "player-b"]
          }).canonicalState.setup,
          startingPlayerChooserId: "player-a",
          startingPlayerId: "player-a",
          battlefieldPools: {
            "player-a": {
              playerId: "player-a",
              registeredCardInstanceIds: ["battlefield-a"],
              usedCardInstanceIds: []
            },
            "player-b": {
              playerId: "player-b",
              registeredCardInstanceIds: ["battlefield-b"],
              usedCardInstanceIds: []
            }
          }
        },
        players: {
          "player-a": {
            playerId: "player-a",
            runePool: {
              energy: 0,
              power: {}
            },
            zones: {
              legend: null,
              champion: null,
              mainDeck: ["a-main-1", "a-main-2", "a-main-3", "a-main-4", "a-main-5"],
              runeDeck: ["a-rune-1", "a-rune-2"],
              hand: [],
              trash: [],
              banishment: [],
              base: []
            }
          },
          "player-b": {
            playerId: "player-b",
            runePool: {
              energy: 0,
              power: {}
            },
            zones: {
              legend: null,
              champion: null,
              mainDeck: ["b-main-1", "b-main-2", "b-main-3", "b-main-4", "b-main-5"],
              runeDeck: ["b-rune-1", "b-rune-2"],
              hand: [],
              trash: [],
              banishment: [],
              base: []
            }
          }
        }
      }
    }),
    {
      actorPlayerId: "player-a",
      cardInstanceId: "battlefield-a",
      now: "2026-06-14T04:00:00.000Z"
    }
  );
  const { repositories } = createIntentFixture({
    game: lockedByPlayerA,
    deckSnapshots: [
      createDeckSnapshotDocument("deck-a", "player-a", playerALegend, playerAChampion),
      createDeckSnapshotDocument("deck-b", "player-b", playerBLegend, playerBChampion)
    ]
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

  assert.equal(result.game.status, "in_progress");
  assert.equal(result.game.canonicalState.turn?.activePlayerId, "player-a");
  assert.equal(
    result.game.canonicalState.players["player-a"]?.zones.legend,
    playerALegend
  );
  assert.equal(
    result.game.canonicalState.players["player-b"]?.zones.champion,
    playerBChampion
  );
  assert.equal(result.game.canonicalState.players["player-a"]?.zones.hand.length, 5);
  assert.equal(result.game.canonicalState.players["player-b"]?.zones.hand.length, 4);
  assert.equal(
    result.game.canonicalState.setup.mulliganChoices["player-a"]?.status,
    "locked"
  );
  assert.deepEqual(
    result.events
      .filter((event) => event.type === gameEventTypes.serverDecision)
      .map((event) => (event.payload as { decision: { type: string } }).decision.type),
    [
      "setup.revealBattlefieldChoices",
      "setup.placeStartingObjects",
      "setup.drawOpeningHands",
      "setup.autoKeepOpeningHands",
      "game.start",
      "turn.start.awaken",
      "turn.start.beginning",
      "turn.start.channel",
      "turn.start.draw",
      "turn.action.begin"
    ]
  );
  assert.equal(
    result.events.filter((event) => event.type === gameEventTypes.rngOperation)
      .length,
    4
  );
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
  assert.equal(result.game.canonicalState.turn?.phase, "action");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      gameEventTypes.playerIntentAccepted,
      gameEventTypes.serverDecision,
      gameEventTypes.serverDecision,
      gameEventTypes.serverDecision,
      gameEventTypes.serverDecision,
      gameEventTypes.serverDecision,
      gameEventTypes.serverDecision
    ]
  );
  assert.deepEqual(
    result.events
      .filter((event) => event.type === gameEventTypes.serverDecision)
      .map((event) => (event.payload as { decision: { type: string } }).decision.type),
    [
      "game.start",
      "turn.start.awaken",
      "turn.start.beginning",
      "turn.start.channel",
      "turn.start.draw",
      "turn.action.begin"
    ]
  );
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

test("intent service ends turn and logs automatic Start of Turn ABCD steps", async () => {
  const game = createInProgressIntentGame();
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: game.stateVersion,
      intent: {
        type: "game.endTurn"
      }
    },
    {
      now: () => "2026-06-14T07:30:00.000Z"
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.deepEqual(result.game.canonicalState.turn, {
    turnNumber: 2,
    activePlayerId: "player-b",
    phase: "action",
    passedPlayerIds: [],
    completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
  });
  assert.deepEqual(result.game.canonicalState.players["player-b"]?.zones.base, [
    "b-rune-1"
  ]);
  assert.deepEqual(result.game.canonicalState.players["player-b"]?.zones.hand, [
    "b-main-1"
  ]);
  assert.deepEqual(
    result.events
      .filter((event) => event.type === gameEventTypes.serverDecision)
      .map((event) => (event.payload as { decision: { type: string } }).decision.type),
    [
      "turn.start.awaken",
      "turn.start.beginning",
      "turn.start.channel",
      "turn.start.draw",
      "turn.action.begin"
    ]
  );
  assert.deepEqual(
    result.logEntries.map((entry) => entry.message),
    [
      "You ended the turn.",
      "Server completed Awaken.",
      "Server completed Beginning.",
      "Server completed Channel.",
      "Server completed Draw.",
      "Server began the Action phase."
    ]
  );
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

test("intent service opens showdown when moving to an empty battlefield", async () => {
  const game = createInProgressIntentGameWithBattlefield();
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-a",
    stateVersion: game.stateVersion,
    intent: {
      type: "game.moveUnitToBattlefield",
      payload: {
        unitCardInstanceId: "a-unit-1",
        battlefieldId: "battlefield-a"
      }
    }
  });

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(result.game.canonicalState.showdown?.focusPlayerId, "player-a");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.serverDecision]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "showdown.enter",
      payload: {
        battlefieldId: "battlefield-a"
      }
    }
  });
});

test("intent service accepts addRuneResource with server-side card metadata", async () => {
  const game = createInProgressIntentGameWithRunes();
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: game.stateVersion,
      intent: {
        type: "game.addRuneResource",
        payload: {
          runeCardInstanceId: "a-rune-base-1",
          resourceType: "energy"
        }
      }
    },
    {
      cardsByInstanceId: intentCardLookup
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(result.game.canonicalState.players["player-a"]?.runePool.energy, 1);
  assert.deepEqual(result.events.map((event) => event.type), [
    gameEventTypes.playerIntentAccepted
  ]);
});

test("intent service accepts playCard and appends payment decision", async () => {
  const game = gameSchema.parse({
    ...createInProgressIntentGameWithRunes(),
    canonicalState: {
      ...createInProgressIntentGameWithRunes().canonicalState,
      players: {
        ...createInProgressIntentGameWithRunes().canonicalState.players,
        "player-a": {
          ...createInProgressIntentGameWithRunes().canonicalState.players["player-a"]!,
          zones: {
            ...createInProgressIntentGameWithRunes().canonicalState.players[
              "player-a"
            ]!.zones,
            hand: ["a-unit-hand-1"]
          }
        }
      }
    }
  });
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: game.stateVersion,
      intent: {
        type: "game.playCard",
        payload: {
          cardInstanceId: "a-unit-hand-1"
        }
      }
    },
    {
      cardsByInstanceId: intentCardLookup
    }
  );

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.deepEqual(result.game.canonicalState.players["player-a"]?.zones.hand, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.serverDecision]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "game.payCosts",
      payload: {
        energyCost: 2,
        powerCost: 0,
        exhaustedRuneCount: 2,
        recycledRuneCount: 0
      }
    }
  });
});

test("intent service resolves Stupefy through chain into draw and Might modifier", async () => {
  const game = createStupefyIntentGame();
  const { repositories } = createIntentFixture({ game });
  const played = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: game.stateVersion,
      intent: {
        type: "game.playCard",
        payload: {
          cardInstanceId: "player-a:stupefy",
          choices: {
            targetCardInstanceIds: ["player-b:target-unit"]
          }
        }
      }
    },
    {
      cardsByInstanceId: stupefyIntentCardLookup
    }
  );

  assert.equal(played.accepted, true);

  if (!played.accepted) {
    return;
  }

  assert.equal(played.game.canonicalState.chain?.items[0]?.label, "Stupefy");

  const resolved = await handleMatchIntent(
    repositories,
    {
      matchId: "match-1",
      gameId: "game-1",
      playerToken: "token-a",
      stateVersion: played.game.stateVersion,
      intent: {
        type: "game.pass"
      }
    },
    {
      autoPassChainOpponent: true,
      cardsByInstanceId: stupefyIntentCardLookup
    }
  );

  assert.equal(resolved.accepted, true);

  if (!resolved.accepted) {
    return;
  }

  assert.equal(resolved.game.canonicalState.chain, null);
  assert.deepEqual(resolved.game.canonicalState.players["player-a"]?.zones.hand, [
    "player-a:draw-card"
  ]);
  assert.deepEqual(resolved.game.canonicalState.players["player-a"]?.zones.trash, [
    "player-a:stupefy"
  ]);
  assert.equal(
    resolved.projection.cardStates["player-b:target-unit"]?.computedMight,
    1
  );
});

test("intent service closes showdown after both relevant players pass", async () => {
  const game = gameSchema.parse({
    ...createInProgressIntentGameWithBattlefield(),
    canonicalState: {
      ...createInProgressIntentGameWithBattlefield().canonicalState,
      showdown: {
        battlefieldId: "battlefield-a",
        relevantPlayerIds: ["player-a", "player-b"],
        focusPlayerId: "player-b",
        priorityPlayerId: "player-b",
        passedPlayerIds: ["player-a"]
      }
    }
  });
  const { repositories } = createIntentFixture({ game });

  const result = await handleMatchIntent(repositories, {
    matchId: "match-1",
    gameId: "game-1",
    playerToken: "token-b",
    stateVersion: game.stateVersion,
    intent: {
      type: "game.pass"
    }
  });

  assert.equal(result.accepted, true);

  if (!result.accepted) {
    return;
  }

  assert.equal(result.game.canonicalState.showdown, null);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [gameEventTypes.playerIntentAccepted, gameEventTypes.serverDecision]
  );
  assert.deepEqual(result.events[1]?.payload, {
    decision: {
      type: "showdown.close"
    }
  });
});

test("intent service rejects action or reaction play during showdown as unsupported", async () => {
  const game = gameSchema.parse({
    ...createInProgressIntentGameWithBattlefield(),
    canonicalState: {
      ...createInProgressIntentGameWithBattlefield().canonicalState,
      showdown: {
        battlefieldId: "battlefield-a",
        relevantPlayerIds: ["player-a", "player-b"],
        focusPlayerId: "player-a",
        priorityPlayerId: "player-a",
        passedPlayerIds: []
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
      type: "game.playCard",
      payload: {
        cardInstanceId: "a-action-card"
      }
    }
  });

  assert.equal(result.accepted, false);

  if (result.accepted) {
    return;
  }

  assert.equal(result.error.code, "unsupported_intent");
  assert.equal(result.error.source, "game.playCard");
  assert.deepEqual(await repositories.games.findById("game-1"), game);
  assert.deepEqual(await repositories.gameEvents.findByGameId("game-1"), []);
});

function createIntentFixture(
  input: {
    deckSnapshots?: DeckSnapshotDocument[];
    game?: Game;
    match?: Match;
  } = {}
) {
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
          tokenHash: hashPlayerToken("token-a"),
          deckSnapshotId: input.deckSnapshots?.find(
            (document) => document.playerId === "player-a"
          )?.id
        },
        {
          playerId: "player-b",
          seat: "player-2",
          tokenHash: hashPlayerToken("token-b"),
          deckSnapshotId: input.deckSnapshots?.find(
            (document) => document.playerId === "player-b"
          )?.id
        }
      ]
    }),
      currentGameId: game.id,
      gameIds: [game.id]
    });

  const games = new Map<string, GameDocument>([[game.id, game]]);
  const matches = new Map<string, MatchDocument>([[match.id, match]]);
  const events: GameEventDocument[] = [];
  const deckSnapshots = new Map<string, DeckSnapshotDocument>(
    input.deckSnapshots?.map((document) => [document.id, document]) ?? []
  );
  const deckSnapshotRepository: DocumentRepository<DeckSnapshotDocument> = {
    async findById(id) {
      return deckSnapshots.get(id) ?? null;
    },

    async insert(document) {
      deckSnapshots.set(document.id, document);
    },

    async upsert(document) {
      deckSnapshots.set(document.id, document);
    }
  };

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
      deckSnapshots: deckSnapshotRepository,
      games: gameRepository,
      matches: matchRepository,
      gameEvents: eventRepository
    }
  };
}

function createDeckSnapshotDocument(
  id: string,
  playerId: string,
  legendInstanceId: string,
  championInstanceId: string
): DeckSnapshotDocument {
  const legend = createResolvedDeckEntry(legendInstanceId, "Legend");
  const champion = createResolvedDeckEntry(championInstanceId, "Unit", 1);

  return {
    id,
    createdAt: "2026-06-14T04:00:00.000Z",
    updatedAt: "2026-06-14T04:00:00.000Z",
    matchId: "match-1",
    playerId,
    catalogVersionHash: "test-catalog",
    sourceText: "",
    snapshot: {
      catalogVersionHash: "test-catalog",
      sourceText: "",
      legend,
      champion,
      mainDeck: [],
      runes: [],
      battlefields: [],
      sideboard: [],
      instances: [
        {
          instanceId: legendInstanceId,
          ownerId: playerId,
          source: "legend",
          card: legend.card
        },
        {
          instanceId: championInstanceId,
          ownerId: playerId,
          source: "champion",
          card: champion.card
        }
      ]
    }
  };
}

function createResolvedDeckEntry(
  name: string,
  type: Card["classification"]["type"],
  energy: number | null = null
) {
  return {
    section: type === "Legend" ? "Legend" as const : "Champion" as const,
    quantity: 1,
    name,
    line: 1,
    card: createCard({
      domain: ["Chaos"],
      energy,
      name,
      power: null,
      type
    })
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
            mainDeck: ["a-main-1"],
            runeDeck: ["a-rune-1", "a-rune-2"],
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

function createInProgressIntentGameWithBattlefield(): Game {
  const game = createInProgressIntentGame();

  return gameSchema.parse({
    ...game,
    canonicalState: {
      ...game.canonicalState,
      players: {
        ...game.canonicalState.players,
        "player-a": {
          ...game.canonicalState.players["player-a"]!,
          zones: {
            ...game.canonicalState.players["player-a"]!.zones,
            base: ["a-unit-1"]
          }
        }
      },
      battlefields: [
        {
          battlefieldId: "battlefield-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: "battlefield-card-a",
          units: [],
          facedownSlot: null
        }
      ]
    }
  });
}

function createInProgressIntentGameWithRunes(): Game {
  const game = createInProgressIntentGame();

  return gameSchema.parse({
    ...game,
    canonicalState: {
      ...game.canonicalState,
      cardStates: {
        "a-rune-base-1": {
          exhausted: false
        },
        "a-rune-base-2": {
          exhausted: false
        }
      },
      players: {
        ...game.canonicalState.players,
        "player-a": {
          ...game.canonicalState.players["player-a"]!,
          zones: {
            ...game.canonicalState.players["player-a"]!.zones,
            base: ["a-rune-base-1", "a-rune-base-2"]
          }
        }
      }
    }
  });
}

function createStupefyIntentGame(): Game {
  const base = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "stupefy-service-seed"
  });

  return gameSchema.parse({
    ...base,
    status: "in_progress",
    stateVersion: 12,
    canonicalState: {
      ...base.canonicalState,
      cardStates: {
        "player-b:target-unit": {
          exhausted: false
        }
      },
      turn: {
        turnNumber: 1,
        activePlayerId: "player-a",
        phase: "action",
        passedPlayerIds: [],
        completedStartOfTurnSteps: ["awaken", "beginning", "channel", "draw"]
      },
      players: {
        "player-a": {
          playerId: "player-a",
          runePool: {
            energy: 1,
            power: {}
          },
          zones: {
            legend: "player-a:legend",
            champion: null,
            mainDeck: ["player-a:draw-card"],
            runeDeck: [],
            hand: ["player-a:stupefy"],
            trash: [],
            banishment: [],
            base: []
          }
        },
        "player-b": {
          playerId: "player-b",
          runePool: {
            energy: 0,
            power: {}
          },
          zones: {
            legend: "player-b:legend",
            champion: null,
            mainDeck: [],
            runeDeck: [],
            hand: [],
            trash: [],
            banishment: [],
            base: ["player-b:target-unit"]
          }
        }
      }
    }
  });
}

const intentCardLookup: Record<string, Card> = {
  "a-rune-base-1": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-rune-base-2": createCard({
    domain: ["Chaos"],
    energy: null,
    name: "Chaos Rune",
    power: null,
    type: "Rune"
  }),
  "a-unit-hand-1": createCard({
    domain: ["Chaos"],
    energy: 2,
    name: "Simple Unit",
    power: null,
    type: "Unit"
  })
};

const stupefyIntentCardLookup: Record<string, Card> = {
  "player-a:draw-card": createCard({
    domain: ["Mind"],
    energy: 1,
    name: "Draw Card",
    power: null,
    type: "Unit"
  }),
  "player-a:legend": createCard({
    domain: ["Mind"],
    energy: null,
    name: "Lady of Luminosity - Starter",
    power: null,
    type: "Legend"
  }),
  "player-a:stupefy": createCard({
    domain: ["Mind"],
    energy: 1,
    name: "Stupefy",
    power: null,
    text: "[Reaction] Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1.",
    type: "Spell"
  }),
  "player-b:legend": createCard({
    domain: ["Fury"],
    energy: null,
    name: "Opponent Legend",
    power: null,
    type: "Legend"
  }),
  "player-b:target-unit": createCard({
    domain: ["Fury"],
    energy: 2,
    name: "Target Unit",
    power: null,
    type: "Unit"
  })
};

function createCard(input: {
  domain: string[];
  energy: number | null;
  name: string;
  power: number | null;
  text?: string;
  type: Card["classification"]["type"];
}): Card {
  return {
    id: input.name,
    name: input.name,
    public_code: input.name,
    attributes: {
      energy: input.energy,
      might: input.type === "Unit" ? 2 : null,
      power: input.power
    },
    classification: {
      type: input.type,
      supertype: null,
      rarity: null,
      domain: input.domain
    },
    text: {
      plain: input.text ?? ""
    },
    set: {
      set_id: "test",
      label: "Test"
    },
    media: {},
    tags: [],
    metadata: {}
  };
}
