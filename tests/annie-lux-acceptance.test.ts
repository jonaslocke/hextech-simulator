import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
import { runAnnieLuxFirstShowdownAcceptance } from "../src/server/match/acceptance-service";

test("runs the first Annie vs Lux path through showdown close", async () => {
  const catalog = await loadCardCatalog();
  const repositories = createInMemoryRepositories();
  const result = await runAnnieLuxFirstShowdownAcceptance(repositories, {
    annieDeckSource: await loadDeck("annie.dec.txt"),
    luxDeckSource: await loadDeck("lux.dec.txt"),
    catalog,
    matchId: "match-annie-lux",
    gameId: "game-annie-lux-1",
    rngSeed: "annie-lux-4",
    now: "2026-06-15T12:00:00.000Z"
  });

  const persistedMatch = await repositories.matches.findById("match-annie-lux");
  const persistedGame = await repositories.games.findById("game-annie-lux-1");
  const events = await repositories.gameEvents.findByGameId("game-annie-lux-1");

  assert.equal(result.match.currentGameId, "game-annie-lux-1");
  assert.equal(persistedMatch?.currentGameId, "game-annie-lux-1");
  assert.deepEqual(persistedGame, result.game);
  assert.equal(result.game.status, "in_progress");
  assert.equal(result.game.canonicalState.showdown, null);

  const battlefield = result.game.canonicalState.battlefields.find(
    (candidate) => candidate.battlefieldId === result.battlefieldId
  );
  assert.deepEqual(battlefield?.units, [result.playedUnitCardInstanceId]);
  assert.equal(
    result.cardsByInstanceId[result.playedUnitCardInstanceId]?.name,
    "Daring Poro"
  );
  assert.deepEqual(
    result.game.canonicalState.cardStates[result.playedUnitCardInstanceId],
    {
      exhausted: true
    }
  );

  assert.equal(
    result.projections.annie.players.lux?.zones.hand.cardInstanceIds.length,
    0
  );
  assert.equal(
    result.projections.annie.players.lux?.zones.hand.visibility,
    "private"
  );
  assert.equal(
    result.projections.lux.players.lux?.zones.hand.cardInstanceIds.length,
    result.projections.lux.players.lux?.zones.hand.count
  );
  assert.deepEqual(result.projections.annie.players.annie?.zones.mainDeck, {
    cardInstanceIds: [],
    count: result.game.canonicalState.players.annie?.zones.mainDeck.length,
    visibility: "secret"
  });

  assert.equal(events.some((event) => event.type === gameEventTypes.rngOperation), true);
  assert.equal(
    events.some(
      (event) =>
        event.type === gameEventTypes.serverDecision &&
        (event.payload as { decision?: { type?: string } }).decision?.type ===
          "showdown.enter"
    ),
    true
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === gameEventTypes.serverDecision &&
        (event.payload as { decision?: { type?: string } }).decision?.type ===
          "showdown.close"
    ),
    true
  );
  assert.equal(
    result.logEntries.lux.some(
      (entry) => entry.message === "Server opened a showdown."
    ),
    true
  );
  assert.equal(
    result.logEntries.lux.some(
      (entry) => entry.message === "Server closed the showdown."
    ),
    true
  );
});

async function loadDeck(filename: string) {
  return readFile(path.join(process.cwd(), "data", "decks", filename), "utf8");
}

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
