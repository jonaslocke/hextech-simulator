import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DocumentRepository,
  GameEventRepository,
  GameEventDocument,
  GameDocument
} from "../src/server/db";
import { gameEventTypes } from "../src/server/events";
import {
  assignGameOneStartingPlayerChooserWithEvents,
  createGame,
  shuffleMainDecksWithEvents,
  shuffleRuneDecksWithEvents,
  type Game
} from "../src/server/match";

test("setup service persists game 1 chooser and appends RNG event", async () => {
  const game = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "chooser-seed"
  });
  const repositories = createInMemorySetupRepositories(game);

  const result = await assignGameOneStartingPlayerChooserWithEvents(
    repositories,
    "game-1",
    "2026-06-14T01:00:00.000Z"
  );

  assert.deepEqual(await repositories.games.findById("game-1"), result.game);
  assert.equal(result.game.canonicalState.rng.rngStep, 1);

  const events = await repositories.gameEvents.findByGameId("game-1");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "game-1:event:1");
  assert.equal(events[0]?.type, gameEventTypes.rngOperation);
  assert.equal(events[0]?.sequence, 1);
  assert.equal(events[0]?.matchId, "match-1");
  assert.equal(events[0]?.gameId, "game-1");
  assert.equal(events[0]?.actorPlayerId, null);
  assert.deepEqual(events[0]?.payload, {
    operation: result.game.canonicalState.setup.startingPlayerChooserId
      ? {
          seed: "chooser-seed",
          rngAlgorithm: "seedrandom",
          rngStep: 0,
          purpose: "game-1-starting-player-chooser",
          result: {
            index:
              result.game.canonicalState.setup.playerIds.indexOf(
                result.game.canonicalState.setup.startingPlayerChooserId
              ),
            value: result.game.canonicalState.setup.startingPlayerChooserId
          }
        }
      : null
  });
});

test("setup service appends deck shuffle RNG events after existing events", async () => {
  const game = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"],
    rngSeed: "shuffle-seed",
    mainDeckCardInstanceIdsByPlayer: {
      "player-a": ["a1", "a2", "a3"],
      "player-b": ["b1", "b2", "b3"]
    },
    runeDeckCardInstanceIdsByPlayer: {
      "player-a": ["ar1", "ar2"],
      "player-b": ["br1", "br2"]
    }
  });
  const repositories = createInMemorySetupRepositories(game);

  await shuffleMainDecksWithEvents(repositories, "game-1", "2026-06-14T02:00:00.000Z");
  await shuffleRuneDecksWithEvents(repositories, "game-1", "2026-06-14T03:00:00.000Z");

  const updatedGame = await repositories.games.findById("game-1");
  const events = await repositories.gameEvents.findByGameId("game-1");

  assert.equal(updatedGame?.canonicalState.rng.rngStep, 6);
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((event) => event.sequence),
    [1, 2, 3, 4]
  );
  assert.deepEqual(
    events.map((event) => (event.payload as { operation: { purpose: string } }).operation.purpose),
    [
      "shuffle-main-deck:player-a",
      "shuffle-main-deck:player-b",
      "shuffle-rune-deck:player-a",
      "shuffle-rune-deck:player-b"
    ]
  );
  assert.equal(
    typeof (events[0]?.payload as { operation: { result: unknown } }).operation.result,
    "object"
  );
});

test("setup service rejects missing games without appending events", async () => {
  const repositories = createInMemorySetupRepositories();

  await assert.rejects(
    () => assignGameOneStartingPlayerChooserWithEvents(repositories, "missing-game"),
    /Game not found/
  );

  assert.deepEqual(await repositories.gameEvents.findByGameId("missing-game"), []);
});

function createInMemorySetupRepositories(initialGame?: Game) {
  const games = new Map<string, GameDocument>();
  const events: GameEventDocument[] = [];

  if (initialGame) {
    games.set(initialGame.id, initialGame);
  }

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

  const gameEventRepository: GameEventRepository = {
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
    games: gameRepository,
    gameEvents: gameEventRepository
  };
}
