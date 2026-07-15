import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCardCatalogVersionDocument,
  loadCardCatalog,
  persistCardCatalogVersion,
} from "../src/server/catalog";

test("loads local Riftbound card catalog", async () => {
  const catalog = await loadCardCatalog();

  assert.equal(catalog.cards.length, 57);
  assert.equal(catalog.cards.some((card) => card.classification.type === "Legend"), true);
  assert.equal(catalog.cards.some((card) => card.classification.supertype === "Champion"), true);
  assert.deepEqual(catalog.setFiles, ["fixed-mvp-cards.generated.ts"]);
  assert.match(catalog.versionHash, /^[a-f0-9]{64}$/);
});

test("creates and persists catalog version metadata", async () => {
  const catalog = await loadCardCatalog();
  const now = new Date("2026-06-11T00:00:00.000Z");
  const document = createCardCatalogVersionDocument(catalog, now);
  let persisted = null as typeof document | null;

  assert.equal(document.id, catalog.versionHash);
  assert.equal(document.versionHash, catalog.versionHash);
  assert.equal(document.cardCount, 57);
  assert.deepEqual(document.setFiles, ["fixed-mvp-cards.generated.ts"]);
  assert.equal(document.createdAt, now.toISOString());

  const result = await persistCardCatalogVersion(
    {
      async findById() {
        return null;
      },
      async insert() {
        throw new Error("persistCardCatalogVersion should upsert.");
      },
      async upsert(nextDocument) {
        persisted = nextDocument;
      }
    },
    catalog,
    now
  );

  assert.deepEqual(result, document);
  assert.deepEqual(persisted, document);
});
