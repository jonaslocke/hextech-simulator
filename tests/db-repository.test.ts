import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  fromMongoDocument,
  getMongoDatabaseName,
  toMongoDocument,
  type CardCatalogVersionDocument
} from "../src/server/db";
import {
  createGameRepositories,
  gameCollectionNames
} from "../src/server/game";

test("maps application documents to Mongo _id documents and back", () => {
  const now = new Date("2026-06-11T00:00:00.000Z").toISOString();
  const document: CardCatalogVersionDocument = {
    id: "catalog-1",
    createdAt: now,
    updatedAt: now,
    versionHash: "catalog-1",
    setFiles: ["set.json"],
    cardCount: 1
  };

  const mongoDocument = toMongoDocument(document);

  assert.equal(mongoDocument._id, "catalog-1");
  assert.equal(mongoDocument.id, "catalog-1");
  assert.deepEqual(
    fromMongoDocument<CardCatalogVersionDocument>(mongoDocument),
    document
  );
});

test("creates repositories for canonical match collections", () => {
  const requestedCollections: string[] = [];
  const db = {
    collection(name: string) {
      requestedCollections.push(name);
      return {};
    }
  } as unknown as Db;

  const repositories = createGameRepositories(db);

  assert.deepEqual(requestedCollections, Object.values(gameCollectionNames));
  assert.equal(typeof repositories.matches.findById, "function");
  assert.equal(typeof repositories.games.upsert, "function");
  assert.equal(typeof repositories.gameEvents.findByGameId, "function");
  assert.equal(typeof repositories.deckSnapshots.insert, "function");
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
