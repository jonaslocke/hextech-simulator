import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCardCatalogVersionDocument,
  loadCardCatalog,
  persistCardCatalogVersion,
  requireCardByName
} from "../src/server/catalog";

test("loads local Riftbound card catalog", async () => {
  const catalog = await loadCardCatalog();

  assert.equal(catalog.cards.length, 656);
  assert.equal(requireCardByName(catalog, "Dark Child - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Lady of Luminosity - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Annie, Stubborn").classification.supertype, "Champion");
  assert.equal(requireCardByName(catalog, "Lux, Crownguard").classification.supertype, "Champion");
  assert.deepEqual(catalog.setFiles, ["ogn.json", "ogs.json", "sfd.json"]);
  assert.match(catalog.versionHash, /^[a-f0-9]{64}$/);
});

test("creates and persists catalog version metadata", async () => {
  const catalog = await loadCardCatalog();
  const now = new Date("2026-06-11T00:00:00.000Z");
  const document = createCardCatalogVersionDocument(catalog, now);
  let persisted = null as typeof document | null;

  assert.equal(document.id, catalog.versionHash);
  assert.equal(document.versionHash, catalog.versionHash);
  assert.equal(document.cardCount, 656);
  assert.deepEqual(document.setFiles, ["ogn.json", "ogs.json", "sfd.json"]);
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
