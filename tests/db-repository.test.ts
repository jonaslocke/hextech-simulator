import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  collectionNames,
  createRepositories,
  fromMongoDocument,
  getMongoDatabaseName,
  toMongoDocument,
  type MatchDocument
} from "../src/server/db";

test("maps application documents to Mongo _id documents and back", () => {
  const now = new Date("2026-06-11T00:00:00.000Z").toISOString();
  const match: MatchDocument = {
    id: "match-1",
    createdAt: now,
    updatedAt: now,
    format: "best-of-3",
    status: "setup_pending",
    playerSeats: [
      {
        playerId: "player-a",
        seat: "player-1",
        deckSnapshotId: "deck-a",
        tokenHash: "hash-a"
      },
      {
        playerId: "player-b",
        seat: "player-2",
        deckSnapshotId: "deck-b",
        tokenHash: "hash-b"
      }
    ],
    currentGameId: null,
    gameIds: [],
    matchScore: {
      "player-a": 0,
      "player-b": 0
    },
    winnerPlayerId: null
  };

  const mongoDocument = toMongoDocument(match);

  assert.equal(mongoDocument._id, "match-1");
  assert.equal(mongoDocument.id, "match-1");
  assert.deepEqual(fromMongoDocument<MatchDocument>(mongoDocument), match);
});

test("creates repositories for all planned collections", () => {
  const requestedCollections: string[] = [];
  const db = {
    collection(name: string) {
      requestedCollections.push(name);
      return {};
    }
  } as unknown as Db;

  const repositories = createRepositories(db);

  assert.deepEqual(requestedCollections, [
    collectionNames.matches,
    collectionNames.games,
    collectionNames.gameEvents,
    collectionNames.deckSnapshots,
    collectionNames.cardCatalogVersions
  ]);
  assert.equal(typeof repositories.matches.findById, "function");
  assert.equal(typeof repositories.games.upsert, "function");
  assert.equal(typeof repositories.gameEvents.append, "function");
  assert.equal(typeof repositories.deckSnapshots.insert, "function");
  assert.equal(typeof repositories.cardCatalogVersions.findById, "function");
});

test("uses default MongoDB database name when env is not set", () => {
  const previous = process.env.MONGODB_DB_NAME;
  delete process.env.MONGODB_DB_NAME;

  try {
    assert.equal(getMongoDatabaseName(), "hextech_simulator");
  } finally {
    if (previous === undefined) {
      delete process.env.MONGODB_DB_NAME;
    } else {
      process.env.MONGODB_DB_NAME = previous;
    }
  }
});

test("does not declare mongoose as a dependency", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.dependencies?.mongoose, undefined);
  assert.equal(packageJson.devDependencies?.mongoose, undefined);
});
