import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCardCatalog } from "../src/server/catalog";
import type {
  BaseDocument,
  CardCatalogVersionDocument,
  DeckSnapshotDocument,
  DocumentRepository,
  GameDocument,
  GameEventDocument,
  GameEventRepository,
  MatchDocument,
  Repositories
} from "../src/server/db";
import { gameEventTypes } from "../src/server/events";
import {
  createFixedDeckMatch,
  listFixedDeckOptions
} from "../src/server/match/fixed-deck-match-service";
import { verifyPlayerToken } from "../src/server/match";

test("lists only the fixed MVP deck options", () => {
  assert.deepEqual(listFixedDeckOptions(), [
    {
      id: "annie",
      label: "Annie"
    },
    {
      id: "lux",
      label: "Lux"
    }
  ]);
});

test("creates a persisted setup match from selected fixed decks", async () => {
  const catalog = await loadCardCatalog();
  const repositories = createInMemoryRepositories();
  const result = await createFixedDeckMatch(repositories, {
    catalog,
    matchId: "match-fixed-decks",
    now: "2026-06-15T12:00:00.000Z",
    playerDecks: {
      player1: "annie",
      player2: "lux"
    },
    rngSeed: "fixed-deck-test"
  });

  const persistedMatch = await repositories.matches.findById("match-fixed-decks");
  const persistedGame = await repositories.games.findById(
    "match-fixed-decks:game:1"
  );
  const events = await repositories.gameEvents.findByGameId(
    "match-fixed-decks:game:1"
  );

  assert.deepEqual(persistedMatch, result.match);
  assert.deepEqual(persistedGame, result.game);
  assert.equal(result.match.currentGameId, "match-fixed-decks:game:1");
  assert.equal(result.game.status, "setup_pending");
  assert.equal(
    result.game.canonicalState.setup.startingPlayerChooserId !== null,
    true
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, gameEventTypes.rngOperation);
  assert.equal(
    (events[0]?.payload as { operation: { purpose: string } }).operation.purpose,
    "game-1-starting-player-chooser"
  );
  assert.equal(
    verifyPlayerToken(
      result.players.player1.playerToken,
      result.match.playerSeats[0].tokenHash
    ),
    true
  );
  assert.equal(
    verifyPlayerToken(
      result.players.player2.playerToken,
      result.match.playerSeats[1].tokenHash
    ),
    true
  );
  assert.equal(result.projections["player-1"]?.viewerPlayerId, "player-1");
  assert.equal(result.projections["player-2"]?.viewerPlayerId, "player-2");
  assert.equal(result.projections["player-1"]?.players["player-2"]?.zones.hand.count, 0);
  assert.equal(
    result.logEntries["player-1"]?.[0]?.message,
    "Server randomly selected the starting-player chooser."
  );
  assert.equal(result.players.player1.deckId, "annie");
  assert.equal(result.players.player2.deckId, "lux");
  assert.equal(Object.keys(result.cardsByInstanceId).length > 100, true);
  assert.equal(result.match.playerSeats[0].deckSnapshotId !== null, true);
  assert.equal(result.match.playerSeats[1].deckSnapshotId !== null, true);
});

function createInMemoryRepositories(): Repositories {
  return {
    matches: createDocumentRepository<MatchDocument>(),
    games: createDocumentRepository<GameDocument>(),
    gameEvents: createGameEventRepository(),
    deckSnapshots: createDocumentRepository<DeckSnapshotDocument>(),
    cardCatalogVersions: createDocumentRepository<CardCatalogVersionDocument>()
  };
}

function createDocumentRepository<T extends BaseDocument>(): DocumentRepository<T> {
  const documents = new Map<string, T>();

  return {
    async findById(id) {
      return documents.get(id) ?? null;
    },

    async insert(document) {
      documents.set(document.id, document);
    },

    async upsert(document) {
      documents.set(document.id, document);
    }
  };
}

function createGameEventRepository(): GameEventRepository {
  const base = createDocumentRepository<GameEventDocument>();
  const events: GameEventDocument[] = [];

  return {
    ...base,

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

    async findById(id) {
      return events.find((event) => event.id === id) ?? null;
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
}
